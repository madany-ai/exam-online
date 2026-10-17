import { z } from "zod";

/**
 * الإصدار الحالي من عقد استيراد الأسئلة (v1).
 * هذا الملف هو "العقد الخارجي" الذي يعتمد عليه المعلم (وعبره يطلب من الذكاء
 * الاصطناعي توليد الملف). يبقى مستقلاً عن مخطط قاعدة البيانات الداخلي.
 */
export const IMPORT_SCHEMA_VERSION = "1.0" as const;

/** حدودAdmissionontrol ضد الملفات الضخمة أو المحتوى التالف. */
export const IMPORT_LIMITS = {
  maxFileBytes: 1_000_000, // ~1MB
  maxQuestions: 200,
  minQuestions: 1,
  maxOptions: 12,
  minOptions: 2,
  maxTextLength: 4_000,
  maxOptionTextLength: 500,
  maxExplanationLength: 2_000,
  maxTitleLength: 200,
  maxDescriptionLength: 2_000,
  maxPoints: 100,
  maxDurationMinutes: 600,
} as const;

export const SUPPORTED_QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
] as const;

export type SupportedQuestionType = (typeof SUPPORTED_QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS_AR: Record<SupportedQuestionType, string> = {
  SINGLE_CHOICE: "اختيار من متعدد (إجابة واحدة)",
  MULTIPLE_CHOICE: "اختيار متعدد (أكثر من إجابة صحيحة)",
  TRUE_FALSE: "صح أو خطأ",
};

/**
 * المعرّفات المسموح بها: حروف لاتينية وأرقام و _ - . :
 * (نسمح بالحروف العربية في المعرّف أيضاً لكن نمنع المسافات والرموز الخطرة)
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_\-.:؀-ۿ]{1,64}$/;

const identifierSchema = z
  .string({ error: "المعرّف مطلوب" })
  .trim()
  .regex(IDENTIFIER_PATTERN, "المعرّف يقبل حروفاً وأرقاماً و _ - . : فقط (حتى 64 خانة)");

const pointsSchema = z
  .number({ error: "الدرجة مطلوبة ويجب أن تكون رقماً" })
  .refine((value) => Number.isFinite(value), "الدرجة يجب أن تكون رقماً منتهياً")
  .refine((value) => value > 0, "الدرجة يجب أن تكون أكبر من صفر")
  .refine(
    (value) => value <= IMPORT_LIMITS.maxPoints,
    `الدرجة يجب ألا تتجاوز ${IMPORT_LIMITS.maxPoints}`,
  )
  .refine(
    (value) => Number.isInteger(value * 2),
    "الدرجة يجب أن تكون عدداً صحيحاً أو نصفاً (مثل 1 أو 1.5)",
  );

const optionSchema = z
  .object({
    id: identifierSchema,
    text: z
      .string({ error: "نص الخيار مطلوب" })
      .trim()
      .min(1, "نص الخيار لا يمكن أن يكون فارغاً")
      .max(
        IMPORT_LIMITS.maxOptionTextLength,
        `نص الخيار طويل جداً (الحد ${IMPORT_LIMITS.maxOptionTextLength} خانة)`,
      ),
  })
  .strict();

const questionSchema = z
  .object({
    id: identifierSchema,
    type: z.enum(SUPPORTED_QUESTION_TYPES, {
      error: `نوع السؤال غير مدعوم. الأنواع المدعومة: ${SUPPORTED_QUESTION_TYPES.join("، ")}`,
    }),
    text: z
      .string({ error: "نص السؤال مطلوب" })
      .trim()
      .min(1, "نص السؤال لا يمكن أن يكون فارغاً")
      .max(
        IMPORT_LIMITS.maxTextLength,
        `نص السؤال طويل جداً (الحد ${IMPORT_LIMITS.maxTextLength} خانة)`,
      ),
    points: pointsSchema,
    options: z
      .array(optionSchema, { error: "قائمة الخيارات مطلوبة" })
      .min(IMPORT_LIMITS.minOptions, `يجب أن يحتوي السؤال على ${IMPORT_LIMITS.minOptions} خيارين على الأقل`)
      .max(IMPORT_LIMITS.maxOptions, `الحد الأقصى ${IMPORT_LIMITS.maxOptions} خياراً للسؤال`),
    correctOptionIds: z
      .array(identifierSchema, { error: "قائمة الإجابات الصحيحة مطلوبة" })
      .min(1, "يجب تحديد إجابة صحيحة واحدة على الأقل"),
    explanation: z
      .string()
      .trim()
      .max(
        IMPORT_LIMITS.maxExplanationLength,
        `الشرح طويل جداً (الحد ${IMPORT_LIMITS.maxExplanationLength} خانة)`,
      )
      .optional(),
  })
  .strict();

const documentSchema = z
  .object({
    schemaVersion: z.literal(IMPORT_SCHEMA_VERSION, {
      error: `إصدار المخطط غير مدعوم. الإصدار المطلوب هو "${IMPORT_SCHEMA_VERSION}"`,
    }),
    title: z
      .string({ error: "عنوان الاختبار مطلوب" })
      .trim()
      .min(1, "عنوان الاختبار لا يمكن أن يكون فارغاً")
      .max(IMPORT_LIMITS.maxTitleLength, "عنوان الاختبار طويل جداً"),
    description: z
      .string()
      .trim()
      .max(IMPORT_LIMITS.maxDescriptionLength, "الوصف طويل جداً")
      .optional(),
    defaultDurationMinutes: z
      .number()
      .int("المدة يجب أن تكون عدداً صحيحاً من الدقائق")
      .min(1, "المدة يجب ألا تقل عن دقيقة")
      .max(IMPORT_LIMITS.maxDurationMinutes, `المدة يجب ألا تتجاوز ${IMPORT_LIMITS.maxDurationMinutes} دقيقة`)
      .optional(),
    questions: z
      .array(questionSchema, { error: "قائمة الأسئلة مطلوبة" })
      .min(IMPORT_LIMITS.minQuestions, "يجب أن يحتوي الملف على سؤال واحد على الأقل")
      .max(IMPORT_LIMITS.maxQuestions, `الحد الأقصى ${IMPORT_LIMITS.maxQuestions} سؤالاً في الملف الواحد`),
  })
  .strict();

export type ValidatedImportDocument = z.infer<typeof documentSchema>;
export type ValidatedImportQuestion = ValidatedImportDocument["questions"][number];
export type ValidatedImportOption = ValidatedImportQuestion["options"][number];

export type ImportIssue = {
  /** مسار داخل الملف، مثل questions[3].options[1].id */
  path: string;
  /** رقم السؤال (يبدأ من 1) إن كان الخطأ متعلقاً بسؤال */
  questionNumber?: number;
  /** معرّف السؤال إن كان متاحاً */
  questionId?: string;
  message: string;
};

