import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { EXAMPLE_IMPORT_DOCUMENT } from "../src/features/questions/example-document";
import { parseImportPayload } from "../src/features/questions/import-schema";
import { generateToken } from "../src/lib/security/random";

/**
 * بيانات تطوير بواقع عربي — تُشغَّل يدوياً فقط عبر `npm run db:seed`.
 * لا تُشغَّل تلقائياً أثناء البناء أو النشر، ولا تُنشر كبيانات إنتاج.
 */

const DEMO_EMAIL = "admin@exam.online";
const DEMO_PASSWORD = "admin2026@";

async function main() {
  const parsed = parseImportPayload(JSON.stringify(EXAMPLE_IMPORT_DOCUMENT));
  if (!parsed.ok) {
    throw new Error("ملف المثال لا يمرّ بالمُتحقّق — لا يمكن إنشاء البذرة.");
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const teacher = await prisma.teacher.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "المدير (Admin)", passwordHash },
    update: { passwordHash, name: "المدير (Admin)" },
    select: { id: true },
  });

  const examCount = await prisma.exam.count({ where: { teacherId: teacher.id } });
  if (examCount > 0) {
    console.log("توجد اختبارات بالفعل لهذا المعلم — لن تُضاف بيانات تجريبية جديدة.");
    return;
  }

  const exam = await prisma.exam.create({
    data: {
      teacherId: teacher.id,
      publicToken: generateToken(24),
      title: "اختبار تجريبي — العلوم",
      description: "اختبار تجريبي للمدىس، مبني على ملف المثال.",
      instructions: "اقرأ السؤال جيداً ثم اختر الإجابة الصحيحة.",
      durationMinutes: 30,
      maxAttempts: 1,
      resultVisibility: "IMMEDIATE",
      status: "DRAFT",
      questions: {
        create: parsed.questions.map((question, index) => {
          const correct = new Set(question.correctOptionIds);
          return {
            externalId: question.id,
            type: question.type,
            text: question.text,
            points: question.points,
            explanation: question.explanation ?? null,
            order: index,
            options: {
              create: question.options.map((option, optionIndex) => ({
                externalId: option.id,
                text: option.text,
                order: optionIndex,
                isCorrect: correct.has(option.id),
              })),
            },
          };
        }),
      },
    },
    select: { id: true, title: true, publicToken: true },
  });

  console.log("تم إنشاء بيانات التطوير:");
  console.log(` - المعلم: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(` - اختبار: ${exam.title}`);
  console.log(` - رابط الطالب: /exam/${exam.publicToken}`);
}

main()
  .catch((error) => {
    console.error("فشلت البذرة:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
