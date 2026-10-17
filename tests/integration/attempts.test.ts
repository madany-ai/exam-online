import { describe, expect, it } from "vitest";
import {
  getStudentResult,
  getPublicExamSummary,
  resumeAttempt,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "@/features/attempts/service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { generateToken, hashToken } from "@/lib/security/random";
import { createExamWithQuestions, createExpiredAttempt, createTeacher, prisma } from "./helpers";

describe("الوصول إلى اختبار الطالب", () => {
  it("يرفض رابطاً غير صحيح", async () => {
    await expect(getPublicExamSummary("unknown-token")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("يعرض ملخص الاختبار دون أسئلة أو مفتاح إجابات", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const summary = await getPublicExamSummary(exam.publicToken);

    expect(summary.title).toBe(exam.title);
    expect(summary.questionCount).toBe(3);
    expect(JSON.stringify(summary)).not.toMatch(/isCorrect|correctOptionIds/);
  });
});

describe("بدء المحاولة", () => {
  it("يمنع بدء اختبار مسودة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });

    await expect(
      startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("يمنع بدء اختبار مغلق", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "CLOSED" });

    await expect(
      startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("يمنع البدء قبل بداية النافذة الزمنية", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, {
      startsAt: new Date(Date.now() + 60 * 60_000),
    });

    await expect(
      startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("يمنع البدء بعد نهاية النافذة الزمنية", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, {
      endsAt: new Date(Date.now() - 60_000),
    });

    await expect(
      startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("ينشئ المحاولة ويعيد أسئلة بلا إجابات صحيحة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const result = await startAttempt(exam.publicToken, {
      studentName: "سارة أحمد",
      studentIdentifier: null,
    });

    expect(result.accessToken.length).toBeGreaterThanOrEqual(32);
    expect(result.questions).toHaveLength(3);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/isCorrect|correctOptionIds/);
    // الخيارات تصل كـ {id, text} فقط — بلا أي علامة تصحيح
    expect(result.questions[0]?.options.map((option) => option.id)).toEqual(["a", "b"]);
    for (const question of result.questions) {
      expect(Object.keys(question.options[0] ?? {}).sort()).toEqual(["id", "text"]);
      expect(Object.keys(question).sort()).toEqual(["id", "options", "points", "text", "type"]);
    }
  });

  it("يحسب الموعد النهائي من المدة على الخادم", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { durationMinutes: 15 });

    const before = Date.now();
    const result = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const expires = result.expiresAt.getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 15 * 60_000 - 2_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 2_000);
  });

  it("يطلب المُعرّف عندما يكون إلزامياً", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { requiresStudentId: true });

    await expect(
      startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: null }),
    ).rejects.toBeInstanceOf(ValidationError);

    const ok = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: "S-100",
    });
    expect(ok.attemptId).toBeTruthy();
  });

  it("يطبّق حدّ المحاولات حسب المُعرّف", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, {
      requiresStudentId: true,
      maxAttempts: 1,
    });

    await startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: "S-100" });

    await expect(
      startAttempt(exam.publicToken, { studentName: "طالب آخر", studentIdentifier: "S-100" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // مُعرّف مختلف يمكنه المحاولة
    const other = await startAttempt(exam.publicToken, {
      studentName: "طالب آخر",
      studentIdentifier: "S-200",
    });
    expect(other.attemptId).toBeTruthy();
  });

  it("لا يخزّن مُعرّف الطالب كنص صريح في مفتاح المطابقة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { requiresStudentId: true });

    await startAttempt(exam.publicToken, { studentName: "طالب", studentIdentifier: "S-100" });

    const attempt = await prisma.examAttempt.findFirstOrThrow({ where: { examId: exam.id } });
    expect(attempt.identifierHash).toHaveLength(64);
    expect(attempt.identifierHash).not.toContain("S-100");
  });
});