export type ImportParseSuccess = {
  ok: true;
  document: ValidatedImportDocument;
  questions: ValidatedImportQuestion[];
  totalPoints: number;
};

export type ImportParseFailure = {
  ok: false;
  /** خطأ عام في الملف أو في بنائه */
  fileError?: string;
  issues: ImportIssue[];
};

export type ImportParseResult = ImportParseSuccess | ImportParseFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * تحويل أخطاء Zod إلى رسائل عربية مقروءة مع رقم السؤال.
 */
function issuesFromZod(error: z.ZodError, raw: unknown): ImportIssue[] {
  const questionIds = new Map<number, string>();
  if (isPlainObject(raw) && Array.isArray(raw.questions)) {
    raw.questions.forEach((question, index) => {
      if (isPlainObject(question) && typeof question.id === "string") {
        questionIds.set(index, question.id);
      }
    });
  }

  return error.issues.map((issue) => {
    const path = issue.path;
    const questionIndex = path[0] === "questions" && typeof path[1] === "number" ? path[1] : undefined;
    const message = issue.message || "قيمة غير صالحة";
    const questionId = questionIndex === undefined ? undefined : questionIds.get(questionIndex);
    return {
      path: path.length > 0 ? path.map((segment) => String(segment)).join(".") : "(الجذر)",
      ...(questionIndex === undefined ? {} : { questionNumber: questionIndex + 1 }),
      ...(questionId === undefined ? {} : { questionId }),
      message,
    };
  });
}

