import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { decimalToNumber, getSubmissionDetail } from "@/features/exams/service";
import { QUESTION_TYPE_LABELS_AR } from "@/features/questions/import-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "تفاصيل المحاولة" };

/** تفاصيل محاولة طالب — للمعلم فقط، ويشمل الإجابات الصحيحة. */
export default async function SubmissionDetailPage({
  params,
}: PageProps<"/dashboard/exams/[examId]/submissions/[attemptId]">) {
  const teacher = await requireTeacher();
  const { examId, attemptId } = await params;

  let data: Awaited<ReturnType<typeof getSubmissionDetail>>;
  try {
    data = await getSubmissionDetail(teacher.id, examId, attemptId);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  const { exam, attempt } = data;
  const answersByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{attempt.studentName}</h1>
          <p className="text-sm text-muted-foreground">
            {exam.title}
            {attempt.studentIdentifier ? ` — المعرّف: ${attempt.studentIdentifier}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/exams/${exam.id}/submissions`}>
            <ArrowRight className="size-4" />
            رجوع للمحاولات
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/80">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الحالة</p>
            <p className="mt-1 font-bold text-emerald-300">
              {attempt.status === "SUBMITTED" ? "مُسلّم" : "جارٍ (لم يُسلّم)"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الدرجة</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {decimalToNumber(attempt.earnedScore) ?? 0} / {decimalToNumber(attempt.maximumScore) ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">النسبة</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
              {decimalToNumber(attempt.percentage) !== null
                ? `${decimalToNumber(attempt.percentage)}%`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الأوقات</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              بدأت: {attempt.startedAt.toLocaleString("ar")}
              <br />
              سُلّمت: {attempt.submittedAt?.toLocaleString("ar") ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-base">مراجعة إجابات الطالب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exam.questions.map((question, index) => {
            const answer = answersByQuestion.get(question.id);
            const selected = new Set(answer?.selectedOptionIds ?? []);
            return (
              <div
                key={question.id}
                className="rounded-2xl border border-border/80 bg-background/50 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">سؤال {index + 1}</span>
                    <Badge variant="secondary">
                      {QUESTION_TYPE_LABELS_AR[question.type]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      الدرجة: {decimalToNumber(answer?.earnedPoints) ?? 0} /{" "}
                      {question.points.toNumber()}
                    </span>
                  </div>
                  {answer?.isCorrect ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <Check className="size-3.5 ml-1" />
                      إجابة صحيحة
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      <X className="size-3.5 ml-1" />
                      غير صحيحة
                    </Badge>
                  )}
                </div>

                <p className="font-medium leading-7">{question.text}</p>

                <ul className="space-y-1.5">
                  {question.options.map((option) => {
                    const isSelected = selected.has(option.externalId);
                    return (
                      <li
                        key={option.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-sm ${
                          option.isCorrect
                            ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-100"
                            : isSelected
                              ? "border-rose-500/45 bg-rose-500/10 text-rose-100"
                              : "border-border/60 bg-card/60 text-foreground/80"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs text-muted-foreground">
                            {option.externalId}
                          </span>
                          <span>{option.text}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isSelected ? (
                            <Badge variant="secondary" className="text-xs">
                              اختيار الطالب
                            </Badge>
                          ) : null}
                          {option.isCorrect ? (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs">
                              الإجابة الصحيحة
                            </Badge>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
