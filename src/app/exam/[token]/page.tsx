import { notFound } from "next/navigation";
import { Clock, FileText, GraduationCap, ShieldAlert, TriangleAlert } from "lucide-react";
import { getPublicExamSummary } from "@/features/attempts/service";
import { isAppError } from "@/lib/errors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StartAttemptForm } from "@/components/student/start-attempt-form";

export const metadata = { title: "بداية الاختبار" };

export default async function StudentExamPage({ params }: PageProps<"/exam/[token]">) {
  const { token } = await params;

  let summary: Awaited<ReturnType<typeof getPublicExamSummary>>;
  try {
    summary = await getPublicExamSummary(token);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/35 via-background to-background" />

      <div className="relative w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary">منصة الاختبارات الإلكترونية</p>
            <p className="text-xs text-muted-foreground">بوابة الطالب لأداء الاختبار</p>
          </div>
        </div>

        <Card className="border-border/80 bg-card/95 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-2 border-b border-border/60">
            <CardTitle className="text-2xl font-bold">{summary.title}</CardTitle>
            {summary.description ? (
              <CardDescription className="text-sm leading-7">
                {summary.description}
              </CardDescription>
            ) : null}
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Clock className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">مدة الاختبار</p>
                  <p className="text-base font-bold">{summary.durationMinutes} دقيقة</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <FileText className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">عدد الأسئلة</p>
                  <p className="text-base font-bold">{summary.questionCount} سؤال</p>
                </div>
              </div>
            </div>

            {summary.instructions ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm leading-7 text-sky-100">
                <p className="font-bold text-sky-300 mb-1">تعليمات قبل البدء:</p>
                <p>{summary.instructions}</p>
              </div>
            ) : null}

            {summary.closedReason ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-200">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
                <p className="leading-6">{summary.closedReason}</p>
              </div>
            ) : (
              <StartAttemptForm
                examToken={token}
                requiresStudentId={summary.requiresStudentId}
                studentIdLabel={summary.studentIdLabel}
              />
            )}

            <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="size-4 shrink-0 text-primary mt-0.5" />
              <p className="leading-5">
                بمجرد الضغط على «ابدأ الاختبار» يبدأ العد التنازلي على الخادم. يتم حفظ إجاباتك تلقائياً أثناء الحل.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
