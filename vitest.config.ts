import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

/**
 * مشروعان للاختبارات:
 *  - unit: منطق خالص بلا قاعدة بيانات (استيراد JSON، التدريج، السياسات)
 *  - integration: تدفقات حقيقية على PostgreSQL (الملكية، دورة حياة الاختبار،
 *    المحاولات والنتائج) — يحتاج TEST_DATABASE_URL
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { "@": srcDir } },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: { "@": srcDir } },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // كل ملف اختبارات متكاملة يحتاج معلومات تسجيل دخول/رمز؛ نمنع التوازي
          // حتى لا تتداخل بيانات الملفات على نفس القاعدة.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
