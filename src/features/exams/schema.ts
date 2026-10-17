import { z } from "zod";
import { IMPORT_LIMITS } from "@/features/questions/import-schema";

/** مدخلات إعدادات الاختبار القادمة من النماذج (غير موثوقة → نتحقق منها دائماً). */

/** اسم حقل مُعرّف الطالب الافتراضي — رقم التليفون (أساس تطبيق حدّ المحاولات). */
export const DEFAULT_STUDENT_ID_LABEL = "رقم التليفون";

/**
 * حقل تاريخ/وقت اختياري من نموذج HTML (datetime-local).
 * يُقبل النص الفارغ كـ null، وتُحوَّل القيم الأخرى إلى Date على الخادم
 * (المتصفح يرسل وقتاً محلياً، وDate يفسّره حسب توقيت الخادم).
 */
const optionalDateTime = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed === "") return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "تاريخ أو وقت غير صالح" });
      return z.NEVER;
    }
    return parsed;
  });

const booleanFromForm = z
  .union([z.literal("on"), z.literal("true"), z.boolean()])
  .transform((value) => value === true || value === "on" || value === "true")
  .nullish()
  .transform((value) => value ?? false);

export const examSettingsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "عنوان الاختبار مطلوب")
      .max(IMPORT_LIMITS.maxTitleLength, "العنوان طويل جداً"),
    description: z
      .string()
      .trim()
      .max(IMPORT_LIMITS.maxDescriptionLength, "الوصف طويل جداً")
      .transform((value) => (value === "" ? null : value))
      .nullish()
      .transform((value) => value ?? null),
    instructions: z
      .string()
      .trim()
      .max(IMPORT_LIMITS.maxDescriptionLength, "التعليمات طويلة جداً")
      .transform((value) => (value === "" ? null : value))
      .nullish()
      .transform((value) => value ?? null),
    durationMinutes: z.coerce
      .number({ error: "المدة مطلوبة" })
      .int("المدة يجب أن تكون عدداً صحيحاً من الدقائق")
      .min(1, "المدة يجب ألا تقل عن دقيقة")
      .max(IMPORT_LIMITS.maxDurationMinutes, `المدة يجب ألا تتجاوز ${IMPORT_LIMITS.maxDurationMinutes} دقيقة`),
    maxAttempts: z.coerce
      .number({ error: "عدد المحاولات مطلوب" })
      .int("عدد المحاولات يجب أن يكون عدداً صحيحاً")
      .min(1, "يجب السماح بمحاولة واحدة على الأقل")
      .max(10, "الحد الأقصى 10 محاولات"),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    shuffleQuestions: booleanFromForm,
    shuffleOptions: booleanFromForm,
    resultVisibility: z.enum(["IMMEDIATE", "MANUAL"], {
      error: "طريقة إظهار النتائج غير صالحة",
    }),
    requiresStudentId: booleanFromForm,
    studentIdLabel: z
      .string()
      .trim()
      .max(100, "اسم الحقل طويل جداً")
      .transform((value) => (value === "" ? null : value))
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && value.endsAt.getTime() <= value.startsAt.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "وقت الانتهاء يجب أن يكون بعد وقت البداية",
      });
    }
    // اسم الحقل اختياري: نستخدم الافتراضي (رقم التليفون) إن تُرك فارغاً.
  });

export type ExamSettingsInput = z.infer<typeof examSettingsSchema>;

/** مدخلات إنشاء محاولة الطالب. */
export const startAttemptSchema = z
  .object({
    studentName: z
      .string()
      .trim()
      .min(2, "الاسم مطلوب (حرفان على الأقل)")
      .max(120, "الاسم طويل جداً"),
    studentIdentifier: z
      .string()
      .trim()
      // نتحقق من شكل رقم التليفون (أرقام، بادئة +، فراغات أو شرطات)
      .regex(
        /^[\d+\-\s()]{6,20}$/,
        "أدخل رقم تليفون صحيحاً (من ٦ إلى ٢٠ خانة)",
      )
      .transform((value) => value === "" ? null : value)
      .nullish()
      .transform((value) => value ?? null),
  })
  .transform((value) => ({ ...value, studentIdentifier: value.studentIdentifier ?? null }));

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;

/** إجابات الطالب: معرّف السؤال + الخيارات المختارة (خارجي، لا يُقبل أي معرّف داخلي). */
export const submittedAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1, "معرّف السؤال مطلوب").max(64),
        selectedOptionIds: z
          .array(z.string().trim().min(1).max(64))
          .max(IMPORT_LIMITS.maxOptions, "عدد الخيارات المختارة يتجاوز الحد"),
      }),
    )
    .max(IMPORT_LIMITS.maxQuestions, "عدد الإجابات يتجاوز الحد"),
});

export type SubmittedAnswersInput = z.infer<typeof submittedAnswersSchema>;
