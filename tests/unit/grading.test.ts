import { describe, expect, it } from "vitest";
import {
  GradeInputError,
  gradeAttempt,
  toMinorUnits,
  type GradeableQuestion,
} from "@/features/grading/grading";

const questions: GradeableQuestion[] = [
  {
    id: "q1",
    type: "SINGLE_CHOICE",
    points: 2,
    correctOptionIds: ["b"],
    optionIds: ["a", "b"],
  },
  {
    id: "q2",
    type: "MULTIPLE_CHOICE",
    points: 3,
    correctOptionIds: ["a", "c"],
    optionIds: ["a", "b", "c"],
  },
  {
    id: "q3",
    type: "TRUE_FALSE",
    points: 1,
    correctOptionIds: ["true"],
    optionIds: ["true", "false"],
  },
];

describe("التدريج الحتمي على الخادم", () => {
  it("يمنح الدرجة الكاملة عند اختيار الإجابة الصحيحة (اختيار واحد)", () => {
    const result = gradeAttempt(questions, [{ questionId: "q1", selectedOptionIds: ["b"] }]);

    expect(result.answers[0]?.isCorrect).toBe(true);
    expect(result.answers[0]?.earnedPoints).toBe(2);
  });

  it("يمنح صفراً عند اختيار الإجابة الخطأ", () => {
    const result = gradeAttempt(questions, [{ questionId: "q1", selectedOptionIds: ["a"] }]);

    expect(result.answers[0]?.isCorrect).toBe(false);
    expect(result.answers[0]?.earnedPoints).toBe(0);
  });

  it("يمنح الدرجة الكاملة عند التطابق التام في الاختيار المتعدد", () => {
    const result = gradeAttempt(questions, [
      { questionId: "q2", selectedOptionIds: ["c", "a"] }, // الترتيب لا يهم
    ]);

    expect(result.answers[1]?.isCorrect).toBe(true);
    expect(result.answers[1]?.earnedPoints).toBe(3);
  });

  it("يمنح صفراً في الاختيار المتعدد عند اختيار جزئي (لا درجات جزئية)", () => {
    const partial = gradeAttempt(questions, [
      { questionId: "q2", selectedOptionIds: ["a"] },
    ]);
    expect(partial.answers[1]?.earnedPoints).toBe(0);

    const extra = gradeAttempt(questions, [
      { questionId: "q2", selectedOptionIds: ["a", "b", "c"] },
    ]);
    expect(extra.answers[1]?.earnedPoints).toBe(0);
  });

  it("يدرّج صح/خطأ", () => {
    const correct = gradeAttempt(questions, [
      { questionId: "q3", selectedOptionIds: ["true"] },
    ]);
    expect(correct.answers[2]?.isCorrect).toBe(true);

    const wrong = gradeAttempt(questions, [
      { questionId: "q3", selectedOptionIds: ["false"] },
    ]);
    expect(wrong.answers[2]?.isCorrect).toBe(false);
  });

  it("يحتسب الأسئلة غير المُجابة صفراً", () => {
    const result = gradeAttempt(questions, []);

    expect(result.answers.every((answer) => !answer.isAnswered)).toBe(true);
    expect(result.earnedScore).toBe(0);
    expect(result.maximumScore).toBe(6);
    expect(result.percentage).toBe(0);
  });

  it("يحسب النسبة بشكل صحيح", () => {
    const result = gradeAttempt(questions, [
      { questionId: "q1", selectedOptionIds: ["b"] }, // 2 من 6
    ]);

    expect(result.earnedScore).toBe(2);
    expect(result.percentage).toBe(33.33);
  });

  it("يعيد null للنسبة عندما تكون الدرجة الكلية صفراً", () => {
    const result = gradeAttempt(
      [
        {
          id: "q0",
          type: "TRUE_FALSE",
          points: 0,
          correctOptionIds: ["true"],
          optionIds: ["true", "false"],
        },
      ],
      [],
    );

    expect(result.maximumScore).toBe(0);
    expect(result.percentage).toBeNull();
  });

  it("يتجنّب أخطاء الفاصلة العائمة في الدرجات النصفية", () => {
    const halfPoints: GradeableQuestion[] = [
      {
        id: "h1",
        type: "SINGLE_CHOICE",
        points: 0.1,
        correctOptionIds: ["a"],
        optionIds: ["a", "b"],
      },
      {
        id: "h2",
        type: "SINGLE_CHOICE",
        points: 0.2,
        correctOptionIds: ["a"],
        optionIds: ["a", "b"],
      },
    ];

    const result = gradeAttempt(halfPoints, [
      { questionId: "h1", selectedOptionIds: ["a"] },
      { questionId: "h2", selectedOptionIds: ["a"] },
    ]);

    // 0.1 + 0.2 = 0.3 بالضبط، و100% — لا ظهور لأخطاء الفاصلة العائمة.
    expect(result.earnedScore).toBe(0.3);
    expect(result.maximumScore).toBe(0.3);
    expect(result.percentage).toBe(100);
    expect(toMinorUnits(0.1) + toMinorUnits(0.2)).toBe(toMinorUnits(0.3));
  });

  it("حتمي: نفس المدخلات تعطي نفس المخرجات", () => {
    const answers = [{ questionId: "q2", selectedOptionIds: ["a", "c"] }];
    expect(gradeAttempt(questions, answers)).toEqual(gradeAttempt(questions, answers));
  });

  it("يرفض معرّف سؤال لا ينتمي للاختبار", () => {
    expect(() =>
      gradeAttempt(questions, [{ questionId: "unknown", selectedOptionIds: ["a"] }]),
    ).toThrow(GradeInputError);
  });

  it("يرفض خياراً لا ينتمي للسؤال", () => {
    expect(() =>
      gradeAttempt(questions, [{ questionId: "q1", selectedOptionIds: ["z"] }]),
    ).toThrow(/خيارات غير صالحة/);
  });

  it("يرفض اختيار أكثر من خيار في سؤال الإجابة الواحدة", () => {
    expect(() =>
      gradeAttempt(questions, [{ questionId: "q1", selectedOptionIds: ["a", "b"] }]),
    ).toThrow(/خياراً واحداً فقط/);
  });

  it("يرفض إجابتين لنفس السؤال", () => {
    expect(() =>
      gradeAttempt(questions, [
        { questionId: "q1", selectedOptionIds: ["a"] },
        { questionId: "q1", selectedOptionIds: ["b"] },
      ]),
    ).toThrow(/مكررة/);
  });

  it("يتجاهل الخيارات المكررة في اختيار الطالب", () => {
    const result = gradeAttempt(questions, [
      { questionId: "q1", selectedOptionIds: ["b", "b"] },
    ]);

    expect(result.answers[0]?.selectedOptionIds).toEqual(["b"]);
    expect(result.answers[0]?.isCorrect).toBe(true);
  });
});