/** قواعد دلالية خاصة بكل نوع سؤال. */
function validateQuestionSemantics(
  question: ValidatedImportQuestion,
  questionNumber: number,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const push = (message: string, subPath = "") =>
    issues.push({
      path: `questions[${questionNumber - 1}]${subPath}`,
      questionNumber,
      questionId: question.id,
      message,
    });

  const optionIds = question.options.map((option) => option.id);
  const optionIdSet = new Set(optionIds);

  // معرّفات الخيارات يجب أن تكون فريدة داخل السؤال
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of optionIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    push(
      `معرّفات خيارات مكررة: ${[...duplicates].join("، ")}. يجب أن يكون لكل خيار معرّف فريد.`,
      ".options",
    );
  }

  // الإجابات الصحيحة يجب أن تشير إلى خيارات موجودة
  const unknownCorrect = question.correctOptionIds.filter((id) => !optionIdSet.has(id));
  if (unknownCorrect.length > 0) {
    push(
      `الإجابة الصحيحة غير مرتبطة بخيار موجود: ${unknownCorrect.join("، ")}. الخيارات المتاحة: ${optionIds.join("، ")}.`,
      ".correctOptionIds",
    );
  }

  const uniqueCorrect = [...new Set(question.correctOptionIds)];

  switch (question.type) {
    case "SINGLE_CHOICE": {
      if (uniqueCorrect.length !== 1) {
        push(
          `سؤال الاختيار من متعدد يجب أن يحتوي على إجابة صحيحة واحدة بالضبط (الموجود: ${uniqueCorrect.length}).`,
          ".correctOptionIds",
        );
      }
      break;
    }
    case "MULTIPLE_CHOICE": {
      if (unknownCorrect.length > 0) break;
      if (uniqueCorrect.length < 1) {
        push("سؤال الاختيار المتعدد يجب أن يحتوي على إجابة صحيحة واحدة على الأقل.", ".correctOptionIds");
      }
      break;
    }
    case "TRUE_FALSE": {
      if (question.options.length !== 2) {
        push(
          `سؤال صح/خطأ يجب أن يحتوي على خيارين فقط بالضبط (الموجود: ${question.options.length}).`,
          ".options",
        );
      }
      if (unknownCorrect.length > 0) break;
      if (uniqueCorrect.length !== 1) {
        push(
          `سؤال صح/خطأ يجب أن يحدد قيمة صحيحة واحدة فقط (صحيح أو خطأ).`,
          ".correctOptionIds",
        );
      }
      break;
    }
  }

  return issues;
}

/** معرّفات الأسئلة يجب أن تكون فريدة داخل الملف. */
function validateDuplicateQuestionIds(questions: ValidatedImportQuestion[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const firstIndexById = new Map<string, number>();
  questions.forEach((question, index) => {
    const first = firstIndexById.get(question.id);
    if (first === undefined) {
      firstIndexById.set(question.id, index);
      return;
    }
    issues.push({
      path: `questions[${index}].id`,
      questionNumber: index + 1,
      questionId: question.id,
      message: `معرّف السؤال "${question.id}" مكرر (مستخدم أيضاً في السؤال رقم ${first + 1}).`,
    });
  });
  return issues;
}

/**
 * تحليل نص JSON والتحقق منه بالكامل.
 * لا يُستورد أي سؤال إذا فشل أي سؤال واحد — الاستيراد ذرّي بطبيعته.
 */
export function parseImportPayload(rawText: string): ImportParseResult {
  const byteLength = new TextEncoder().encode(rawText).length;
  if (byteLength > IMPORT_LIMITS.maxFileBytes) {
    return {
      ok: false,
      fileError: `حجم الملف أكبر من الحد المسموح (${Math.round(IMPORT_LIMITS.maxFileBytes / 1024)} كيلوبايت).`,
      issues: [],
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (error) {
    return {
      ok: false,
      fileError:
        error instanceof SyntaxError
          ? `الملف ليس JSON صالحاً: ${error.message}`
          : "تعذّر قراءة الملف كملف JSON.",
      issues: [],
    };
  }

  if (!isPlainObject(json)) {
    return { ok: false, fileError: "المحتوى المتوقع كائن JSON يحتوي على الحقول المطلوبة.", issues: [] };
  }

  const parsed = documentSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromZod(parsed.error, json) };
  }

  const document = parsed.data;
  const issues: ImportIssue[] = [];
  document.questions.forEach((question, index) => {
    issues.push(...validateQuestionSemantics(question, index + 1));
  });
  issues.push(...validateDuplicateQuestionIds(document.questions));

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const totalPoints = document.questions.reduce((sum, question) => sum + question.points, 0);

  return {
    ok: true,
    document,
    questions: document.questions,
    totalPoints,
  };
}
