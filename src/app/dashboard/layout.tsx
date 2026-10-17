import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";

export default async function TeacherLayout({ children }: LayoutProps<"/dashboard">) {
  // حارس على الخادم: كل ما تحت /dashboard محمي.
  const teacher = await requireTeacher();
  if (!teacher) redirect("/login");

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[270px_1fr]">
      <aside className="flex flex-col justify-between border-b border-border/80 bg-sidebar md:sticky md:top-0 md:h-screen md:border-b-0 md:border-l">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-4 md:p-5 border-b border-border/60">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <GraduationCap className="size-5" />
              </div>
              <div>
                <p className="font-bold text-base leading-tight text-foreground">منصة الاختبارات</p>
                <p className="text-[11px] text-muted-foreground">لوحة تحكم المعلم</p>
              </div>
            </Link>

            <form action={logoutAction} className="md:hidden">
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut className="size-4" />
                خروج
              </Button>
            </form>
          </div>

          <SidebarNav />
        </div>

        <div className="hidden md:block p-4 border-t border-border/60">
          <div className="rounded-xl bg-card/80 border border-border/70 p-3 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-emerald-300 font-bold text-sm">
                {teacher.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{teacher.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {teacher.email}
                </p>
              </div>
            </div>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full justify-center text-muted-foreground hover:text-rose-300 hover:border-rose-500/30"
              >
                <LogOut className="size-4" />
                تسجيل الخروج
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
