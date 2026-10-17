import { notFound, redirect } from "next/navigation";
import { resumeAttempt } from "@/features/attempts/service";
import { isAppError } from "@/lib/errors";
import { ExamRunner } from "@/components/student/exam-runner";

export const metadata = { title: "أداء الاختبار" };

export default async function AttemptPage({
  params,
}: PageProps<"/exam/[token]/attempt/[accessToken]">) {
  const { token, accessToken } = await params;

  let data: Awaited<ReturnType<typeof resumeAttempt>>;
  try {
    data = await resumeAttempt(token, accessToken);
  } catch (error) {
    if (isAppError(error)) notFound();
    throw error;
  }

  // محاولة مُسلّمة مسبقاً: نعيد التوجيه لصفحة النتيجة بدل عرض الأسئلة مجدداً.
  if (data.status === "SUBMITTED") {
    redirect(`/exam/${token}/result/${accessToken}`);
  }

  return (
    <ExamRunner
      examToken={token}
      accessToken={accessToken}
      questions={data.questions}
      initialAnswers={data.answers}
      expiresAt={data.expiresAt.toISOString()}
    />
  );
}
