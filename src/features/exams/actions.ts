"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth/session";
import { safeMessage } from "@/lib/errors";
import { checkRateLimit, RATE_LIMIT_PROFILES } from "@/lib/security/rate-limit";
import { examSettingsSchema, type ExamSettingsInput } from "@/features/exams/schema";
import {
  createExamWithImport,
  importQuestions,
  previewImport,
} from "@/features/questions/import-service";
import {
  deleteExam,
  hideResults,
  publicExamUrl,
  releaseResults,
  transitionExam,
  updateExam,
} from "@/features/exams/service";
import type { ImportParseResult } from "@/features/questions/import-schema";

/**
 * كل إجراءات المعلم تمرّ من requireTeacher() على الخادم،
 * ثم تتحقق من الملكية داخل طبقة الخدمة (لا نثق بمعرّفات من العميل).
 */

export type ExamActionState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "success"; message: string };

function formToObject(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (
      key === "confirmTitle" ||
      key === "examId" ||
      key === "rawJson" ||
      key === "intent" ||
      key === "publish" ||
      key === "file"
    ) {
      continue;
    }
    raw[key] = value;
  }
  return raw;
}

function parseSettings(formData: FormData):
  | { ok: true; data: ExamSettingsInput }
  | { ok: false; fieldErrors: Record<string, string> } {
  const parsed = examSettingsSchema.safeParse(formToObject(formData));
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}

/* ------------------------- إنشاء اختبار + استيراد ------------------------- */

export type CreateExamState =
  | { status: "idle" }
  | { status: "preview"; rawJson: string; result: Extract<ImportParseResult, { ok: true }> }
  | {
      status: "created";
      examId: string;
      publicToken: string;
      publicUrl: string;
      published: boolean;
      title: string;
      questionCount: number;
      totalPoints: number;
    }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      issues?: { path: string; message: string; questionNumber?: number }[];
      fileError?: string;
    };

const MAX_UPLOAD_BYTES = 1_000_000;

async function readUploadedJson(
  formData: FormData,
): Promise<{ ok: true; rawJson: string } | { ok: false; error: string }> {
  const rawJsonField = formData.get("rawJson");
  if (typeof rawJsonField === "string" && rawJsonField.trim().length > 0) {
    const byteLength = new TextEncoder().encode(rawJsonField).length;
    if (byteLength > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "حجم الملف أكبر من 1 ميجابايت." };
    }
    return { ok: true, rawJson: rawJsonField };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "يرجى اختيار ملف JSON يحتوي على أسئلة الاختبار أولاً." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "حجم الملف أكبر من 1 ميجابايت." };
  }
  return { ok: true, rawJson: await file.text() };
}

/**
 * مسار واحد للمعلم:
 * 1) يملأ البيانات ويرفع الملف ويضغط «إنشاء الاختبار» (intent = "preview") → يفحص البيانات والملف ويعرض معاينة الأسئلة للموافقة.
 * 2) بعد مراجعة الأسئلة يوافق على النشر (intent = "publish") أو الحفظ كمسودة (intent = "create_draft") → ينشئ الاختبار ويستورد الأسئلة ويعيد الرابط العام مباشرة.
 */
