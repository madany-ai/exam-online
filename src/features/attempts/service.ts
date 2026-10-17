import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { generateToken, hashStudentIdentifier, hashToken } from "@/lib/security/random";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { gradeAttempt, GradeInputError, type GradeableQuestion } from "@/features/grading/grading";
import type { StartAttemptInput, SubmittedAnswersInput } from "@/features/exams/schema";
import type { SupportedQuestionType } from "@/features/questions/import-schema";
import { computeExpiresAt, evaluateStartEligibility, hasExpired } from "@/features/attempts/policy";
import { shuffled } from "@/features/attempts/shuffle";
import { getCachedExamQuestions, type CachedExamQuestion } from "@/lib/cache/exam-cache";

/**
 * منطق محاولة الطالب — كل التحقق يتم هنا على الخادم.
 * قواعد ثابتة:
 *  - لا يُسرسل مفتاح الإجابات للمتصفح مطلقاً.
 *  - الخادم هو مصدر الحقيقة للوقت والمحاولات.
 *  - التسليم idempotent: تكرار الطلب لا ينشئ درجة ثانية ولا يغيّر درجة مُسلّمة.
 */

type ExamForStudent = {
  id: string;
  publicToken: string;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultVisibility: "IMMEDIATE" | "MANUAL";
  resultsReleasedAt: Date | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  requiresStudentId: boolean;
  studentIdLabel: string | null;
};

const examStudentFields = {
  id: true,
  publicToken: true,
  title: true,
  description: true,
  instructions: true,
  durationMinutes: true,
  startsAt: true,
  endsAt: true,
  maxAttempts: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  resultVisibility: true,
  resultsReleasedAt: true,
  status: true,
  requiresStudentId: true,
  studentIdLabel: true,
} as const;

/** معلومات الاختبار العامة للصفحة التعريفية (بدون أسئلة ولا مفتاح إجابات). */
export async function getPublicExamSummary(publicToken: string) {
  const exam = await prisma.exam.findUnique({
    where: { publicToken },
    select: {
      ...examStudentFields,
      _count: { select: { questions: true } },
    },
  });
  if (!exam) throw new NotFoundError("رابط الاختبار غير صحيح أو تم حذفه.");

  const now = new Date();
  const isOpen =
    exam.status === "PUBLISHED" &&
    (!exam.startsAt || exam.startsAt.getTime() <= now.getTime()) &&
    (!exam.endsAt || exam.endsAt.getTime() > now.getTime());

  // سبب الإغلاق يُحسب هنا على الخادم، لا أثناء عرض الصفحة،
  // حتى تبقى قراءة "الوقت الحالي" في مكان واحد فقط.
  let closedReason: string | null = null;
  if (exam.status === "DRAFT") {
    closedReason = "لم يُنشر هذا الاختبار بعد.";
  } else if (exam.status === "CLOSED") {
    closedReason = "أُغلق هذا الاختبار ولم يعد متاحاً.";
  } else if (exam.startsAt && now.getTime() < exam.startsAt.getTime()) {
    closedReason = `يبدأ هذا الاختبار في ${exam.startsAt.toLocaleString("ar")}.`;
  } else if (exam.endsAt && now.getTime() >= exam.endsAt.getTime()) {
    closedReason = "انتهت نافذة هذا الاختبار.";
  }

  return {
    title: exam.title,
    description: exam.description,
    instructions: exam.instructions,
    durationMinutes: exam.durationMinutes,
    questionCount: exam._count.questions,
    requiresStudentId: exam.requiresStudentId,
    studentIdLabel: exam.studentIdLabel,
    status: exam.status,
    isOpen,
    closedReason,
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
  };
}

export type StudentQuestion = {
  id: string;
  text: string;
  points: number;
  type: SupportedQuestionType;
  options: { id: string; text: string }[];
};

/** أسئلة الطالب: بلا isCorrect وبلا شرح. */
function sanitizeQuestions(
  questions: CachedExamQuestion[],
  seed: string,
  shuffleQuestions: boolean,
  shuffleOptions: boolean,
): StudentQuestion[] {
  const ordered = shuffleQuestions ? shuffled(questions, seed) : [...questions];
  return ordered.map((question) => ({
    id: question.externalId,
    text: question.text,
    points: question.points,
    type: question.type,
    options: shuffleOptions
      ? shuffled(question.options, `${seed}:${question.externalId}`).map((option) => ({
          id: option.externalId,
          text: option.text,
        }))
      : question.options.map((option) => ({ id: option.externalId, text: option.text })),
  }));
}

