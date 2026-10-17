import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { invalidateExamQuestionsCache } from "@/lib/cache/exam-cache";
import { ValidationError } from "@/lib/errors";
import { generateToken } from "@/lib/security/random";
import { assertEditable, getExamForTeacher } from "@/features/exams/service";
import type { ExamSettingsInput } from "@/features/exams/schema";
import {
  parseImportPayload,
  type ImportParseResult,
  type ValidatedImportQuestion,
} from "@/features/questions/import-schema";

/**
 * استيراد الأسئلة من ملف JSON.
 *
 * المبدأ الأساسي: كل أو لا شيء.
 * - التحقق يتم بالكامل قبل أي كتابة.
 * - الاستبدال يتم داخل معاملة واحدة باستخدام الإدخال المجمّع (createMany) لضمان السرعة الفائقة
 *   وتفادي انتهاء مهلة المعاملة على قواعد البيانات السحابية (Neon Pooler).
 * - إعادة التحقق تتم على الخادم عند التأكيد أيضاً (لا نثق بما أرسله المتصفح).
 */

export type ImportSummary = {
  examId: string;
  publicToken: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  questionCount: number;
  optionCount: number;
  totalPoints: number;
  replacedExisting: boolean;
};

/** رسالة موحّدة عند فشل الاستيراد، تجمع كل المشاكل. */
export function importFailureMessage(result: ImportParseResult): string {
  if (result.ok) return "";
  if (result.fileError) return result.fileError;
  return `فشل الاستيراد: ${result.issues.length} مشكلة في الملف.\n${result.issues
    .map((issue) => `• ${issue.message}`)
    .join("\n")}`;
}

/**
 * تجهيز صفوف الأسئلة والخيارات للإدخال المجمّع السريع (Bulk Insert) في استعلامين فقط
 * بدلاً من عشرات الاستعلامات المتسلسلة التي قد تتجاوز مهلة المعاملة.
 */
function buildBulkQuestionAndOptionRows(
  examId: string,
  questions: ValidatedImportQuestion[],
) {
  const questionRows: {
    id: string;
    examId: string;
    externalId: string;
    type: ValidatedImportQuestion["type"];
    text: string;
    points: number;
    explanation: string | null;
    order: number;
  }[] = [];

  const optionRows: {
    id: string;
    questionId: string;
    externalId: string;
    text: string;
    order: number;
    isCorrect: boolean;
  }[] = [];

  for (const [index, question] of questions.entries()) {
    const questionId = randomUUID();
    const correctSet = new Set(question.correctOptionIds);

    questionRows.push({
      id: questionId,
      examId,
      externalId: question.id,
      type: question.type,
      text: question.text,
      points: question.points,
      explanation: question.explanation ?? null,
      order: index,
    });

    for (const [optionIndex, option] of question.options.entries()) {
      optionRows.push({
        id: randomUUID(),
        questionId,
        externalId: option.id,
        text: option.text,
        order: optionIndex,
        isCorrect: correctSet.has(option.id),
      });
    }
  }

  return { questionRows, optionRows };
}

/**
 * إنشاء اختبار جديد واستيراد الأسئلة في عملية واحدة (المسار الأسرع للمعلم).
 *
 * كل شيء داخل معاملة واحدة: إما أُنشئ الاختبار بكل أسئلته، أو لم يُكتب شيء.
 * لا يبقى في القاعدة اختبار فارغ إذا فشل ملف الأسئلة.
 * يمكن تمرير publishImmediately لنشر الاختبار فوراً بعد موافقة المعلم على المعاينة.
 */
export async function createExamWithImport(
  teacherId: string,
  settings: ExamSettingsInput,
  rawJson: string,
  options?: { publishImmediately?: boolean },
): Promise<ImportSummary> {
  const parsed = parseImportPayload(rawJson);
  if (!parsed.ok) {
    throw new ValidationError(importFailureMessage(parsed));
  }

  const questions = parsed.questions;
  const optionCount = questions.reduce((sum, question) => sum + question.options.length, 0);
  const initialStatus = options?.publishImmediately ? "PUBLISHED" : "DRAFT";

  const exam = await prisma.$transaction(
    async (tx) => {
      const created = await tx.exam.create({
        data: {
          teacherId,
          publicToken: generateToken(24),
          title: settings.title,
          description: settings.description,
          instructions: settings.instructions,
          durationMinutes: settings.durationMinutes,
          maxAttempts: settings.maxAttempts,
          startsAt: settings.startsAt,
          endsAt: settings.endsAt,
          shuffleQuestions: settings.shuffleQuestions,
          shuffleOptions: settings.shuffleOptions,
          resultVisibility: settings.resultVisibility,
          requiresStudentId: settings.requiresStudentId,
          studentIdLabel: settings.studentIdLabel,
          status: initialStatus,
        },
        select: { id: true, publicToken: true, status: true },
      });

      const { questionRows, optionRows } = buildBulkQuestionAndOptionRows(
        created.id,
        questions,
      );

      if (questionRows.length > 0) {
        await tx.question.createMany({ data: questionRows });
      }
      if (optionRows.length > 0) {
        await tx.questionOption.createMany({ data: optionRows });
      }

      return created;
    },
    { maxWait: 15000, timeout: 30000 },
  );

  invalidateExamQuestionsCache(exam.id);

  return {
    examId: exam.id,
    publicToken: exam.publicToken,
    status: exam.status,
    questionCount: questions.length,
    optionCount,
    totalPoints: parsed.totalPoints,
    replacedExisting: false,
  };
}

/** معاينة فقط — لا تكتب شيئاً. تُستخدم لعرض الأخطاء أو عرض الأسئلة للمعلم. */
export function previewImport(rawJson: string): ImportParseResult {
  return parseImportPayload(rawJson);
}

export async function importQuestions(
  teacherId: string,
  examId: string,
  rawJson: string,
  options?: { publishImmediately?: boolean },
): Promise<ImportSummary> {
  const exam = await getExamForTeacher(teacherId, examId);
  assertEditable(exam.status);

  const parsed = parseImportPayload(rawJson);
  if (!parsed.ok) {
    throw new ValidationError(importFailureMessage(parsed));
  }

  const questions = parsed.questions;
  const optionCount = questions.reduce((sum, question) => sum + question.options.length, 0);
  const nextStatus = options?.publishImmediately ? "PUBLISHED" : exam.status;
  const { questionRows, optionRows } = buildBulkQuestionAndOptionRows(exam.id, questions);

  // معاملة واحدة: حذف القديم + إضافة الجديد (+ النشر الاختياري). أي خطأ يُرجع كل شيء كما كان.
  await prisma.$transaction(
    async (tx) => {
      await tx.question.deleteMany({ where: { examId: exam.id } });
      if (questionRows.length > 0) {
        await tx.question.createMany({ data: questionRows });
      }
      if (optionRows.length > 0) {
        await tx.questionOption.createMany({ data: optionRows });
      }
      if (options?.publishImmediately && exam.status !== "PUBLISHED") {
        await tx.exam.update({
          where: { id: exam.id },
          data: { status: "PUBLISHED" },
        });
      }
    },
    { maxWait: 15000, timeout: 30000 },
  );

  invalidateExamQuestionsCache(exam.id);

  return {
    examId: exam.id,
    publicToken: exam.publicToken,
    status: nextStatus,
    questionCount: questions.length,
    optionCount,
    totalPoints: parsed.totalPoints,
    replacedExisting: exam.questions.length > 0,
  };
}
