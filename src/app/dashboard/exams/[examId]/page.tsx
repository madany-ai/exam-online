import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock,
  FileUp,
  HelpCircle,
  Share2,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getExamForTeacher, publicExamUrl } from "@/features/exams/service";
import { updateExamAction } from "@/features/exams/actions";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyLinkButton } from "@/components/exam/copy-link-button";
import { DeleteExamDialog } from "@/components/exam/delete-exam-dialog";
import {
  ExamStatusControlButton,
  ResultsReleaseToggleButton,
} from "@/components/exam/exam-lifecycle-actions";
import { ExamSettingsForm } from "@/components/exam/exam-settings-form";
import { QuestionsPreview } from "@/components/exam/questions-preview";
import { ExamStatusBadge, ResultVisibilityBadge } from "@/components/exam/status-badge";

export const metadata = { title: "إدارة الاختبار" };

export default async function ExamDetailPage({ params }: PageProps<"/dashboard/exams/[examId]">) {
  const teacher = await requireTeacher();
  const { examId } = await params;

  let exam: Awaited<ReturnType<typeof getExamForTeacher>>;
  try {
    exam = await getExamForTeacher(teacher.id, examId);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  const attemptCount = await prisma.examAttempt.count({ where: { examId: exam.id } });
  const isPublished = exam.status === "PUBLISHED";
  const shareUrl = publicExamUrl(exam.publicToken);
  const totalPoints = exam.questions.reduce((sum, q) => sum + q.points.toNumber(), 0);

  return (
    <div className="space-y-6">
      {/* رأس الصفحة وبطاقة التحكم السريع */}
      <Card className="border-border/80 bg-gradient-to-br from-card via-card to-emerald-950/20 shadow-lg">
        <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ExamStatusBadge status={exam.status} />
                <ResultVisibilityBadge
                  visibility={exam.resultVisibility}
                  released={exam.resultsReleasedAt !== null}
                />
              </div>
              <h1 className="text-xl sm:text-3xl font-bold tracking-tight">{exam.title}</h1>
              {exam.description ? (
                <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">{exam.description}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {exam.status === "DRAFT" ? (
                <ExamStatusControlButton
                  examId={exam.id}
                  to="PUBLISHED"
                  label="نشر الاختبار الآن"
                />
              ) : null}

              {exam.status === "PUBLISHED" ? (
                <ExamStatusControlButton
                  examId={exam.id}
                  to="CLOSED"
                  label="إغلاق الاختبار"
                  variant="outline"
                />
              ) : null}

              {exam.status === "CLOSED" && attemptCount === 0 ? (
                <ExamStatusControlButton
                  examId={exam.id}
                  to="DRAFT"
                  label="إعادة إلى مسودة"
                  variant="outline"
                />
              ) : null}

              <Button asChild variant="secondary" className="flex-1 sm:flex-none">
                <Link href={`/dashboard/exams/${exam.id}/import`}>
                  <FileUp className="size-4" />
                  استيراد / تحديث الأسئلة
                </Link>
              </Button>
              <Button asChild variant="secondary" className="flex-1 sm:flex-none">
                <Link href={`/dashboard/exams/${exam.id}/submissions`}>
                  <Users className="size-4" />
                  محاولات الطلاب ({attemptCount})
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4 pt-3 border-t border-border/60">
            <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
              <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <HelpCircle className="size-3.5 text-primary shrink-0" />
                عدد الأسئلة
              </p>
              <p className="mt-1 text-sm sm:text-lg font-bold tabular-nums">
                {exam.questions.length} سؤال ({totalPoints} درجة)
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
              <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5 text-primary shrink-0" />
                مدة الاختبار
              </p>
              <p className="mt-1 text-sm sm:text-lg font-bold tabular-nums">{exam.durationMinutes} دقيقة</p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
              <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-primary shrink-0" />
                محاولات الطلاب
              </p>
              <p className="mt-1 text-sm sm:text-lg font-bold tabular-nums">{attemptCount} محاولة</p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
              <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary shrink-0" />
                الحد الأقصى للطالب
              </p>
              <p className="mt-1 text-sm sm:text-lg font-bold tabular-nums">{exam.maxAttempts} محاولة</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* بطاقة رابط الطالب ومشاركته */}
      <Card
        className={
          isPublished
            ? "border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-card to-card shadow-lg"
            : "border-border/80"
        }
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Share2 className="size-5 text-primary" />
                رابط دخول الطلاب للاختبار
              </CardTitle>
              <CardDescription className="mt-1">
                {isPublished
                  ? "الاختبار منشور ونشط الآن — انسخ الرابط وشاركه مع الطلاب لبدء الحل."
                  : exam.status === "DRAFT"
                    ? "هذا هو رابط الاختبار المخصص، لكن لن يتمكن الطلاب من البدء قبل الضغط على «نشر الاختبار الآن»."
                    : "الاختبار مغلق حالياً؛ لا يمكن بدء محاولات جديدة عبر الرابط."}
              </CardDescription>
            </div>
            {exam.status === "DRAFT" && exam.questions.length > 0 ? (
              <ExamStatusControlButton
                examId={exam.id}
                to="PUBLISHED"
                label="تفعيل الرابط ونشر الاختبار"
              />
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <CopyLinkButton url={shareUrl} examTitle={exam.title} />
        </CardContent>
      </Card>

      {exam.resultVisibility === "MANUAL" ? (
        <Card className="border-border/80">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">إصدار النتائج للطلاب</CardTitle>
              <CardDescription className="mt-1">
                {exam.resultsReleasedAt
                  ? `النتائج مُتاحة للطلاب منذ ${exam.resultsReleasedAt.toLocaleString("ar")}.`
                  : "الطلاب لا يرون درجاتهم حتى تضغط «إصدار النتائج للطلاب»."}
              </CardDescription>
            </div>
            <ResultsReleaseToggleButton
              examId={exam.id}
              released={exam.resultsReleasedAt !== null}
            />
          </CardHeader>
        </Card>
      ) : null}

      <QuestionsPreview questions={exam.questions} />

      <section className="space-y-4">
        <h2 className="text-lg font-bold">تعديل إعدادات الاختبار</h2>
        <ExamSettingsForm
          action={updateExamAction}
          examId={exam.id}
          submitLabel="حفظ التعديلات"
          disabled={isPublished}
          disabledHint="الاختبار منشور حالياً — أغلقه أولاً إذا أردت تعديل الإعدادات أو استبدال الأسئلة."
          defaults={{
            title: exam.title,
            description: exam.description,
            instructions: exam.instructions,
            durationMinutes: exam.durationMinutes,
            maxAttempts: exam.maxAttempts,
            startsAt: exam.startsAt,
            endsAt: exam.endsAt,
            shuffleQuestions: exam.shuffleQuestions,
            shuffleOptions: exam.shuffleOptions,
            resultVisibility: exam.resultVisibility,
            requiresStudentId: exam.requiresStudentId,
            studentIdLabel: exam.studentIdLabel,
          }}
        />
      </section>

      <Card className="border-rose-500/30 bg-rose-950/15">
        <CardHeader>
          <CardTitle className="text-base text-rose-400 flex items-center gap-2">
            <ShieldAlert className="size-5" />
            منطقة الخطر — حذف الاختبار
          </CardTitle>
          <CardDescription>
            الحذف نهائي ويشمل الأسئلة والخيارات وكل محاولات الطلاب ودرجاتهم.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteExamDialog
            examId={exam.id}
            title={exam.title}
            attemptCount={attemptCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
