"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  FileJson,
  HelpCircle,
  Loader2,
  Rocket,
  Save,
  Share2,
  Trash2,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";
import {
  confirmImportAction,
  previewImportAction,
} from "@/features/exams/actions";
import {
  parseImportPayload,
  QUESTION_TYPE_LABELS_AR,
  type ImportIssue,
  type ImportParseSuccess,
} from "@/features/questions/import-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ImportWizard({
  examId,
  examTitle,
  publicToken,
}: {
  examId: string;
  examTitle: string;
  publicToken?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    rawJson: string;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [previewData, setPreviewData] = useState<ImportParseSuccess | null>(null);
  const [completedResult, setCompletedResult] = useState<{
    message: string;
    published: boolean;
    publicUrl: string;
  } | null>(null);

  async function handleFileSelected(file: File | null | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error("حجم الملف أكبر من 1 ميجابايت");
      return;
    }

    try {
      const text = await file.text();
      setFileInfo({ name: file.name, size: file.size, rawJson: text });
      setErrorMessage(null);
      setIssues([]);
      setCompletedResult(null);

      // فحص فوري وعرض المعاينة مباشرة دون إضاعة وقت المعلم
      const localParsed = parseImportPayload(text);
      if (!localParsed.ok) {
        const firstIssue = localParsed.issues[0];
        const msg = localParsed.fileError
          ? localParsed.fileError
          : firstIssue
            ? `${firstIssue.questionNumber ? `السؤال ${firstIssue.questionNumber}: ` : ""}${firstIssue.message}`
            : "الملف يحتوي على أخطاء.";
        setErrorMessage(msg);
        setIssues(localParsed.issues);
        setPreviewData(null);
        toast.error("يوجد خطأ في ملف الـ JSON", {
          description: msg,
          duration: 7000,
        });
        return;
      }

      // تحقق أيضاً عبر الخادم
      startTransition(async () => {
        const fd = new FormData();
        fd.set("rawJson", text);
        const serverCheck = await previewImportAction({ status: "idle" }, fd);
        if (serverCheck.status === "error") {
          setErrorMessage(serverCheck.message);
          setIssues(serverCheck.issues ?? []);
          setPreviewData(null);
          toast.error("تعذّر التحقق من الملف", {
            description: serverCheck.message,
          });
          return;
        }
        if (serverCheck.status === "preview") {
          setPreviewData(serverCheck.result);
          toast.success("تم فحص ملف الأسئلة بنجاح!", {
            description: `${serverCheck.result.questions.length} سؤال جاهز للمراجعة والاعتماد.`,
          });
        }
      });
    } catch {
      toast.error("تعذّر قراءة الملف المرفوع.");
    }
  }

  function handleConfirm(publishImmediately: boolean) {
    if (!fileInfo?.rawJson) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("examId", examId);
      fd.set("rawJson", fileInfo.rawJson);
      fd.set("publish", publishImmediately ? "true" : "false");

      const result = await confirmImportAction({ status: "idle" }, fd);
      if (result.status === "error") {
        setErrorMessage(result.message);
        toast.error("فشل استيراد الأسئلة", {
          description: result.message,
        });
        return;
      }

      if (result.status === "success") {
        setCompletedResult({
          message: result.message,
          published: result.published,
          publicUrl: result.publicUrl,
        });
        toast.success(
          result.published
            ? "تم اعتماد الأسئلة ونشر الاختبار بنجاح!"
            : "تم استيراد واعتماد الأسئلة بنجاح!",
          {
            description: result.message,
          },
        );
      }
    });
  }

  if (completedResult) {
    return (
      <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/45 via-card to-card shadow-2xl">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/35">
              <CheckCircle2 className="size-9" />
            </div>
            <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1">
              {completedResult.published ? "منشور ومتاح للطلاب الآن" : "تم تحديث أسئلة الاختبار"}
            </Badge>
            <h2 className="text-xl font-bold">{examTitle}</h2>
            <p className="text-sm text-muted-foreground max-w-lg">{completedResult.message}</p>
          </div>

          <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-border/80 bg-background/80 p-4">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Share2 className="size-3.5 text-primary" />
              رابط دخول الطلاب للاختبار
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 overflow-x-auto rounded-xl border border-border/70 bg-card px-4 py-3 text-xs sm:text-sm font-mono text-emerald-300 select-all"
              >
                {completedResult.publicUrl}
              </code>
              <Button
                type="button"
                size="lg"
                className="font-bold shrink-0"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(completedResult.publicUrl);
                    setCopiedLink(true);
                    toast.success("تم نسخ رابط الاختبار إلى الحافظة!");
                    setTimeout(() => setCopiedLink(false), 2500);
                  } catch {
                    toast.error("تعذّر النسخ التلقائي.");
                  }
                }}
              >
                {copiedLink ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiedLink ? "تم النسخ!" : "نسخ رابط الاختبار"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button asChild variant="secondary" size="sm">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `اختبار: ${examTitle}\nادخل على الرابط التالي لبدء الحل:\n${completedResult.publicUrl}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Share2 className="size-4 text-emerald-400" />
                  مشاركة عبر واتساب
                </a>
              </Button>
              {publicToken && completedResult.published ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/exam/${publicToken}`} target="_blank">
                    <ExternalLink className="size-4" />
                    معاينة صفحة الطالب
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link href={`/dashboard/exams/${examId}`}>العودة لإدارة الاختبار</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="size-5 text-primary" />
            رفع وفحص ملف الأسئلة (JSON)
          </CardTitle>
          <CardDescription>
            اختر ملف الـ JSON وسيتم فحصه تلقائياً وعرض معاينة الأسئلة للموافقة قبل اعتمادها.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleFileSelected(e.target.files?.[0])}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              void handleFileSelected(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`group cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging
                ? "border-primary bg-primary/10"
                : fileInfo
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {fileInfo ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  {isPending ? <Loader2 className="size-6 animate-spin" /> : <FileCheck2 className="size-6" />}
                </div>
                <p className="text-sm font-bold">{fileInfo.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(fileInfo.size / 1024).toFixed(1)} كيلوبايت
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    اختيار ملف آخر
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-rose-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileInfo(null);
                      setPreviewData(null);
                      setErrorMessage(null);
                      setIssues([]);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <Trash2 className="size-4" />
                    إزالة
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary transition-colors">
                  <UploadCloud className="size-6" />
                </div>
                <p className="text-sm font-semibold">
                  اضغط لاختيار ملف <span className="text-primary font-mono">.json</span> أو اسحبه وأفلته هنا
                </p>
                <p className="text-xs text-muted-foreground">سيتم فحص الملف فور اختياره</p>
              </div>
            )}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2.5 text-rose-300">
                <TriangleAlert className="size-5 shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <p className="text-sm font-bold">لم يتم استيراد أي سؤال — يرجى تصحيح التالي:</p>
                  <p className="text-xs mt-1 text-rose-200">{errorMessage}</p>
                </div>
              </div>

              {issues.length > 0 ? (
                <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
                  {issues.map((issue, idx) => (
                    <li
                      key={`${issue.path}-${idx}`}
                      className="rounded-lg border border-rose-500/20 bg-background/60 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-rose-300">
                          {issue.questionNumber ? `السؤال ${issue.questionNumber}` : "هيكل الملف"}
                        </span>
                        <span dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                          {issue.path}
                        </span>
                      </div>
                      <p className="text-foreground/90">{issue.message}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {previewData ? (
        <div className="space-y-6">
          <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/45 via-card to-card shadow-xl">
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="size-4" />
                  الملف صالح: {previewData.questions.length} سؤال — مجموع {previewData.totalPoints} درجة
                </p>
                <p className="text-xs text-muted-foreground">
                  هل أنت موافق على اعتماد هذه الأسئلة في «{examTitle}» ونشر الاختبار الآن؟
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  size="lg"
                  disabled={isPending}
                  onClick={() => handleConfirm(true)}
                  className="font-bold"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Rocket className="size-4" />
                  )}
                  نعم، اعتمد الأسئلة وانشر الاختبار الآن
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={isPending}
                  onClick={() => handleConfirm(false)}
                >
                  <Save className="size-4" />
                  اعتماد وحفظ كمسودة
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <HelpCircle className="size-5 text-primary" />
                معاينة الأسئلة والإجابات الصحيحة ({previewData.questions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewData.questions.map((question, index) => {
                const correctSet = new Set(question.correctOptionIds);
                return (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-border/80 bg-background/50 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-emerald-300 border border-primary/30">
                          السؤال {index + 1}
                        </span>
                        <Badge variant="secondary">{QUESTION_TYPE_LABELS_AR[question.type]}</Badge>
                      </div>
                      <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {question.points} درجة
                      </Badge>
                    </div>

                    <p className="text-base font-medium leading-7">{question.text}</p>

                    <div className="grid gap-2">
                      {question.options.map((option) => {
                        const isCorrect = correctSet.has(option.id);
                        return (
                          <div
                            key={option.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-sm ${
                              isCorrect
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                                : "border-border/60 bg-card/60 text-foreground/85"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-xs text-muted-foreground">
                                {option.id}
                              </span>
                              <span>{option.text}</span>
                            </div>
                            {isCorrect ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                                <Check className="size-3.5" />
                                صحيحة
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
