import { Badge } from "@/components/ui/badge";

const STATUS_META = {
  DRAFT: {
    label: "مسودة",
    className: "bg-slate-500/15 text-slate-300 border border-slate-500/30",
  },
  PUBLISHED: {
    label: "منشور ونشط",
    className: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35",
  },
  CLOSED: {
    label: "مغلق",
    className: "bg-amber-500/15 text-amber-300 border border-amber-500/35",
  },
} as const;

export function ExamStatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function ResultVisibilityBadge({
  visibility,
  released,
}: {
  visibility: "IMMEDIATE" | "MANUAL";
  released: boolean;
}) {
  if (visibility === "IMMEDIATE") {
    return (
      <Badge className="bg-sky-500/15 text-sky-300 border border-sky-500/30">
        النتيجة فوراً
      </Badge>
    );
  }
  return released ? (
    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
      النتائج مُصدرة
    </Badge>
  ) : (
    <Badge className="bg-muted text-muted-foreground border border-border">
      النتائج مخفية يدوياً
    </Badge>
  );
}
