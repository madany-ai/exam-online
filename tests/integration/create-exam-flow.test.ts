import { describe, expect, it } from "vitest";
import { createExamWithImport } from "@/features/questions/import-service";
import { startAttempt } from "@/features/attempts/service";
import { EXAMPLE_IMPORT_JSON } from "@/features/questions/example-document";
import { examSettingsSchema, startAttemptSchema } from "@/features/exams/schema";
import { ConflictError, ValidationError } from "@/lib/errors";
import { createTeacher, prisma } from "./helpers";

/**
 * المسار الأسرع للمعلم: إنشاء الاختبار + استيراد الأسئلة في خطوة واحدة،
 * مع رقم التليفون ك basis لتطبيق حدّ المحاولات.
 */

const baseSettings = {
  title: "اختبار Genetics قصير",
  description: null,
  instructions: null,
  durationMinutes: 30,
  maxAttempts: 2,
  startsAt: null,
  endsAt: null,
  shuffleQuestions: false,
  shuffleOptions: false,
  resultVisibility: "IMMEDIATE" as const,
  requiresStudentId: true,
  studentIdLabel: "رقم التليفون",
};

describe("إنشاء اختبار مع استيراد الأسئلة في خطوة واحدة", () => {
  it("ينشئ الاختبار والأسئلة في معاملة واحدة", async () => {
    const teacher = await createTeacher();

    const created = await createExamWithImport(teacher.id, baseSettings, EXAMPLE_IMPORT_JSON);

    expect(created.questionCount).toBe(4);
    const exam = await prisma.exam.findUniqueOrThrow({
      where: { id: created.examId },
      include: { questions: { include: { options: true } } },
    });
    expect(exam.status).toBe("DRAFT");
    expect(exam.questions).toHaveLength(4);
    expect(exam.requiresStudentId).toBe(true);
    expect(exam.studentIdLabel).toBe("رقم التليفون");
    expect(exam.publicToken.length).toBeGreaterThanOrEqual(32);
  });

  it("ينشئ الاختبار وينشره فوراً عند موافقة المعلم (publishImmediately)", async () => {
    const teacher = await createTeacher();

    const created = await createExamWithImport(teacher.id, baseSettings, EXAMPLE_IMPORT_JSON, {
      publishImmediately: true,
    });

    expect(created.status).toBe("PUBLISHED");
    expect(created.questionCount).toBe(4);
    const exam = await prisma.exam.findUniqueOrThrow({
      where: { id: created.examId },
    });
    expect(exam.status).toBe("PUBLISHED");
  });

  it("لا ينشئ أي شيء إذا كان الملف غير صالح (لا اختبار يتيم)", async () => {
    const teacher = await createTeacher();
    const invalid = JSON.stringify({
      schemaVersion: "1.0",
      title: "ملف تالف",
      questions: [
        {
          id: "q1",
          type: "SINGLE_CHOICE",
          text: "سؤال",
          points: 1,
          options: [
            { id: "a", text: "أ" },
            { id: "b", text: "ب" },
          ],
          correctOptionIds: ["missing"],
        },
      ],
    });

    await expect(
      createExamWithImport(teacher.id, baseSettings, invalid),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await prisma.exam.count()).toBe(0);
    expect(await prisma.question.count()).toBe(0);
  });
});

describe("حدّ المحاولات برقم التليفون", () => {
  it("يسمح بالعدد المسموح ثم يمنع الرقم نفسه", async () => {
    const teacher = await createTeacher();
    const created = await createExamWithImport(
      teacher.id,
      { ...baseSettings, maxAttempts: 2 },
      EXAMPLE_IMPORT_JSON,
    );
    await prisma.exam.update({
      where: { id: created.examId },
      data: { status: "PUBLISHED" },
    });

    const phone = "01012345678";

    // المحاولة الأولى
    const first = await startAttempt(created.publicToken, {
      studentName: "أحمد",
      studentIdentifier: phone,
    });
    expect(first.attemptId).toBeTruthy();

    // المحاولة الثانية لنفس الرقم
    const second = await startAttempt(created.publicToken, {
      studentName: "أحمد",
      studentIdentifier: phone,
    });
    expect(second.attemptId).toBeTruthy();

    // الثالثة تُرفض — الرابط "يبوز" بالنسبة لهذا الرقم
    await expect(
      startAttempt(created.publicToken, { studentName: "أحمد", studentIdentifier: phone }),
    ).rejects.toBeInstanceOf(ConflictError);

    // لكن رقماً آخر يستطيع المحاولة
    const other = await startAttempt(created.publicToken, {
      studentName: "محمود",
      studentIdentifier: "01099999999",
    });
    expect(other.attemptId).toBeTruthy();
  });

  it("يتعامل مع صيغ مختلفة للرقم نفسه كرقم واحد", async () => {
    const teacher = await createTeacher();
    const created = await createExamWithImport(
      teacher.id,
      { ...baseSettings, maxAttempts: 1 },
      EXAMPLE_IMPORT_JSON,
    );
    await prisma.exam.update({
      where: { id: created.examId },
      data: { status: "PUBLISHED" },
    });

    await startAttempt(created.publicToken, {
      studentName: "أحمد",
      studentIdentifier: "01012345678",
    });

    // مسافات بنفس الرقم يجب ألّا تمنح محاولة إضافية
    await expect(
      startAttempt(created.publicToken, {
        studentName: "أحمد",
        studentIdentifier: "  01012345678  ",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("التحقق من مُعرّف الطالب", () => {
  it("يقبل إعدادات الاختبار مع حقل رقم التليفون", () => {
    expect(examSettingsSchema.safeParse(baseSettings).success).toBe(true);
  });

  it("يطبّق قاعدة شكل رقم التليفون عند بدء المحاولة", () => {
    expect(
      startAttemptSchema.safeParse({ studentName: "سارة", studentIdentifier: "01012345678" })
        .success,
    ).toBe(true);
    expect(
      startAttemptSchema.safeParse({ studentName: "سارة", studentIdentifier: "12" }).success,
    ).toBe(false);
    expect(
      startAttemptSchema.safeParse({ studentName: "سارة", studentIdentifier: "abcdefghij" })
        .success,
    ).toBe(false);
  });
});
