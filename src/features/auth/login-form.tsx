"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import { loginAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );

  useEffect(() => {
    if (state?.error) {
      toast.error("تعذّر تسجيل الدخول", {
        description: state.error,
      });
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          dir="ltr"
          required
          placeholder="teacher@example.com"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          className="h-10"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full font-bold" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحقق…
          </>
        ) : (
          <>
            <LogIn className="size-4" />
            تسجيل الدخول
          </>
        )}
      </Button>
    </form>
  );
}