async function countUsedAttempts(examId: string, identifierHash: string | null) {
  if (!identifierHash) return 0;
  return prisma.examAttempt.count({ where: { examId, identifierHash } });
}

export type StartAttemptResult = {
  attemptId: string;
  accessToken: string;
  expiresAt: Date;
  questions: StudentQuestion[];
};

/**
 * بدء محاولة: يتحقق من التوفر، المعرّف، وحدّ المحاولات على الخادم.
 * رمز الوصول يُعاد مرة واحدة فقط هنا (يُخزَّن في رابط الطالب).
 */
export async function startAttempt(
  publicToken: string,
  input: StartAttemptInput,
): Promise<StartAttemptResult> {
  const exam = await prisma.exam.findUnique({
    where: { publicToken },
    select: { ...examStudentFields, _count: { select: { questions: true } } },
  });
  if (!exam) throw new NotFoundError("رابط الاختبار غير صحيح أو تم حذفه.");

  if (exam.requiresStudentId && !input.studentIdentifier) {
    throw new ValidationError(
      `هذا الاختبار يطلب ${exam.studentIdLabel ?? "مُعرّفاً"} قبل البدء.`,
    );
  }

  const identifierHash = input.studentIdentifier
    ? hashStudentIdentifier(input.studentIdentifier)
    : null;
  const usedAttempts = await countUsedAttempts(exam.id, identifierHash);

  const now = new Date();
  const eligibility = evaluateStartEligibility({
    status: exam.status,
    questionCount: exam._count.questions,
    window: { startsAt: exam.startsAt, endsAt: exam.endsAt },
    now,
    usedAttempts,
    maxAttempts: exam.maxAttempts,
    requiresStudentId: exam.requiresStudentId,
    hasIdentifier: Boolean(input.studentIdentifier),
  });
  if (!eligibility.allowed) {
    throw new ConflictError(eligibility.message);
  }

  const accessToken = generateToken(32);
  const expiresAt = computeExpiresAt(now, exam.durationMinutes, {
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
  });

  const [attempt, questions] = await Promise.all([
    prisma.examAttempt.create({
      data: {
        examId: exam.id,
        studentName: input.studentName,
        studentIdentifier: input.studentIdentifier,
        identifierHash,
        accessTokenHash: hashToken(accessToken),
        startedAt: now,
        expiresAt,
      },
      select: { id: true },
    }),
    getCachedExamQuestions(exam.id),
  ]);

  return {
    attemptId: attempt.id,
    accessToken,
    expiresAt,
    questions: sanitizeQuestions(
      questions,
      attempt.id,
      exam.shuffleQuestions,
      exam.shuffleOptions,
    ),
  };
}

/**
 * تحميل محاولة عبر رمز الوصول.
 * لا يمكن لأي طالب الوصول إلى محاولة غيره: الرمز عشوائي 256 بت
 * ونتحقق من ارتباطه بالاختبار المحدد في الرابط.
 */
