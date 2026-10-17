import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getExamForTeacher, listSubmissions } from "@/features/exams/service";
import { SubmissionsTable } from "@/components/attempts/submissions-table";
import { ExamStatusBadge, ResultVisibilityBadge } from "@/components/exam/status-badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "محاولات الطلاب" };

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function SubmissionsPage({
  params,
  searchParams,
}: PageProps<"/dashboard/exams/[examId]/submissions"> & { searchParams: SearchParams }) {
  const teacher = await requireTeacher();
  const { examId } = await params;
  const { q, status } = await searchParams;

  let exam: Awaited<ReturnType<typeof getExamForTeacher>>;
  try {
    exam = await getExamForTeacher(teacher.id, examId);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  const attempts = await listSubmissions(teacher.id, exam.id, {
    ...(status === "IN_PROGRESS" || status === "SUBMITTED" ? { status } : {}),
    ...(q ? { query: q.trim() } : {}),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">محاولات الطلاب</h1>
            <ExamStatusBadge status={exam.status} />
            <ResultVisibilityBadge
              visibility={exam.resultVisibility}
              released={exam.resultsReleasedAt !== null}
            />
          </div>
          <p className="text-sm text-muted-foreground">{exam.title}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/teacher/exams/${exam.id}/results.csv`} download>
            <Download className="size-4" />
            تصدير CSV
          </a>
        </Button>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="ابحث بالاسم أو المعرّف"
          className="h-9 rounded-md border bg-background px-3 text-sm md:w-72"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="SUBMITTED">مُسلّم</option>
          <option value="IN_PROGRESS">جارٍ</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          تصفية
        </Button>
      </form>

      <SubmissionsTable
        examId={exam.id}
        attempts={attempts}
        showIdentifier={exam.requiresStudentId}
        resultsReleased={exam.resultsReleasedAt !== null}
        resultVisibility={exam.resultVisibility}
      />

      <Button asChild variant="ghost">
        <Link href={`/dashboard/exams/${exam.id}`}>رجوع للاختبار</Link>
      </Button>
    </div>
  );
}
