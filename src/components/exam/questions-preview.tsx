import { Check, HelpCircle } from "lucide-react";
import { QUESTION_TYPE_LABELS_AR, type SupportedQuestionType } from "@/features/questions/import-schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type QuestionWithOptions = {
  id: string;
  externalId: string;
  type: SupportedQuestionType;
  text: string;
  points: { toNumber(): number };
  explanation: string | null;
  options: { id: string; externalId: string; text: string; isCorrect: boolean }[];
};

/**
 * عرض الأسئلة للمعلم فقط — يشمل الإجابات الصحيحة.
 * لا يُستخدم هذا المكوّن أبداً في واجهة الطالب.
 */
export function QuestionsPreview({ questions }: { questions: QuestionWithOptions[] }) {
  if (questions.length === 0) {
    return (
      <Card className="border-border/80">
        <CardContent className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <p className="font-bold text-foreground text-base">لا توجد أسئلة في هذا الاختبار بعد</p>
          <p className="mt-1">استورد ملف JSON يحتوي على الأسئلة لتظهر هنا للمراجعة.</p>
        </CardContent>
      </Card>
    );
  }

  const totalPoints = questions.reduce((sum, question) => sum + question.points.toNumber(), 0);

  return (
    <Card className="border-border/80 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/60">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="size-5 text-primary" />
            الأسئلة المبرمجة في الاختبار ({questions.length} سؤال — {totalPoints} درجة)
          </CardTitle>
          <CardDescription className="mt-1">
            معاينة كاملة للأسئلة ومفاتيح الإجابات الصحيحة (تظهر للمعلم فقط).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {questions.map((question, index) => (
          <div
            key={question.id}
            className="rounded-2xl border border-border/80 bg-background/50 p-4 sm:p-5 space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-emerald-300 border border-primary/30">
                  سؤال {index + 1}
                </span>
                <Badge variant="secondary">{QUESTION_TYPE_LABELS_AR[question.type]}</Badge>
                <span className="text-xs font-mono text-muted-foreground">
                  #{question.externalId}
                </span>
              </div>
              <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {question.points.toNumber()} درجة
              </Badge>
            </div>

            <p className="text-base font-medium leading-8">{question.text}</p>

            <ul className="grid gap-2">
              {question.options.map((option) => (
                <li
                  key={option.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
                    option.isCorrect
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                      : "border-border/60 bg-card/60 text-foreground/85"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                        option.isCorrect
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {option.externalId}
                    </span>
                    <span>{option.text}</span>
                  </div>
                  {option.isCorrect ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                      <Check className="size-3.5" />
                      إجابة صحيحة
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            {question.explanation ? (
              <p className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200 leading-6">
                <span className="font-bold text-sky-300">الشرح: </span>
                {question.explanation}
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
