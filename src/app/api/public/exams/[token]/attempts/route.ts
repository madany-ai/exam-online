import { startAttempt } from "@/features/attempts/service";
import { startAttemptSchema } from "@/features/exams/schema";
import { handleRouteError, enforceRateLimit, jsonError, jsonOk } from "@/lib/api/response";
import { extractClientIp, RATE_LIMIT_PROFILES } from "@/lib/security/rate-limit";

/**
 * POST /api/public/exams/[token]/attempts
 * بدء محاولة طالب. نقطة عامة → حدّ معدل مزدوج (لكل IP ولكل معرّف طالب) + تحقق صارم من المدخلات.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = extractClientIp(request.headers);

  // طبقة الحماية الأولى: لكل IP مع الاختبار (تسمح بدخول فصل كامل على نفس الشبكة وتمنع الإغراق)
  const ipLimited = enforceRateLimit(
    request,
    "start-attempt-ip",
    RATE_LIMIT_PROFILES.START_ATTEMPT_IP.limit,
    RATE_LIMIT_PROFILES.START_ATTEMPT_IP.windowMs,
    `${token}:${ip}`,
  );
  if (ipLimited) return ipLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "صيغة الطلب غير صالحة.");
  }

  const parsed = startAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "بيانات الطالب غير صالحة.");
  }

  // طبقة الحماية الثانية: لكل معرّف طالب داخل نفس الاختبار لمنع التكرار السريع قبل ضرب قاعدة البيانات
  const studentKey = parsed.data.studentIdentifier
    ? `${token}:id:${parsed.data.studentIdentifier.trim().toLowerCase()}`
    : `${token}:name:${parsed.data.studentName.trim().toLowerCase()}:${ip}`;

  const studentLimited = enforceRateLimit(
    request,
    "start-attempt-student",
    RATE_LIMIT_PROFILES.START_ATTEMPT_STUDENT.limit,
    RATE_LIMIT_PROFILES.START_ATTEMPT_STUDENT.windowMs,
    studentKey,
  );
  if (studentLimited) return studentLimited;

  try {
    const result = await startAttempt(token, parsed.data);
    return jsonOk(
      {
        attemptId: result.attemptId,
        accessToken: result.accessToken,
        expiresAt: result.expiresAt.toISOString(),
        questions: result.questions,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
