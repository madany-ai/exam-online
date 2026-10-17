import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CheckCircle2, Clock, Hourglass } from "lucide-react";
import { getPublicExamSummary, getStudentResult } from "@/features/attempts/service";
import { isAppError } from "@/lib/errors";
import { ResultReview } from "@/components/student/result-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "نتيجة الاختبار" };

export default async function ResultPage({
  params,
}: PageProps<"/exam/[token]/result/[accessToken]">) {
  const { token, accessToken } = await params;

  let result: Awaited<ReturnType<typeof getStudentResult>>;
  let examTitle: string;
  try {
    const [studentResult, summary] = await Promise.all([
      getStudentResult(token, accessToken),
      getPublicExamSummary(token),
    ]);
    result = studentResult;
    examTitle = summary.title;
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  const submitted = result.status === "SUBMITTED";

  return (
    <main className="relative min-h-screen bg-background py-6 px-3.5 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/35 via-background to-background" />

      <div className="relative mx-auto w-full max-w-2xl space-y-6">
        <Card className="border-border/80 bg-card/95 backdrop-blur-md shadow-2xl">
          <CardHeader className="text-center border-b border-border/60 p-4 sm:p-6 pb-4 sm:pb-5">
            <CardTitle className="text-xl sm:text-2xl font-bold leading-8">{examTitle}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {submitted ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/15 p-3.5 sm:p-4 text-emerald-200">
                <CheckCircle2 className="size-6 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-xs sm:text-sm font-bold text-emerald-300">
                    تم استلام وتسليم إجاباتك بنجاح
                  </p>
                  {result.submittedAt ? (
                    <p className="text-[11px] sm:text-xs text-emerald-200/80 mt-0.5 flex items-center gap-1">
                      <Clock className="size-3.5" />
                      وقت التسليم: {result.submittedAt.toLocaleString("ar")}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-amber-500/35 bg-amber-500/15 p-4 text-amber-200">
                <Hourglass className="size-6 shrink-0 text-amber-400" />
                <p className="text-sm font-semibold">لم تُسلّم هذه المحاولة بعد.</p>
              </div>
            )}

            {result.result ? (
              <div className="rounded-2xl border border-emerald-500/35 bg-gradient-to-b from-emerald-950/40 to-background/60 p-5 sm:p-6 text-center space-y-2">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
                  <Award className="size-6" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">درجتك النهائية</p>
                <p className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">
                  {result.result.earnedScore}
                  <span className="text-lg sm:text-xl text-muted-foreground">
                    {" "}
                    / {result.result.maximumScore}
                  </span>
                </p>
                {result.result.percentage !== null ? (
                  <p className="inline-block rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-0.5 text-sm font-bold tabular-nums text-emerald-300">
                    {result.result.percentage}%
                  </p>
                ) : null}
              </div>
            ) : submitted && result.resultsHiddenBecause === "MANUAL_NOT_RELEASED" ? (
              <div className="rounded-2xl border border-border/80 bg-background/60 p-5 text-center text-sm space-y-1.5">
                <p className="font-bold text-foreground">النتيجة قيد المراجعة</p>
                <p className="text-xs leading-6 text-muted-foreground">
                  اختار المعلم إعلان النتائج يدوياً بعد انتهاء الطلاب. ستظهر درجتك ومراجعة إجاباتك في نفس هذه الصفحة فور إصدارها.
                </p>
              </div>
            ) : null}

            {!submitted ? (
              <Button asChild size="lg" className="w-full font-bold">
                <Link href={`/exam/${token}/attempt/${accessToken}`}>العودة لإكمال الاختبار</Link>
              </Button>
            ) : null}

            <p className="text-center text-xs text-muted-foreground">
              احتفظ برابط هذه الصفحة إذا أردت الرجوع لنتيجتك ومراجعة إجاباتك لاحقاً.
            </p>
          </CardContent>
        </Card>

        {/* قسم مراجعة الإجابات والأخطاء (يظهر عند إتاحة النتيجة) */}
        {result.review && result.review.length > 0 ? (
          <ResultReview items={result.review} />
        ) : null}
      </div>
    </main>
  );
}
