/**
 * تجهيز قاعدة بيانات الاختبار قبل تشغيل اختبارات التكامل.
 *
 * نستخدم TEST_DATABASE_URL (قاعدة منفصلة عن التطوير والإنتاج) ونطبّق
 * الترحيلات فقط (migrate deploy): بلا بيانات تجريبية وبلا أي أثر على الإنتاج.
 * إذا لم تكن متغيّر البيئة مضبوطاً، تفشل الاختبارات صراحةً بدل أن تُزعم ناجحة.
 */
import { execFileSync } from "node:child_process";

export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL غير مضبوط. شغّل الاختبارات المتكاملة على قاعدة بيانات منفصلة، مثل:\n" +
        "  docker run -d --name exam_pg -e POSTGRES_PASSWORD=exam -e POSTGRES_USER=exam -e POSTGRES_DB=exam_test -p 5455:5432 postgres:17-alpine\n" +
        "  export TEST_DATABASE_URL='postgresql://exam:exam@127.0.0.1:5455/exam_test?schema=public'\n" +
        "  npm run test",
    );
  }
  if (!/test/i.test(url)) {
    throw new Error("TEST_DATABASE_URL يجب أن يشير إلى قاعدة بيانات باسم يحتوي \"test\".");
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
