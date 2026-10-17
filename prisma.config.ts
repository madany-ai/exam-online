import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * إعدادات Prisma CLI.
 *
 * الترحيلات (migrate) يجب أن تمرّ عبر اتصال **مباشر** (غير pooled):
 * PgBouncer في وضع transaction لا يدعم عمليات مستوى الجلسة، وقد يفشل
 * الترحيل بأخطاء مضلِّلة. لذلك نستخدم DATABASE_URL_UNPOOLED إن كان موجوداً،
 * وننزل إلى DATABASE_URL فقط عند غيابه (قاعدة محلية مثلاً).
 *
 * أما التطبيق نفسه فيستخدم DATABASE_URL (المجمّع) عبر src/lib/db/prisma.ts.
 */
const directUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: directUrl,
  },
});
