"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  X,
  XCircle,
} from "lucide-react";
import type { StudentQuestionReviewItem } from "@/features/attempts/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FilterMode = "all" | "mistakes" | "correct";

export function ResultReview({ items }: { items: StudentQuestionReviewItem[] }) {
  const mistakesCount = items.filter((item) => !item.isCorrect).length;
  const correctCount = items.filter((item) => item.isCorrect).length;

  const [filter, setFilter] = useState<FilterMode>("all");

  const filteredItems = items
    .map((item, idx) => ({ item, number: idx + 1 }))
    .filter(({ item }) => {
      if (filter === "mistakes") return !item.isCorrect;
      if (filter === "correct") return item.isCorrect;
      return true;
    });

  return (
    <Card className="border-border/80 bg-card/95 backdrop-blur-md shadow-2xl">
      <CardHeader className="border-b border-border/60 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <HelpCircle className="size-5 text-primary shrink-0" />
              <span>مراجعة الإجابات وتصحيح الأخطاء</span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              راجع إجاباتك مقارنةً بالإجابات الصحيحة والشرح التفصيلي لكل سؤال.
            </p>
          </div>

          {mistakesCount === 0 ? (
            <Badge className="w-fit bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1">
              <CheckCircle2 className="size-3.5 ml-1" />
              أجبت على جميع الأسئلة بشكل صحيح!
            </Badge>
          ) : (
            <Badge className="w-fit bg-rose-500/15 text-rose-300 border border-rose-500/30 px-3 py-1">
              <AlertCircle className="size-3.5 ml-1" />
              لديك {mistakesCount} {mistakesCount === 1 ? "سؤال يحتاج" : "أسئلة تحتاج"} مراجعة
            </Badge>
          )}
        </div>

        {/* أزرار الفلترة السريعة (الكل / الأخطاء فقط / الصحيحة) */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs sm:text-sm font-bold transition-all ${
              filter === "all"
                ? "border-primary/50 bg-primary/15 text-emerald-300 shadow-sm"
                : "border-border/70 bg-background/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <span>كل الأسئلة</span>
            <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] tabular-nums">
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("mistakes")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs sm:text-sm font-bold transition-all ${
              filter === "mistakes"
                ? "border-rose-500/50 bg-rose-500/15 text-rose-300 shadow-sm"
                : "border-border/70 bg-background/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <span>الأخطاء فقط</span>
            <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] tabular-nums text-rose-300">
              {mistakesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("correct")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs sm:text-sm font-bold transition-all ${
              filter === "correct"
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm"
                : "border-border/70 bg-background/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <span>الصحيحة</span>
            <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-300">
              {correctCount}
            </span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-6 space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-background/50 p-6 text-center text-sm text-muted-foreground">
            {filter === "mistakes"
              ? "ممتاز! لا توجد أي أخطاء في إجاباتك."
              : "لا توجد أسئلة مطابقة لهذا الفلتر."}
          </div>
        ) : (
          filteredItems.map(({ item, number }) => (
            <div
              key={item.questionId}
              className={`rounded-2xl border p-3.5 sm:p-5 space-y-3.5 transition-colors ${
                item.isCorrect
                  ? "border-emerald-500/25 bg-background/50"
                  : "border-rose-500/35 bg-rose-950/10"
              }`}
            >
              {/* رأس بطاقة السؤال */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-foreground border border-border/70">
                    السؤال {number}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    الدرجة: {item.earnedPoints} / {item.points}
                  </span>
                </div>

                {item.isCorrect ? (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                    <CheckCircle2 className="size-3.5 ml-1" />
                    إجابة صحيحة
                  </Badge>
                ) : item.unanswered ? (
                  <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/35">
                    <AlertCircle className="size-3.5 ml-1" />
                    لم تتم الإجابة
                  </Badge>
                ) : (
                  <Badge className="bg-rose-500/15 text-rose-300 border border-rose-500/35">
                    <XCircle className="size-3.5 ml-1" />
                    إجابة خاطئة
                  </Badge>
                )}
              </div>

              {/* نص السؤال */}
              <p className="text-sm sm:text-base font-semibold leading-7 sm:leading-8 text-foreground">
                {item.text}
              </p>

              {/* الخيارات مع توضيح إجابة الطالب والإجابة الصحيحة */}
              <div className="grid gap-2">
                {item.options.map((option) => {
                  const isStudentRight = option.selected && option.isCorrect;
                  const isStudentWrong = option.selected && !option.isCorrect;
                  const isMissedCorrect = !option.selected && option.isCorrect;

                  return (
                    <div
                      key={option.id}
                      className={`flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 sm:px-3.5 text-xs sm:text-sm ${
                        isStudentRight
                          ? "border-emerald-500/55 bg-emerald-500/15 text-emerald-100"
                          : isStudentWrong
                            ? "border-rose-500/55 bg-rose-500/15 text-rose-100"
                            : isMissedCorrect
                              ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-200"
                              : "border-border/60 bg-card/50 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold mt-0.5 sm:mt-0 ${
                            isStudentRight || isMissedCorrect
                              ? "bg-emerald-500 text-slate-950"
                              : isStudentWrong
                                ? "bg-rose-500 text-white"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isStudentRight || isMissedCorrect ? (
                            <Check className="size-3.5" />
                          ) : isStudentWrong ? (
                            <X className="size-3.5" />
                          ) : (
                            option.id
                          )}
                        </span>
                        <span className="leading-6 break-words">{option.text}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mr-8 sm:mr-0 shrink-0">
                        {isStudentRight ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
                            <Check className="size-3" />
                            إجابتك الصحيحة
                          </span>
                        ) : null}

                        {isStudentWrong ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/25 border border-rose-500/40 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
                            <X className="size-3" />
                            إجابتك الخاطئة
                          </span>
                        ) : null}

                        {isMissedCorrect ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                            <Check className="size-3" />
                            الإجابة الصحيحة
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* الشرح التعليمي للسؤال إن وُجد */}
              {item.explanation ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200 leading-6">
                  <Lightbulb className="size-4 shrink-0 mt-1 text-sky-400" />
                  <div>
                    <strong className="text-sky-300">توضيح الإجابة: </strong>
                    {item.explanation}
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

