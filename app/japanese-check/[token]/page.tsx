import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import JapaneseCheckClient from "./JapaneseCheckClient";

export const dynamic = "force-dynamic";

/**
 * 日本語チェックの公開ページ (未ログイン、専用トークンで動作)。
 * 入力フォーム (/intake/[token]) とは別のリンクとして候補者へ送る。
 */
export default async function JapaneseCheckPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const person = await prisma.person.findUnique({
    where: { japaneseCheckToken: token },
    select: {
      id: true,
      name: true,
      onboarding: { select: { englishName: true } },
      japaneseCheck: { select: { id: true } },
    },
  });
  if (!person) notFound();

  return (
    <JapaneseCheckClient
      token={token}
      personName={person.name}
      englishName={person.onboarding?.englishName ?? null}
      alreadyDone={Boolean(person.japaneseCheck)}
    />
  );
}
