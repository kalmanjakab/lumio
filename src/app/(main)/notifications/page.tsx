import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { NotificationList } from "@/components/notifications/notification-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notif");
  return { title: t("title") };
}

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (viewer.kind !== "user") redirect("/login?next=%2Fnotifications");
  return <NotificationList />;
}
