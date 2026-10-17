import { saveAnswers, submitAttempt } from "@/features/attempts/service";
import { submittedAnswersSchema } from "@/features/exams/schema";
import { handleRouteError, enforceRateLimit, jsonError, jsonOk } from "@/lib/api/response";
import { RATE_LIMIT_PROFILES } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ token: string; accessToken: string }> };

function readBody(raw: unknown) {
  return submittedAnswersSchema.safeParse(raw);
}

/**
 * PATCH /api/public/exams/[token]/attempts/[accessToken]
 * حفظ تلقائي للإجابات. معزول لكل محاولة طالب (accessToken) لحماية قاعدة البيانات.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { token, accessToken } = await params;

  const limited = enforceRateLimit(
    request,
    "save-answers",
    RATE_LIMIT_PROFILES.SAVE_ANSWERS.limit,
    RATE_LIMIT_PROFILES.SAVE_ANSWERS.windowMs,
    accessToken,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "صيغة الطلب غير صالحة.");
  }

  const parsed = readBody(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "صيغة الإجابات غير صالحة.");
  }

  try {
    const result = await saveAnswers(token, accessToken, parsed.data);
    return jsonOk({
      saved: result.saved,
      savedAt: result.savedAt.toISOString(),
      finalized: result.finalized,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/public/exams/[token]/attempts/[accessToken]
 * تسليم المحاولة. آمن التكرار ومحمّي بحدّ معدل خاص بكل محاولة.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { token, accessToken } = await params;

  const limited = enforceRateLimit(
    request,
    "submit-attempt",
    RATE_LIMIT_PROFILES.SUBMIT_ATTEMPT.limit,
    RATE_LIMIT_PROFILES.SUBMIT_ATTEMPT.windowMs,
    accessToken,
  );
  if (limited) return limited;

  let body: unknown = null;
  const text = await request.text();
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError(400, "صيغة الطلب غير صالحة.");
    }
  }

  const parsed = body === null ? null : readBody(body);
  if (parsed && !parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "صيغة الإجابات غير صالحة.");
  }

  try {
    const result = await submitAttempt(token, accessToken, parsed?.data ?? null);
    return jsonOk({
      submittedAt: result.submittedAt?.toISOString() ?? null,
      alreadyFinalized: result.alreadyFinalized,
      // لا نُرجع الدرجة من نقطة التسليم إطلاقاً؛
      // ما يراه الطالب يحدّده مسار /result حسب سياسة إظهار النتائج.
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
