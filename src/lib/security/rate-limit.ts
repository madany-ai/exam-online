/**
 * نظام تحديد معدل الطلبات (Rate Limiter) فائق الخفة ومُحسّن للسيرفرات المجانية.
 *
 * المزايا الهندسية للخطة المجانية (Free Tier):
 * 1. استهلاك ذاكرة محدود وثابت (Bounded LRU Map بحد أقصى 5000 مفتاح).
 * 2. طرد أقدم مفتاح (Eviction) بتعقيد زمني O(1) بدون حلقات ثقيلة تستهلك المعالج (CPU).
 * 3. صدّ الطلبات المفرطة في الذاكرة (< 0.1ms) قبل الوصول إلى قاعدة البيانات (Neon) أو تشفير كلمة المرور (scrypt).
 * 4. فصل حصص الطلاب عبر رمز المحاولة (accessToken) أو معرّف الطالب لتفادي حظر الطلاب المشتركين في نفس شبكة الـ Wi-Fi أو الـ CGNAT لشركات المحمول.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const MAX_BUCKETS = 5_000;

declare global {
  var __examRateLimitBuckets: Map<string, Bucket> | undefined;
  var __examRateLimitCleanupTimer: ReturnType<typeof setInterval> | undefined;
}

const buckets: Map<string, Bucket> =
  globalThis.__examRateLimitBuckets ?? new Map<string, Bucket>();

if (!globalThis.__examRateLimitBuckets) {
  globalThis.__examRateLimitBuckets = buckets;
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

/**
 * إعدادات حدود الطلبات الموصى بها لكل مسار لحماية السيرفر المجاني وقاعدة البيانات.
 */
export const RATE_LIMIT_PROFILES = {
  /** تسجيل دخول المعلم: 8 محاولات كل 5 دقائق لكل IP أو بريد (يحمي المعالج من هجمات التخمين على scrypt) */
  LOGIN: { limit: 8, windowMs: 5 * 60_000 },
  /** بدء اختبار (لكل IP): 45 محاولة في الدقيقة (يسمح لفصل دراسي كامل أو شبكة CGNAT بالبدء معاً دون حظر) */
  START_ATTEMPT_IP: { limit: 45, windowMs: 60_000 },
  /** بدء اختبار (لكل طالب): 5 محاولات في الدقيقة لنفس رقم الطالب */
  START_ATTEMPT_STUDENT: { limit: 5, windowMs: 60_000 },
  /** الحفظ التلقائي للإجابات: 30 طلباً في الدقيقة لكل محاولة طالب (طلب كل ثانيتين كحد أقصى) */
  SAVE_ANSWERS: { limit: 30, windowMs: 60_000 },
  /** تسليم الاختبار النهائي: 10 طلبات في الدقيقة لكل محاولة طالب */
  SUBMIT_ATTEMPT: { limit: 10, windowMs: 60_000 },
  /** إنشاء أو استيراد اختبار للمعلم: 15 عملية في الدقيقة */
  TEACHER_WRITE: { limit: 15, windowMs: 60_000 },
} as const;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    // في حال امتلاء الذاكرة نحذف أقدم مفتاح بتعقيد O(1)
    if (!existing && buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) {
        buckets.delete(oldestKey);
      }
    }
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: 0,
      resetAt,
    };
  }

  // تحديث موضع المفتاح في نهاية الـ Map للحفاظ على ترتيب LRU بتعقيد O(1)
  existing.count += 1;
  buckets.delete(key);
  buckets.set(key, existing);

  if (existing.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      resetAt: existing.resetAt,
    };
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: 0,
    resetAt: existing.resetAt,
  };
}

/** تنظيف دوري خفيف للمفاتيح المنتهية كل دقيقتين دون استهلاك يذكر للمعالج. */
if (typeof setInterval !== "undefined" && !globalThis.__examRateLimitCleanupTimer) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, 120_000);
  timer.unref?.();
  globalThis.__examRateLimitCleanupTimer = timer;
}

/**
 * استخراج عنوان IP الحقيقي للعميل خلف خدمات الاستضافة السحابية (Cloudflare / Vercel / Render / Nginx).
 */
export function extractClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const vercelIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

/** بناء مفتاح تحديد المعدل بناءً على عنوان الـ IP ومعرّف إضافي اختياري (مثل رمز المحاولة أو الاختبار). */
export function clientKey(headers: Headers, scope: string, subKey?: string): string {
  const ip = extractClientIp(headers);
  return subKey ? `${scope}:${subKey}:${ip}` : `${scope}:${ip}`;
}
