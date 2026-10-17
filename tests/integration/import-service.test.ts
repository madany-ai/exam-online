import { describe, expect, it } from "vitest";
import { importQuestions, previewImport } from "@/features/questions/import-service";
import { ConflictError, ValidationError } from "@/lib/errors";
import { EXAMPLE_IMPORT_JSON } from "@/features/questions/example-document";
import { createExamWithQuestions, createTeacher, prisma } from "./helpers";

describe("استيراد الأسئلة من JSON", () => {
  it("معاينة ملف صالح لا تكتب شيئاً", async () => {
    const preview = previewImport(EXAMPLE_IMPORT_JSON);

    expect(preview.ok).toBe(true);
    expect(await prisma.question.count()).toBe(0);
  });

  it("يستورد الأسئلة مع الخيارات ومفتاح الإجابات", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });

    const summary = await importQuestions(teacher.id, exam.id, EXAMPLE_IMPORT_JSON);

    expect(summary.questionCount).toBe(4);
    expect(summary.replacedExisting).toBe(true);

    const questions = await prisma.question.findMany({
      where: { examId: exam.id },
      orderBy: { order: "asc" },
      include: { options: true },
    });

    expect(questions).toHaveLength(4);
    expect(questions.map((question) => question.externalId)).toEqual(["q1", "q2", "q3", "q4"]);

    const first = questions[0];
    expect(first?.type).toBe("SINGLE_CHOICE");
    expect(first?.points.toNumber()).toBe(1);
    // مفتاح الإجابة يُخزَّن relationally في الخيارات
    expect(first?.options.filter((option) => option.isCorrect).map((option) => option.externalId)).toEqual(
      ["b"],
    );
  });

  it("لا يستورد شيئاً عند فشل أي سؤال (كل أو لا شيء)", async () => {
    const teacher = await createTeacher();
    const exam = await prisma.exam.create({
      data: {
        teacherId: teacher.id,
        publicToken: "token-empty",
        title: "اختبار فارغ",
        durationMinutes: 30,
        maxAttempts: 1,
      },
    });

    const invalid = JSON.stringify({
      schemaVersion: "1.0",
      title: "ملف تالف",
      questions: [
        {
          id: "q1",
          type: "SINGLE_CHOICE",
          text: "سؤال صحيح",
          points: 1,
          options: [
            { id: "a", text: "أ" },
            { id: "b", text: "ب" },
          ],
          correctOptionIds: ["b"],
        },
        {
          id: "q2",
          type: "SINGLE_CHOICE",
          text: "سؤال بلا إجابة صحيحة",
          points: 1,
          options: [
            { id: "a", text: "أ" },
            { id: "b", text: "ب" },
          ],
          correctOptionIds: [],
        },
      ],
    });

    await expect(importQuestions(teacher.id, exam.id, invalid)).rejects.toBeInstanceOf(
      ValidationError,
    );

    // لا أسئلة جزئية ولا اختبار نصف مُعد
    expect(await prisma.question.count({ where: { examId: exam.id } })).toBe(0);
    expect(await prisma.questionOption.count()).toBe(0);
  });

  it("يستبدل الأسئلة القديمة عند إعادة الاستيراد", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });
    expect(await prisma.question.count({ where: { examId: exam.id } })).toBe(3);

    await importQuestions(teacher.id, exam.id, EXAMPLE_IMPORT_JSON);

    expect(await prisma.question.count({ where: { examId: exam.id } })).toBe(4);
    const leftovers = await prisma.question.findMany({
      where: { examId: exam.id, externalId: "q1", options: { some: { externalId: "a" } } },
      include: { options: true },
    });
    // الخيارات القديمة (الخيار b كان صحيحاً في بيانات الاختبار) استُبدلت بالكامل
    expect(leftovers[0]?.options).toHaveLength(3);
  });

  it("يرفض الاستيراد في اختبار منشور", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "PUBLISHED" });

    await expect(importQuestions(teacher.id, exam.id, EXAMPLE_IMPORT_JSON)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("يرفض الاستيراد من معلم آخر", async () => {
    const owner = await createTeacher();
    const intruder = await createTeacher();
    const { exam } = await createExamWithQuestions(owner.id, { status: "DRAFT" });

    await expect(
      importQuestions(intruder.id, exam.id, EXAMPLE_IMPORT_JSON),
    ).rejects.toThrow();
    expect(await prisma.question.count({ where: { examId: exam.id } })).toBe(3);
  });

  it("يرفض JSON تالفاً برسالة واضحة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });

    await expect(importQuestions(teacher.id, exam.id, "{ oops")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("يحفظ الدرجات النصية العشرية بدقة (Decimal)", async () => {
    const teacher = await createTeacher();
    const exam = await prisma.exam.create({
      data: {
        teacherId: teacher.id,
        publicToken: "token-decimal",
        title: "اختبار درجات",
        durationMinutes: 30,
        maxAttempts: 1,
      },
    });

    const payload = JSON.stringify({
      schemaVersion: "1.0",
      title: "درجات نصفية",
      questions: [
        {
          id: "q1",
          type: "TRUE_FALSE",
          text: "سؤال بدرجة نصفية",
          points: 0.5,
          options: [
            { id: "true", text: "صح" },
            { id: "false", text: "خطأ" },
          ],
          correctOptionIds: ["true"],
        },
      ],
    });

    await importQuestions(teacher.id, exam.id, payload);

    const question = await prisma.question.findFirstOrThrow({ where: { examId: exam.id } });
    expect(question.points.toNumber()).toBe(0.5);
    expect(question.points.toString()).toBe("0.5");
  });
});
