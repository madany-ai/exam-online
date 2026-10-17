import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ARABIC_AI_PROMPT,
  EXAMPLE_IMPORT_DOCUMENT,
  EXAMPLE_IMPORT_JSON,
} from "@/features/questions/example-document";
import { IMPORT_SCHEMA_VERSION, parseImportPayload } from "@/features/questions/import-schema";

describe("ملف المثال المُولّد", () => {
  it("يمرّ بمُتحقّق التطبيق الفعلي", () => {
    const result = parseImportPayload(EXAMPLE_IMPORT_JSON);

    expect(
      result.ok,
      result.ok ? "" : JSON.stringify(result.issues ?? result.fileError, null, 2),
    ).toBe(true);
  });

  it("يغطي الأنواع الثلاثة المدعومة", () => {
    const types = new Set(EXAMPLE_IMPORT_DOCUMENT.questions.map((question) => question.type));
    expect(types).toEqual(new Set(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"]));
  });

  it("الملف العام في public/examples مطابق للمصدر", () => {
    const published = readFileSync("public/examples/exam-import-v1.json", "utf8");
    expect(JSON.parse(published)).toEqual(JSON.parse(EXAMPLE_IMPORT_JSON));
  });

  it("الملف العام يمرّ بالمُتحقّق أيضاً", () => {
    const published = readFileSync("public/examples/exam-import-v1.json", "utf8");
    expect(parseImportPayload(published).ok).toBe(true);
  });
});

describe("قالب الطلب العربي", () => {
  it("يذكّر بالقواعد الحرجة للذكاء الاصطناعي", () => {
    expect(ARABIC_AI_PROMPT).toContain(IMPORT_SCHEMA_VERSION);
    expect(ARABIC_AI_PROMPT).toMatch(/لا تخترع أي إجابة صحيحة/);
    expect(ARABIC_AI_PROMPT).toMatch(/Markdown/);
    expect(ARABIC_AI_PROMPT).toMatch(/JSON صالح/);
    expect(ARABIC_AI_PROMPT).toMatch(/correctOptionIds/);
    expect(ARABIC_AI_PROMPT).toMatch(/schemaVersion/);
  });

  it("ينصّ صراحةً على عدم إضافة حقول خارج العقد", () => {
    expect(ARABIC_AI_PROMPT).toMatch(/لا تضف أي حقول غير موجودة في العقد/);
  });

  it("المثال نفسه لا يحتوي حقولاً خارج العقد", () => {
    const allowedQuestionKeys = new Set([
      "id",
      "type",
      "text",
      "points",
      "options",
      "correctOptionIds",
      "explanation",
    ]);
    for (const question of EXAMPLE_IMPORT_DOCUMENT.questions) {
      for (const key of Object.keys(question)) {
        expect(allowedQuestionKeys.has(key)).toBe(true);
      }
    }
  });
});
