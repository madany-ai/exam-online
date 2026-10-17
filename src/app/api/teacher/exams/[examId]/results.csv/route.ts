import { requireTeacher } from "@/lib/auth/session";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { buildResultsCsv, getExamForTeacher } from "@/features/exams/service";
import { isAppError } from "@/lib/errors";

/**
 * GET /api/teacher/exams/[examId]/results.csv
 * تصدير نتائج اختبار — يتطلب جلسة معلم، ويتحقق من الملكية على الخادم.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const teacher = await requireTeacher();
  const { examId } = await params;

  try {
    await getExamForTeacher(teacher.id, examId);
    const csv = await buildResultsCsv(teacher.id, examId);

    return new Response(`﻿${csv}`, {
      headers: {
        // BOM حتى تفتح Excel العربية بشكل صحيح
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") {
      return jsonError(404, "الاختبار غير موجود.");
    }
    return handleRouteError(error);
  }
}
