import { hashPassword } from "@/lib/auth/password";
import { generateToken } from "@/lib/security/random";
import { prisma } from "./setup";

export { prisma };

export async function createTeacher(overrides: { email?: string; name?: string } = {}) {
  return prisma.teacher.create({
    data: {
      email: overrides.email ?? `teacher-${Math.random().toString(36).slice(2, 8)}@example.com`,
      name: overrides.name ?? "معلم تجريبي",
      passwordHash: await hashPassword("Password12345"),
    },
  });
}

type ExamOverrides = {
  status?: "DRAFT" | "PUBLISHED" | "CLOSED";
  durationMinutes?: number;
  maxAttempts?: number;
  resultVisibility?: "IMMEDIATE" | "MANUAL";
  startsAt?: Date | null;
  endsAt?: Date | null;
  requiresStudentId?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
};

/** ينشئ اختباراً مع أسئلة صحيحة/خاطئة معروفة للتدريج. */
export async function createExamWithQuestions(
  teacherId: string,
  overrides: ExamOverrides = {},
) {
  const exam = await prisma.exam.create({
    data: {
      teacherId,
      publicToken: generateToken(24),
      title: "اختبار تكاملي",
      durationMinutes: overrides.durationMinutes ?? 30,
      maxAttempts: overrides.maxAttempts ?? 1,
      resultVisibility: overrides.resultVisibility ?? "MANUAL",
      status: overrides.status ?? "PUBLISHED",
      startsAt: overrides.startsAt ?? null,
      endsAt: overrides.endsAt ?? null,
      requiresStudentId: overrides.requiresStudentId ?? false,
      shuffleQuestions: overrides.shuffleQuestions ?? false,
      shuffleOptions: overrides.shuffleOptions ?? false,
    },
  });

  const single = await prisma.question.create({
    data: {
      examId: exam.id,
      externalId: "q1",
      type: "SINGLE_CHOICE",
      text: "ما ناتج ٢ + ٢؟",
      points: 2,
      order: 0,
      options: {
        create: [
          { externalId: "a", text: "٣", order: 0, isCorrect: false },
          { externalId: "b", text: "٤", order: 1, isCorrect: true },
        ],
      },
    },
    include: { options: true },
  });

  const multiple = await prisma.question.create({
    data: {
      examId: exam.id,
      externalId: "q2",
      type: "MULTIPLE_CHOICE",
      text: "اختر كل الأعداد الزوجية",
      points: 3,
      order: 1,
      options: {
        create: [
          { externalId: "a", text: "٢", order: 0, isCorrect: true },
          { externalId: "b", text: "٣", order: 1, isCorrect: false },
          { externalId: "c", text: "٤", order: 2, isCorrect: true },
        ],
      },
    },
    include: { options: true },
  });

  await prisma.question.create({
    data: {
      examId: exam.id,
      externalId: "q3",
      type: "TRUE_FALSE",
      text: "الشمس نجم.",
      points: 1,
      order: 2,
      options: {
        create: [
          { externalId: "true", text: "صح", order: 0, isCorrect: true },
          { externalId: "false", text: "خطأ", order: 1, isCorrect: false },
        ],
      },
    },
  });

  return { exam, questions: { single, multiple } };
}

/** محاولة في الماضي انتهت مهلته — لمحاكاة انتهاء الوقت على الخادم. */
export async function createExpiredAttempt(examId: string, expiresMinutesAgo = 5) {
  const attempt = await prisma.examAttempt.create({
    data: {
      examId,
      studentName: "طالب متأخر",
      accessTokenHash: generateToken(20),
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - expiresMinutesAgo * 60_000),
    },
  });
  return attempt;
}
