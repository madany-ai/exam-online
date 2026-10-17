import { describe, expect, it } from "vitest";
import {
  createExam,
  deleteExam,
  getExamForTeacher,
  getSubmissionDetail,
  hideResults,
  listSubmissions,
  releaseResults,
  transitionExam,
  updateExam,
} from "@/features/exams/service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { createExamWithQuestions, createTeacher, prisma } from "./helpers";

const baseSettings = {
  title: "اختبار جديد",
  description: null,
  instructions: null,
  durationMinutes: 20,
  maxAttempts: 1,
  startsAt: null,
  endsAt: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  resultVisibility: "MANUAL" as const,
  requiresStudentId: false,
  studentIdLabel: null,
};

describe("عزل ملكية الاختبارات", () => {
  it("يمنع معلماً آخر من قراءة اختبار لا يخصّه", async () => {
    const owner = await createTeacher({ name: "المالك" });
    const intruder = await createTeacher({ name: "آخر" });
    const { exam } = await createExamWithQuestions(owner.id);

    await expect(getExamForTeacher(intruder.id, exam.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("يمنع معلماً آخر من تعديل اختبار لا يخصّه", async () => {
    const owner = await createTeacher();
    const intruder = await createTeacher();
    const { exam } = await createExamWithQuestions(owner.id);

    await expect(
      updateExam(intruder.id, exam.id, { ...baseSettings, title: "مُختَرَق" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const untouched = await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } });
    expect(untouched.title).toBe(exam.title);
  });

  it("يمنع معلماً آخر من حذف اختبار لا يخصّه", async () => {
    const owner = await createTeacher();
    const intruder = await createTeacher();
    const { exam } = await createExamWithQuestions(owner.id, { status: "CLOSED" });

    // ترفض الخدمة الوصول برسالة "غير موجود" حتى لا تكشف وجود اختبار يخصّ معلماً آخر
    await expect(deleteExam(intruder.id, exam.id, exam.title)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await prisma.exam.count()).toBe(1);
  });

  it("يمنع معلماً آخر من قراءة محاولات اختبار لا يخصّه", async () => {
    const owner = await createTeacher();
    const intruder = await createTeacher();
    const { exam } = await createExamWithQuestions(owner.id);

    await expect(listSubmissions(intruder.id, exam.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getSubmissionDetail(intruder.id, exam.id, "any-attempt")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("يعيد 404 لاختبار غير موجود", async () => {
    const teacher = await createTeacher();
    await expect(getExamForTeacher(teacher.id, "does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("دورة حياة الاختبار", () => {
  it("ينشئ اختباراً كمسودة برابط عام عشوائي", async () => {
    const teacher = await createTeacher();
    const exam = await createExam(teacher.id, baseSettings);

    expect(exam.status).toBe("DRAFT");
    expect(exam.publicToken.length).toBeGreaterThanOrEqual(32);
  });

  it("يمنع النشر بلا أسئلة", async () => {
    const teacher = await createTeacher();
    const exam = await createExam(teacher.id, baseSettings);

    await expect(transitionExam(teacher.id, exam.id, "PUBLISHED")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("يمرّ بالمسار المسموح فقط", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });

    const published = await transitionExam(teacher.id, exam.id, "PUBLISHED");
    expect(published.status).toBe("PUBLISHED");

    const closed = await transitionExam(teacher.id, exam.id, "CLOSED");
    expect(closed.status).toBe("CLOSED");

    await expect(transitionExam(teacher.id, exam.id, "PUBLISHED")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("يمنع تعديل اختبار منشور", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "PUBLISHED" });

    await expect(
      updateExam(teacher.id, exam.id, { ...baseSettings, title: "تعديل" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("يسمح بالتعديل بعد الإغلاق", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "CLOSED" });

    const updated = await updateExam(teacher.id, exam.id, {
      ...baseSettings,
      title: "عنوان محدّث",
    });
    expect(updated.title).toBe("عنوان محدّث");
  });
});

describe("الحذف التأكيدي", () => {
  it("يرفض الحذف بلا تطابق العنوان", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "CLOSED" });

    await expect(deleteExam(teacher.id, exam.id, "عنوان خاطئ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await prisma.exam.count()).toBe(1);
  });

  it("يرفض حذف اختبار منشور قبل إغلاقه", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "PUBLISHED" });

    await expect(deleteExam(teacher.id, exam.id, exam.title)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("يحذف الاختبار وأسئلته بعد التطابق", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });

    await deleteExam(teacher.id, exam.id, exam.title);

    expect(await prisma.exam.count()).toBe(0);
    expect(await prisma.question.count()).toBe(0);
    expect(await prisma.questionOption.count()).toBe(0);
  });
});

describe("إصدار النتائج (إعداد منفصل عن النشر)", () => {
  it("يرفض إصدار النتائج قبل وجود محاولات مسلّمة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "PUBLISHED" });

    await expect(releaseResults(teacher.id, exam.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("يسجّل وقت الإصدار ثم يسمح بالإخفاء", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "PUBLISHED" });

    await prisma.examAttempt.create({
      data: {
        examId: exam.id,
        studentName: "طالب",
        accessTokenHash: "hash-1",
        expiresAt: new Date(Date.now() - 60_000),
        status: "SUBMITTED",
        submittedAt: new Date(),
        gradedAt: new Date(),
        earnedScore: 3,
        maximumScore: 6,
        percentage: 50,
      },
    });

    const released = await releaseResults(teacher.id, exam.id);
    expect(released.resultsReleasedAt).not.toBeNull();

    const hidden = await hideResults(teacher.id, exam.id);
    expect(hidden.resultsReleasedAt).toBeNull();
  });

  it("لا يغيّر إصدار النتائج حالة نشر الاختبار", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "PUBLISHED" });

    await prisma.examAttempt.create({
      data: {
        examId: exam.id,
        studentName: "طالب",
        accessTokenHash: "hash-2",
        expiresAt: new Date(Date.now() - 60_000),
        status: "SUBMITTED",
        submittedAt: new Date(),
        gradedAt: new Date(),
        earnedScore: 6,
        maximumScore: 6,
        percentage: 100,
      },
    });

    const released = await releaseResults(teacher.id, exam.id);
    expect(released.status).toBe("PUBLISHED");
  });
});
