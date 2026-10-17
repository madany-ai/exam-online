import { redirect } from "next/navigation";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { getCurrentTeacher } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = { title: "تسجيل الدخول — منصة الاختبارات" };

export default async function LoginPage() {
  if (await getCurrentTeacher()) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/35 via-background to-background" />

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/30 shadow-lg">
            <GraduationCap className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">منصة الاختبارات الإلكترونية</h1>
          <p className="text-sm text-muted-foreground">
            بوابة المعلم لإدارة الاختبارات ومتابعة نتائج الطلاب
          </p>
        </div>

        <Card className="border-border/80 bg-card/90 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">بوابة المعلمين</CardTitle>
            <CardDescription>
              سجّل دخولك أو أنشئ حساباً جديداً لإدارة الاختبارات ومتابعة النتائج.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LoginForm />
            <div className="flex items-center justify-center gap-1.5 border-t border-border/60 pt-4 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              <span>منصة اختبارات ذكية ومحمية للمعلمين والطلاب</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