export async function getAttemptByAccessToken(
  publicToken: string,
  accessToken: string,
): Promise<{ exam: ExamForStudent; attempt: { id: string; status: string; expiresAt: Date } }> {
  const exam = await prisma.exam.findUnique({
    where: { publicToken },
    select: examStudentFields,
  });
  if (!exam) throw new NotFoundError("رابط الاختبار غير صحيح أو تم حذفه.");

  const attempt = await prisma.examAttempt.findFirst({
    where: { accessTokenHash: hashToken(accessToken), examId: exam.id },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!attempt) throw new NotFoundError("محاولة غير موجودة أو الرمز غير صحيح.");

  return {
    exam,
    attempt: { id: attempt.id, status: attempt.status, expiresAt: attempt.expiresAt },
  };
}

/**
 * خريطة من المعرّف الخارجي (يراه الطالب) إلى بيانات التدريج.
 * نُبقي المعرّف الداخلي (قاعدة البيانات) بجانبه صراحةً حتى لا نخلط بين
 * المعرّفين عند الكتابة — الخلط بينهما ينتج أخطاء مفاتيح خارجية.
 */
type GradeableEntry = GradeableQuestion & { internalId: string };

function toGradeableQuestions(
  questions: CachedExamQuestion[],
): Map<string, GradeableEntry> {
  return new Map(
    questions.map((question) => [
      question.externalId,
      {
        id: question.externalId,
        internalId: question.id,
        type: question.type,
        points: question.points,
        correctOptionIds: question.options
          .filter((option) => option.isCorrect)
          .map((option) => option.externalId),
        optionIds: question.options.map((option) => option.externalId),
      },
    ]),
  );
}

/** حفظ الإجابات (autosave). لا يقيّم ولا ينهي المحاولة. */
export async function saveAnswers(
  publicToken: string,
  accessToken: string,
  payload: SubmittedAnswersInput,
): Promise<{ saved: number; savedAt: Date; finalized: boolean }> {
  const exam = await prisma.exam.findUnique({ where: { publicToken }, select: { id: true } });
  if (!exam) throw new NotFoundError("رابط الاختبار غير صحيح أو تم حذفه.");

  const [attempt, questions] = await Promise.all([
    prisma.examAttempt.findFirst({
      where: { accessTokenHash: hashToken(accessToken), examId: exam.id },
      select: { id: true, status: true, expiresAt: true },
    }),
    getCachedExamQuestions(exam.id),
  ]);
  if (!attempt) throw new NotFoundError("محاولة غير موجودة أو الرمز غير صحيح.");

  if (attempt.status === "SUBMITTED") {
    // تكرار بعد التسليم: لا نكتب شيئاً ونُبلغ العميل بأن المحاولة النهائية.
    return { saved: 0, savedAt: new Date(), finalized: true };
  }

  const gradeable = toGradeableQuestions(questions);

  // نتحقق من صلاحية كل إجابة قبل الكتابة (معرّفات سؤال/خيار صحيحة، بلا تكرار)
  validateSubmission(gradeable, payload.answers);

  const now = new Date();
  if (hasExpired(attempt.expiresAt, now)) {
    // انتهت المهلة: نُنهي المحاولة بالإجابات المحفوظة حتى الآن.
    await finalizeAttempt(exam.id, attempt.id);
    return { saved: 0, savedAt: now, finalized: true };
  }

  const answerRows = payload.answers
    .map((answer) => {
      const questionId = gradeable.get(answer.questionId)?.internalId;
      if (!questionId) return null;
      return {
        id: randomUUID(),
        attemptId: attempt.id,
        questionId,
        selectedOptionIds: [...new Set(answer.selectedOptionIds)],
        earnedPoints: 0,
        isCorrect: false,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (answerRows.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        await tx.attemptAnswer.deleteMany({
          where: {
            attemptId: attempt.id,
            questionId: { in: answerRows.map((row) => row.questionId) },
          },
        });
        await tx.attemptAnswer.createMany({ data: answerRows });
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }

  return { saved: payload.answers.length, savedAt: new Date(), finalized: false };
}

function validateSubmission(
  gradeable: Map<string, GradeableEntry>,
  answers: SubmittedAnswersInput["answers"],
) {
  try {
    gradeAttempt(
      [...gradeable.values()],
      answers.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionIds: answer.selectedOptionIds,
      })),
    );
  } catch (error) {
    if (error instanceof GradeInputError) {
      throw new ValidationError(`إجابات غير صالحة: ${error.problems[0]}`);
    }
    throw error;
  }
}

/**
 * إنهاء المحاولة وتقييمها — idempotent.
 * إذا كانت المحاولة مُسلّمة مسبقاً نُعيد النتيجة المخزّنة كما هي.
 * يدعم تمرير الإجابات النهائية مباشرةً لتجنب تكرار الاستعلامات المتسلسلة.
 */
export async function finalizeAttempt(
  examId: string,
  attemptId: string,
  incomingAnswers?: SubmittedAnswersInput["answers"],
) {
  const [attempt, questions] = await Promise.all([
    prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      include: { answers: true },
    }),
    getCachedExamQuestions(examId),
  ]);
  if (!attempt) throw new NotFoundError("المحاولة غير موجودة.");

  if (attempt.status === "SUBMITTED" && attempt.gradedAt) {
    return {
      alreadyFinalized: true,
      earnedScore: attempt.earnedScore?.toNumber() ?? 0,
      maximumScore: attempt.maximumScore?.toNumber() ?? 0,
      percentage: attempt.percentage?.toNumber() ?? null,
      submittedAt: attempt.submittedAt,
    };
  }

  const gradeable = toGradeableQuestions(questions);
  if (incomingAnswers) {
    validateSubmission(gradeable, incomingAnswers);
  }

  // دمج الإجابات المحفوظة مسبقاً مع الإجابات المرسلة لحظة التسليم النهائي
  const externalById = new Map(questions.map((q) => [q.id, q.externalId]));
  const mergedByExternalId = new Map<string, string[]>();

  for (const existing of attempt.answers) {
    const extId = externalById.get(existing.questionId);
    if (extId) {
      mergedByExternalId.set(extId, existing.selectedOptionIds);
    }
  }
  if (incomingAnswers) {
    for (const incoming of incomingAnswers) {
      mergedByExternalId.set(incoming.questionId, [...new Set(incoming.selectedOptionIds)]);
    }
  }

  const mergedList = [...mergedByExternalId.entries()].map(([questionId, selectedOptionIds]) => ({
    questionId,
    selectedOptionIds,
  }));

  const graded = gradeAttempt([...gradeable.values()], mergedList);
  const submittedAt = attempt.submittedAt ?? new Date();

  const gradedAnswerRows = graded.answers
    .filter((ans) => mergedByExternalId.has(ans.questionId))
    .map((ans) => {
      const questionId = gradeable.get(ans.questionId)?.internalId;
      if (!questionId) return null;
      return {
        id: randomUUID(),
        attemptId,
        questionId,
        selectedOptionIds: ans.selectedOptionIds,
        earnedPoints: ans.earnedPoints,
        isCorrect: ans.isCorrect,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // تحديث مشروط على الحالة + حفظ درجات كل سؤال دفعة واحدة (createMany) داخل معاملة سريعة.
  const didUpdate = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.examAttempt.updateMany({
        where: { id: attemptId, status: "IN_PROGRESS" },
        data: {
          status: "SUBMITTED",
          submittedAt,
          gradedAt: new Date(),
          earnedScore: graded.earnedScore,
          maximumScore: graded.maximumScore,
          percentage: graded.percentage,
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.attemptAnswer.deleteMany({ where: { attemptId } });
      if (gradedAnswerRows.length > 0) {
        await tx.attemptAnswer.createMany({ data: gradedAnswerRows });
      }
      return true;
    },
    { maxWait: 15000, timeout: 30000 },
  );

  if (!didUpdate) {
    // فاز طلب آخر بالسباق: نقرأ النتيجة النهائية بدل الكتابة فوقها.
    const fresh = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { earnedScore: true, maximumScore: true, percentage: true, submittedAt: true },
    });
    return {
      alreadyFinalized: true,
      earnedScore: fresh.earnedScore?.toNumber() ?? 0,
      maximumScore: fresh.maximumScore?.toNumber() ?? 0,
      percentage: fresh.percentage?.toNumber() ?? null,
      submittedAt: fresh.submittedAt,
    };
  }

  return {
    alreadyFinalized: false,
    earnedScore: graded.earnedScore,
    maximumScore: graded.maximumScore,
    percentage: graded.percentage,
    submittedAt,
  };
}

/** تسليم المحاولة من طرف الطالب (مع حفظ وتصحيح الإجابات الأخيرة في خطوة واحدة سريعة). */
export async function submitAttempt(
  publicToken: string,
  accessToken: string,
  payload: SubmittedAnswersInput | null,
) {
  const exam = await prisma.exam.findUnique({ where: { publicToken }, select: { id: true } });
  if (!exam) throw new NotFoundError("رابط الاختبار غير صحيح أو تم حذفه.");

  const attempt = await prisma.examAttempt.findFirst({
    where: { accessTokenHash: hashToken(accessToken), examId: exam.id },
    select: { id: true, status: true },
  });
  if (!attempt) throw new NotFoundError("محاولة غير موجودة أو الرمز غير صحيح.");

  return finalizeAttempt(
    exam.id,
    attempt.id,
    attempt.status === "IN_PROGRESS" && payload ? payload.answers : undefined,
  );
}

export type StudentQuestionReviewItem = {
  questionId: string;
  text: string;
  type: SupportedQuestionType;
  points: number;
  earnedPoints: number;
  isCorrect: boolean;
  unanswered: boolean;
  explanation: string | null;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
    selected: boolean;
  }[];
};