export async function createExamAction(
  _previousState: CreateExamState,
  formData: FormData,
): Promise<CreateExamState> {
  const teacher = await requireTeacher();
  const intent = String(formData.get("intent") ?? "preview");

  const settings = parseSettings(formData);
  if (!settings.ok) {
    const firstFieldMsg = Object.values(settings.fieldErrors)[0];
    return {
      status: "error",
      message: firstFieldMsg
        ? `تأكد من بيانات الاختبار: ${firstFieldMsg}`
        : "راجع بيانات الاختبار المطلوبة.",
      fieldErrors: settings.fieldErrors,
    };
  }

  const upload = await readUploadedJson(formData);
  if (!upload.ok) {
    return { status: "error", message: upload.error, fileError: upload.error };
  }

  const parsed = previewImport(upload.rawJson);
  if (!parsed.ok) {
    const firstIssue = parsed.issues[0];
    const primaryMessage = parsed.fileError
      ? parsed.fileError
      : firstIssue
        ? `${firstIssue.questionNumber ? `السؤال ${firstIssue.questionNumber}: ` : ""}${firstIssue.message}${parsed.issues.length > 1 ? ` (و${parsed.issues.length - 1} أخطاء أخرى)` : ""}`
        : `الملف يحتوي على ${parsed.issues.length} مشكلة، ولم يتم إنشاء الاختبار.`;

    return {
      status: "error",
      message: primaryMessage,
      ...(parsed.fileError ? { fileError: parsed.fileError } : {}),
      ...(parsed.issues.length > 0
        ? {
            issues: parsed.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              ...(issue.questionNumber === undefined ? {} : { questionNumber: issue.questionNumber }),
            })),
          }
        : {}),
    };
  }

  if (intent === "preview") {
    return { status: "preview", rawJson: upload.rawJson, result: parsed };
  }

  const writeRate = checkRateLimit(
    `teacher-write:${teacher.id}`,
    RATE_LIMIT_PROFILES.TEACHER_WRITE.limit,
    RATE_LIMIT_PROFILES.TEACHER_WRITE.windowMs,
  );
  if (!writeRate.allowed) {
    return {
      status: "error",
      message: `عدد عمليات الإنشاء كبير جداً. يرجى الانتظار ${writeRate.retryAfterSeconds} ثانية ثم المحاولة.`,
    };
  }

  const publishImmediately = intent === "publish";

  try {
    const created = await createExamWithImport(teacher.id, settings.data, upload.rawJson, {
      publishImmediately,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/exams");
    revalidatePath(`/dashboard/exams/${created.examId}`);

    return {
      status: "created",
      examId: created.examId,
      publicToken: created.publicToken,
      publicUrl: publicExamUrl(created.publicToken),
      published: created.status === "PUBLISHED",
      title: settings.data.title,
      questionCount: created.questionCount,
      totalPoints: created.totalPoints,
    };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { status: "error", message: safeMessage(error) };
  }
}

/* --------------------------- تعديل وإدارة الاختبار --------------------------- */

export async function updateExamAction(
  _previousState: ExamActionState,
  formData: FormData,
): Promise<ExamActionState> {
  const teacher = await requireTeacher();
  const examId = String(formData.get("examId") ?? "");
  const parsed = parseSettings(formData);
  if (!parsed.ok) {
    return { status: "error", message: "راجع الحقول المطلوبة.", fieldErrors: parsed.fieldErrors };
  }

  try {
    await updateExam(teacher.id, examId, parsed.data);
    revalidatePath(`/dashboard/exams/${examId}`);
    revalidatePath("/dashboard/exams");
    return { status: "success", message: "تم حفظ إعدادات الاختبار بنجاح." };
  } catch (error) {
    return { status: "error", message: safeMessage(error) };
  }
}

export async function transitionExamAction(formData: FormData): Promise<void> {
  const teacher = await requireTeacher();
  const examId = String(formData.get("examId") ?? "");
  const to = String(formData.get("to") ?? "") as "DRAFT" | "PUBLISHED" | "CLOSED";

  await transitionExam(teacher.id, examId, to);
  revalidatePath(`/dashboard/exams/${examId}`);
  revalidatePath("/dashboard/exams");
  revalidatePath("/dashboard");
}

export async function transitionExamWithFeedbackAction(
  examId: string,
  to: "DRAFT" | "PUBLISHED" | "CLOSED",
): Promise<{ ok: true; message: string; publicUrl?: string } | { ok: false; error: string }> {
  const teacher = await requireTeacher();
  try {
    const updated = await transitionExam(teacher.id, examId, to);
    revalidatePath(`/dashboard/exams/${examId}`);
    revalidatePath("/dashboard/exams");
    revalidatePath("/dashboard");

    const message =
      to === "PUBLISHED"
        ? "تم نشر الاختبار بنجاح! يمكنك الآن مشاركة الرابط مع الطلاب."
        : to === "CLOSED"
          ? "تم إغلاق الاختبار. لن يتمكن طلاب جدد من البدء."
          : "تمت إعادة الاختبار إلى حالة المسودة.";

    return {
      ok: true,
      message,
      ...(to === "PUBLISHED" ? { publicUrl: publicExamUrl(updated.publicToken) } : {}),
    };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function releaseResultsAction(formData: FormData): Promise<void> {
  const teacher = await requireTeacher();
  const examId = String(formData.get("examId") ?? "");
  await releaseResults(teacher.id, examId);
  revalidatePath(`/dashboard/exams/${examId}`);
}

export async function hideResultsAction(formData: FormData): Promise<void> {
  const teacher = await requireTeacher();
  const examId = String(formData.get("examId") ?? "");
  await hideResults(teacher.id, examId);
  revalidatePath(`/dashboard/exams/${examId}`);
}

export async function toggleResultsReleaseAction(
  examId: string,
  release: boolean,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const teacher = await requireTeacher();
  try {
    if (release) {
      await releaseResults(teacher.id, examId);
    } else {
      await hideResults(teacher.id, examId);
    }
    revalidatePath(`/dashboard/exams/${examId}`);
    return {
      ok: true,
      message: release
        ? "تم إصدار النتائج للطلاب بنجاح."
        : "تم إخفاء النتائج عن الطلاب.",
    };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function deleteExamAction(
  _previousState: ExamActionState,
  formData: FormData,
): Promise<ExamActionState> {
  const teacher = await requireTeacher();
  const examId = String(formData.get("examId") ?? "");
  const confirmationTitle = String(formData.get("confirmTitle") ?? "");

  try {
    await deleteExam(teacher.id, examId, confirmationTitle);
  } catch (error) {
    return { status: "error", message: safeMessage(error) };
  }
  revalidatePath("/dashboard/exams");
  revalidatePath("/dashboard");
  redirect("/dashboard/exams");
}

/* ------------------------------ استبدال الأسئلة ------------------------------ */

export type ImportPreviewState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      issues?: { path: string; message: string; questionNumber?: number }[];
      fileError?: string;
    }
  | { status: "preview"; rawJson: string; result: Extract<ImportParseResult, { ok: true }> };

/**
 * معاينة ملف الأسئلة لاختبار قائم: قراءة وتحقق فقط، بلا أي كتابة.
 * نعيد النص الخام للتأكيد، ويُعاد التحقق منه على الخادم عند التأكيد.
 */
export async function previewImportAction(
  _previousState: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  await requireTeacher();

  const upload = await readUploadedJson(formData);
  if (!upload.ok) return { status: "error", message: upload.error, fileError: upload.error };

  const parsed = previewImport(upload.rawJson);
  if (!parsed.ok) {
    const firstIssue = parsed.issues[0];
    const primaryMessage = parsed.fileError
      ? parsed.fileError
      : firstIssue
        ? `${firstIssue.questionNumber ? `السؤال ${firstIssue.questionNumber}: ` : ""}${firstIssue.message}${parsed.issues.length > 1 ? ` (و${parsed.issues.length - 1} أخطاء أخرى)` : ""}`
        : `الملف يحتوي على ${parsed.issues.length} مشكلة، ولم يتم استيراد أي سؤال.`;

    return {
      status: "error",
      message: primaryMessage,
      ...(parsed.fileError ? { fileError: parsed.fileError } : {}),
      ...(parsed.issues.length > 0
        ? {
            issues: parsed.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              ...(issue.questionNumber === undefined ? {} : { questionNumber: issue.questionNumber }),
            })),
          }
        : {}),
    };
  }

  return { status: "preview", rawJson: upload.rawJson, result: parsed };
}

export type ImportConfirmState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      message: string;
      examId: string;
      published: boolean;
      publicUrl: string;
    };

