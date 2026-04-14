import { redirect } from "next/navigation";

/**
 * /admin → redirect to /admin/dashboard
 */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