export type StudentResultView = {
  status: string;
  submittedAt: Date | null;
  expiresAt: Date;
  /** null = لم تُعرض النتيجة بعد (نتائج مخفية بقرار المعلم) */
  result: { earnedScore: number; maximumScore: number; percentage: number | null } | null;
  /** تفاصيل الأسئلة والإجابات ومراجعة الأخطاء — تظهر فقط عندما يُسمح للطالب برؤية النتيجة */
  review: StudentQuestionReviewItem[] | null;
  resultsHiddenBecause: "MANUAL_NOT_RELEASED" | "NOT_SUBMITTED" | null;
  resultVisibility: "IMMEDIATE" | "MANUAL";
  resultsReleased: boolean;
};

/**
 * عرض نتيجة الطالب — سياسة visibility مفروضة على الخادم:
 * IMMEDIATE: النتيجة ومراجعة الأخطاء متاحة بعد التسليم مباشرة.
 * MANUAL: النتيجة ومراجعة الأخطاء تظهر فقط بعد أن يضغط المعلم "إصدار النتائج".
 */
export async function getStudentResult(
  publicToken: string,
  accessToken: string,
): Promise<StudentResultView> {
  const exam = await prisma.exam.findUnique({
    where: { publicToken },
    select: {
      id: true,
      resultVisibility: true,
      resultsReleasedAt: true,
      attempts: {
        where: { accessTokenHash: hashToken(accessToken) },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          expiresAt: true,
          earnedScore: true,
          maximumScore: true,
          percentage: true,
          answers: {
            select: {
              questionId: true,
              selectedOptionIds: true,
              earnedPoints: true,
              isCorrect: true,
            },
          },
        },
      },
    },
  });
  if (!exam) throw new NotFoundError("رابط الاختبار غير صحيح أو تم حذفه.");

  const attempt = exam.attempts[0];
  if (!attempt) throw new NotFoundError("محاولة غير موجودة أو الرمز غير صحيح.");

  const resultsReleased = exam.resultsReleasedAt !== null;
  const canView =
    attempt.status === "SUBMITTED" && (exam.resultVisibility === "IMMEDIATE" || resultsReleased);

  let review: StudentQuestionReviewItem[] | null = null;
  if (canView) {
    const questions = await getCachedExamQuestions(exam.id);

    const answerByQuestionId = new Map(
      attempt.answers.map((ans) => [ans.questionId, ans]),
    );

    review = questions.map((question) => {
      const answer = answerByQuestionId.get(question.id);
      const selectedSet = new Set(answer?.selectedOptionIds ?? []);
      const unanswered = selectedSet.size === 0;
      const isCorrect = answer?.isCorrect ?? false;
      const earnedPoints = answer?.earnedPoints ? answer.earnedPoints.toNumber() : 0;

      return {
        questionId: question.externalId,
        text: question.text,
        type: question.type,
        points: question.points,
        earnedPoints,
        isCorrect,
        unanswered,
        explanation: question.explanation,
        options: question.options.map((opt) => ({
          id: opt.externalId,
          text: opt.text,
          isCorrect: opt.isCorrect,
          selected: selectedSet.has(opt.externalId),
        })),
      };
    });
  }

  return {
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    expiresAt: attempt.expiresAt,
    result: canView
      ? {
          earnedScore: attempt.earnedScore?.toNumber() ?? 0,
          maximumScore: attempt.maximumScore?.toNumber() ?? 0,
          percentage: attempt.percentage?.toNumber() ?? null,
        }
      : null,
    review,
    resultsHiddenBecause:
      attempt.status !== "SUBMITTED"
        ? "NOT_SUBMITTED"
        : canView
          ? null
          : "MANUAL_NOT_RELEASED",
    resultVisibility: exam.resultVisibility,
    resultsReleased,
  };
}

/** إعادة تحميل الأسئلة والإجابات المحفوظة عند العودة إلى المحاولة. */
export async function resumeAttempt(publicToken: string, accessToken: string) {
  const { exam } = await getAttemptByAccessToken(publicToken, accessToken);
  const [attempt, questions] = await Promise.all([
    prisma.examAttempt.findFirst({
      where: { accessTokenHash: hashToken(accessToken) },
      include: { answers: { select: { questionId: true, selectedOptionIds: true } } },
    }),
    getCachedExamQuestions(exam.id),
  ]);
  if (!attempt) throw new NotFoundError("محاولة غير موجودة أو الرمز غير صحيح.");

  const externalById = new Map(questions.map((row) => [row.id, row.externalId]));

  const answers: Record<string, string[]> = {};
  for (const answer of attempt.answers) {
    const externalId = externalById.get(answer.questionId);
    if (externalId) answers[externalId] = answer.selectedOptionIds;
  }

  return {
    status: attempt.status as string,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    questions: sanitizeQuestions(
      questions,
      attempt.id,
      exam.shuffleQuestions,
      exam.shuffleOptions,
    ),
    answers,
  };
}
