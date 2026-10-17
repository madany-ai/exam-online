"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type RunnerQuestion = {
  id: string;
  text: string;
  points: number;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  options: { id: string; text: string }[];
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

function formatRemaining(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ExamRunner({
  examToken,
  accessToken,
  questions,
  initialAnswers,
  expiresAt,
}: {
  examToken: string;
  accessToken: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, string[]>;
  expiresAt: string;
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(initialAnswers);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answersRef = useRef(answers);
  const lastSavedJsonRef = useRef<string>(JSON.stringify(initialAnswers));
  const inFlightSaveRef = useRef(false);
  const submittingRef = useRef(false);
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const baseUrl = `/api/public/exams/${examToken}/attempts/${accessToken}`;

  const saveAnswers = useCallback(async () => {
    if (submittingRef.current || inFlightSaveRef.current) return;
    const currentSnapshot = JSON.stringify(answersRef.current);
    // عدم إرسال أي طلب للشبكة إذا لم تتغير الإجابات منذ آخر حفظ ناجح
    if (currentSnapshot === lastSavedJsonRef.current) return;

    const payload = Object.entries(answersRef.current).map(([questionId, selectedOptionIds]) => ({
      questionId,
      selectedOptionIds,
    }));
    if (payload.length === 0) return;

    inFlightSaveRef.current = true;
    setSaveState({ kind: "saving" });
    try {
      const response = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      const data = await response.json();

      if (submittingRef.current) return;

      if (!response.ok) {
        if (response.status === 429) {
          setSaveState({
            kind: "error",
            message: "تم تجاوز معدل الحفظ السريع — سيتم الحفظ تلقائياً بعد لحظات.",
          });
          return;
        }
        setSaveState({ kind: "error", message: data.error ?? "تعذّر الحفظ." });
        return;
      }
      if (data.finalized) {
        router.push(`/exam/${examToken}/result/${accessToken}`);
        return;
      }
      lastSavedJsonRef.current = currentSnapshot;
      setSaveState({ kind: "saved", at: new Date(data.savedAt) });
    } catch {
      if (!submittingRef.current) {
        setSaveState({ kind: "error", message: "انقطع الاتصال — لم يُحفظ آخر تعديل." });
      }
    } finally {
      inFlightSaveRef.current = false;
    }
  }, [accessToken, baseUrl, examToken, router]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveAnswers();
    }, 2500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [answers, saveAnswers]);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    const payload = Object.entries(answersRef.current).map(([questionId, selectedOptionIds]) => ({
      questionId,
      selectedOptionIds,
    }));

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      const data = await response.json();
      if (!response.ok) {
        const msg = data.error ?? "تعذّر التسليم.";
        setSubmitError(msg);
        toast.error("تعذّر تسليم الاختبار", { description: msg });
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      toast.success("تم تسليم إجاباتك بنجاح!");
      router.push(`/exam/${examToken}/result/${accessToken}`);
    } catch {
      const msg = "انقطع الاتصال أثناء التسليم. أعد المحاولة.";
      setSubmitError(msg);
      toast.error(msg);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [accessToken, baseUrl, examToken, router]);

  useEffect(() => {
    const deadline = new Date(expiresAt).getTime();
    const interval = setInterval(() => {
      const seconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) {
        clearInterval(interval);
        void submit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, submit]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((selected) => selected.length > 0).length,
    [answers],
  );
  const current = questions[currentIndex];

  function toggleOption(question: RunnerQuestion, optionId: string) {
    setAnswers((previous) => {
      const selected = previous[question.id] ?? [];
      if (question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE") {
        return { ...previous, [question.id]: [optionId] };
      }
      return {
        ...previous,
        [question.id]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      };
    });
  }

  const isLowTime = remaining <= 60;
  const isOutOfTime = remaining === 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5 p-3 sm:p-6">
      {/* شريط علوي: الحالة والوقت والتقدم */}
      <header className="sticky top-2 sm:top-3 z-10 space-y-2.5 sm:space-y-3 rounded-2xl border border-border/80 bg-card/95 p-3 sm:p-4 backdrop-blur-md shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs sm:text-sm">
            <span className="text-muted-foreground">الإنجاز: </span>
            <span className="font-bold tabular-nums text-emerald-300">
              {answeredCount} من {questions.length} سؤال
            </span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-xs sm:text-sm font-bold tabular-nums ${
              isOutOfTime
                ? "border-rose-500/50 bg-rose-500/20 text-rose-200"
                : isLowTime
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-200 animate-pulse"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
            }`}
            role="timer"
            aria-live="off"
          >
            <Clock className="size-3.5 sm:size-4" />
            الوقت المتبقي: {formatRemaining(remaining)}
          </div>
        </div>

        <Progress value={(answeredCount / Math.max(questions.length, 1)) * 100} />

        <div className="flex items-center justify-between text-[11px] sm:text-xs" aria-live="polite">
          <SaveIndicator state={saveState} onRetry={() => void saveAnswers()} />
          <span className="text-muted-foreground font-medium">
            السؤال {currentIndex + 1} من {questions.length}
          </span>
        </div>
      </header>

      {/* السؤال الحالي */}
      {current ? (
        <Card className="border-border/80 shadow-xl">
          <CardHeader className="border-b border-border/60 p-4 sm:p-6 pb-3 sm:pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <Badge className="bg-primary/15 text-emerald-300 border border-primary/30">
                  السؤال {currentIndex + 1}
                </Badge>
                <Badge variant="secondary">
                  {current.type === "SINGLE_CHOICE"
                    ? "اختر إجابة واحدة"
                    : current.type === "TRUE_FALSE"
                      ? "صح أو خطأ"
                      : "يمكن اختيار أكثر من إجابة"}
                </Badge>
              </div>
              <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {current.points} درجة
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <fieldset>
              <legend className="mb-4 sm:mb-5 text-base sm:text-xl font-semibold leading-7 sm:leading-8">
                {current.text}
              </legend>
              <div className="space-y-2.5 sm:space-y-3">
                {current.options.map((option) => {
                  const checked = (answers[current.id] ?? []).includes(option.id);
                  const isMultiple = current.type === "MULTIPLE_CHOICE";
                  return (
                    <label
                      key={option.id}
                      className={`flex min-h-12 sm:min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 sm:p-4 text-sm sm:text-base transition-all ${
                        checked
                          ? "border-primary bg-primary/15 text-emerald-100 shadow-sm"
                          : "border-border/70 bg-background/60 hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type={isMultiple ? "checkbox" : "radio"}
                          name={`question-${current.id}`}
                          value={option.id}
                          checked={checked}
                          onChange={() => toggleOption(current, option.id)}
                          className="size-4 sm:size-5 shrink-0 accent-primary"
                        />
                        <span className="leading-6 sm:leading-7">{option.text}</span>
                      </div>
                      {checked ? (
                        <Check className="size-4 shrink-0 text-emerald-400" />
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {/* التنقّل بين الأسئلة */}
      <nav className="flex items-center justify-between gap-2.5 sm:gap-3">
        <Button
          variant="outline"
          size="lg"
          className="flex-1 sm:flex-none"
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          disabled={currentIndex === 0}
        >
          <ArrowRight className="size-4" />
          السؤال السابق
        </Button>

        <Button
          variant="secondary"
          size="lg"
          className="flex-1 sm:flex-none"
          onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
          disabled={currentIndex === questions.length - 1}
        >
          السؤال التالي
          <ArrowLeft className="size-4" />
        </Button>
      </nav>

      {/* شبكة الأسئلة answered/unanswered */}
      <Card className="border-border/80">
        <CardContent className="p-5">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">خريطة الأسئلة السريعة</p>
          <ul className="flex flex-wrap gap-2">
            {questions.map((question, index) => {
              const answered = (answers[question.id] ?? []).length > 0;
              return (
                <li key={question.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    aria-current={index === currentIndex ? "true" : undefined}
                    aria-label={`السؤال ${index + 1}${answered ? " — مُجاب" : " — غير مُجاب"}`}
                    className={`size-10 rounded-xl border text-sm font-bold tabular-nums transition-all ${
                      index === currentIndex
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : answered
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {index + 1}
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {submitError ? (
        <p role="alert" className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 text-sm text-rose-300">
          {submitError}
        </p>
      ) : null}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="w-full font-bold text-base" size="lg" disabled={submitting || isOutOfTime}>
            <Send className="size-4" />
            تسليم الاختبار النهائي
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تسليم الاختبار نهائياً؟</AlertDialogTitle>
            <AlertDialogDescription>
              {answeredCount < questions.length ? (
                <span className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="size-4 shrink-0" />
                  لم تُجب على {questions.length - answeredCount} سؤالاً. الأسئلة غير المُجابة تُحتسب صفراً.
                </span>
              ) : (
                "أكملت الإجابة على جميع الأسئلة."
              )}{" "}
              بعد التسليم لا يمكنك تعديل إجاباتك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>مراجعة الإجابات</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => void submit()} disabled={submitting}>
                {submitting ? "جارٍ التسليم…" : "نعم، سلّم الآن"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        جارٍ الحفظ التلقائي…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        تم الحفظ تلقائياً {state.at.toLocaleTimeString("ar")}
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 text-rose-400 underline"
      >
        <WifiOff className="size-3.5" />
        {state.message} إعادة المحاولة
      </button>
    );
  }
  return <span className="text-muted-foreground">الحفظ التلقائي مفعّل</span>;
}
