import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * اتصال قاعدة البيانات.
 *
 * على Neon (Vercel):
 *  - `DATABASE_URL` هو رابط الـ Pooler (PgBouncer) — لحركة التطبيق العادية.
 *  - `DATABASE_URL_UNPOOLED` هو رابط مباشر، ويُستخدم للترحيلات فقط
 *    (انظر prisma.config.ts) لأن PgBouncer لا يدعم عمليات على مستوى الجلسة.
 *  - `@prisma/adapter-pg` يدير مجمّع الاتصالات تلقائياً بإعدادات محسّنة لخطة Neon المجانية.
 *
 * معيار الاختبارات (PostgreSQL محلي) يمرّ بنفس الكود: نفس المُهيّئ pg.
 */

declare global {
  var __examPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL غير مضبوط. انسخ .env.example إلى .env ثم نفّذ: neon env pull");
  }

  const adapter = new PrismaPg({
    connectionString,
    // إعدادات متوازنة للسيرفر المجاني + Neon Pooler لتفادي الاتصالات الخاملة المقطوعة (Stale Sockets):
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * في بيئة التطوير نعيد استخدام العميل بين عمليات إعادة التحميل (HMR)
 * حتى لا نستنزف اتصالات قاعدة البيانات.
 */
export const prisma: PrismaClient = globalThis.__examPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__examPrisma = prisma;
}
