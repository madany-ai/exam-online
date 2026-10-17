"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteExamAction, type ExamActionState } from "@/features/exams/actions";

/**
 * حذف اختبار: يتطلّب كتابة عنوان الاختبار يدوياً للتأكيد،
 * ويعرض بوضوح عدد المحاولات التي ستُحذف نهائياً.
 */
export function DeleteExamDialog({
  examId,
  title,
  attemptCount,
}: {
  examId: string;
  title: string;
  attemptCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState<ExamActionState, FormData>(
    deleteExamAction,
    { status: "idle" },
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="size-4" />
          حذف الاختبار
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>حذف «{title}» نهائياً؟</AlertDialogTitle>
          <AlertDialogDescription>
            سيُحذف الاختبار مع كل أسئلته وخياراته
            {attemptCount > 0
              ? ` و${attemptCount} محاولة طلاب (بما فيها درجاتهم). لا يمكن التراجع.`
              : ". لا يمكن التراجع."}
            <br />
            إن كانت لديك محاولات طلاب وتريد الاحتفاظ بسجلها، أغلق الاختبار بدل حذفه.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="examId" value={examId} />
          <div className="space-y-2">
            <Label htmlFor="confirmTitle">
              اكتب عنوان الاختبار للتأكيد: <span className="font-semibold">{title}</span>
            </Label>
            <Input
              id="confirmTitle"
              name="confirmTitle"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={title}
              required
            />
          </div>

          {state.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel type="button">إلغاء</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || confirmation.trim() !== title.trim()}
              >
                {pending ? "جارٍ الحذف…" : "حذف نهائي"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
