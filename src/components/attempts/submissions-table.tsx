import Link from "next/link";
import { decimalToNumber } from "@/features/exams/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AttemptRow = {
  id: string;
  studentName: string;
  studentIdentifier: string | null;
  status: "IN_PROGRESS" | "SUBMITTED";
  startedAt: Date;
  submittedAt: Date | null;
  earnedScore: { toNumber(): number } | null;
  maximumScore: { toNumber(): number } | null;
  percentage: { toNumber(): number } | null;
};

/** جدول محاولات الطلاب — معروضة داخل لوحة المعلم المحمية فقط. */
export function SubmissionsTable({
  examId,
  attempts,
  showIdentifier,
  resultsReleased,
  resultVisibility,
}: {
  examId: string;
  attempts: AttemptRow[];
  showIdentifier: boolean;
  resultsReleased: boolean;
  resultVisibility: "IMMEDIATE" | "MANUAL";
}) {
  if (attempts.length === 0) {
    return (
      <Card className="border-border/80">
        <CardContent className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <p className="font-bold text-foreground text-base">لا توجد محاولات بعد</p>
          <p className="mt-1">شارك رابط الاختبار مع الطلاب لبدء المحاولات.</p>
        </CardContent>
      </Card>
    );
  }

  const canSeeScores = resultVisibility === "IMMEDIATE" || resultsReleased;

  return (
    <Card className="border-border/80 overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>الطالب</TableHead>
                {showIdentifier ? <TableHead>المعرّف</TableHead> : null}
                <TableHead>الحالة</TableHead>
                <TableHead>البداية</TableHead>
                <TableHead>التسليم</TableHead>
                <TableHead className="text-left">الدرجة</TableHead>
                <TableHead className="text-left">النسبة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt) => {
                const percentage = decimalToNumber(attempt.percentage);
                return (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-semibold">{attempt.studentName}</TableCell>
                    {showIdentifier ? (
                      <TableCell dir="ltr" className="text-left font-mono text-xs text-muted-foreground">
                        {attempt.studentIdentifier ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {attempt.status === "SUBMITTED" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          مُسلّم
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          جارٍ الحل
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {attempt.startedAt.toLocaleString("ar")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {attempt.submittedAt ? attempt.submittedAt.toLocaleString("ar") : "—"}
                    </TableCell>
                    <TableCell className="text-left font-bold tabular-nums">
                      {attempt.status === "SUBMITTED" && canSeeScores
                        ? `${decimalToNumber(attempt.earnedScore) ?? 0} / ${
                            decimalToNumber(attempt.maximumScore) ?? 0
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-left font-bold tabular-nums text-emerald-300">
                      {attempt.status === "SUBMITTED" && canSeeScores && percentage !== null
                        ? `${percentage}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/exams/${examId}/submissions/${attempt.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        عرض الإجابات
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
