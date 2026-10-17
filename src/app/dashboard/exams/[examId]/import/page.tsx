import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download, TriangleAlert } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getExamForTeacher } from "@/features/exams/service";
import { ImportWizard } from "@/components/import/import-wizard";
import { Button } from "@/components/ui/button";

export const metadata = { title: "استيراد الأسئلة" };

export default async function ImportPage({
  params,
}: PageProps<"/dashboard/exams/[examId]/import">) {
  const teacher = await requireTeacher();
  const { examId } = await params;

  let exam: Awaited<ReturnType<typeof getExamForTeacher>>;
  try {
    exam = await getExamForTeacher(teacher.id, examId);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  const isPublished = exam.status === "PUBLISHED";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">استيراد وتحديث الأسئلة</h1>
          <p className="text-sm text-muted-foreground">
            الاختبار: <span className="font-semibold text-foreground">{exam.title}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/examples/exam-import-v1.json" download>
              <Download className="size-4 text-primary" />
              تنزيل ملف JSON مثال
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/dashboard/exams/${exam.id}`}>
              <ArrowRight className="size-4" />
              رجوع للاختبار
            </Link>
          </Button>
        </div>
      </div>

      {isPublished ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-200">
          <TriangleAlert className="size-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-300">الاختبار منشور حالياً</p>
            <p className="text-xs leading-6">
              لا يمكن استبدال الأسئلة أثناء نشر الاختبار حتى لا تتأثر محاولات الطلاب الجارية. أغلق الاختبار أولاً من صفحة إدارة الاختبار ثم أعد الاستيراد.
            </p>
          </div>
        </div>
      ) : (
        <ImportWizard examId={exam.id} examTitle={exam.title} publicToken={exam.publicToken} />
      )}
    </div>
  );
}
