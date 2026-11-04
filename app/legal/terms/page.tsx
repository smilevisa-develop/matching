export const metadata = {
  title: "利用規約 | SMILE MATCHING (クロスラン株式会社)",
};

/** SNS 連携 (TikTok / Meta) のアプリ登録で求められる利用規約。本サービスは社内と取引先パートナー向け */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--color-primary)]">SMILE MATCHING</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--color-text-dark)]">利用規約 / Terms of Service</h1>
        <p className="mt-2 text-xs text-gray-500">最終更新日: 2026年11月4日</p>
      </header>

      <div className="space-y-8 text-sm leading-7 text-[var(--color-text-dark)]">
        <section>
          <h2 className="text-base font-bold mb-2">1. 本サービス</h2>
          <p>
            SMILE MATCHING (以下「本サービス」) は、クロスラン株式会社 (以下「当社」) が運営する人材紹介のための業務システムです。
            当社の社員と、当社と契約した紹介パートナー、および本サービスを通じて当社に情報を提供する候補者が利用します。
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold mb-2">2. SNS との連携</h2>
          <p>
            本サービスは、当社が運営する YouTube / Facebook / Instagram / TikTok のアカウントについて、各社の公式 API を通じて投稿の再生数や
            フォロワー数などの統計情報を取得し、当社の社員だけが見られる画面に表示します。取得した情報を第三者に提供することはありません。
            連携は当社の管理者がいつでも解除できます。
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold mb-2">3. 禁止事項</h2>
          <p>利用者は、本サービスを不正に利用すること、他の利用者の情報を無断で持ち出すこと、本サービスの運営を妨げることをしてはなりません。</p>
        </section>
        <section>
          <h2 className="text-base font-bold mb-2">4. 個人情報</h2>
          <p>
            個人情報の取り扱いは <a href="/legal/privacy" className="text-[var(--color-primary)] underline">プライバシーポリシー</a> に定めます。
          </p>
        </section>
        <section>
          <h2 className="text-base font-bold mb-2">5. 変更</h2>
          <p>当社は必要に応じて本規約を変更できます。変更後の規約は本ページに掲載した時点で効力を持ちます。</p>
        </section>
        <section>
          <h2 className="text-base font-bold mb-2">English summary</h2>
          <p>
            SMILE MATCHING is an internal recruiting system operated by CROSSLAN Inc. It connects to the company&apos;s own YouTube, Facebook,
            Instagram and TikTok accounts through their official APIs to display view counts and follower statistics to company staff only.
            No data obtained through these APIs is shared with third parties, and the connection can be revoked by the administrator at any time.
          </p>
        </section>
      </div>
    </div>
  );
}
