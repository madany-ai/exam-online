import { redirect } from "next/navigation";
import { getCurrentTeacher } from "@/lib/auth/session";

export default async function Home() {
  const teacher = await getCurrentTeacher();
  redirect(teacher ? "/dashboard" : "/login");
}
