import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import JapaneseCheckClient from "./JapaneseCheckClient";
import { isDevPreview } from "@/lib/dev-preview";
import { SAMPLE_PERSON } from "@/lib/dev-preview-samples";
import DevPreviewBanner from "@/app/components/DevPreviewBanner";

export const dynamic = "force-dynamic";

/**
 * 日本語チェックの公開ページ (未ログイン、専用トークンで動作)。
 * 入力フォーム (/intake/[token]) とは別のリンクとして候補者へ送る。
 * 受験は 1 回のみ。開始済み / 送信済みのリンクでは受験画面を出さない。
 */
export default async function JapaneseCheckPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (await isDevPreview(token)) {
    return (
      <>
        <DevPreviewBanner />
        <JapaneseCheckClient preview token={token} personName={SAMPLE_PERSON.name} englishName={SAMPLE_PERSON.englishName} attempt="ready" />
      </>
    );
  }
  if (!token || token.length < 8) notFound();

  const person = await prisma.person.findUnique({
    where: { japaneseCheckToken: token },
    select: {
      id: true,
      name: true,
      japaneseCheckStartedAt: true,
      japaneseCheckSubmittedAt: true,
      onboarding: { select: { englishName: true } },
    },
  });
  if (!person) notFound();

  const attempt = person.japaneseCheckSubmittedAt
    ? "submitted"
    : person.japaneseCheckStartedAt
      ? "started"
      : "ready";

  return (
    <JapaneseCheckClient
      token={token}
      personName={person.name}
      englishName={person.onboarding?.englishName ?? null}
      attempt={attempt}
    />
  );
}
