import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ملاحظة: قالب create-next-app يفعّل cacheComponents/partialPrefetching.
  // تعطيلهما هنا مقصود: تطبيقنا يعتمد على جلسات (cookies) وبيانات حيّة
  // (محاولات students) في كل طلب، والتخزين المؤقت التلقائي يزيد تعقيد
  // صحّة الصلاحيات دون فائدة حقيقية لحجم هذا المشروع.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
