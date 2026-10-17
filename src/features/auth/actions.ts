"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticateTeacher,
  createTeacherSession,
  destroyTeacherSession,
} from "@/lib/auth/session";
import {
  checkRateLimit,
  extractClientIp,
  RATE_LIMIT_PROFILES,
} from "@/lib/security/rate-limit";

/**
 * إجراءات المصادقة.
 * لا يوجد تسجيل عام: الحسابات تُنشأ عبر `npm run teacher:create`.
 */

export type AuthActionState = { error?: string } | undefined;

const loginSchema = z.object({
  email: z.string().trim().min(1, "أدخل البريد الإلكتروني").email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات الدخول غير صالحة." };
  }

  // حماية المعالج (scrypt) وقاعدة البيانات على السيرفر المجاني من محاولات التخمين المتكررة
  const reqHeaders = await headers();
  const ip = extractClientIp(reqHeaders);
  const normalizedEmail = parsed.data.email.toLowerCase();

  const ipRate = checkRateLimit(
    `login-ip:${ip}`,
    RATE_LIMIT_PROFILES.LOGIN.limit,
    RATE_LIMIT_PROFILES.LOGIN.windowMs,
  );
  const emailRate = checkRateLimit(
    `login-email:${normalizedEmail}`,
    RATE_LIMIT_PROFILES.LOGIN.limit,
    RATE_LIMIT_PROFILES.LOGIN.windowMs,
  );

  if (!ipRate.allowed || !emailRate.allowed) {
    const waitSec = Math.max(ipRate.retryAfterSeconds, emailRate.retryAfterSeconds);
    return {
      error: `محاولات دخول كثيرة جداً. يرجى الانتظار ${waitSec} ثانية قبل المحاولة مرة أخرى.`,
    };
  }

  const teacher = await authenticateTeacher(parsed.data.email, parsed.data.password);
  if (!teacher) {
    // رسالة واحدة سواء كان الحساب موجوداً أم لا — لا نكشف أي معلومة.
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  await createTeacherSession(teacher.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroyTeacherSession();
  redirect("/login");
}
