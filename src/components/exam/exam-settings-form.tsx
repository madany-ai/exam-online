"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExamActionState } from "@/features/exams/actions";
import { DEFAULT_STUDENT_ID_LABEL } from "@/features/exams/schema";

/** يحوّل Date إلى صيغة input[type=datetime-local] بتوقيت المتصفح. */
function toLocalInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export type ExamFormDefaults = {
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number;
  maxAttempts: number;
  startsAt: Date | null;
  endsAt: Date | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultVisibility: "IMMEDIATE" | "MANUAL";
  requiresStudentId: boolean;
  studentIdLabel: string | null;
};

type Props = {
  action: (previousState: ExamActionState, formData: FormData) => Promise<ExamActionState>;
  defaults?: ExamFormDefaults;
  examId?: string;
  submitLabel: string;
  disabled?: boolean;
  disabledHint?: string;
};

export function ExamSettingsForm({
  action,
  defaults,
  examId,
  submitLabel,
  disabled = false,
  disabledHint,
}: Props) {
  const [state, formAction, pending] = useActionState<ExamActionState, FormData>(action, {
    status: "idle",
  });

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const fieldError = (key: string) =>
    state.status === "error" ? state.fieldErrors?.[key] : undefined;

  return (
    <form action={formAction} className="space-y-6">
      {examId ? <input type="hidden" name="examId" value={examId} /> : null}

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-base">بيانات الاختبار</CardTitle>
          <CardDescription>العنوان والوصف والتعليمات التي تظهر للطالب.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">عنوان الاختبار *</Label>
            <Input
              id="title"
              name="title"
              required
              disabled={disabled}
              defaultValue={defaults?.title ?? ""}
              placeholder="مثال: اختبار الرياضيات — الفصل الأول"
            />
            {fieldError("title") ? (
              <p className="text-xs text-rose-400">{fieldError("title")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">الوصف (اختياري)</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              disabled={disabled}
              defaultValue={defaults?.description ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">تعليمات قبل البدء (اختياري)</Label>
            <Textarea
              id="instructions"
              name="instructions"
              rows={2}
              disabled={disabled}
              defaultValue={defaults?.instructions ?? ""}
              placeholder="مثال: أجب عن جميع الأسئلة. لا تغلق الصفحة أثناء الاختبار."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-base">التوقيت والمحاولات</CardTitle>
          <CardDescription>
            يحسب الخادم الموعد النهائي من لحظة البدء؛ لا يمكن تجاوز المدة حتى بتعديل توقيت جهاز الطالب.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="durationMinutes">المدة بالدقائق *</Label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={1}
              max={600}
              required
              disabled={disabled}
              defaultValue={defaults?.durationMinutes ?? 30}
            />
            {fieldError("durationMinutes") ? (
              <p className="text-xs text-rose-400">{fieldError("durationMinutes")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxAttempts">أقصى عدد محاولات للطالب *</Label>
            <Input
              id="maxAttempts"
              name="maxAttempts"
              type="number"
              min={1}
              max={10}
              required
              disabled={disabled}
              defaultValue={defaults?.maxAttempts ?? 1}
            />
            {fieldError("maxAttempts") ? (
              <p className="text-xs text-rose-400">{fieldError("maxAttempts")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="startsAt">يبدأ الاختبار في (اختياري)</Label>
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              disabled={disabled}
              defaultValue={toLocalInputValue(defaults?.startsAt)}
            />
            {fieldError("startsAt") ? (
              <p className="text-xs text-rose-400">{fieldError("startsAt")}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="endsAt">ينتهي الاختبار في (اختياري)</Label>
            <Input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              disabled={disabled}
              defaultValue={toLocalInputValue(defaults?.endsAt)}
            />
            {fieldError("endsAt") ? (
              <p className="text-xs text-rose-400">{fieldError("endsAt")}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-base">خيارات العرض والنتائج</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="resultVisibility">متى يرى الطالب نتيجته؟ *</Label>
            <Select
              name="resultVisibility"
              defaultValue={defaults?.resultVisibility ?? "MANUAL"}
              disabled={disabled}
            >
              <SelectTrigger id="resultVisibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IMMEDIATE">فوراً بعد التسليم</SelectItem>
                <SelectItem value="MANUAL">بعد إصدار النتائج من اللوحة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="studentIdLabel">اسم حقل مُعرّف الطالب</Label>
            <Input
              id="studentIdLabel"
              name="studentIdLabel"
              disabled={disabled}
              defaultValue={defaults?.studentIdLabel ?? DEFAULT_STUDENT_ID_LABEL}
              placeholder={DEFAULT_STUDENT_ID_LABEL}
            />
            {fieldError("studentIdLabel") ? (
              <p className="text-xs text-rose-400">{fieldError("studentIdLabel")}</p>
            ) : null}
          </div>

          <div className="space-y-3 md:col-span-2 pt-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="shuffleQuestions"
                value="on"
                defaultChecked={defaults?.shuffleQuestions ?? false}
                disabled={disabled}
                className="size-4 accent-primary"
              />
              <Shuffle className="size-4 text-primary" />
              خلط ترتيب الأسئلة لكل طالب
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="shuffleOptions"
                value="on"
                defaultChecked={defaults?.shuffleOptions ?? false}
                disabled={disabled}
                className="size-4 accent-primary"
              />
              <Shuffle className="size-4 text-primary" />
              خلط ترتيب الاختيارات داخل كل سؤال
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="requiresStudentId"
                value="on"
                defaultChecked={defaults?.requiresStudentId ?? true}
                disabled={disabled}
                className="size-4 accent-primary"
              />
              طلب رقم التليفون / المُعرّف من الطالب (مطلوب لتطبيق حدّ المحاولات)
            </label>
          </div>
        </CardContent>
      </Card>

      {disabled ? (
        <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-sm text-amber-200">
          {disabledHint ?? "لا يمكن التعديل الآن."}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={disabled || pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            جارٍ الحفظ…
          </>
        ) : (
          <>
            <Save className="size-4" />
            {submitLabel}
          </>
        )}
      </Button>
    </form>
  );
}
