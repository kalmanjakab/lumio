import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/server/auth";
import { getDueForUser } from "@/lib/server/review";
import { GlobalReview } from "@/components/modes/global-review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("review");
  return { title: t("todayTitle") };
}

/** „Mai ismétlés”: minden esedékes kártya az összes készletből. */
export default async function TodayReviewPage() {
  const viewer = await getViewer();
  const due = viewer.kind === "user" ? await getDueForUser(viewer.user.id, 200) : null;
  return <GlobalReview serverItems={due} />;
}
