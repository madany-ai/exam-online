import "dotenv/config";

/**
 * تجهيز قاعدة بيانات الاختبارات المتكاملة.
 *
 * الاختبارات المتكاملة تحتاج PostgreSQL حقيقياً (تطبيق المخطط، القيود،
 * المعاملات). في CI أو محلياً شغّل:
 *
 *   1) أنشئ قاعدة بيانات فارغة، ثم
 *   2) DATABASE_URL=postgresql://...tsx scripts/setup-test-db.ts
 *
 * السكربت يطبّق المخطط من الصفر عبر prisma migrate reset على قاعدة الاختبار فقط
 * (DATABASE_URL يجب أن يشير إلى قاعدة منفصلة عن الإنتاج).
 */

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl) {
  console.error("DATABASE_URL غير مضبوط.");
  process.exit(1);
}

if (!/test/i.test(databaseUrl)) {
  console.error(
    "رفض التشغيل: اسم قاعدة البيانات لا يحتوي على \"test\".\n" +
      "هذا السكربت يحذف جداول قاعدة البيانات، ويجب أن يكون مخصصاً للاختبارات فقط.",
  );
  process.exit(1);
}

async function main() {
  const { execFileSync } = await import("node:child_process");
  console.log(`تطبيق المخطط على قاعدة الاختبار: ${new URL(databaseUrl).pathname}`);
  execFileSync("npx", ["prisma", "migrate", "reset", "--force", "--skip-seed"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  console.log("تم تجهيز قاعدة بيانات الاختبار.");
}

void main();
