import Link from "next/link";
import { Clock, HelpCircle, PlusCircle, Settings, Users } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { listExams, publicExamUrl } from "@/features/exams/service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExamStatusBadge, ResultVisibilityBadge } from "@/components/exam/status-badge";
import { CopyLinkButton } from "@/components/exam/copy-link-button";

export const metadata = { title: "الاختبارات" };

export default async function ExamsListPage() {
  const teacher = await requireTeacher();
  const exams = await listExams(teacher.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">قائمة الاختبارات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة الاختبارات، مشاركة روابط الطلاب، ومتابعة التسليمات والدرجات.
          </p>
        </div>
        <Button asChild size="lg" className="font-bold">
          <Link href="/dashboard/exams/new">
            <PlusCircle className="size-4" />
            اختبار جديد
          </Link>
        </Button>
      </div>

      {exams.length === 0 ? (
        <Card className="border-border/80">
          <CardContent className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            <p className="font-bold text-foreground text-base">لا توجد اختبارات بعد</p>
            <p className="mt-1">أنشئ اختباراً جديداً وارفع ملف الأسئلة بصيغة JSON لنشره فوراً.</p>
            <Button asChild className="mt-4 font-bold">
              <Link href="/dashboard/exams/new">
                <PlusCircle className="size-4" />
                إنشاء اختبار
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4">
          {exams.map((exam) => (
            <li key={exam.id}>
              <Card className="border-border/80 transition-colors hover:border-border">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/exams/${exam.id}`}
                          className="text-lg font-bold hover:text-primary transition-colors"
                        >
                          {exam.title}
                        </Link>
                        <ExamStatusBadge status={exam.status} />
                        <ResultVisibilityBadge
                          visibility={exam.resultVisibility}
                          released={exam.resultsReleasedAt !== null}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <HelpCircle className="size-3.5 text-primary" />
                          {exam._count.questions} سؤال
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5 text-primary" />
                          {exam.durationMinutes} دقيقة
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5 text-primary" />
                          {exam._count.attempts} محاولة
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/dashboard/exams/${exam.id}/submissions`}>
                          <Users className="size-4" />
                          المحاولات ({exam._count.attempts})
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/exams/${exam.id}`}>
                          <Settings className="size-4" />
                          إدارة الاختبار
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {exam.status === "PUBLISHED" ? (
                    <div className="pt-3 border-t border-border/60">
                      <CopyLinkButton
                        url={publicExamUrl(exam.publicToken)}
                        examTitle={exam.title}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
