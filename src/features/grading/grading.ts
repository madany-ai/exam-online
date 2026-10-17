import type { SupportedQuestionType } from "@/features/questions/import-schema";

/**
 * تدريج حتمي (deterministic) يتم على الخادم فقط.
 * لا يُرسل مفتاح الإجابات إلى متصفح الطالب قبل التسليم.
 *
 * تُحسب الدرجات بوحدات صغيرة (نصف نقطة = وحدة) لتجنّب أخطاء الفاصلة العائمة.
 */

export type GradeableQuestion = {
  id: string;
  type: SupportedQuestionType;
  points: number;
  /** المعرّفات الخارجية للخيارات الصحيحة (لا تُمرَّر للمتصفح) */
  correctOptionIds: string[];
  /** كل المعرّفات الصالحة للخيارات في السؤال */
  optionIds: string[];
};

export type SubmittedAnswerInput = {
  questionId: string;
  selectedOptionIds: string[];
};

export type GradedAnswer = {
  questionId: string;
  type: SupportedQuestionType;
  selectedOptionIds: string[];
  /** 0 = غير مجاب عليها */
  isAnswered: boolean;
  isCorrect: boolean;
  /** الدرجة المكتسبة من هذه السؤال */
  earnedPoints: number;
  maximumPoints: number;
};

export type GradeResult = {
  answers: GradedAnswer[];
  earnedScore: number;
  maximumScore: number;
  /** نسبة مئوية بخانتين عشريتين، أو null إذا كانت الدرجة الكلية صفراً */
  percentage: number | null;
};

export class GradeInputError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`إجابات غير صالحة: ${problems.join(" | ")}`);
    this.name = "GradeInputError";
    this.problems = problems;
  }
}

/**
 * نستخدم وحدات صغيرة بمقياس 100 (يطابق عمود Decimal(8,2) في قاعدة البيانات)
 * حتى تُحسب أي درجة ذات منزلتين عشريتين بدقة، بلا أخطاء فاصلة عائمة.
 */
const MINOR_UNIT_SCALE = 100;

export function toMinorUnits(points: number): number {
  return Math.round(points * MINOR_UNIT_SCALE);
}

export function fromMinorUnits(minor: number): number {
  return minor / MINOR_UNIT_SCALE;
}

function normalizeSelection(optionIds: string[]): string[] {
  return [...new Set(optionIds.map((id) => id.trim()).filter((id) => id.length > 0))].sort();
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/**
 * يفحص الإجابات مقابل أسئلة الاختبار ويرفض:
 * - معرّفات أسئلة غير موجودة في الاختبار
 * - خيارات غير موجودة ضمن خيارات السؤال
 * - إجابات مكررة لنفس السؤال أو قيم غير صالحة
 */
export function collectAnswerProblems(
  questions: GradeableQuestion[],
  answers: SubmittedAnswerInput[],
): string[] {
  const problems: string[] = [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const seenQuestionIds = new Set<string>();

  for (const answer of answers) {
    if (typeof answer?.questionId !== "string" || answer.questionId.length === 0) {
      problems.push("إجابة بدون معرّف سؤال");
      continue;
    }
    if (seenQuestionIds.has(answer.questionId)) {
      problems.push(`إجابة مكررة للسؤال ${answer.questionId}`);
      continue;
    }
    seenQuestionIds.add(answer.questionId);

    const question = questionById.get(answer.questionId);
    if (!question) {
      problems.push(`معرّف سؤال غير موجود في هذا الاختبار: ${answer.questionId}`);
      continue;
    }
    if (!Array.isArray(answer.selectedOptionIds)) {
      problems.push(`قائمة الخيارات غير صالحة للسؤال ${answer.questionId}`);
      continue;
    }
    const validOptionIds = new Set(question.optionIds);
    const unknown = answer.selectedOptionIds.filter((optionId) => !validOptionIds.has(optionId));
    if (unknown.length > 0) {
      problems.push(
        `خيارات غير صالحة للسؤال ${answer.questionId}: ${unknown.join("، ")}`,
      );
    }
    const selection = normalizeSelection(answer.selectedOptionIds);
    if (question.type !== "MULTIPLE_CHOICE" && selection.length > 1) {
      problems.push(`السؤال ${answer.questionId} يقبل خياراً واحداً فقط`);
    }
  }

  return problems;
}

/**
 * التدريج: نقاط كاملة عند التطابق التام في اختيار متعدد، وصفر عند غير ذلك.
 * الأسئلة غير المجاب عنها تُحتسب صفراً.
 */
export function gradeAttempt(
  questions: GradeableQuestion[],
  answers: SubmittedAnswerInput[],
): GradeResult {
  const problems = collectAnswerProblems(questions, answers);
  if (problems.length > 0) {
    throw new GradeInputError(problems);
  }

  const answersByQuestion = new Map(
    answers.map((answer) => [answer.questionId, normalizeSelection(answer.selectedOptionIds)]),
  );

  let earnedMinor = 0;
  let maximumMinor = 0;

  const gradedAnswers: GradedAnswer[] = questions.map((question) => {
    const maximum = toMinorUnits(question.points);
    maximumMinor += maximum;

    const selected = answersByQuestion.get(question.id) ?? [];
    const isAnswered = selected.length > 0;

    // التطابق يجب أن يكون على المجموعة كاملة (ترتيب مهمل)
    const isCorrect =
      isAnswered && question.correctOptionIds.length > 0 && sameSet(selected, normalizeSelection(question.correctOptionIds));

    const earned = isCorrect ? maximum : 0;
    earnedMinor += earned;

    return {
      questionId: question.id,
      type: question.type,
      selectedOptionIds: selected,
      isAnswered,
      isCorrect,
      earnedPoints: fromMinorUnits(earned),
      maximumPoints: fromMinorUnits(maximum),
    };
  });

  return {
    answers: gradedAnswers,
    earnedScore: fromMinorUnits(earnedMinor),
    maximumScore: fromMinorUnits(maximumMinor),
    // النسبة بنسبة من مئة، مقرّبة إلى خانتين عشريتين عبر وحدات صغيرة.
    percentage:
      maximumMinor === 0 ? null : Math.round((earnedMinor * 10_000) / maximumMinor) / 100,
  };
}
