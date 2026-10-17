import { prisma } from "@/lib/db/prisma";
import { generateToken } from "@/lib/security/random";
import { appUrl } from "@/lib/env";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { ExamSettingsInput } from "@/features/exams/schema";
import { evaluateTransition } from "@/features/attempts/policy";
import { invalidateExamQuestionsCache } from "@/lib/cache/exam-cache";

/**
 * منطق الاختبارات من منظور المعلم.
 * كل دالة تستقبل teacherId من الجلسة على الخادم (لا نثق بمعرّف مرسل من العميل)
 * وتتحقق من الملكية داخل الاستعلام نفسه.
 */

const examInclude = {
  questions: {
    orderBy: { order: "asc" },
    include: { options: { orderBy: { order: "asc" } } },
  },
} as const;

export type ExamWithQuestions = Awaited<ReturnType<typeof getExamForTeacher>>;

/** قراءة اختبار مع التحقق من الملكية — أساس كل عمليات التعديل. */
export async function getExamForTeacher(teacherId: string, examId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, teacherId },
    include: examInclude,
  });
  if (!exam) {
    // نميّز بين "غير موجود" و"غير مملوك" بشكل آمن:
    // نتحقق من وجود السجل فقط لتسجيل operador، لكن الرسالة للمستخدم واحدة.
    const exists = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
    throw exists ? new ForbiddenError("هذا الاختبار لا يخصك.") : new NotFoundError("الاختبار غير موجود.");
  }
  return exam;
}

export async function listExams(teacherId: string) {
  return prisma.exam.findMany({
    where: { teacherId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
  });
}

export async function createExam(teacherId: string, input: ExamSettingsInput) {
  return prisma.exam.create({
    data: {
      teacherId,
      publicToken: generateToken(24),
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      durationMinutes: input.durationMinutes,
      maxAttempts: input.maxAttempts,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      resultVisibility: input.resultVisibility,
      requiresStudentId: input.requiresStudentId,
      studentIdLabel: input.studentIdLabel,
      status: "DRAFT",
    },
  });
}

/** التعديل مسموح في المسودة فقط (أو بعد الإغلاق). لا تُعدَّل اختبارات منشورة. */
export function assertEditable(status: string) {
  if (status === "PUBLISHED") {
    throw new ConflictError(
      "لا يمكن تعديل اختبار منشور. أغلق الاختبار أولاً ثم عدّل، ثم أعد نشره.",
    );
  }
}

export async function updateExam(
  teacherId: string,
  examId: string,
  input: ExamSettingsInput,
) {
  const exam = await getExamForTeacher(teacherId, examId);
  assertEditable(exam.status);

  return prisma.exam.update({
    where: { id: exam.id },
    data: {
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      durationMinutes: input.durationMinutes,
      maxAttempts: input.maxAttempts,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      resultVisibility: input.resultVisibility,
      requiresStudentId: input.requiresStudentId,
      studentIdLabel: input.studentIdLabel,
    },
  });
}

export async function transitionExam(
  teacherId: string,
  examId: string,
  to: "DRAFT" | "PUBLISHED" | "CLOSED",
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, teacherId },
    include: { _count: { select: { questions: true, attempts: true } } },
  });
  if (!exam) throw new NotFoundError("الاختبار غير موجود.");

  const verdict = evaluateTransition({
    from: exam.status,
    to,
    questionCount: exam._count.questions,
    attemptCount: exam._count.attempts,
  });
  if (!verdict.allowed) {
    throw new ConflictError(verdict.reason ?? "انتقال الحالة غير مسموح.");
  }

  return prisma.exam.update({
    where: { id: exam.id },
    data: { status: to },
  });
}

/** إصدار النتائج — إعداد منفصل تماماً عن حالة نشر الاختبار. */
export async function releaseResults(teacherId: string, examId: string) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, teacherId } });
  if (!exam) throw new NotFoundError("الاختبار غير موجود.");
  const submittedCount = await prisma.examAttempt.count({
    where: { examId: exam.id, status: "SUBMITTED" },
  });
  if (submittedCount === 0) {
    throw new ValidationError("لا توجد محاولات مُسلّمة بعد لإصدار نتائجها.");
  }
  return prisma.exam.update({
    where: { id: exam.id },
    data: { resultsReleasedAt: new Date() },
  });
}

