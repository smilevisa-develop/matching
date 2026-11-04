import { requireCurrentAccount } from "@/lib/auth";
import { getYoutubeStats, youtubeConfigured, type YoutubeChannel } from "@/lib/sns-youtube";

export const dynamic = "force-dynamic";

/**
 * SNS の数字。候補者向けに投稿している動画 (YouTube / Facebook / Instagram / TikTok) の再生数などを 1 か所で見る。
 * 2026/11: まず YouTube。Facebook / Instagram は Meta のトークン、TikTok は開発者審査のあとに足す
 */
export default async function SnsPage() {
  await requireCurrentAccount();
  const yt = youtubeConfigured() ? await getYoutubeStats() : null;

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-dark)]">SNS</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dark)]">候補者向けに投稿している動画の数字。1 時間ごとに更新</p>
      </div>

      {!yt ? (
        <Card title="YouTube">
          <p className="text-sm text-[var(--color-text-dark)]">まだ接続していません (API キーとチャンネルの設定が要ります)</p>
        </Card>
      ) : (
        <>
          {yt.errors.map((e) => (
            <p key={e.id} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {e.id}: {e.error}
            </p>
          ))}
          {yt.channels.map((c) => (
            <ChannelCard key={c.id} channel={c} />
          ))}
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Facebook">
          <p className="text-sm text-[var(--color-text-dark)]">準備中 (Meta のページトークンを設定したら出ます)</p>
        </Card>
        <Card title="Instagram">
          <p className="text-sm text-[var(--color-text-dark)]">準備中 (Facebook と同じトークンで出ます)</p>
        </Card>
        <Card title="TikTok">
          <p className="text-sm text-[var(--color-text-dark)]">準備中 (TikTok の開発者審査のあと)</p>
        </Card>
      </div>
    </div>
  );
}

function ChannelCard({ channel: c }: { channel: YoutubeChannel }) {
  const fmt = (v: number) => v.toLocaleString("ja-JP");
  const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "");
  return (
    <Card
      title={
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
          YouTube ・ {c.title}
          {c.handle ? <span className="ml-2 text-sm font-normal">{c.handle}</span> : null}
        </a>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="登録者" value={fmt(c.subscribers)} />
        <Stat label="総再生数" value={fmt(c.totalViews)} />
        <Stat label="動画数" value={fmt(c.videoCount)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-light)] text-left text-xs font-semibold text-[var(--color-text-dark)]">
              <th className="px-3 py-2">動画</th>
              <th className="px-3 py-2 w-28">公開日</th>
              <th className="px-3 py-2 w-24 text-right">再生</th>
              <th className="px-3 py-2 w-20 text-right">高評価</th>
              <th className="px-3 py-2 w-20 text-right">コメント</th>
            </tr>
          </thead>
          <tbody>
            {c.videos.map((v) => (
              <tr key={v.id} className="border-t border-gray-100">
                <td className="px-3 py-2">
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                    {v.title}
                  </a>
                </td>
                <td className="px-3 py-2 tabular-nums text-[var(--color-text-dark)]">{day(v.publishedAt)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-text-dark)]">{fmt(v.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.likes)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-dark)]">{fmt(v.comments)}</td>
              </tr>
            ))}
            {c.videos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-sm text-[var(--color-text-dark)]">
                  動画がありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--color-text-dark)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-light)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-dark)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-dark)]">{value}</p>
    </div>
  );
}
