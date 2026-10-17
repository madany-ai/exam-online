import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/security/rate-limit";

describe("تجزئة كلمة المرور", () => {
  it("يتحقّق من كلمة المرور الصحيحة", async () => {
    const hash = await hashPassword("Teacher12345");
    expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("Teacher12345", hash)).resolves.toBe(true);
  });

  it("يرفض كلمة المرور الخاطئة", async () => {
    const hash = await hashPassword("Teacher12345");
    await expect(verifyPassword("teacher12345", hash)).resolves.toBe(false);
  });

  it("ينتج تجزئة مختلفة في كل مرة (ملح عشوائي)", async () => {
    const first = await hashPassword("Teacher12345");
    const second = await hashPassword("Teacher12345");
    expect(first).not.toBe(second);
    await expect(verifyPassword("Teacher12345", first)).resolves.toBe(true);
    await expect(verifyPassword("Teacher12345", second)).resolves.toBe(true);
  });

  it("يرفض تجزئات تالفة أو بصيغة غير معروفة", async () => {
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$abc$8$1$AAAA$AAAA")).resolves.toBe(false);
  });

  it("لا يخزّن كلمة المرور نفسها", async () => {
    const hash = await hashPassword("Teacher12345");
    expect(hash).not.toContain("Teacher12345");
  });
});

describe("تحديد معدل الطلبات", () => {
  it("يسمح حتى الحد ثم يمنع", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);

    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("يفصل بين المفاتيح المختلفة", () => {
    const first = `a-${Math.random()}`;
    const second = `b-${Math.random()}`;
    checkRateLimit(first, 1, 60_000);
    expect(checkRateLimit(first, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(second, 1, 60_000).allowed).toBe(true);
  });
});