export async function hideResults(teacherId: string, examId: string) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, teacherId } });
  if (!exam) throw new NotFoundError("الاختبار غير موجود.");
  return prisma.exam.update({ where: { id: exam.id }, data: { resultsReleasedAt: null } });
}

/**
 * حذف اختبار — عملية تدميرية تتطلب:
 * 1) أن يكون الاختبار غير منشور (مسودة أو مغلق)
 * 2) كتابة عنوان الاختبار حرفياً للتأكيد
 * تُحذف الأسئلة والخيارات والمحاولات المرتبطة (cascade على مستوى القاعدة).
 */
export async function deleteExam(
  teacherId: string,
  examId: string,
  confirmationTitle: string,
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, teacherId },
    include: { _count: { select: { attempts: true } } },
  });
  if (!exam) throw new NotFoundError("الاختبار غير موجود.");

  if (exam.status === "PUBLISHED") {
    throw new ConflictError("أغلق الاختبار أولاً قبل حذفه.");
  }
  if (confirmationTitle.trim() !== exam.title.trim()) {
    throw new ValidationError("عنوان التأكيد لا يطابق عنوان الاختبار.");
  }

  await prisma.exam.delete({ where: { id: exam.id } });
  invalidateExamQuestionsCache(exam.id);
  return { deletedQuestionsAndAttempts: true, attemptsRemoved: exam._count.attempts };
}

export async function getDashboardOverview(teacherId: string) {
  const [total, drafts, published, closed, submissions, recent] = await Promise.all([
    prisma.exam.count({ where: { teacherId } }),
    prisma.exam.count({ where: { teacherId, status: "DRAFT" } }),
    prisma.exam.count({ where: { teacherId, status: "PUBLISHED" } }),
    prisma.exam.count({ where: { teacherId, status: "CLOSED" } }),
    prisma.examAttempt.count({ where: { exam: { teacherId } } }),
    prisma.exam.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { questions: true, attempts: true } } },
    }),
  ]);

  return { total, drafts, published, closed, submissions, recent };
}

export async function listSubmissions(
  teacherId: string,
  examId: string,
  options: { status?: "IN_PROGRESS" | "SUBMITTED"; query?: string } = {},
) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, teacherId } });
  if (!exam) throw new NotFoundError("الاختبار غير موجود.");

  return prisma.examAttempt.findMany({
    where: {
      examId: exam.id,
      ...(options.status ? { status: options.status } : {}),
      ...(options.query
        ? {
            OR: [
              { studentName: { contains: options.query, mode: "insensitive" } },
              { studentIdentifier: { contains: options.query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    take: 500,
  });
}

export async function getSubmissionDetail(teacherId: string, examId: string, attemptId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, teacherId },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });
  if (!exam) throw new NotFoundError("الاختبار غير موجود.");

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, examId: exam.id },
    include: { answers: true },
  });
  if (!attempt) throw new NotFoundError("المحاولة غير موجودة.");

  return { exam, attempt };
}

/** تصدير CSV بسيط للنتائج ( encoding UTF-8 مع BOM لفتحه في Excel بالعربية). */
export async function buildResultsCsv(teacherId: string, examId: string): Promise<string> {
  const attempts = await listSubmissions(teacherId, examId, { status: "SUBMITTED" });

  const header = ["اسم الطالب", "المعرّف", "الحالة", "بداية المحاولة", "وقت التسليم", "الدرجة", "الدرجة الكلية", "النسبة"];
  const rows = attempts.map((attempt) => [
    attempt.studentName,
    attempt.studentIdentifier ?? "",
    attempt.status === "SUBMITTED" ? "مُسلّم" : "جارٍ",
    attempt.startedAt.toISOString(),
    attempt.submittedAt?.toISOString() ?? "",
    attempt.earnedScore !== null ? attempt.earnedScore.toString() : "",
    attempt.maximumScore !== null ? attempt.maximumScore.toString() : "",
    attempt.percentage !== null ? attempt.percentage.toString() : "",
  ]);

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function publicExamUrl(publicToken: string): string {
  return `${appUrl()}/exam/${publicToken}`;
}

/** تحويل Decimal إلى رقم للعرض/التصدير (نتجنّب استيراد صنف Decimal مباشرةً). */
export function decimalToNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}
