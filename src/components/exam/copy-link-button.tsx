"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** نسخ ومشاركة رابط الاختبار العام للحافظة. */
export function CopyLinkButton({
  url,
  examTitle,
}: {
  url: string;
  examTitle?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <code
          dir="ltr"
          className="max-w-full flex-1 overflow-x-auto rounded-xl border border-border/80 bg-background/80 px-3.5 py-2.5 text-xs sm:text-sm font-mono text-emerald-300 select-all break-all sm:break-normal"
        >
          {url}
        </code>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 sm:flex-none font-bold"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                toast.success("تم نسخ رابط الاختبار إلى الحافظة!", {
                  description: "يمكنك الآن إرساله للطلاب لبدء الحل.",
                });
                setTimeout(() => setCopied(false), 2000);
              } catch {
                toast.error("تعذّر النسخ التلقائي، انسخ الرابط يدوياً.");
                setCopied(false);
              }
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "تم النسخ!" : "نسخ الرابط"}
          </Button>

          <Button asChild variant="secondary" size="sm" className="flex-1 sm:flex-none">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                examTitle
                  ? `اختبار: ${examTitle}\nادخل على الرابط التالي لبدء الحل:\n${url}`
                  : `رابط الاختبار:\n${url}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Share2 className="size-4 text-emerald-400" />
              واتساب
            </a>
          </Button>

          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              فتح الرابط
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
