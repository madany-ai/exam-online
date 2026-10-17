import { describe, expect, it } from "vitest";
import {
  IMPORT_LIMITS,
  IMPORT_SCHEMA_VERSION,
  parseImportPayload,
} from "@/features/questions/import-schema";

/** تبني مستنداً صالحاً ثم تعدّل عليه لاختبار حالة خطأ بعينها. */
function validDocument() {
  return {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    title: "اختبار الرياضيات",
    defaultDurationMinutes: 30,
    questions: [
      {
        id: "q1",
        type: "SINGLE_CHOICE",
        text: "ما ناتج ٢ + ٢؟",
        points: 1,
        options: [
          { id: "a", text: "٣" },
          { id: "b", text: "٤" },
        ],
        correctOptionIds: ["b"],
      },
      {
        id: "q2",
        type: "MULTIPLE_CHOICE",
        text: "الأعداد الزوجية",
        points: 2,
        options: [
          { id: "a", text: "٢" },
          { id: "b", text: "٣" },
          { id: "c", text: "٤" },
        ],
        correctOptionIds: ["a", "c"],
      },
      {
        id: "q3",
        type: "TRUE_FALSE",
        text: "الشمس نجم",
        points: 1,
        options: [
          { id: "true", text: "صح" },
          { id: "false", text: "خطأ" },
        ],
        correctOptionIds: ["true"],
      },
    ],
  };
}

type Doc = ReturnType<typeof validDocument>;

function parse(doc: unknown) {
  return parseImportPayload(JSON.stringify(doc));
}

function messages(result: ReturnType<typeof parse>) {
  return result.ok
    ? []
    : [result.fileError, ...result.issues.map((issue) => issue.message)]
        .filter((value): value is string => Boolean(value))
        .join(" | ");
}

describe("عقد استيراد الأسئلة v1", () => {
  it("يقبل مستنداً صالحاً ويحسب مجموع الدرجات", () => {
    const result = parse(validDocument());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions).toHaveLength(3);
    expect(result.totalPoints).toBe(4);
    expect(result.document.title).toBe("اختبار الرياضيات");
  });

  it("يقبل درجات نصفية", () => {
    const document = validDocument() as Doc;
    document.questions[0].points = 1.5;

    const result = parse(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalPoints).toBe(4.5);
  });

  it("يرفض JSON تالفاً", () => {
    const result = parseImportPayload("{ ليس JSON");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError).toMatch(/JSON/);
  });

  it("يرفض محتوى ليس كائن JSON", () => {
    expect(parseImportPayload("[1,2,3]").ok).toBe(false);
    expect(parseImportPayload("42").ok).toBe(false);
  });

  it("يرفض إصدار مخطط غير مدعوم", () => {
    const document = { ...validDocument(), schemaVersion: "2.0" };
    const result = parse(document);

    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/إصدار المخطط/);
  });

  it("يرفض غياب إصدار المخطط", () => {
    const document = validDocument() as Partial<Doc>;
    delete (document as Record<string, unknown>).schemaVersion;
    expect(parse(document).ok).toBe(false);
  });

  it("يرفض حقلاً غير معروف (لا حقول زائدة)", () => {
    const document = validDocument() as Doc;
    (document.questions[0] as Record<string, unknown>).hint = "تلميح";
    const result = parse(document);

    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/hint|غير معروف|keys/i);
  });

  it("يرفض نوع سؤال غير مدعوم", () => {
    const document = validDocument() as Doc;
    (document.questions[0] as Record<string, unknown>).type = "ESSAY";
    const result = parse(document);

    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/نوع السؤال غير مدعوم/);
  });

  it("يرفض سؤالاً بلا إجابة صحيحة", () => {
    const document = validDocument() as Doc;
    document.questions[0].correctOptionIds = [];

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/إجابة صحيحة واحدة على الأقل/);
  });

  it("يرفض إجابة صحيحة تشير إلى خيار غير موجود", () => {
    const document = validDocument() as Doc;
    document.questions[0].correctOptionIds = ["z"];

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/غير مرتبطة بخيار موجود/);
  });

  it("يرفض معرّفات خيارات مكررة", () => {
    const document = validDocument() as Doc;
    document.questions[0].options = [
      { id: "a", text: "٣" },
      { id: "a", text: "٤" },
    ];

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/معرّفات خيارات مكررة/);
  });

  it("يرفض معرّفات أسئلة مكررة داخل الملف", () => {
    const document = validDocument() as Doc;
    document.questions[1].id = "q1";

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/مكرر/);
  });

  it.each([
    ["صفر", 0],
    ["سالباً", -1],
    ["أكبر من الحد", 500],
    ["كسرياً غير مسموح", 1.25],
  ])("يرفض درجة %s", (_label, points) => {
    const document = validDocument() as Doc;
    document.questions[0].points = points as number;

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/الدرجة/);
  });

  it("يرفض نص سؤال فارغاً", () => {
    const document = validDocument() as Doc;
    document.questions[0].text = "   ";

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/نص السؤال/);
  });

  it("يرفض اختياراً من متعدد بإجابتين صحيحتين", () => {
    const document = validDocument() as Doc;
    document.questions[0].correctOptionIds = ["a", "b"];

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/إجابة صحيحة واحدة بالضبط/);
  });

  it("يرفض سؤال صح/خطأ بثلاثة خيارات", () => {
    const document = validDocument() as Doc;
    document.questions[2].options = [
      { id: "true", text: "صح" },
      { id: "false", text: "خطأ" },
      { id: "maybe", text: "ربما" },
    ];

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/خيارين فقط/);
  });

  it("يرفض سؤالاً بخيار واحد فقط", () => {
    const document = validDocument() as Doc;
    document.questions[0].options = [{ id: "a", text: "٣" }];
    document.questions[0].correctOptionIds = ["a"];

    const result = parse(document);
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(/خيارين على الأقل/);
  });

  it("يرفض معرّفاً بمحتوى غير صالح", () => {
    const document = validDocument() as Doc;
    document.questions[0].options[0].id = "خيار <script>";

    const result = parse(document);
    expect(result.ok).toBe(false);
  });

  it("يرفض نصاً أطول من الحد", () => {
    const document = validDocument() as Doc;
    document.questions[0].text = "ا".repeat(IMPORT_LIMITS.maxTextLength + 1);

    expect(parse(document).ok).toBe(false);
  });

  it("يرفض عدد أسئلة يتجاوز الحد", () => {
    const document = validDocument() as Doc;
    document.questions = Array.from({ length: IMPORT_LIMITS.maxQuestions + 1 }, (_, index) => ({
      id: `q${index}`,
      type: "TRUE_FALSE",
      text: `سؤال ${index}`,
      points: 1,
      options: [
        { id: "true", text: "صح" },
        { id: "false", text: "خطأ" },
      ],
      correctOptionIds: ["true"],
    }));

    expect(parse(document).ok).toBe(false);
  });

  it("يرفض ملفاً يتجاوز حد الحجم", () => {
    const huge = `{ "padding": "${"ا".repeat(IMPORT_LIMITS.maxFileBytes)}" }`;
    const result = parseImportPayload(huge);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError).toMatch(/حجم/);
  });

  it("يبلّغ عن كل الأسئلة الفاشلة مع أرقامها", () => {
    const document = validDocument() as Doc;
    document.questions[0].points = 0;
    document.questions[2].options = [{ id: "true", text: "صح" }];

    const result = parse(document);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const questionNumbers = result.issues
      .map((issue) => issue.questionNumber)
      .filter((value): value is number => value !== undefined);
    expect(new Set(questionNumbers)).toEqual(new Set([1, 3]));
  });
});
