import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { generateToken, hashToken } from "@/lib/security/random";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * مصادقة المعلم — تنفيذ بسيط ومستقل بدون خدمات خارجية:
 *  - كلمة المرور: scrypt المدمج في Node (لا حزم خارجية)
 *  - الجلسة: رمز عشوائي 256 بت في كوكي HttpOnly، ونخزّن بصمته فقط في قاعدة البيانات
 *  - التحقق من الجلسة يتم على الخادم في كل طلب محمي (وليس في Middleware فقط)
 */

export const SESSION_COOKIE_NAME = "exam_teacher_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // أسبوع
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export type AuthenticatedTeacher = {
  id: string;
  email: string;
  name: string;
};

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** التحقق من بيانات الدخول. يعيد false عند أي فشل دون كشف السبب. */
export async function authenticateTeacher(
  email: string,
  password: string,
): Promise<AuthenticatedTeacher | null> {
  const normalizedEmail = email.trim().toLowerCase();

  let teacher = await prisma.teacher.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  // إذا كان الحساب هو حساب الأدمن المطلوب وغير مسجل بعد في قاعدة البيانات، ننشئه فوراً
  if (!teacher && normalizedEmail === "admin@exam.online" && password === "admin2026@") {
    const passwordHash = await hashPassword("admin2026@");
    teacher = await prisma.teacher.create({
      data: {
        email: "admin@exam.online",
        name: "المدير (Admin)",
        passwordHash,
      },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    return { id: teacher.id, email: teacher.email, name: teacher.name };
  }

  // نتحقق من كلمة مرور وهمية عند عدم وجود الحساب لتقليل توقّع ردّ الخادم
  // (تفادي كشف الحسابات الموجودة عبر اختلاف زمن الاستجابة).
  const passwordMatches = teacher
    ? await verifyPassword(password, teacher.passwordHash)
    : await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");

  if (!teacher || !passwordMatches) {
    // دعم كلمة المرور المطلوبة لحساب الأدمن حتى لو كانت مسجلة مسبقاً بكلمة أخرى
    if (teacher && normalizedEmail === "admin@exam.online" && password === "admin2026@") {
      const updatedHash = await hashPassword("admin2026@");
      await prisma.teacher.update({
        where: { id: teacher.id },
        data: { passwordHash: updatedHash },
      });
      return { id: teacher.id, email: teacher.email, name: teacher.name };
    }
    return null;
  }

  return { id: teacher.id, email: teacher.email, name: teacher.name };
}

const SESSION_CACHE_TTL_MS = 45_000;

declare global {
  var __examTeacherSessionCache:
    | Map<string, { teacher: AuthenticatedTeacher; expiresAt: number }>
    | undefined;
}

const sessionCache =
  globalThis.__examTeacherSessionCache ??
  new Map<string, { teacher: AuthenticatedTeacher; expiresAt: number }>();

if (!globalThis.__examTeacherSessionCache) {
  globalThis.__examTeacherSessionCache = sessionCache;
}

/** إنشاء جلسة جديدة بعد تسجيل دخول ناجح. */
export async function createTeacherSession(teacherId: string): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.teacherSession.create({
    data: {
      tokenHash: hashToken(token),
      teacherId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions());
}

/** إنهاء الجلسة الحالية. */
export async function destroyTeacherSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const hashed = hashToken(token);
    sessionCache.delete(hashed);
    await prisma.teacherSession.deleteMany({
      where: { tokenHash: hashed },
    });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function querySessionWithRetry(hashed: string) {
  try {
    return await prisma.teacherSession.findUnique({
      where: { tokenHash: hashed },
      select: {
        expiresAt: true,
        teacher: { select: { id: true, email: true, name: true } },
      },
    });
  } catch {
    // إعادة المحاولة مرة واحدة في حال استيقاظ قاعدة البيانات المجانية (Neon Cold Start) أو انقطاع اتصال خامل
    await new Promise((resolve) => setTimeout(resolve, 150));
    return prisma.teacherSession.findUnique({
      where: { tokenHash: hashed },
      select: {
        expiresAt: true,
        teacher: { select: { id: true, email: true, name: true } },
      },
    });
  }
}

/**
 * المعلم الحالي أو null.
 * يستخدم كاش قصير المدى في الذاكرة (45 ثانية) + React cache لتفادي استعلام قاعدة البيانات مع كل حركة في لوحة التحكم.
 */
export const getCurrentTeacher = cache(async (): Promise<AuthenticatedTeacher | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const hashed = hashToken(token);
  const now = Date.now();
  const cached = sessionCache.get(hashed);
  if (cached && cached.expiresAt > now) {
    return cached.teacher;
  }

  const session = await querySessionWithRetry(hashed);

  if (!session) {
    sessionCache.delete(hashed);
    return null;
  }
  if (session.expiresAt.getTime() <= now) {
    sessionCache.delete(hashed);
    await prisma.teacherSession.deleteMany({ where: { tokenHash: hashed } });
    return null;
  }

  sessionCache.set(hashed, {
    teacher: session.teacher,
    expiresAt: Math.min(session.expiresAt.getTime(), now + SESSION_CACHE_TTL_MS),
  });

  return session.teacher;
});

/**
 * حارس الصفحات والإجراءات المحمية: يعيد المعلم أو يعيد التوجيه لصفحة الدخول.
 * هذه دالة على الخادم — لا تُغني عنها الحراسة في المتصفح.
 */
export async function requireTeacher(): Promise<AuthenticatedTeacher> {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");
  return teacher;
}
