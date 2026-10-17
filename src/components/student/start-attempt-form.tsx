"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** إدخال بيانات الطالب وبدء المحاولة. */
export function StartAttemptForm({
  examToken,
  requiresStudentId,
  studentIdLabel,
}: {
  examToken: string;
  requiresStudentId: boolean;
  studentIdLabel: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/public/exams/${examToken}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentName: formData.get("studentName"),
          studentIdentifier: formData.get("studentIdentifier") || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const msg = payload.error ?? "تعذّر بدء المحاولة.";
        setError(msg);
        toast.error("تعذّر بدء الاختبار", { description: msg });
        setPending(false);
        return;
      }

      toast.success("تم بدء الاختبار! بالتوفيق.");
      router.push(`/exam/${examToken}/attempt/${payload.accessToken}`);
    } catch {
      const msg = "تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى.";
      setError(msg);
      toast.error(msg);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="studentName">الاسم الثلاثي أو الكامل *</Label>
        <Input
          id="studentName"
          name="studentName"
          required
          minLength={2}
          maxLength={120}
          placeholder="اكتب اسمك الكامل هنا"
          className="h-11"
        />
      </div>

      {requiresStudentId ? (
        <div className="space-y-2">
          <Label htmlFor="studentIdentifier">{studentIdLabel ?? "رقم التليفون"} *</Label>
          <Input
            id="studentIdentifier"
            name="studentIdentifier"
            required
            inputMode="tel"
            placeholder="01xxxxxxxxx"
            maxLength={20}
            dir="ltr"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            يُستخدم {studentIdLabel ?? "رقم التليفون"} لتسجيل محاولتك وتطبيق عدد المحاولات المسموح.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full font-bold text-base" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تجهيز أسئلة الاختبار…
          </>
        ) : (
          <>
            <Play className="size-4" />
            ابدأ الاختبار الآن
          </>
        )}
      </Button>
    </form>
  );
}
