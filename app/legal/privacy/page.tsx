export const metadata = {
  title: "プライバシーポリシー | SMILE MATCHING (クロスラン株式会社)",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--color-primary)]">SMILE MATCHING</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--color-text-dark)]">プライバシーポリシー</h1>
        <p className="mt-2 text-xs text-gray-500">最終更新日: 2026年6月2日</p>
      </header>

      <div className="space-y-8 text-sm leading-7 text-[var(--color-text-dark)]">
        <section>
          <h2 className="text-base font-bold mb-2">1. 事業者情報</h2>
          <p>クロスラン株式会社 (以下「当社」) は、当社が運営する人材紹介マッチングシステム「SMILE MATCHING」(以下「本サービス」) における個人情報の取り扱いについて、本プライバシーポリシーを定めます。</p>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            <li>事業者名: クロスラン株式会社 (CROSSLAN Inc.)</li>
            <li>所在地: (御社所在地を記入)</li>
            <li>代表者: (代表者名を記入)</li>
            <li>連絡先: (連絡先メールアドレスを記入)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">2. 取得する情報</h2>
          <p>本サービスは、以下の情報を取得します:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>候補者情報: 氏名、生年月日、国籍、在留資格、職務経歴、連絡先など履歴書記載事項</li>
            <li>パートナー情報: 会社名、担当者名、連絡先、紹介可能分野など</li>
            <li>連絡先 ID: LINE User ID、Facebook Messenger PSID、WhatsApp 番号 (本人および取引先パートナーから提供を受けた場合のみ)</li>
            <li>メッセージ送受信履歴: 本サービスを通じて送受信したメッセージの本文・タイムスタンプ</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">3. 利用目的</h2>
          <p>取得した情報は以下の目的でのみ利用します:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>人材紹介マッチングサービスの提供 (候補者と求人企業のマッチング、推薦活動)</li>
            <li>取引先パートナーへの求人案件情報のご案内</li>
            <li>本サービスの運営・改善・障害対応</li>
            <li>法令に基づく対応</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">4. Facebook Messenger / WhatsApp / LINE プラットフォーム経由のデータ取り扱い</h2>
          <p>本サービスは Meta Platforms, Inc. が提供する Facebook Messenger Platform、WhatsApp Business Platform、および LY Corporation が提供する LINE Messaging API を利用し、取引先パートナーとの業務連絡を行います。これらのプラットフォーム経由で取得する情報および取り扱いは以下の通りです:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>取得する情報</strong>: Page Scoped ID (PSID)、表示名、メッセージ内容、送受信タイムスタンプ</li>
            <li><strong>利用目的</strong>: 取引先パートナーとの求人案件に関する業務連絡</li>
            <li><strong>保存期間</strong>: 取引関係が継続している期間、もしくはパートナーから削除要請があるまで</li>
            <li><strong>第三者提供</strong>: 法令に基づく場合を除き、第三者には一切提供しません</li>
            <li><strong>パートナーの権利</strong>: いつでも当社に連絡することでデータの開示・訂正・削除を請求できます</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">5. 第三者提供</h2>
          <p>当社は、以下の場合を除き、取得した個人情報を第三者に提供しません:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>本人の事前同意を得た場合 (候補者の履歴書を求人企業へ送付する場合等)</li>
            <li>法令に基づく場合</li>
            <li>人の生命・身体・財産の保護のために必要な場合</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">6. 業務委託</h2>
          <p>本サービスの運営にあたり、以下の外部サービスを利用しています。それぞれのサービスは各社のプライバシーポリシーに従って情報を処理します:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Railway (アプリケーションホスティング)</li>
            <li>Google Workspace (ドライブ・スプレッドシート・ドキュメント)</li>
            <li>Meta Platforms (Facebook Messenger / WhatsApp Business)</li>
            <li>LY Corporation (LINE Messaging API)</li>
            <li>Google LLC (Gemini AI API)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">7. 安全管理措置</h2>
          <p>当社は取得した個人情報の漏洩、滅失、毀損の防止のため、合理的な安全管理措置を講じます。具体的には、アクセス権限管理、通信の暗号化 (HTTPS)、データベース接続の認証、社員教育等を実施します。</p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">8. データの開示・訂正・削除請求</h2>
          <p>本人またはパートナーは、当社が保有する自己の個人情報について、開示・訂正・削除を請求できます。下記連絡先までご連絡ください。本人確認の上、合理的な期間内に対応します。</p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">9. お問い合わせ</h2>
          <p>本プライバシーポリシーに関するお問い合わせは、下記までご連絡ください。</p>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            <li>クロスラン株式会社</li>
            <li>メール: (お問い合わせ用メールアドレスを記入)</li>
            <li>電話: (お問い合わせ用電話番号を記入)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2">10. 改定</h2>
          <p>本ポリシーは、法令の変更や本サービスの内容に応じて改定することがあります。重要な改定の場合は本サービス上で告知します。</p>
        </section>
      </div>

      <footer className="mt-12 border-t border-gray-200 pt-4 text-xs text-gray-400">
        © Crosslan Inc. All rights reserved.
      </footer>
    </div>
  );
}
