import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExamWithQuestions, createTeacher, prisma } from "./helpers";

/**
 * نختبر المصادقة بجلسة حقيقية على الخادم، مع محاكاة مخزن كوكيز Next.js
 * (لأن cookies() يحتاج سياق طلب داخل Next).
 */

const cookieJar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    reset() {
      store.clear();
    },
  };
});

const redirectCalls = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.store.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.store.delete(name);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectCalls.paths.push(path);
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;${path}`;
    throw error;
  },
}));

const {
  SESSION_COOKIE_NAME,
  authenticateTeacher,
  createTeacherSession,
  destroyTeacherSession,
  getCurrentTeacher,
  requireTeacher,
} = await import("@/lib/auth/session");
const { hashToken } = await import("@/lib/security/random");

beforeEach(() => {
  cookieJar.reset();
  redirectCalls.paths.length = 0;
});

describe("التحقق من بيانات الدخول", () => {
  it("يقبل بيانات صحيحة", async () => {
    const teacher = await createTeacher({ email: "correct@example.com" });

    const result = await authenticateTeacher("correct@example.com", "Password12345");
    expect(result?.id).toBe(teacher.id);
  });

  it("يتجاهل حالة الأحرف والمسافات في البريد", async () => {
    await createTeacher({ email: "mixed@example.com" });
    const result = await authenticateTeacher("  Mixed@Example.com ", "Password12345");
    expect(result).not.toBeNull();
  });

  it("يرفض كلمة مرور خاطئة", async () => {
    await createTeacher({ email: "correct@example.com" });
    expect(await authenticateTeacher("correct@example.com", "wrong-password")).toBeNull();
  });

  it("يرفض بريداً غير موجود برسالة موحّدة", async () => {
    const result = await authenticateTeacher("ghost@example.com", "Password12345");
    expect(result).toBeNull();
  });
});

describe("جلسة المعلّم", () => {
  it("ينشئ جلسة ويخزّن بصمة الرمز لا الرمز نفسه", async () => {
    const teacher = await createTeacher();

    await createTeacherSession(teacher.id);

    const token = cookieJar.store.get(SESSION_COOKIE_NAME);
    expect(token).toBeTruthy();

    const session = await prisma.teacherSession.findFirstOrThrow({
      where: { teacherId: teacher.id },
    });
    expect(session.tokenHash).toHaveLength(64);
    expect(session.tokenHash).toBe(hashToken(token as string));
    expect(session.tokenHash).not.toBe(token);
  });

  it("getCurrentTeacher يعيد المعلم من كوكي صالح", async () => {
    const teacher = await createTeacher({ name: "أ. محمد" });
    await createTeacherSession(teacher.id);

    const current = await getCurrentTeacher();
    expect(current?.id).toBe(teacher.id);
    expect(current?.name).toBe("أ. محمد");
  });

  it("لا يعيد معلماً بدون كوكي", async () => {
    expect(await getCurrentTeacher()).toBeNull();
  });

  it("لا يعيد معالماً لكوكي مزوّر", async () => {
    cookieJar.store.set(SESSION_COOKIE_NAME, "forged-token");
    expect(await getCurrentTeacher()).toBeNull();
  });

  it("يرفض جلسة منتهية وينظّفها", async () => {
    const teacher = await createTeacher();
    const token = "expired-session-token";

    await prisma.teacherSession.create({
      data: {
        teacherId: teacher.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    cookieJar.store.set(SESSION_COOKIE_NAME, token);

    expect(await getCurrentTeacher()).toBeNull();
    expect(await prisma.teacherSession.count({ where: { teacherId: teacher.id } })).toBe(0);
  });

  it("إنهاء الجلسة يبطل الوصول", async () => {
    const teacher = await createTeacher();
    await createTeacherSession(teacher.id);
    expect(await getCurrentTeacher()).not.toBeNull();

    await destroyTeacherSession();

    expect(cookieJar.store.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await getCurrentTeacher()).toBeNull();
    expect(await prisma.teacherSession.count({ where: { teacherId: teacher.id } })).toBe(0);
  });
});

describe("حماية الصفحات والإجراءات", () => {
  it("requireTeacher يعيد التوجيه لغير المسجّلين", async () => {
    await expect(requireTeacher()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectCalls.paths).toContain("/login");
  });

  it("requireTeacher يعيد المعلم عند وجود جلسة", async () => {
    const teacher = await createTeacher();
    await createTeacherSession(teacher.id);

    const current = await requireTeacher();
    expect(current.id).toBe(teacher.id);
  });

  it("جلسة معلم لا تمنحه الوصول لاختبارات معلم آخر", async () => {
    const owner = await createTeacher();
    const intruder = await createTeacher();
    await createExamWithQuestions(owner.id);

    await createTeacherSession(intruder.id);
    const session = await requireTeacher();

    const { getExamForTeacher } = await import("@/features/exams/service");
    const exams = await prisma.exam.findMany({ where: { teacherId: owner.id } });

    await expect(getExamForTeacher(session.id, exams[0]!.id)).rejects.toThrow(
      /لا يخصك|الاختبار غير موجود/,
    );
  });
});
