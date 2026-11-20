/**
 * 開発者だけが見る「開発中の画面」(/dev) と、候補者・パートナー向け画面のプレビュー。
 *
 * - 開発者は loginId で決める。既定は土田 (tsuchida)。環境変数 DEV_PREVIEW_LOGIN_IDS (カンマ区切り) で差し替えられる
 * - 公開ページは、鍵が DEV_PREVIEW_TOKEN で、かつ開発者がログインしているときだけ、見本のデータで表示する。
 *   送信・保存はしない (画面側で通信を止める。API もこの鍵では該当データが無いので何も書かない)
 * - 他の社員が同じ URL を開いても、ふつうの「見つかりません」になる
 */
import { getCurrentAccount, type CurrentAccount } from "@/lib/auth";

export const DEV_PREVIEW_TOKEN = "dev-preview";

const DEFAULT_DEVELOPER_LOGIN_IDS = ["tsuchida"];

export function developerLoginIds(): string[] {
  const env = process.env.DEV_PREVIEW_LOGIN_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  return env && env.length > 0 ? env : DEFAULT_DEVELOPER_LOGIN_IDS;
}

export function isDeveloper(account: Pick<CurrentAccount, "loginId"> | null | undefined): boolean {
  return !!account && developerLoginIds().includes(account.loginId);
}

/** ログイン中の人が開発者ならそのアカウント、そうでなければ null */
export async function getDeveloperAccount(): Promise<CurrentAccount | null> {
  const account = await getCurrentAccount();
  return isDeveloper(account) ? account : null;
}

/** 公開ページの鍵がプレビュー用で、開いている人が開発者か */
export async function isDevPreview(token: string | null | undefined): Promise<boolean> {
  if (token !== DEV_PREVIEW_TOKEN) return false;
  return !!(await getDeveloperAccount());
}
