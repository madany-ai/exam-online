"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { EyeOff, ListChecks, Loader2, Lock, Rocket, RotateCcw } from "lucide-react";
import {
  toggleResultsReleaseAction,
  transitionExamWithFeedbackAction,
} from "@/features/exams/actions";
import { Button } from "@/components/ui/button";

export function ExamStatusControlButton({
  examId,
  to,
  label,
  variant = "default",
}: {
  examId: string;
  to: "DRAFT" | "PUBLISHED" | "CLOSED";
  label: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const res = await transitionExamWithFeedbackAction(examId, to);
          if (!res.ok) {
            toast.error("تعذّر تحديث حالة الاختبار", {
              description: res.error,
            });
            return;
          }
          toast.success(res.message);
        });
      }}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : to === "PUBLISHED" ? (
        <Rocket className="size-4" />
      ) : to === "CLOSED" ? (
        <Lock className="size-4" />
      ) : (
        <RotateCcw className="size-4" />
      )}
      {label}
    </Button>
  );
}

export function ResultsReleaseToggleButton({
  examId,
  released,
}: {
  examId: string;
  released: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant={released ? "outline" : "default"}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const res = await toggleResultsReleaseAction(examId, !released);
          if (!res.ok) {
            toast.error("تعذّر تحديث حالة النتائج", {
              description: res.error,
            });
            return;
          }
          toast.success(res.message);
        });
      }}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : released ? (
        <EyeOff className="size-4" />
      ) : (
        <ListChecks className="size-4" />
      )}
      {released ? "إخفاء النتائج" : "إصدار النتائج للطلاب"}
    </Button>
  );
}

