import { prisma } from "@/lib/db/prisma";
import type { SupportedQuestionType } from "@/features/questions/import-schema";

/**
 * ذاكرة تخزين مؤقت (In-Memory LRU Cache) لأسئلة الاختبار على السيرفر المجاني.
 *
 * لماذا هذا مهم جداً للسيرفر المجاني + Neon Free Tier؟
 * - أثناء الامتحان يرسل عشرات الطلاب طلبات حفظ تلقائي (PATCH) وتسليم (POST) في نفس الدقيقة.
 * - أسئلة الاختبار وخياراتها ثابتة لا تتغير أثناء الامتحان.
 * - تخزين الأسئلة في الذاكرة لمدة 60 ثانية يوفّر أكثر من 70% من استعلامات قاعدة البيانات وحجم البيانات المنقولة،
 *   ويُبطل تلقائياً وفوراً عند أي استيراد أو تعديل أو حذف للأسئلة.
 */

export type CachedExamQuestion = {
  id: string;
  externalId: string;
  text: string;
  type: SupportedQuestionType;
  points: number;
  explanation: string | null;
  options: {
    externalId: string;
    text: string;
    isCorrect: boolean;
  }[];
};

type CacheEntry = {
  questions: CachedExamQuestion[];
  expiresAt: number;
};

const MAX_CACHED_EXAMS = 100;
const CACHE_TTL_MS = 60_000;

declare global {
  var __examQuestionsCache: Map<string, CacheEntry> | undefined;
}

const examQuestionsCache: Map<string, CacheEntry> =
  globalThis.__examQuestionsCache ?? new Map<string, CacheEntry>();

if (!globalThis.__examQuestionsCache) {
  globalThis.__examQuestionsCache = examQuestionsCache;
}

async function defaultLoadExamQuestions(examId: string): Promise<CachedExamQuestion[]> {
  const rows = await prisma.question.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      externalId: true,
      text: true,
      type: true,
      points: true,
      explanation: true,
      options: {
        orderBy: { order: "asc" },
        select: {
          externalId: true,
          text: true,
          isCorrect: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    externalId: row.externalId,
    text: row.text,
    type: row.type,
    points: row.points.toNumber(),
    explanation: row.explanation,
    options: row.options,
  }));
}

export async function getCachedExamQuestions(
  examId: string,
  loader: () => Promise<CachedExamQuestion[]> = () => defaultLoadExamQuestions(examId),
): Promise<CachedExamQuestion[]> {
  const now = Date.now();
  const cached = examQuestionsCache.get(examId);

  if (cached && cached.expiresAt > now) {
    // تحديث موضع المفتاح في نهاية الـ Map (LRU O(1))
    examQuestionsCache.delete(examId);
    examQuestionsCache.set(examId, cached);
    return cached.questions;
  }

  const questions = await loader();

  if (examQuestionsCache.size >= MAX_CACHED_EXAMS) {
    const oldestKey = examQuestionsCache.keys().next().value;
    if (oldestKey !== undefined) {
      examQuestionsCache.delete(oldestKey);
    }
  }

  examQuestionsCache.set(examId, {
    questions,
    expiresAt: now + CACHE_TTL_MS,
  });

  return questions;
}

/** إبطال الكاش فوراً عند تحديث أسئلة الاختبار أو حذفه. */
export function invalidateExamQuestionsCache(examId?: string): void {
  if (!examId) {
    examQuestionsCache.clear();
    return;
  }
  examQuestionsCache.delete(examId);
}
