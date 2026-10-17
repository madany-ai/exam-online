import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileEdit,
  FileText,
  PlusCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { getDashboardOverview, publicExamUrl } from "@/features/exams/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExamStatusBadge } from "@/components/exam/status-badge";
import { CopyLinkButton } from "@/components/exam/copy-link-button";

export const metadata = { title: "لوحة التحكم" };

export default async function DashboardPage() {
  const teacher = await requireTeacher();
  const overview = await getDashboardOverview(teacher.id);

  return (
    <div className="space-y-6">
      {/* الترحيب والإجراء الرئيسي */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/35 via-card to-card p-6 shadow-lg">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            أهلاً بك في لوحة المعلم
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">مرحباً، {teacher.name}</h1>
          <p className="text-sm text-muted-foreground">
            أنشئ اختباراتك الإلكترونية، افحص ملفات الأسئلة، وشارك روابط الحل مع طلابك في ثوانٍ.
          </p>
        </div>
        <Button asChild size="lg" className="font-bold shadow-lg">
          <Link href="/dashboard/exams/new">
            <PlusCircle className="size-4" />
            إنشاء اختبار جديد
          </Link>
        </Button>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">إجمالي الاختبارات</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{overview.total}</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25">
              <FileText className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">اختبارات منشورة</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-400">
                {overview.published}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">مسودات قيد الإعداد</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-amber-300">
                {overview.drafts}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/25">
              <FileEdit className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">إجمالي محاولات الطلاب</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-sky-400">
                {overview.submissions}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/25">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* أحدث الاختبارات */}
      <Card className="border-border/80 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/60">
          <div>
            <CardTitle className="text-base">أحدث الاختبارات</CardTitle>
            <CardDescription className="mt-0.5">
              آخر الاختبارات التي قمت بإنشائها مع إمكانية نسخ رابط الطلاب مباشرة.
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/exams">
              عرض الكل
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-5">
          {overview.recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <p className="font-bold text-foreground text-base">لا توجد اختبارات بعد</p>
              <p className="mt-1">
                ابدأ بإنشاء أول اختبار، ارفع ملف الأسئلة، وانشره للطلاب في خطوات بسيطة.
              </p>
              <Button asChild className="mt-4 font-bold">
                <Link href="/dashboard/exams/new">
                  <PlusCircle className="size-4" />
                  إنشاء أول اختبار
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {overview.recent.map((exam) => (
                <li
                  key={exam.id}
                  className="rounded-2xl border border-border/80 bg-background/50 p-4 space-y-3 transition-colors hover:border-border"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/exams/${exam.id}`}
                          className="text-base font-bold hover:text-primary transition-colors"
                        >
                          {exam.title}
                        </Link>
                        <ExamStatusBadge status={exam.status} />
                      </div>
                      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                        <span>{exam._count.questions} سؤال</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" />
                          {exam.durationMinutes} دقيقة
                        </span>
                        <span>•</span>
                        <span>{exam._count.attempts} محاولة طلاب</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/dashboard/exams/${exam.id}/submissions`}>
                          المحاولات ({exam._count.attempts})
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/exams/${exam.id}`}>إدارة الاختبار</Link>
                      </Button>
                    </div>
                  </div>

                  {exam.status === "PUBLISHED" ? (
                    <div className="pt-2 border-t border-border/60">
                      <CopyLinkButton
                        url={publicExamUrl(exam.publicToken)}
                        examTitle={exam.title}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
