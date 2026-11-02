# smile-matching

社内のグローバル人材事業部向けに、外国人候補者・企業・海外紹介パートナーとの連絡や日程調整を行う Next.js アプリです。運用は Railway 上の Next.js と Railway Postgres を前提にしています。

## Environment Variables

アプリ側には次の環境変数が必要です。

```env
DATABASE_URL="postgresql://..."
LINE_CHANNEL_ACCESS_TOKEN="..."
LINE_CHANNEL_SECRET="..."
LINE_TEST_USER_ID="U..."
```

`DATABASE_URL` が無い場合でも、Railway が次の分割済み環境変数を渡していれば接続できます。

```env
PGHOST="..."
PGPORT="..."
PGUSER="..."
PGPASSWORD="..."
PGDATABASE="..."
```

## Railway Setup

1. Railway で Postgres を追加する
2. Next.js サービスをその Postgres に接続する
3. Next.js サービス側に `LINE_CHANNEL_ACCESS_TOKEN` など必要な連絡用環境変数を設定する
4. デプロイする

Docker 起動時に `prisma migrate deploy` が実行され、その後アプリが起動します。

## Local Development

```bash
npm install
npm run dev
```

ローカルでも Railway Postgres を使う場合は、同じ `DATABASE_URL` を `.env` に入れてください。

## 今後の方針

- 最小ログイン
- 社内3名 + 管理者1名での利用
- 管理者は各アカウントへ代理ログインできる
- カレンダーやテンプレートは各アカウントごとに持てる
