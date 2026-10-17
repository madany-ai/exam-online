/**
 * التحقق من متغيّرات البيئة عند الإقلاع.
 * أي متغيّر مطلوب غائب يُنتج رسالة خطأ عربية واضحة بدل فشل صامت.
 */

const REQUIRED = ["DATABASE_URL"] as const;

export type AppEnv = {
  DATABASE_URL: string;
  NODE_ENV: "development" | "test" | "production";
  /** رابط التطبيق العام، يُستخدم في روابط الاختبار公共卫生ية */
  APP_URL?: string;
};

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cached) return cached;

  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `متغيّرات البيئة التالية مفقودة: ${missing.join("، ")}. انسخ .env.example إلى .env وأكملها.`,
    );
  }

  cached = {
    DATABASE_URL: process.env.DATABASE_URL as string,
    NODE_ENV: (process.env.NODE_ENV as AppEnv["NODE_ENV"]) ?? "development",
    APP_URL: process.env.APP_URL,
  };
  return cached;
}

/** رابط الاختبار العام كما يظهر للطالب. */
export function appUrl(): string {
  const configured = getEnv().APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
