import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARABIC_AI_PROMPT,
  EXAMPLE_IMPORT_DOCUMENT,
  EXAMPLE_IMPORT_JSON,
} from "../src/features/questions/example-document";
import { parseImportPayload } from "../src/features/questions/import-schema";

/**
 * يولّد ملفات المثال العامة من المصدر الوحيد في الكود.
 * الملف الناتج يمرّ بنفس المُتحقّق المستخدم في الاستيراد — وهذا متحقَّق منه
 * في اختبار (example-document.test.ts)، فلا يمكن أن يخرج ملف غير صالح.
 */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "public/examples");

const validation = parseImportPayload(EXAMPLE_IMPORT_JSON);
if (!validation.ok) {
  console.error("فشل توليد المثال: الملف لا يمرّ بالمُتحقّق.");
  for (const issue of validation.issues) {
    console.error(` - [${issue.path}] ${issue.message}`);
  }
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

writeFileSync(
  resolve(outputDir, "exam-import-v1.json"),
  `${JSON.stringify(EXAMPLE_IMPORT_DOCUMENT, null, 2)}\n`,
  "utf8",
);

writeFileSync(resolve(outputDir, "arabic-ai-prompt.txt"), `${ARABIC_AI_PROMPT}\n`, "utf8");

console.log(`تم توليد ${validation.questions.length} أسئلة في public/examples/exam-import-v1.json`);
console.log("تم توليد public/examples/arabic-ai-prompt.txt");
