"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/exams", label: "الاختبارات", icon: FileText, exact: false },
  { href: "/dashboard/exams/new", label: "إنشاء اختبار جديد", icon: PlusCircle, exact: true },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-3 gap-1.5 px-3 pb-3 md:flex md:flex-col md:px-4 md:space-y-1">
      {navItems.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href) && pathname !== "/dashboard/exams/new";

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-center md:justify-start gap-1.5 md:gap-3 rounded-xl px-2 py-2 md:px-3.5 md:py-2.5 text-xs md:text-sm font-medium transition-all text-center md:text-right",
              isActive
                ? "bg-primary/15 text-emerald-300 border border-primary/35 shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

