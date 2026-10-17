import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";

/**
 * إنشاء حساب معلم بأمان — الطريقة الوحيدة للوصول الأول إلى النظام.
 * لا يوجد تسجيل عام في التطبيق.
 *
 * الاستخدام:
 *   npm run teacher:create -- --email=teacher@example.com --name="أ. محمد" [--password=...]
 *
 * إذا لم تُمرَّر كلمة مرور، تُولَّد كلمة مرور عشوائية قوية وتُطبع مرة واحدة.
 */
function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match?.slice(prefix.length);
}

function generatePassword(): string {
  // كلمة مرور عشوائية من 18 حرفاً قابلة للنسخ (بدون رموز غريبة)
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(18);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function main() {
  const email = readArg("email")?.trim().toLowerCase();
  const name = readArg("name")?.trim() || "المعلم";
  const providedPassword = readArg("password");

  if (!email || !email.includes("@")) {
    console.error("الاستخدام: npm run teacher:create -- --email=you@example.com --name=\"اسمك\"");
    process.exit(1);
  }

  const password = providedPassword ?? generatePassword();
  if (password.length < 10) {
    console.error("كلمة المرور قصيرة جداً (10 أحرف على الأقل).");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const teacher = await prisma.teacher.upsert({
    where: { email },
    create: { email, name, passwordHash },
    update: { name, passwordHash },
    select: { id: true, email: true, name: true },
  });

  console.log(`تم إنشاء/تحديث حساب المعلم: ${teacher.email} (${teacher.name})`);
  if (!providedPassword) {
    console.log(`كلمة المرور المُولّدة (احفظها الآن، لن تُعرض مرة أخرى): ${password}`);
  }
}

main()
  .catch((error) => {
    console.error("فشل إنشاء الحساب:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
