import { describe, expect, it } from "vitest";
import { POST as startRoute } from "@/app/api/public/exams/[token]/attempts/route";
import {
  PATCH as saveRoute,
  POST as submitRoute,
} from "@/app/api/public/exams/[token]/attempts/[accessToken]/route";
import { generateToken } from "@/lib/security/random";
import { createExamWithQuestions, createTeacher, prisma } from "./helpers";

/**
 * كل طلب في هذا الملف يحصل على عنوان IP ظاهري مختلف حتى لا يتأثر
 * اختبار حدّ المعدل ببقيّة الاختبارات (وأن نتحقق فعلياً من أن المفتاح هو IP).
 */
let requestCounter = 0;

function jsonRequest(url: string, body: unknown, method = "POST", ip?: string) {
  requestCounter += 1;
  return new Request(`https://exam.test${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? `10.0.0.${requestCounter % 250}`,
    },
    body: JSON.stringify(body),
  });
}

async function startAttemptViaApi(publicToken: string, body: unknown) {
  const response = await startRoute(jsonRequest(`/api/public/exams/${publicToken}/attempts`, body), {
    params: Promise.resolve({ token: publicToken }),
  });
  return { response, payload: await response.json() };
}

describe("نقطة بدء المحاولة (API)", () => {
  it("يرفض طلباً بدون بيانات صحيحة", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const { response, payload } = await startAttemptViaApi(exam.publicToken, {
      studentName: "ا",
    });

    expect(response.status).toBe(400);
    expect(payload.error).toBeTruthy();
  });

  it("ينشئ محاولة ويعيد الأسئلة بدون مفتاح الإجابات", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const { response, payload } = await startAttemptViaApi(exam.publicToken, {
      studentName: "سارة",
    });

    expect(response.status).toBe(201);
    expect(payload.accessToken).toBeTruthy();
    expect(payload.questions).toHaveLength(3);
    expect(JSON.stringify(payload)).not.toMatch(/isCorrect/);
    expect(payload.earnedScore).toBeUndefined();
  });

  it("يرفض اختبار مسودة على مستوى الـ API", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { status: "DRAFT" });

    const { response } = await startAttemptViaApi(exam.publicToken, { studentName: "سارة" });
    expect(response.status).toBe(409);
  });

  it("يطبّق حدّ المعدل على نقطة البدء", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    let lastStatus = 200;
    // نتجاوز الحد (20 طلباً/دقيقة) من نفس عنوان IP
    for (let index = 0; index < 25; index += 1) {
      const response = await startRoute(
        jsonRequest("/x", { studentName: "سارة" }, "POST", "203.0.113.7"),
        { params: Promise.resolve({ token: exam.publicToken }) },
      );
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("نقاط الحفظ والتسليم (API)", () => {
  it("يحفظ الإجابات ثم يسلّم دون إرجاع الدرجة من نقطة التسليم", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id, { resultVisibility: "IMMEDIATE" });

    const start = await startAttemptViaApi(exam.publicToken, { studentName: "سارة" });
    const accessToken = start.payload.accessToken as string;

    const saveResponse = await saveRoute(
      jsonRequest(
        `/api/public/exams/${exam.publicToken}/attempts/${accessToken}`,
        { answers: [{ questionId: "q1", selectedOptionIds: ["b"] }] },
        "PATCH",
      ),
      { params: Promise.resolve({ token: exam.publicToken, accessToken }) },
    );
    const savePayload = await saveResponse.json();
    expect(saveResponse.status).toBe(200);
    expect(savePayload.finalized).toBe(false);

    const submitResponse = await submitRoute(
      jsonRequest(`/api/public/exams/${exam.publicToken}/attempts/${accessToken}/submit`, {
        answers: [
          { questionId: "q1", selectedOptionIds: ["b"] },
          { questionId: "q2", selectedOptionIds: ["a", "c"] },
          { questionId: "q3", selectedOptionIds: ["true"] },
        ],
      }),
      { params: Promise.resolve({ token: exam.publicToken, accessToken }) },
    );
    const submitPayload = await submitResponse.json();

    expect(submitResponse.status).toBe(200);
    expect(submitPayload.alreadyFinalized).toBe(false);
    // الدرجة لا تُرجع من نقطة التسليم إطلاقاً
    expect(submitPayload.earnedScore).toBeUndefined();
    expect(submitPayload.percentage).toBeUndefined();

    const stored = await prisma.examAttempt.findFirstOrThrow({ where: { examId: exam.id } });
    expect(stored.earnedScore?.toNumber()).toBe(6);
  });

  it("التسليم المتكرر عبر الـ API يعيد النتيجة نفسها بلا تغيير", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);

    const start = await startAttemptViaApi(exam.publicToken, { studentName: "سارة" });
    const accessToken = start.payload.accessToken as string;
    const answers = {
      answers: [{ questionId: "q1", selectedOptionIds: ["b"] }],
    };

    const first = await submitRoute(
      jsonRequest(`/x`, answers),
      { params: Promise.resolve({ token: exam.publicToken, accessToken }) },
    );
    const firstPayload = await first.json();

    const second = await submitRoute(
      jsonRequest(`/x`, answers),
      { params: Promise.resolve({ token: exam.publicToken, accessToken }) },
    );
    const secondPayload = await second.json();

    expect(firstPayload.alreadyFinalized).toBe(false);
    expect(secondPayload.alreadyFinalized).toBe(true);
    expect(secondPayload.submittedAt).toBe(firstPayload.submittedAt);
  });

  it("يرفض رمز وصول خاطئ على مستوى الـ API", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const bogusToken = generateToken(32);

    const response = await saveRoute(
      jsonRequest(`/x`, { answers: [] }, "PATCH"),
      { params: Promise.resolve({ token: exam.publicToken, accessToken: bogusToken }) },
    );

    expect(response.status).toBe(404);
  });

  it("يرفض إجابة بمعرّف سؤال غير موجود", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const start = await startAttemptViaApi(exam.publicToken, { studentName: "سارة" });
    const accessToken = start.payload.accessToken as string;

    const response = await saveRoute(
      jsonRequest(
        `/x`,
        { answers: [{ questionId: "ghost", selectedOptionIds: ["a"] }] },
        "PATCH",
      ),
      { params: Promise.resolve({ token: exam.publicToken, accessToken }) },
    );

    expect(response.status).toBe(400);
  });

  it("يرفض حمولة تالفة (JSON غير صالح)", async () => {
    const teacher = await createTeacher();
    const { exam } = await createExamWithQuestions(teacher.id);
    const start = await startAttemptViaApi(exam.publicToken, { studentName: "سارة" });
    const accessToken = start.payload.accessToken as string;

    const request = new Request("https://exam.test/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const response = await saveRoute(request, {
      params: Promise.resolve({ token: exam.publicToken, accessToken }),
    });

    expect(response.status).toBe(400);
  });
});