describe("حفظ الإجابات والتسليم", () => {
  it("يحفظ الإجابات تدريجياً دون تقييم", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const saved = await saveAnswers(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });

    expect(saved.finalized).toBe(false);
    const stored = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.attemptId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.selectedOptionIds).toEqual(["b"]);
    // لا تقييم قبل التسليم
    expect(stored[0]?.isCorrect).toBe(false);
  });

  it("يرفض خياراً لا ينتمي للسؤال", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    await expect(
      saveAnswers(exam.publicToken, attempt.accessToken, {
        answers: [{ questionId: "q1", selectedOptionIds: ["not-an-option"] }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("يرفض معرّف سؤال من اختبار آخر", async () => {
    const teacher = await createTeacher();
    const first = await createExamWithQuestions(teacher.id);
    const second = await createExamWithQuestions(teacher.id);

    const attempt = await startAttempt(first.exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    await expect(
      saveAnswers(first.exam.publicToken, attempt.accessToken, {
        answers: [{ questionId: "question-from-other-exam", selectedOptionIds: ["a"] }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(second.exam.id).not.toBe(first.exam.id);
  });

  it("يقيّم على الخادم ويخزّن الدرجة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const result = await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [
        { questionId: "q1", selectedOptionIds: ["b"] }, // 2/2
        { questionId: "q2", selectedOptionIds: ["a", "c"] }, // 3/3
        { questionId: "q3", selectedOptionIds: ["true"] }, // 1/1
      ],
    });

    expect(result.alreadyFinalized).toBe(false);
    expect(result.earnedScore).toBe(6);
    expect(result.maximumScore).toBe(6);
    expect(result.percentage).toBe(100);

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    });
    expect(stored.status).toBe("SUBMITTED");
    expect(stored.gradedAt).not.toBeNull();
    expect(stored.earnedScore?.toNumber()).toBe(6);
  });

  it("يمنع الاختيار الجزئي في الاختيار المتعدد", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const result = await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q2", selectedOptionIds: ["a"] }],
    });

    expect(result.earnedScore).toBe(0);
    expect(result.maximumScore).toBe(6);
  });

  it("التسليم idempotent: الطلب المتكرر لا يغيّر الدرجة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const answers = {
      answers: [
        { questionId: "q1", selectedOptionIds: ["b"] },
        { questionId: "q2", selectedOptionIds: ["a", "c"] },
      ],
    };

    const first = await submitAttempt(exam.publicToken, attempt.accessToken, answers);
    const second = await submitAttempt(exam.publicToken, attempt.accessToken, answers);
    const third = await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["a"] }],
    });

    expect(second.alreadyFinalized).toBe(true);
    expect(third.alreadyFinalized).toBe(true);
    expect(third.earnedScore).toBe(first.earnedScore);

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    });
    expect(stored.earnedScore?.toNumber()).toBe(5);
  });

  it("يحفظ بعد انتهاء المهلة ويُسلّم تلقائياً", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const attempt = await createExpiredAttempt(exam.id);
    const accessToken = "unused"; // سنستخدم هاش مطابق أدناه

    // نُنشئ رمز وصول معروفاً للمحاولة المنتهية
    const knownToken = generateToken(32);
    await prisma.examAttempt.update({
      where: { id: attempt.id },
      data: { accessTokenHash: hashToken(knownToken) },
    });

    const result = await saveAnswers(exam.publicToken, knownToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });

    expect(result.finalized).toBe(true);
    expect(result.saved).toBe(0);
    expect(accessToken).toBeTruthy();

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      include: { answers: true },
    });
    expect(stored.status).toBe("SUBMITTED");
    // لم تكن هناك إجابات محفوظة قبل انتهاء المهلة، فالدرجة صفر — لا تُقبل إجابات متأخرة
    expect(stored.earnedScore?.toNumber()).toBe(0);
    expect(stored.answers).toHaveLength(0);
  });

  it("يخزّن الرمز كبصمة لا كنص صريح", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    });
    expect(stored.accessTokenHash).toHaveLength(64);
    expect(stored.accessTokenHash).not.toBe(attempt.accessToken);
  });
});

