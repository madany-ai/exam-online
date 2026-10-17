import { describe, expect, it } from "vitest";
import {
  canTransition,
  computeExpiresAt,
  evaluateStartEligibility,
  evaluateTransition,
  hasExpired,
  isWithinWindow,
} from "@/features/attempts/policy";

const now = new Date("2026-03-01T10:00:00Z");

const baseInput = {
  status: "PUBLISHED" as const,
  questionCount: 3,
  window: { startsAt: null, endsAt: null },
  now,
  usedAttempts: 0,
  maxAttempts: 1,
  requiresStudentId: false,
  hasIdentifier: false,
};

describe("سياسة التوفر والمدة", () => {
  it("يحسب الموعد النهائي من المدة", () => {
    const expiresAt = computeExpiresAt(now, 30, { startsAt: null, endsAt: null });
    expect(expiresAt.toISOString()).toBe("2026-03-01T10:30:00.000Z");
  });

  it("يستخدم نهاية النافذة إن كانت أقرب من المدة", () => {
    const windowEnd = new Date("2026-03-01T10:10:00Z");
    const expiresAt = computeExpiresAt(now, 30, { startsAt: null, endsAt: windowEnd });
    expect(expiresAt.toISOString()).toBe(windowEnd.toISOString());
  });

  it("يتحقق من نافذة التوفر", () => {
    expect(isWithinWindow(now, { startsAt: null, endsAt: null })).toBe(true);
    expect(
      isWithinWindow(now, { startsAt: new Date("2026-03-01T11:00:00Z"), endsAt: null }),
    ).toBe(false);
    expect(
      isWithinWindow(now, { startsAt: null, endsAt: new Date("2026-03-01T09:00:00Z") }),
    ).toBe(false);
  });

  it("يكشف انتهاء المهلة", () => {
    expect(hasExpired(new Date("2026-03-01T09:59:59Z"), now)).toBe(true);
    expect(hasExpired(new Date("2026-03-01T10:00:01Z"), now)).toBe(false);
  });
});

describe("أهلية بدء المحاولة", () => {
  it("يسمح بالبدء في اختبار منشور متاح", () => {
    expect(evaluateStartEligibility(baseInput)).toEqual({ allowed: true });
  });

  it("يمنع اختبار المسودة", () => {
    const result = evaluateStartEligibility({ ...baseInput, status: "DRAFT" });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("NOT_PUBLISHED");
  });

  it("يمنع اختباراً مغلقاً", () => {
    const result = evaluateStartEligibility({ ...baseInput, status: "CLOSED" });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("ENDED");
  });

  it("يمنع البدء قبل بداية النافذة", () => {
    const result = evaluateStartEligibility({
      ...baseInput,
      window: { startsAt: new Date("2026-03-01T12:00:00Z"), endsAt: null },
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("NOT_STARTED");
  });

  it("يمنع البدء بعد نهاية النافذة", () => {
    const result = evaluateStartEligibility({
      ...baseInput,
      window: { startsAt: null, endsAt: new Date("2026-03-01T09:00:00Z") },
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("ENDED");
  });

  it("يمنع اختباراً بلا أسئلة", () => {
    const result = evaluateStartEligibility({ ...baseInput, questionCount: 0 });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("NO_QUESTIONS");
  });

  it("يطبّق حدّ المحاولات حسب المُعرّف", () => {
    const result = evaluateStartEligibility({ ...baseInput, usedAttempts: 1, maxAttempts: 1 });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("ATTEMPTS_EXHAUSTED");
  });

  it("يسمح عند وجود محاولات متبقية", () => {
    expect(
      evaluateStartEligibility({ ...baseInput, usedAttempts: 1, maxAttempts: 2 }).allowed,
    ).toBe(true);
  });

  it("يشترط المعرّف إذا كان مطلوباً", () => {
    const result = evaluateStartEligibility({
      ...baseInput,
      requiresStudentId: true,
      hasIdentifier: false,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("IDENTIFIER_REQUIRED");
  });
});

describe("دورة حياة الاختبار", () => {
  it("يسمح بالمسار المعتاد: مسودة ← منشور ← مغلق", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition("PUBLISHED", "CLOSED")).toBe(true);
  });

  it("يمنع القفز من المسودة إلى المغلق", () => {
    expect(canTransition("DRAFT", "CLOSED")).toBe(false);
  });

  it("يمنع التراجع عن اختبار منشور إلى مسودة", () => {
    expect(canTransition("PUBLISHED", "DRAFT")).toBe(false);
  });

  it("يشترط وجود أسئلة للنشر", () => {
    const verdict = evaluateTransition({
      from: "DRAFT",
      to: "PUBLISHED",
      questionCount: 0,
      attemptCount: 0,
    });
    expect(verdict.allowed).toBe(false);
  });

  it("يمنع الإعادة إلى مسودة بعد وجود محاولات", () => {
    const verdict = evaluateTransition({
      from: "CLOSED",
      to: "DRAFT",
      questionCount: 3,
      attemptCount: 1,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/محاولات/);
  });
});
