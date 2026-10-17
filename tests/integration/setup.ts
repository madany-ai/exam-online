import { afterAll, beforeEach } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * قاعدة بيانات منفصلة تماماً لكل تشغيل اختبارات متكاملة.
 * تفشل الاختبارات صراحةً إن لم تكن متاحة — لا تُتخطّى بصمت.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL غير مضبوط — الاختبارات المتكاملة تتطلّب قاعدة بيانات منفصلة عن الإنتاج.",
  );
}

export const prisma: PrismaClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

// خدمات التطبيق تقرأ DATABASE_URL عند تحميلها، لذا نوجّهها إلى قاعدة الاختبار.
// (ملف الإعداد هذا يُنفَّذ قبل استيراد ملفات الاختبار.)
process.env.DATABASE_URL = url;

beforeEach(async () => {
  // تنظيف كامل قبل كل اختبار — نبدأ من حالة معروفة.
  await prisma.attemptAnswer.deleteMany();
  await prisma.examAttempt.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.question.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.teacherSession.deleteMany();
  await prisma.teacher.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
