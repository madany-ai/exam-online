"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileCheck2,
  FileJson,
  HelpCircle,
  Loader2,
  Rocket,
  Save,
  Share2,
  Shuffle,
  Sparkles,
  Trash2,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";
import { createExamAction } from "@/features/exams/actions";
import { examSettingsSchema } from "@/features/exams/schema";
import { ARABIC_AI_PROMPT } from "@/features/questions/example-document";
import {
  parseImportPayload,
  QUESTION_TYPE_LABELS_AR,
  type ImportIssue,
  type ImportParseSuccess,
} from "@/features/questions/import-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WizardStep = "form" | "preview" | "published";

type FormValues = {
  title: string;
  description: string;
  instructions: string;
  durationMinutes: string;
  maxAttempts: string;
  resultVisibility: "IMMEDIATE" | "MANUAL";
  startsAt: string;
  endsAt: string;
  studentIdLabel: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
};

type CreatedExamData = {
  examId: string;
  publicToken: string;
  publicUrl: string;
  published: boolean;
  title: string;
  questionCount: number;
  totalPoints: number;
};

export function NewExamForm() {
  const [step, setStep] = useState<WizardStep>("form");
  const [isPending, startTransition] = useTransition();
  const [showPrompt, setShowPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // جميع بيانات النموذج محفوظة في State حتى لا تختفي أبداً عند التحقق أو التنقل
  const [values, setValues] = useState<FormValues>({
    title: "",
    description: "",
    instructions: "",
    durationMinutes: "30",
    maxAttempts: "1",
    resultVisibility: "IMMEDIATE",
    startsAt: "",
    endsAt: "",
    studentIdLabel: "رقم التليفون",
    shuffleQuestions: false,
    shuffleOptions: false,
  });

  // حالة ملف الـ JSON المرفوع
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    rawJson: string;
  } | null>(null);

  // الأخطاء والمعاينة والنتيجة النهائية
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [jsonIssues, setJsonIssues] = useState<ImportIssue[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ImportParseSuccess | null>(null);
  const [validatedRawJson, setValidatedRawJson] = useState<string>("");
  const [createdExam, setCreatedExam] = useState<CreatedExamData | null>(null);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleFileSelected(file: File | null | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error("حجم الملف كبير جداً", {
        description: "الحد الأقصى المسموح لملف الأسئلة هو 1 ميجابايت.",
      });
      return;
    }

    try {
      const text = await file.text();
      setFileInfo({ name: file.name, size: file.size, rawJson: text });
      setGeneralError(null);
      setJsonIssues([]);

      // فحص سريع أولي لتعبئة العنوان تلقائياً إن كان فارغاً وإعطاء تغذية راجعة فورية
      const quickCheck = parseImportPayload(text);
      if (quickCheck.ok) {
        setValidatedRawJson(text);
        setValues((prev) => ({
          ...prev,
          title: prev.title.trim() ? prev.title : quickCheck.document.title,
          description:
            prev.description.trim() || !quickCheck.document.description
              ? prev.description
              : quickCheck.document.description,
          durationMinutes:
            prev.durationMinutes !== "30" || !quickCheck.document.defaultDurationMinutes
              ? prev.durationMinutes
              : String(quickCheck.document.defaultDurationMinutes),
        }));
        toast.success(`تم إرفاق الملف «${file.name}» بنجاح`, {
          description: `يحتوي على ${quickCheck.questions.length} سؤال بإجمالي ${quickCheck.totalPoints} درجة. اضغط «إنشاء الاختبار» للمراجعة والنشر.`,
        });
      } else {
        const firstIssue = quickCheck.issues[0];
        const detail = quickCheck.fileError
          ? quickCheck.fileError
          : firstIssue
            ? `${firstIssue.questionNumber ? `السؤال ${firstIssue.questionNumber}: ` : ""}${firstIssue.message}`
            : "يوجد خطأ في بنية ملف الـ JSON.";
        setGeneralError(detail);
        setJsonIssues(quickCheck.issues);
        toast.error("تنبيه: يوجد خطأ في ملف الـ JSON المرفوع", {
          description: detail,
          duration: 6000,
        });
      }
    } catch {
      toast.error("تعذّر قراءة الملف", {
        description: "تأكد من اختيار ملف JSON صالح وحاول مرة أخرى.",
      });
    }
  }

  function buildFormData(intent: "preview" | "publish" | "create_draft"): FormData {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("title", values.title);
    fd.set("description", values.description);
    fd.set("instructions", values.instructions);
    fd.set("durationMinutes", values.durationMinutes);
    fd.set("maxAttempts", values.maxAttempts);
    fd.set("resultVisibility", values.resultVisibility);
    fd.set("startsAt", values.startsAt);
    fd.set("endsAt", values.endsAt);
    fd.set("requiresStudentId", "on");
    fd.set("studentIdLabel", values.studentIdLabel || "رقم التليفون");
    if (values.shuffleQuestions) fd.set("shuffleQuestions", "on");
    if (values.shuffleOptions) fd.set("shuffleOptions", "on");
    const rawJsonPayload = fileInfo?.rawJson || validatedRawJson;
    if (rawJsonPayload) {
      fd.set("rawJson", rawJsonPayload);
    }
    return fd;
  }

  /**
   * عند الضغط على «إنشاء الاختبار»:
   * يفحص الحقول وملف الـ JSON بدون مسح أي بيانات،
   * ولو فيه مشكلة يظهر Toast واضح جداً، ولو سليم يفتح شاشة معاينة الأسئلة والموافقة على النشر.
   */
  function handleCreateClick(event: React.FormEvent) {
    event.preventDefault();
    setGeneralError(null);
    setFieldErrors({});
    setJsonIssues([]);

    if (!values.title.trim()) {
      setFieldErrors({ title: "عنوان الاختبار مطلوب." });
      toast.error("بيانات الاختبار غير مكتملة", {
        description: "يرجى كتابة عنوان الاختبار قبل المتابعة.",
      });
      return;
    }

    if (!fileInfo?.rawJson) {
      setGeneralError("يرجى رفع ملف الأسئلة بصيغة JSON أولاً.");
      toast.error("لم يتم إرفاق ملف الأسئلة", {
        description: "اختر ملف الـ JSON الذي يحتوي على الأسئلة ثم اضغط «إنشاء الاختبار».",
      });
      return;
    }

    // التحقق الكامل من إعدادات الاختبار محلياً في 0ms بدون الحاجة لطلب خادم إضافي قبل المعاينة
    const parsedSettings = examSettingsSchema.safeParse({
      title: values.title,
      description: values.description,
      instructions: values.instructions,
      durationMinutes: values.durationMinutes,
      maxAttempts: values.maxAttempts,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      shuffleQuestions: values.shuffleQuestions,
      shuffleOptions: values.shuffleOptions,
      resultVisibility: values.resultVisibility,
      requiresStudentId: true,
      studentIdLabel: values.studentIdLabel || "رقم التليفون",
    });

    if (!parsedSettings.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsedSettings.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      const firstMsg = parsedSettings.error.issues[0]?.message ?? "تحقق من الحقول المدخلة.";
      setFieldErrors(nextErrors);
      setGeneralError(firstMsg);
      toast.error("تأكد من إعدادات الاختبار", {
        description: firstMsg,
        duration: 6000,
      });
      return;
    }

    // فحص فوري لملف الـ JSON والانتقال للمعاينة مباشرةً بدون استهلاك طلب سيرفر
    const localCheck = parseImportPayload(fileInfo.rawJson);
    if (!localCheck.ok) {
      const firstIssue = localCheck.issues[0];
      const msg = localCheck.fileError
        ? localCheck.fileError
        : firstIssue
          ? `${firstIssue.questionNumber ? `السؤال ${firstIssue.questionNumber}: ` : ""}${firstIssue.message}`
          : "الملف يحتوي على أخطاء تمنع إنشاء الاختبار.";
      setGeneralError(msg);
      setJsonIssues(localCheck.issues);
      toast.error("ملف الـ JSON يحتاج إلى تعديل", {
        description: msg,
        duration: 7000,
      });
      return;
    }

    setValidatedRawJson(fileInfo.rawJson);
    setPreviewData(localCheck);
    setGeneralError(null);
    setStep("preview");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("تم التحقق من ملف الأسئلة بنجاح!", {
      description: `تم تجهيز ${localCheck.questions.length} سؤال (${localCheck.totalPoints} درجة). راجع الأسئلة ثم اضغط «نعم، موافق — انشر الاختبار الآن».`,
    });
  }

  /**
   * عند موافقة المعلم على النشر (أو الحفظ كمسودة):
   * ينشئ الاختبار ويستورد الأسئلة وينشره فوراً ويعرض رابط الطلاب مباشرةً.
   */
  function handleConfirmPublish(publishNow: boolean) {
    setGeneralError(null);
    startTransition(async () => {
      try {
        const intent = publishNow ? "publish" : "create_draft";
        const response = await createExamAction({ status: "idle" }, buildFormData(intent));

        if (response.status === "error") {
          setGeneralError(response.message);
          toast.error("حدثت مشكلة أثناء حفظ الاختبار", {
            description: response.message,
            duration: 7000,
          });
          return;
        }

        if (response.status === "created") {
          setCreatedExam(response);
          setStep("published");
          window.scrollTo({ top: 0, behavior: "smooth" });
          if (response.published) {
            toast.success("تم نشر الاختبار بنجاح!", {
              description: "الرابط جاهز الآن، يمكنك نسخه ومشاركته مع الطلاب فوراً.",
            });
          } else {
            toast.success("تم حفظ الاختبار كمسودة بنجاح!", {
              description: "يمكنك نشره في أي وقت من لوحة إدارة الاختبار.",
            });
          }
        }
      } catch {
        const fallbackMsg = "حدث خطأ في الاتصال بالخادم أثناء النشر. يرجى المحاولة مرة أخرى.";
        setGeneralError(fallbackMsg);
        toast.error("تعذّر نشر الاختبار حالياً", {
          description: fallbackMsg,
          duration: 7000,
        });
      }
    });
  }

  const stepsMeta = [
    { id: "form", num: "١", label: "بيانات الاختبار والملف" },
    { id: "preview", num: "٢", label: "مراجعة الأسئلة والموافقة" },
    { id: "published", num: "٣", label: "نشر ومشاركة الرابط" },
  ] as const;

  const currentStepIndex = stepsMeta.findIndex((s) => s.id === step);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* شريط المراحل التفاعلي — متجاوب بالكامل مع الموبايل بدون قص النص */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 rounded-2xl border border-border/80 bg-card/70 p-2.5 sm:p-3 backdrop-blur-sm">
        {stepsMeta.map((item, idx) => {
          const isActive = idx === currentStepIndex;
          const isCompleted = idx < currentStepIndex;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 sm:gap-3 rounded-xl px-3 py-2 sm:px-3.5 sm:py-2.5 transition-all ${
                isActive
                  ? "bg-primary/15 border border-primary/40 text-emerald-300 shadow-sm"
                  : isCompleted
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-muted/30 text-muted-foreground"
              }`}
            >
              <span
                className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="size-3.5 sm:size-4" /> : item.num}
              </span>
              <span className="text-xs sm:text-sm font-semibold leading-5">{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* ================= المرحلة ١: إدخال البيانات ورفع الملف ================= */}
      {step === "form" ? (
        <div className="space-y-5 sm:space-y-6">
          {/* بطاقة مساعدة الذكاء الاصطناعي — مدمجة وأنيقة */}
          <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-950/35 via-card to-card overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    <Sparkles className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base leading-6">
                      تجهيز ملف الأسئلة بالذكاء الاصطناعي (ChatGPT / Claude)
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 leading-5">
                      انسخ البرومبت الجاهز وأرفق معه مذكرتك أو ملف الـ PDF ليخرج لك ملف JSON جاهز للرفع.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1 sm:flex-none border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(ARABIC_AI_PROMPT);
                        setCopiedPrompt(true);
                        toast.success("تم نسخ برومبت الذكاء الاصطناعي", {
                          description: "ألصقه الآن في ChatGPT أو Claude مع ملف الأسئلة الخاص بك.",
                        });
                        setTimeout(() => setCopiedPrompt(false), 2500);
                      } catch {
                        toast.error("تعذّر النسخ التلقائي، يمكنك فتح النص ونسخه يدوياً.");
                      }
                    }}
                  >
                    {copiedPrompt ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedPrompt ? "تم نسخ البرومبت" : "نسخ البرومبت الجاهز"}
                  </Button>

                  <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                    <a href="/examples/exam-import-v1.json" download>
                      <FileJson className="size-4 text-emerald-400" />
                      تنزيل ملف JSON مثال
                    </a>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setShowPrompt((prev) => !prev)}
                  >
                    {showPrompt ? (
                      <>
                        <ChevronUp className="size-4" />
                        إخفاء النص
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-4" />
                        عرض النص
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            {showPrompt ? (
              <CardContent className="pt-0 space-y-2">
                <Textarea
                  readOnly
                  dir="rtl"
                  rows={8}
                  value={ARABIC_AI_PROMPT}
                  className="font-mono text-xs leading-6 bg-background/60 border-border/70"
                />
                <p className="text-xs text-muted-foreground">
                  ملاحظة: تأكد أن ملف أسئلتك يحتوي على الإجابات الصحيحة، لأن النظام يرفض أي سؤال بدون إجابة صحيحة محددة.
                </p>
              </CardContent>
            ) : null}
          </Card>

          <form onSubmit={handleCreateClick} className="space-y-6" noValidate>
            {/* القسم الأول: رفع ملف الـ JSON */}
            <Card className="border-border/80 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileJson className="size-5 text-primary" />
                      ملف أسئلة الاختبار (JSON) *
                    </CardTitle>
                    <CardDescription className="mt-1">
                      ارفع ملف الـ JSON أولاً أو املأ بيانات الاختبار؛ لن تضيع بياناتك أبداً أثناء الفحص.
                    </CardDescription>
                  </div>
                  {fileInfo ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <FileCheck2 className="size-3.5 ml-1" />
                      ملف مرفق
                    </Badge>
                  ) : null}
                </div>
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
                    const dropped = e.dataTransfer.files?.[0];
                    void handleFileSelected(dropped);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`group cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : fileInfo
                        ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  {fileInfo ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                        <FileCheck2 className="size-6" />
                      </div>
                      <p className="text-sm font-bold text-foreground">{fileInfo.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(fileInfo.size / 1024).toFixed(1)} كيلوبايت • جاهز للفحص والإنشاء
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                        >
                          تغيير الملف
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFileInfo(null);
                            setJsonIssues([]);
                            setGeneralError(null);
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
                      <p className="text-xs text-muted-foreground">
                        بحد أقصى 1 ميجابايت (حتى 200 سؤال في الاختبار الواحد)
                      </p>
                    </div>
                  )}
                </div>

                {/* عرض تفصيلي للأخطاء إن وجدت في الملف بجانب الـ Toast */}
                {generalError ? (
                  <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 space-y-3">
                    <div className="flex items-start gap-2.5 text-rose-300">
                      <TriangleAlert className="size-5 shrink-0 mt-0.5 text-rose-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold">يوجد خطأ يمنع إنشاء الاختبار</p>
                        <p className="text-xs leading-5 text-rose-200/90">{generalError}</p>
                      </div>
                    </div>

                    {jsonIssues.length > 0 ? (
                      <ul className="max-h-60 space-y-2 overflow-y-auto pr-1 text-xs">
                        {jsonIssues.map((issue, idx) => (
                          <li
                            key={`${issue.path}-${idx}`}
                            className="flex flex-col gap-1 rounded-lg border border-rose-500/20 bg-background/60 p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-rose-300">
                                {issue.questionNumber
                                  ? `السؤال رقم ${issue.questionNumber}`
                                  : "خطأ في هيكل الملف"}
                              </span>
                              <span
                                dir="ltr"
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                              >
                                {issue.path}
                              </span>
                            </div>
                            <p className="text-foreground/90 leading-5">{issue.message}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* القسم الثاني: إعدادات وبيانات الاختبار */}
            <Card className="border-border/80 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">إعدادات وبيانات الاختبار</CardTitle>
                <CardDescription>
                  حدد عنوان الاختبار، مدته الزمنية، وعدد المحاولات المسموحة لكل طالب.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="title">عنوان الاختبار *</Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    value={values.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    placeholder="مثال: اختبار الفيزياء — الباب الأول"
                    className="h-10"
                  />
                  {fieldErrors.title ? (
                    <p className="text-xs font-medium text-rose-400">{fieldErrors.title}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">وصف مختصر (اختياري)</Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={2}
                    value={values.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="وصف يظهر للطالب في صفحة البداية..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions">تعليمات قبل البدء (اختياري)</Label>
                  <Textarea
                    id="instructions"
                    name="instructions"
                    rows={2}
                    value={values.instructions}
                    onChange={(e) => updateField("instructions", e.target.value)}
                    placeholder="مثال: تأكد من استقرار الإنترنت ولا تغلق الصفحة أثناء الحل."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="durationMinutes">مدة الاختبار (بالدقائق) *</Label>
                  <Input
                    id="durationMinutes"
                    name="durationMinutes"
                    type="number"
                    min={1}
                    max={600}
                    required
                    value={values.durationMinutes}
                    onChange={(e) => updateField("durationMinutes", e.target.value)}
                  />
                  {fieldErrors.durationMinutes ? (
                    <p className="text-xs font-medium text-rose-400">{fieldErrors.durationMinutes}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxAttempts">عدد المحاولات المسموحة للطالب *</Label>
                  <Input
                    id="maxAttempts"
                    name="maxAttempts"
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={values.maxAttempts}
                    onChange={(e) => updateField("maxAttempts", e.target.value)}
                  />
                  {fieldErrors.maxAttempts ? (
                    <p className="text-xs font-medium text-rose-400">{fieldErrors.maxAttempts}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resultVisibility">متى يرى الطالب نتيجته؟ *</Label>
                  <Select
                    value={values.resultVisibility}
                    onValueChange={(val: "IMMEDIATE" | "MANUAL") =>
                      updateField("resultVisibility", val)
                    }
                  >
                    <SelectTrigger id="resultVisibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMMEDIATE">فوراً بمجرد تسليم الإجابات</SelectItem>
                      <SelectItem value="MANUAL">يدوياً بعد ضغطي على «إصدار النتائج»</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="studentIdLabel">بيان تعريف الطالب (لمنع تكرار المحاولات)</Label>
                  <Input
                    id="studentIdLabel"
                    name="studentIdLabel"
                    value={values.studentIdLabel}
                    onChange={(e) => updateField("studentIdLabel", e.target.value)}
                    placeholder="رقم التليفون"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startsAt">يبدأ في وقت محدد (اختياري)</Label>
                  <Input
                    id="startsAt"
                    name="startsAt"
                    type="datetime-local"
                    value={values.startsAt}
                    onChange={(e) => updateField("startsAt", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endsAt">ينتهي في وقت محدد (اختياري)</Label>
                  <Input
                    id="endsAt"
                    name="endsAt"
                    type="datetime-local"
                    value={values.endsAt}
                    onChange={(e) => updateField("endsAt", e.target.value)}
                  />
                  {fieldErrors.endsAt ? (
                    <p className="text-xs font-medium text-rose-400">{fieldErrors.endsAt}</p>
                  ) : null}
                </div>

                {/* خيارات الخلط العشوائي كبطاقات تفاعلية */}
                <div className="grid gap-3 sm:grid-cols-2 md:col-span-2 pt-1">
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all ${
                      values.shuffleQuestions
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/70 bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Shuffle className="size-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">خلط ترتيب الأسئلة</p>
                        <p className="text-xs text-muted-foreground">
                          تظهر الأسئلة بترتيب مختلف لكل طالب
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={values.shuffleQuestions}
                      onChange={(e) => updateField("shuffleQuestions", e.target.checked)}
                      className="size-4 accent-primary"
                    />
                  </label>

                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all ${
                      values.shuffleOptions
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/70 bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Shuffle className="size-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">خلط ترتيب الاختيارات</p>
                        <p className="text-xs text-muted-foreground">
                          تغيير ترتيب (أ، ب، ج، د) داخل كل سؤال
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={values.shuffleOptions}
                      onChange={(e) => updateField("shuffleOptions", e.target.checked)}
                      className="size-4 accent-primary"
                    />
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* زر الإنشاء والفحص الواحد */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-lg">
              <div className="text-xs sm:text-sm text-muted-foreground leading-5">
                عند الضغط على <strong className="text-foreground">«إنشاء الاختبار»</strong> سيتم فحص الملف وعرض الأسئلة للمراجعة قبل النشر.
              </div>
              <Button type="submit" size="lg" disabled={isPending} className="w-full sm:w-auto sm:min-w-48 font-bold">
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    جارٍ فحص الملف والبيانات…
                  </>
                ) : (
                  <>
                    <Eye className="size-4" />
                    إنشاء الاختبار
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ================= المرحلة ٢: معاينة الأسئلة وسؤال الموافقة على النشر ================= */}
      {step === "preview" && previewData ? (
        <div className="space-y-5 sm:space-y-6">
          {/* بطاقة قرار النشر العلوية */}
          <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/50 via-card to-card shadow-xl">
            <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    <span>اجتاز ملف الأسئلة جميع فحوصات الجودة بنجاح</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-foreground">
                    هل أنت موافق على نشر الاختبار الآن؟
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-6">
                    راجع كيف تمت برمجة الأسئلة والإجابات الصحيحة بالأسفل. بمجرد الضغط على{" "}
                    <strong className="text-emerald-300">«نعم، موافق — انشر الاختبار الآن»</strong>{" "}
                    سيظهر لك رابط الطلاب مباشرةً لمشاركته.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                  <Button
                    type="button"
                    size="lg"
                    disabled={isPending}
                    onClick={() => handleConfirmPublish(true)}
                    className="w-full sm:w-auto font-bold shadow-lg shadow-emerald-950/50"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        جارٍ النشر وتوليد الرابط…
                      </>
                    ) : (
                      <>
                        <Rocket className="size-4" />
                        نعم، موافق — انشر الاختبار الآن
                      </>
                    )}
                  </Button>

                  <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      disabled={isPending}
                      onClick={() => handleConfirmPublish(false)}
                      className="w-full sm:w-auto text-xs sm:text-sm px-3 sm:px-4"
                    >
                      <Save className="size-4 shrink-0" />
                      حفظ كمسودة فقط
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      disabled={isPending}
                      onClick={() => {
                        setGeneralError(null);
                        setStep("form");
                      }}
                      className="w-full sm:w-auto text-xs sm:text-sm px-3 sm:px-4"
                    >
                      <ArrowRight className="size-4 shrink-0" />
                      تعديل البيانات
                    </Button>
                  </div>
                </div>
              </div>

              {/* تنبيه واضح في حال حدوث أي خطأ أثناء النشر */}
              {generalError ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-rose-200 flex items-start gap-2.5">
                  <TriangleAlert className="size-5 shrink-0 mt-0.5 text-rose-400" />
                  <div className="space-y-1 text-xs sm:text-sm">
                    <p className="font-bold text-rose-300">تعذّر إتمام النشر</p>
                    <p className="leading-5">{generalError}</p>
                  </div>
                </div>
              ) : null}

              {/* ملخص سريع لإعدادات الاختبار المبرمجة */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4 pt-3 border-t border-border/60">
                <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
                  <p className="text-[11px] sm:text-xs text-muted-foreground">عنوان الاختبار</p>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold truncate">{values.title}</p>
                </div>
                <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
                  <p className="text-[11px] sm:text-xs text-muted-foreground">عدد الأسئلة والدرجات</p>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold">
                    {previewData.questions.length} سؤال • {previewData.totalPoints} درجة
                  </p>
                </div>
                <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
                  <p className="text-[11px] sm:text-xs text-muted-foreground">المدة والمحاولات</p>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold">
                    {values.durationMinutes} دقيقة • {values.maxAttempts} محاولة
                  </p>
                </div>
                <div className="rounded-xl bg-background/60 border border-border/60 p-2.5 sm:p-3">
                  <p className="text-[11px] sm:text-xs text-muted-foreground">ظهور النتيجة للطالب</p>
                  <p className="mt-0.5 text-xs sm:text-sm font-bold">
                    {values.resultVisibility === "IMMEDIATE" ? "فوراً بعد التسليم" : "يدوياً بقرار المعلم"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* معاينة تفصيلية لكيفية عرض وبرمجة كل سؤال */}
          <Card className="border-border/80">
            <CardHeader className="border-b border-border/60 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2 leading-6">
                    <HelpCircle className="size-5 shrink-0 text-primary" />
                    <span>
                      معاينة الأسئلة كما ستُعرض وتُصحح تلقائياً ({previewData.questions.length} سؤال)
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs leading-5">
                    الخيارات المميّزة باللون الأخضر هي الإجابات الصحيحة المبرمجة في مفتاح التصحيح (لا يراها الطالب أثناء الحل).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
              {previewData.questions.map((question, index) => {
                const correctSet = new Set(question.correctOptionIds);
                return (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-border/80 bg-background/50 p-3.5 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="inline-flex items-center justify-center rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-emerald-300 border border-primary/30">
                          السؤال {index + 1}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {QUESTION_TYPE_LABELS_AR[question.type]}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">
                          #{question.id}
                        </span>
                      </div>

                      <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {question.points} {question.points === 1 ? "درجة" : "درجات"}
                      </Badge>
                    </div>

                    <p className="text-sm sm:text-base font-medium leading-7 sm:leading-8 text-foreground">
                      {question.text}
                    </p>

                    <div className="grid gap-2">
                      {question.options.map((option) => {
                        const isCorrect = correctSet.has(option.id);
                        return (
                          <div
                            key={option.id}
                            className={`flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2.5 sm:gap-3 rounded-xl border px-3 py-2.5 sm:px-3.5 text-xs sm:text-sm transition-colors ${
                              isCorrect
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                                : "border-border/60 bg-card/60 text-foreground/85"
                            }`}
                          >
                            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                              <span
                                className={`flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold mt-0.5 sm:mt-0 ${
                                  isCorrect
                                    ? "bg-emerald-500 text-slate-950"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {option.id}
                              </span>
                              <span className="leading-6 break-words">{option.text}</span>
                            </div>

                            {isCorrect ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] sm:text-xs font-bold text-emerald-300 mr-8 sm:mr-0">
                                <Check className="size-3.5" />
                                إجابة صحيحة
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {question.explanation ? (
                      <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200 leading-6">
                        <strong className="text-sky-300">الشرح المبرمج: </strong>
                        {question.explanation}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* شريط الموافقة السفلي */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-2xl border border-emerald-500/40 bg-card p-4 shadow-lg">
            <p className="text-xs sm:text-sm font-medium leading-6">
              هل كل الأسئلة والإجابات الصحيحة مضبوطة؟ اضغط موافق لنشر الاختبار وإظهار اللينك فوراً.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setGeneralError(null);
                  setStep("form");
                }}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                رجوع للتعديل
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => handleConfirmPublish(true)}
                disabled={isPending}
                className="w-full sm:w-auto font-bold"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    جارٍ النشر…
                  </>
                ) : (
                  <>
                    <Rocket className="size-4" />
                    نعم، موافق — انشر الاختبار الآن
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ================= المرحلة ٣: شاشة النشر ومشاركة اللينك الفورية ================= */}
      {step === "published" && createdExam ? (
        <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-950/45 via-card to-card shadow-2xl">
          <CardContent className="p-5 sm:p-8 space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="flex size-14 sm:size-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/35 shadow-inner">
                <CheckCircle2 className="size-8 sm:size-9" />
              </div>

              <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1">
                {createdExam.published ? "منشور ومتاح للطلاب الآن" : "تم الحفظ كمسودة"}
              </Badge>

              <h2 className="text-xl sm:text-2xl font-bold text-foreground">{createdExam.title}</h2>
              <p className="max-w-lg text-xs sm:text-sm text-muted-foreground leading-6">
                {createdExam.published
                  ? `تم إنشاء ونشر الاختبار بنجاح (${createdExam.questionCount} سؤال — ${createdExam.totalPoints} درجة). انسخ الرابط التالي وشاركه مع طلابك ليبدأوا الحل فوراً.`
                  : "تم حفظ الاختبار كمسودة. يمكنك فتح لوحة إدارة الاختبار لنشره ومشاركة رابطه متى شئت."}
              </p>
            </div>

            {/* صندوق الرابط المباشر للطالب */}
            <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-border/80 bg-background/80 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Share2 className="size-3.5 text-primary" />
                  رابط دخول الطلاب للاختبار
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  المدة: {values.durationMinutes} دقيقة
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <code
                  dir="ltr"
                  className="flex-1 overflow-x-auto rounded-xl border border-border/70 bg-card px-3.5 py-3 text-xs sm:text-sm font-mono text-emerald-300 select-all break-all sm:break-normal"
                >
                  {createdExam.publicUrl}
                </code>

                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto shrink-0 font-bold"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdExam.publicUrl);
                      setCopiedLink(true);
                      toast.success("تم نسخ رابط الاختبار إلى الحافظة!", {
                        description: "يمكنك الآن لصقه وإرساله للطلاب مباشرة.",
                      });
                      setTimeout(() => setCopiedLink(false), 2500);
                    } catch {
                      toast.error("تعذّر النسخ التلقائي، يمكنك تحديد الرابط ونسخه.");
                    }
                  }}
                >
                  {copiedLink ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiedLink ? "تم نسخ الرابط!" : "نسخ رابط الاختبار"}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-2.5 pt-2">
                <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `اختبار: ${createdExam.title}\nادخل على الرابط التالي لبدء الحل:\n${createdExam.publicUrl}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Share2 className="size-4 text-emerald-400" />
                    مشاركة عبر واتساب
                  </a>
                </Button>

                {createdExam.published ? (
                  <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                    <Link href={`/exam/${createdExam.publicToken}`} target="_blank">
                      <ExternalLink className="size-4" />
                      فتح صفحة الطالب في نافذة جديدة
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3 pt-2 border-t border-border/60">
              <Button asChild size="lg" variant="default" className="w-full sm:w-auto">
                <Link href={`/dashboard/exams/${createdExam.examId}`}>
                  إدارة الاختبار ومتابعة محاولات الطلاب
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/dashboard/exams">العودة لقائمة الاختبارات</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
