"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");

  const [loginState, loginFormAction, loginPending] = useActionState<
    AuthActionState,
    FormData
  >(loginAction, undefined);

  const [registerState, registerFormAction, registerPending] = useActionState<
    AuthActionState,
    FormData
  >(registerAction, undefined);

  const activeState = mode === "login" ? loginState : registerState;
  const isPending = mode === "login" ? loginPending : registerPending;

  useEffect(() => {
    if (activeState?.error) {
      toast.error(mode === "login" ? "تعذّر تسجيل الدخول" : "تعذّر إنشاء الحساب", {
        description: activeState.error,
      });
    }
  }, [activeState, mode]);

  return (
    <div className="space-y-4">
      {/* مفتاح التبديل بين تسجيل الدخول وإنشاء حساب جديد */}
      <div className="grid grid-cols-2 rounded-xl bg-muted/60 p-1 border border-border/60">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
            mode === "login"
              ? "bg-card text-emerald-400 shadow-sm border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LogIn className="size-3.5" />
          تسجيل الدخول
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
            mode === "register"
              ? "bg-card text-emerald-400 shadow-sm border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus className="size-3.5" />
          إنشاء حساب معلّم
        </button>
      </div>

      <form
        key={mode}
        action={mode === "login" ? loginFormAction : registerFormAction}
        className="space-y-4"
      >
        {mode === "register" ? (
          <div className="space-y-2">
            <Label htmlFor="name">الاسم الكامل</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="أ. محمد أحمد"
              className="h-10"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">البريد الإلكتروني</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            dir="ltr"
            required
            placeholder={mode === "login" ? "admin@exam.online" : "you@example.com"}
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">كلمة المرور</Label>
            {mode === "register" ? (
              <span className="text-[11px] text-muted-foreground">٦ أحرف على الأقل</span>
            ) : null}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            dir="ltr"
            required
            className="h-10"
          />
        </div>

        {activeState?.error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300"
          >
            {activeState.error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full font-bold shadow-lg shadow-primary/10"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              جارٍ المعالجة…
            </>
          ) : mode === "login" ? (
            <>
              <LogIn className="size-4" />
              تسجيل الدخول
            </>
          ) : (
            <>
              <UserPlus className="size-4" />
              إنشاء الحساب والدخول للوحة التحكم
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
