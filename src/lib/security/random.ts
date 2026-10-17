import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** توليد رموز عشوائية غير قابلة للتخمين (>= 128 بت). */
export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** بصمة SHA-256 للتخزين — لا نخزّن الرموز نفسها في قاعدة البيانات. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * مفتاح مشتق لمعرّف الطالب: نخزّن البصمة فقط حتى لا نحفظ أرقام الطلاب كنص صريح.
 * نطبّع النص (أحرف صغيرة، إزالة الفراغات) لتفادي اختلاف الكتابة بين الطلاب.
 */
export function hashStudentIdentifier(identifier: string): string {
  return createHash("sha256")
    .update(`identifier:${identifier.trim().toLowerCase()}`)
    .digest("hex");
}

/** معرّف عشوائي قصير للاستخدامات غير الحساسة (مثل مفتاح attempt). */
export function generateShortId(): string {
  return randomInt(0, 1_000_000).toString(36).padStart(4, "0");
}