/**
 * استبدال أسئلة اختبار قائم. يُعاد التحقق من الملف على الخادم
 * (لا نثق بما حلّله المتصفح مسبقاً)، مع دعم النشر الفوري وإرجاع رابط الطالب.
 */
export async function confirmImportAction(
  _previousState: ImportConfirmState,
  formData: FormData,
): Promise<ImportConfirmState> {
  const teacher = await requireTeacher();
  const examId = String(formData.get("examId") ?? "");
  const rawJson = String(formData.get("rawJson") ?? "");
  const publishImmediately = formData.get("publish") === "true";

  const writeRate = checkRateLimit(
    `teacher-write:${teacher.id}`,
    RATE_LIMIT_PROFILES.TEACHER_WRITE.limit,
    RATE_LIMIT_PROFILES.TEACHER_WRITE.windowMs,
  );
  if (!writeRate.allowed) {
    return {
      status: "error",
      message: `عدد عمليات الاستيراد كبير جداً. يرجى الانتظار ${writeRate.retryAfterSeconds} ثانية ثم المحاولة.`,
    };
  }

  try {
    const summary = await importQuestions(teacher.id, examId, rawJson, {
      publishImmediately,
    });
    revalidatePath(`/dashboard/exams/${examId}`);
    revalidatePath("/dashboard/exams");
    revalidatePath("/dashboard");

    return {
      status: "success",
      examId: summary.examId,
      published: summary.status === "PUBLISHED",
      publicUrl: publicExamUrl(summary.publicToken),
      message:
        summary.status === "PUBLISHED"
          ? `تم استيراد ${summary.questionCount} سؤالاً ونشر الاختبار بنجاح! رابط الطلاب جاهز للمشاركة.`
          : `تم استيراد ${summary.questionCount} سؤالاً (${summary.optionCount} خياراً) بمجموع ${summary.totalPoints} درجة.`,
    };
  } catch (error) {
    return { status: "error", message: safeMessage(error) };
  }
}
