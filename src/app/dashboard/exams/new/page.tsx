import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { NewExamForm } from "@/components/exam/new-exam-form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "إنشاء اختبار جديد" };

export default async function NewExamPage() {
  await requireTeacher();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            معالج الإنشاء السريع
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">إنشاء اختبار جديد</h1>
          <p className="text-sm text-muted-foreground">
            ارفع ملف الأسئلة (JSON)، راجع برمجة الأسئلة والإجابات، ثم انشر الاختبار واحصل على رابط الطلاب فوراً.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/exams">
            <ArrowRight className="size-4" />
            قائمة الاختبارات
          </Link>
        </Button>
      </div>

      <NewExamForm />
    </div>
  );
}
