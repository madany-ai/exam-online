import { NextResponse } from "next/server";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { safeMessage } from "@/lib/errors";

/** رد JSON موحّد + ترويسات حماية أساسية. */
export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...init?.headers,
    },
  });
}

export function jsonError(
  status: number,
  message: string,
  extra?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(
    { error: message, ...extra },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...extraHeaders,
      },
    },
  );
}

/**
 * فرض تحديد معدل الطلبات (Rate Limit) على مسارات الـ API العامة.
 * يدعم تمرير subKey (مثل accessToken أو رمز الاختبار) لفصل حصص الطلاب،
 * ويعيد كود 429 مع ترويسات Retry-After القياسية قبل الوصول إلى قاعدة البيانات.
 */
export function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
  subKey?: string,
) {
  const key = subKey
    ? `${bucket}:${subKey}`
    : clientKey(request.headers, bucket);
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    return jsonError(
      429,
      `عدد الطلبات كبير جداً. يرجى الانتظار ${result.retryAfterSeconds} ثانية ثم إعادة المحاولة.`,
      { retryAfterSeconds: result.retryAfterSeconds },
      {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    );
  }
  return null;
}

/** يحوّل أخطاء التطبيق إلى رد JSON آمن دون آثار مكدّس. */
export function handleRouteError(error: unknown) {
  // نُسجّل الخطأ على الخادم فقط (لا يصل إلى العميل) لتشهيل تشخيص أعطال الإنتاج.
  if (process.env.NODE_ENV !== "production") {
    console.error("[api] خطأ:", error);
  }

  const status =
    error instanceof Error && "code" in error
      ? ({
          VALIDATION: 400,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          CONFLICT: 409,
        } as Record<string, number>)[(error as { code: string }).code] ?? 500
      : 500;
  return jsonError(status, safeMessage(error));
}