describe("منع الوصول إلى محاولة طالب آخر", () => {
  it("يرفض رمز وصول لا يخص المحاولة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const otherToken = generateToken(32);

    await expect(resumeAttempt(exam.publicToken, otherToken)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      getStudentResult(exam.publicToken, otherToken),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      submitAttempt(exam.publicToken, otherToken, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(attempt.accessToken).toBeTruthy();
  });

  it("يرفض رمز محاولة مع اختبار آخر", async () => {
    const teacher = await createTeacher();
    const first = await createExamWithQuestions(teacher.id);
    const second = await createExamWithQuestions(teacher.id);

    const attempt = await startAttempt(first.exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    await expect(
      resumeAttempt(second.exam.publicToken, attempt.accessToken),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("لا يمكن لأي طالب آخر رؤية نتيجة مُسلَّمة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { resultVisibility: "IMMEDIATE" });
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });
    await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });

    const stolen = generateToken(32);
    await expect(getStudentResult(exam.publicToken, stolen)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("سياسة إظهار النتائج", () => {
  it("IMMEDIATE: النتيجة متاحة مباشرة بعد التسليم", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { resultVisibility: "IMMEDIATE" });
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });
    await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });

    const view = await getStudentResult(exam.publicToken, attempt.accessToken);
    expect(view.result?.earnedScore).toBe(2);
    expect(view.result?.percentage).toBeCloseTo(33.33, 2);
    expect(view.resultsHiddenBecause).toBeNull();
  });

  it("MANUAL: النتيجة مخفية حتى يُصدرها المعلم", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { resultVisibility: "MANUAL" });
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });
    await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });

    const hidden = await getStudentResult(exam.publicToken, attempt.accessToken);
    expect(hidden.result).toBeNull();
    expect(hidden.resultsHiddenBecause).toBe("MANUAL_NOT_RELEASED");

    await prisma.exam.update({
      where: { id: exam.id },
      data: { resultsReleasedAt: new Date() },
    });

    const released = await getStudentResult(exam.publicToken, attempt.accessToken);
    expect(released.result?.earnedScore).toBe(2);
  });

  it("لا يكشف مفتاح الإجابات في أي استجابة للطالب", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { resultVisibility: "IMMEDIATE" });
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });
    await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });

    const view = await getStudentResult(exam.publicToken, attempt.accessToken);
    const resumed = await resumeAttempt(exam.publicToken, attempt.accessToken);

    for (const payload of [JSON.stringify(view), JSON.stringify(resumed)]) {
      expect(payload).not.toMatch(/isCorrect|correctOptionIds/);
      expect(payload).not.toMatch(/الإجابة الصحيحة/);
    }
  });

  it("لا نتيجة قبل التسليم", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { resultVisibility: "IMMEDIATE" });
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const view = await getStudentResult(exam.publicToken, attempt.accessToken);
    expect(view.result).toBeNull();
    expect(view.resultsHiddenBecause).toBe("NOT_SUBMITTED");
  });
});

describe("الخلط الحتمي", () => {
  it("يثبّت الترتيب لنفس المحاولة ويغيّره بين المحاولات", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, {
      shuffleQuestions: true,
      shuffleOptions: true,
    });

    const originalOrder = ["q1", "q2", "q3"];
    const orderings = new Set<string>();

    for (let index = 0; index < 6; index += 1) {
      const attempt = await startAttempt(exam.publicToken, {
        studentName: "طالب",
        studentIdentifier: null,
      });
      const resumed = await resumeAttempt(exam.publicToken, attempt.accessToken);
      const order = resumed.questions.map((question) => question.id);

      // الحتمية: إعادة تحميل نفس المحاولة ترجّع نفس الترتيب
      expect(order).toEqual(attempt.questions.map((question) => question.id));
      // والترتيب لم يُفقد أي سؤال
      expect([...order].sort()).toEqual(originalOrder);
      orderings.add(order.join(","));
    }

    // ترتيبات مختلفة فعلاً بين المحاولات (احتمال تطابق ترتيبين مع 3 أسئلة ليس معدوماً، فنأخذ 6 محاولات)
    expect(orderings.size).toBeGreaterThan(1);
  });

  it("يحافظ على صحة الفحص عند الخلط: المعرّفات تبقى كما هي", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, {
      shuffleOptions: true,
    });
    const attempt = await startAttempt(exam.publicToken, {
      studentName: "طالب",
      studentIdentifier: null,
    });

    const q1 = attempt.questions.find((question) => question.id === "q1");
    expect(q1?.options.map((option) => option.id).sort()).toEqual(["a", "b"]);

    const result = await submitAttempt(exam.publicToken, attempt.accessToken, {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    });
    expect(result.earnedScore).toBe(2);
  });
});
