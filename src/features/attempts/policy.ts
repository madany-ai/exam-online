/**
 * سياسات الاختبار — دوال نقية بلا قاعدة بيانات، يسهل اختبارها مباشرةً.
 * كل قرارات التوفر والمدة تُحسم هنا على الخادم؛ عدّاد الوقت في المتصفح عرض فقط.
 */

export type AvailabilityWindow = {
  startsAt: Date | null;
  endsAt: Date | null;
};

export type StartEligibility =
  | { allowed: true }
  | { allowed: false; code: StartBlockedCode; message: string };

export type StartBlockedCode =
  | "NOT_PUBLISHED"
  | "NOT_STARTED"
  | "ENDED"
  | "NO_QUESTIONS"
  | "ATTEMPTS_EXHAUSTED"
  | "IDENTIFIER_REQUIRED";

/** الموعد النهائي = الأسبق بين (بداية + المدة) ونهاية نافذة التوفر. */
export function computeExpiresAt(
  startedAt: Date,
  durationMinutes: number,
  window: AvailabilityWindow,
): Date {
  const byDuration = new Date(startedAt.getTime() + durationMinutes * 60_000);
  if (window.endsAt && window.endsAt.getTime() < byDuration.getTime()) {
    return window.endsAt;
  }
  return byDuration;
}

export function isWithinWindow(now: Date, window: AvailabilityWindow): boolean {
  if (window.startsAt && now.getTime() < window.startsAt.getTime()) return false;
  if (window.endsAt && now.getTime() >= window.endsAt.getTime()) return false;
  return true;
}

type StartCheckInput = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  questionCount: number;
  window: AvailabilityWindow;
  now: Date;
  /** عدد المحاولات المستخدمة سابقاً لنفس مُعرّف الطالب */
  usedAttempts: number;
  maxAttempts: number;
  requiresStudentId: boolean;
  hasIdentifier: boolean;
};

export function evaluateStartEligibility(input: StartCheckInput): StartEligibility {
  if (input.status === "DRAFT") {
    return { allowed: false, code: "NOT_PUBLISHED", message: "هذا الاختبار لم يُنشر بعد." };
  }
  if (input.status === "CLOSED") {
    return { allowed: false, code: "ENDED", message: "أُغلق هذا الاختبار ولم يعد متاحاً." };
  }
  if (input.questionCount === 0) {
    return {
      allowed: false,
      code: "NO_QUESTIONS",
      message: "لا يحتوي هذا الاختبار على أسئلة بعد.",
    };
  }
  if (input.window.startsAt && input.now.getTime() < input.window.startsAt.getTime()) {
    return {
      allowed: false,
      code: "NOT_STARTED",
      message: "لم يبدأ هذا الاختبار بعد.",
    };
  }
  if (input.window.endsAt && input.now.getTime() >= input.window.endsAt.getTime()) {
    return {
      allowed: false,
      code: "ENDED",
      message: "انتهت نافذة هذا الاختبار.",
    };
  }
  if (input.requiresStudentId && !input.hasIdentifier) {
    return {
      allowed: false,
      code: "IDENTIFIER_REQUIRED",
      message: "هذا الاختبار يطلب مُعرّفاً للطالب.",
    };
  }
  if (input.usedAttempts >= input.maxAttempts) {
    return {
      allowed: false,
      code: "ATTEMPTS_EXHAUSTED",
      message: "استنفدت عدد المحاولات المسموح بها لهذا الاختبار.",
    };
  }
  return { allowed: true };
}

/** هل انتهت المهلة؟ (يُفرض على الخادم) */
export function hasExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/**Transition map entre estados الاختبار — يُفرض على الخادم فقط. */
export const EXAM_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["CLOSED"],
  CLOSED: ["DRAFT"],
} as const;

export function canTransition(from: string, to: string): boolean {
  return (EXAM_TRANSITIONS[from] ?? []).includes(to);
}

export type TransitionBlock = { allowed: boolean; reason?: string };

export function evaluateTransition(input: {
  from: "DRAFT" | "PUBLISHED" | "CLOSED";
  to: "DRAFT" | "PUBLISHED" | "CLOSED";
  questionCount: number;
  attemptCount: number;
}): TransitionBlock {
  if (!canTransition(input.from, input.to)) {
    return {
      allowed: false,
      reason: `لا يمكن الانتقال من "${input.from}" إلى "${input.to}".`,
    };
  }
  if (input.to === "PUBLISHED" && input.questionCount === 0) {
    return { allowed: false, reason: "أضف سؤالاً واحداً على الأقل قبل النشر." };
  }
  // العودة إلى المسودة تُسمح فقط إذا لم يبدأ أي طالب — وإلا فستتغير الأسئلة
  // التي قد يكون الطالب يراها الآن.
  if (input.to === "DRAFT" && input.attemptCount > 0) {
    return {
      allowed: false,
      reason: "لا يمكن إعادة الاختبار إلى مسودة بعد وجود محاولات طلاب.",
    };
  }
  return { allowed: true };
}
