"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
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
 * إجراءات المصادقة (تسجيل الدخول وإنشاء حساب معلّم جديد لأي بريد إلكتروني).
 */

export type AuthActionState = { error?: string } | undefined;

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const loginSchema = z.object({
  email: z.string().trim().min(1, "أدخل البريد الإلكتروني").email("بريد إلكتروني غير صالح"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
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
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    console.error("Login action error:", error);
    return { error: "تعذّر تسجيل الدخول حالياً. يرجى إعادة المحاولة." };
  }
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب (حرفان على الأقل)").max(100, "الاسم طويل جداً"),
  email: z.string().trim().min(1, "أدخل البريد الإلكتروني").email("بريد إلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
});

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    const parsed = registerSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "بيانات التسجيل غير صالحة." };
    }

    const reqHeaders = await headers();
    const ip = extractClientIp(reqHeaders);
    const normalizedEmail = parsed.data.email.toLowerCase();

    const ipRate = checkRateLimit(
      `register-ip:${ip}`,
      RATE_LIMIT_PROFILES.LOGIN.limit,
      RATE_LIMIT_PROFILES.LOGIN.windowMs,
    );
    if (!ipRate.allowed) {
      return {
        error: `محاولات كثيرة جداً. يرجى الانتظار ${ipRate.retryAfterSeconds} ثانية.`,
      };
    }

    const existing = await prisma.teacher.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return { error: "هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول مباشرة." };
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const teacher = await prisma.teacher.create({
      data: {
        email: normalizedEmail,
        name: parsed.data.name,
        passwordHash,
      },
      select: { id: true },
    });

    await createTeacherSession(teacher.id);
    redirect("/dashboard");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    console.error("Register action error:", error);
    return { error: "تعذّر إنشاء الحساب حالياً. يرجى التحقق من البيانات والمحاولة مرة أخرى." };
  }
}

export async function logoutAction() {
  await destroyTeacherSession();
  redirect("/login");
}

