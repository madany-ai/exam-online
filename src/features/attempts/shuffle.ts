/**
 * خلط حتمي (deterministic) للأسئلة والخيارات.
 * نستخدم معرّف المحاولة كبذرة حتى يبقى الترتيب ثابتاً للطالب نفسه
 * عند تحديث الصفحة، مع اختلافه بين طالب وآخر.
 */

/** مولّد أرقام شبه‑عشوائي (mulberry32) — سريع وحتمي. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffled<T>(items: readonly T[], seed: string): T[] {
  const random = mulberry32(seedFrom(seed));
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function shuffledQuestions<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  return shuffled(items, seed);
}

export function shuffledOptions<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  return shuffled(items, seed);
}
