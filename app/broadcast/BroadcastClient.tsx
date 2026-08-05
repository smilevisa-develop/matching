"use client";

import { useEffect, useMemo, useState } from "react";
import {
  INTRODUCIBLE_FIELDS,
  INTRODUCIBLE_NATIONALITIES,
  RELATIONSHIP_STATUSES,
  parseCsv,
} from "@/lib/partner-profile";
import {
  URGENT_DEAL_STATUSES,
  expandTemplate,
  PREVIEW_PARTNER,
  type DealForBroadcast,
  type PartnerForBroadcast,
} from "@/lib/broadcast-variables";

type DealJson = Omit<DealForBroadcast, "deadline"> & { deadline: string | null };

type Partner = {
  id: number;
  name: string;
  country: string | null;
  channel: string | null;
  preferredChannels: string | null;
  linkStatus: string;
  contactName: string | null;
  email: string | null;
  lineUserId: string | null;
  lineGroupId: string | null;
  lineGroupName: string | null;
  messengerPsid: string | null;
  whatsappId: string | null;
  relationshipStatus: string | null;
  role: string | null;
  rating: number | null;
  introducibleNationalities: string | null;
  introducibleScope: string | null;
  introducibleFields: string | null;
  introducibleResidenceStatuses: string | null;
};
/** Meta 承認済みテンプレート (一斉連絡で固定使用し、全チャネルの文面もこれで統一) */
type WaTemplateInfo = {
  name: string;
  language: string;
  category: string | null;
  bodyVarCount: number;
  bodyText: string;
  examples: string[];
};

/** 本文の {{1}}{{2}}{{3}} に自動で入る変数 (選択不要・入力不要) */
const AUTO_COUNT = 3;

/** 本文テキストから {{n}} の直前の見出しを推測して、手入力欄のラベルにする */
function deriveLabelFromBody(body: string, n: number): string {
  const idx = body.indexOf(`{{${n}}}`);
  if (idx < 0) return "";
  const before = body.slice(0, idx).replace(/\{\{\d+\}\}/g, "");
  const lines = before
    .split("\n")
    .map((l) => l.replace(/^[■●・\-\s]+/, "").replace(/[：:]\s*$/, "").trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/**
 * 「主な連絡手段」(channel) を基準に、配信可能なパートナーか判定する。
 * 未設定 / 該当 ID 未登録 のパートナーは false (配信対象外)。
 */
function isPartnerReachable(p: Partner): boolean {
  switch (p.channel) {
    case "LINE":
      return Boolean(p.lineGroupId || p.lineUserId);
    case "Messenger":
      return Boolean(p.messengerPsid);
    case "WhatsApp":
      return Boolean(p.whatsappId);
    case "mail":
    case "メール":
    case "Email":
      return Boolean(p.email && /@/.test(p.email));
    default:
      // 未設定 / null / 未知の値
      return false;
  }
}

/** 「主な連絡手段」に応じて配信経路バッジを返す */
function partnerChannelBadge(p: Partner): string {
  switch (p.channel) {
    case "LINE":
      if (p.lineGroupId) return "LINEグループ";
      if (p.lineUserId) return "LINE個人";
      return "LINE 未登録";
    case "Messenger":
      return p.messengerPsid ? "Messenger" : "MSG 未登録";
    case "WhatsApp":
      return p.whatsappId ? "WhatsApp" : "WA 未登録";
    case "mail":
    case "メール":
    case "Email":
      return p.email && /@/.test(p.email) ? "メール" : "メール 未登録";
    default:
      return "未設定";
  }
}
type Group = {
  id: number;
  name: string;
  memberCount: number;
  /** Group 所属パートナーの ID 配列 (preview / 送信整合性のために必須) */
  memberPartnerIds: number[];
};

const ALL = "すべて";

export default function BroadcastClient({
  partners,
  groups,
  openDeals: openDealsRaw,
}: {
  partners: Partner[];
  groups: Group[];
  openDeals: DealJson[];
}) {
  const openDeals: DealForBroadcast[] = useMemo(
    () =>
      openDealsRaw.map((d) => ({
        ...d,
        deadline: d.deadline ? new Date(d.deadline) : null,
      })),
    [openDealsRaw]
  );
  const urgentDeals = useMemo(
    () => openDeals.filter((d) => (URGENT_DEAL_STATUSES as readonly string[]).includes(d.status)),
    [openDeals]
  );
  const [mode, setMode] = useState<"filter" | "group">("filter");
  const [relationshipStatus, setRelationshipStatus] = useState(ALL);
  const [introNationality, setIntroNationality] = useState(ALL);
  const [introField, setIntroField] = useState(ALL);
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("linked");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  /** 固定使用する承認済みテンプレート (取得失敗時は null + note にエラー) */
  const [waTpl, setWaTpl] = useState<WaTemplateInfo | null>(null);
  const [waTplNote, setWaTplNote] = useState<string | null>("テンプレートを読み込み中...");
  /** 手入力変数 ({{4}} 以降) の入力値。全対象パートナー共通 */
  const [waValues, setWaValues] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((d) => {
        const list: WaTemplateInfo[] = d?.ok ? (d.templates ?? []) : [];
        // WhatsApp まで送れる UTILITY を優先。無ければ先頭のものを文面として使う
        // (MARKETING は課金が高いため WhatsApp には送らず LINE / メール のみ)
        const picked = list.find((t) => t.category === "UTILITY") ?? list[0];
        if (!picked) {
          setWaTplNote(
            d?.error ?? d?.note ?? "承認済みテンプレートが見つかりません。設定を確認してください。"
          );
          return;
        }
        setWaTpl(picked);
        setWaTplNote(null);
        setWaValues(Array(Math.max(0, picked.bodyVarCount - AUTO_COUNT)).fill(""));
      })
      .catch(() => setWaTplNote("テンプレートの取得に失敗しました (ネットワークエラー)"));
  }, []);
  /**
   * WhatsApp まで配信できるのは UTILITY テンプレのときだけ。
   * MARKETING は単価が約 6.5 倍 かつ 24h 枠内でも常に課金されるため、
   * 文面は LINE / Messenger / メール にのみ使い、WhatsApp へは送らない。
   */
  const waSendable = waTpl?.category === "UTILITY";
  /** ログイン中アカウントの姓 (WhatsApp テンプレの {{姓}} プレビュー用) */
  const [senderLastName, setSenderLastName] = useState("");
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const name: string = d?.account?.name ?? "";
        setSenderLastName(name.trim().split(/\s+/)[0] ?? "");
      })
      .catch(() => {});
  }, []);

  /** 添付画像: アップロード済みファイル (LINE image message + メール添付に使う) */
  const [attachedImages, setAttachedImages] = useState<
    { id: string; filename: string; url: string; sizeBytes: number }[]
  >([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImagePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const remaining = 4 - attachedImages.length;
    if (remaining <= 0) {
      setUploadError("画像は最大 4 枚までです");
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingImage(true);
    try {
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.ok) {
          setUploadError(`「${file.name}」: ${data.error}`);
          continue;
        }
        setAttachedImages((prev) => [
          ...prev,
          {
            id: data.file.id,
            filename: data.file.filename,
            url: data.file.url,
            sizeBytes: data.file.sizeBytes,
          },
        ]);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "アップロード失敗");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeAttachedImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((f) => f.id !== id));
  };

  const [sending, setSending] = useState(false);
  const [sendingStartedAt, setSendingStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  /** 今月の チャネル別 送信通数 + 上限 (LINE ライトプラン 5000通/月 警告用) */
  const [usage, setUsage] = useState<
    { channel: string; used: number; limit: number | null }[] | null
  >(null);
  const refetchUsage = async () => {
    try {
      const res = await fetch("/api/broadcast/usage");
      const data = await res.json();
      if (data.ok) setUsage(data.usage);
    } catch {
      // 失敗してもサイレント (UI 必須ではない)
    }
  };
  // 初回ロード
  useEffect(() => {
    refetchUsage();
  }, []);

  // plannedUsage / lineUsage / lineAfter / lineOverLimit は targetPartners 確定後にまとめて算出 (下記)
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  /** 送信前の確認モーダル: 押下時の (scheduled) 値を保持 */
  const [confirmingScheduled, setConfirmingScheduled] = useState<boolean | null>(null);
  /** 送信完了後の結果 (success or failure summary) */
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    summary: string;
    failures?: { name: string; channel: string; error: string }[];
  } | null>(null);

  // 送信中の経過秒数カウンタ
  useEffect(() => {
    if (sendingStartedAt === null) {
      setElapsedSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sendingStartedAt) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [sendingStartedAt]);

  // 送信中はページ離脱時に警告
  useEffect(() => {
    if (!sending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "配信中です。ページを閉じると送信が中断する可能性があります。";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sending]);

  const filtered = useMemo(
    () =>
      partners.filter((p) => {
        if (relationshipStatus !== ALL && (p.relationshipStatus ?? "") !== relationshipStatus) return false;
        if (introNationality !== ALL && !parseCsv(p.introducibleNationalities).includes(introNationality)) return false;
        if (introField !== ALL && !parseCsv(p.introducibleFields).includes(introField)) return false;
        // 「主な連絡手段」だけを判定基準にする (未設定は紐づけ済みに入らない)
        const isLinked = isPartnerReachable(p);
        if (linkFilter === "linked" && !isLinked) return false;
        if (linkFilter === "unlinked" && isLinked) return false;
        return true;
      }),
    [partners, relationshipStatus, introNationality, introField, linkFilter]
  );

  /**
   * 実際の送信対象パートナー一覧。
   * filter / group どちらのモードでも、ここで返した配列がそのまま
   * プレビューにも送信 API にも渡る = 不整合ゼロ
   */
  const targetPartners = useMemo<Partner[]>(() => {
    if (mode === "filter") return filtered;
    // group mode: 選択された group のメンバー partner ID をもとに、partners から再構築
    const selectedG = groups.find((g) => g.id === Number(selectedGroup));
    if (!selectedG) return [];
    const ids = new Set(selectedG.memberPartnerIds);
    return partners.filter((p) => ids.has(p.id));
  }, [mode, filtered, groups, selectedGroup, partners]);

  const targetCount = targetPartners.length;

  /** 今回の配信で各チャネル何通使うかを試算
   *  各パートナーは preferredChannels の全チャネルに 同時 送信されるため、
   *  「メール ✓ LINE ✓」の場合 1 パートナーがメール 1 通 + LINE 1〜5 通を消費する。
   *  preferredChannels が空の場合は 従来の channel をフォールバック。
   */
  const plannedUsage = useMemo(() => {
    let line = 0;
    let messenger = 0;
    let email = 0;
    let whatsapp = 0;
    const imgCount = Math.min(attachedImages.length, 4);
    const linePerPartner = 1 + imgCount;
    for (const p of targetPartners) {
      const parsed = (p.preferredChannels ?? "")
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const channels = parsed.length > 0 ? parsed : p.channel ? [p.channel] : [];
      for (const ch of channels) {
        if (ch === "LINE") line += linePerPartner;
        else if (ch === "Messenger") messenger += 1;
        else if (ch === "WhatsApp") {
          if (waSendable) whatsapp += 1;
        }
        else if (ch === "mail" || ch === "メール" || ch === "Email") email += 1;
      }
    }
    return { line, messenger, email, whatsapp };
  }, [targetPartners, attachedImages.length, waSendable]);

  const lineUsage = usage?.find((u) => u.channel === "LINE");
  const lineAfter = (lineUsage?.used ?? 0) + plannedUsage.line;
  const lineOverLimit =
    lineUsage?.limit !== null && lineUsage?.limit !== undefined && lineAfter > lineUsage.limit;

  /** 手入力欄のラベル ({{4}} 以降、本文見出しから導出) と入力例 */
  const manualFields = useMemo(() => {
    if (!waTpl) return [];
    return Array.from({ length: Math.max(0, waTpl.bodyVarCount - AUTO_COUNT) }, (_, i) => {
      const n = AUTO_COUNT + i + 1; // {{n}}
      return {
        n,
        label: deriveLabelFromBody(waTpl.bodyText, n) || `項目 ${n}`,
        example: waTpl.examples[n - 1] ?? "",
      };
    });
  }, [waTpl]);

  /**
   * 送信用メッセージ本文。テンプレ本文の {{n}} を:
   *   {{1}} → {{パートナー名}} / {{2}} → {{担当者名}} (受信者ごとにサーバーで展開)
   *   {{3}} → ログイン中アカウントの姓
   *   {{4}}以降 → ページで入力した値
   * に置換したもの。LINE / Messenger / メール にはこの文面がそのまま届く。
   */
  const messageTemplate = useMemo(() => {
    if (!waTpl) return "";
    return waTpl.bodyText.replace(/\{\{(\d+)\}\}/g, (_, s) => {
      const n = Number(s);
      if (n === 1) return "{{パートナー名}}";
      if (n === 2) return "{{担当者名}}";
      if (n === 3) return senderLastName || "（担当者姓）";
      return waValues[n - AUTO_COUNT - 1] ?? "";
    });
  }, [waTpl, senderLastName, waValues]);

  /** WhatsApp テンプレ送信用の変数指定 ({{n}} 順) */
  const whatsappParams = useMemo(() => {
    if (!waTpl) return [];
    return Array.from({ length: waTpl.bodyVarCount }, (_, i): { auto?: string; value?: string } => {
      if (i === 0) return { auto: "パートナー名" };
      if (i === 1) return { auto: "担当者名" };
      if (i === 2) return { auto: "account:姓" };
      return { value: (waValues[i - AUTO_COUNT] ?? "").trim() };
    });
  }, [waTpl, waValues]);

  /** プレビュー: 1 件目のパートナーで変数展開 (なければダミー) */
  const previewMessage = useMemo(() => {
    if (!messageTemplate) return "";
    const samplePartner: PartnerForBroadcast =
      targetPartners.length > 0
        ? {
            name: targetPartners[0].name,
            contactName: targetPartners[0].contactName,
            country: targetPartners[0].country,
            introducibleFields: targetPartners[0].introducibleFields,
          }
        : PREVIEW_PARTNER;
    return expandTemplate(messageTemplate, { partner: samplePartner, openDeals, urgentDeals });
  }, [messageTemplate, targetPartners, openDeals, urgentDeals]);

  const previewPartnerName =
    targetPartners.length > 0 ? targetPartners[0].name : "サンプル";

  /** 送信前の共通検証。問題があればメッセージを返す */
  const validateSend = (scheduled: boolean): string | null => {
    if (!waTpl) return "テンプレートが読み込めていないため送信できません";
    const emptyField = manualFields.find((f, i) => !(waValues[i] ?? "").trim());
    if (emptyField) return `「${emptyField.label}」が未入力です`;
    if (scheduled && !scheduleDate) return "日時を選択してください";
    if (targetPartners.length === 0) return "送信対象がいません";
    return null;
  };

  /** 「配信」「予約」ボタン → まず確認モーダルを開く */
  const requestSend = (scheduled: boolean) => {
    const err = validateSend(scheduled);
    if (err) {
      alert(err);
      return;
    }
    setConfirmingScheduled(scheduled);
  };

  const handleSend = async (scheduled = false) => {
    const err = validateSend(scheduled);
    if (err) {
      alert(err);
      return;
    }
    // 明示的なホワイトリスト: プレビューに表示されている partner のみ送信対象
    const partnerIds = targetPartners.map((p) => p.id);
    setSending(true);
    setSendingStartedAt(Date.now());
    setSendResult(null);
    // タイムアウト: 1 通あたり ~3 秒 × 件数 + 60 秒バッファ、上限 8 分 (Railway リクエスト上限内)
    const timeoutMs = Math.min(60_000 + partnerIds.length * 3_000, 480_000);
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          mode,
          relationshipStatus: relationshipStatus === ALL ? null : relationshipStatus,
          introNationality: introNationality === ALL ? null : introNationality,
          introField: introField === ALL ? null : introField,
          groupId: selectedGroup ? Number(selectedGroup) : null,
          partnerIds,
          message: messageTemplate,
          emailSubject: emailSubject.trim() || null,
          scheduledAt: scheduled ? scheduleDate : null,
          whatsappTemplateName: waTpl?.name ?? null,
          whatsappTemplateLang: waTpl?.language ?? null,
          whatsappParams,
          fileIds: attachedImages.map((a) => a.id),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const summary = scheduled
          ? `予約完了: ${data.scheduledAt} に ${data.targetCount} 件へ送信予定`
          : `送信完了: ${data.sentCount} 件成功 / ${data.failedCount} 件失敗\n` +
            `内訳: LINEグループ ${data.sentLineGroup ?? 0} / LINE個人 ${data.sentLine ?? 0} / WhatsApp ${data.sentWhatsapp ?? 0} / Messenger ${data.sentMessenger ?? 0} / メール ${data.sentEmail ?? 0}`;
        setSendResult({ ok: true, summary, failures: data.failures ?? [] });
        setShowSchedule(false);
      } else {
        setSendResult({ ok: false, summary: `送信失敗: ${data.error}` });
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? `送信が ${Math.round(timeoutMs / 1000)} 秒以内に完了しませんでした。\nサーバー側で処理が続いている可能性があります。\n二重送信を避けるため、受信側で届いているか確認してから再送してください。`
          : `送信失敗: ${e instanceof Error ? e.message : "unknown error"}`;
      setSendResult({ ok: false, summary: msg });
    } finally {
      clearTimeout(timeoutId);
      setSending(false);
      setSendingStartedAt(null);
      // 送信後に利用通数を再フェッチ (上限警告の更新)
      void refetchUsage();
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 items-stretch gap-6">
      {/* 左: 設定 */}
      <div className="flex flex-col gap-5">
        {/* 送信モード */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">送信対象 (パートナー)</p>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("filter")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === "filter"
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              フィルタ
            </button>
            <button
              onClick={() => setMode("group")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === "group"
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              グループ
            </button>
          </div>

          {mode === "filter" ? (
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="紹介可能 国籍"
                value={introNationality}
                onChange={setIntroNationality}
                options={[ALL, ...INTRODUCIBLE_NATIONALITIES]}
              />
              <Select
                label="紹介可能 分野"
                value={introField}
                onChange={setIntroField}
                options={[ALL, ...INTRODUCIBLE_FIELDS]}
              />
              <Select
                label="関係性"
                value={relationshipStatus}
                onChange={setRelationshipStatus}
                options={[ALL, ...RELATIONSHIP_STATUSES]}
              />
              <Select
                label="連絡先紐づけ"
                value={linkFilter}
                onChange={(v) => setLinkFilter(v as "all" | "linked" | "unlinked")}
                options={["all", "linked", "unlinked"]}
                labels={["すべて", "紐づけ済み", "未紐づけ"]}
              />
            </div>
          ) : (
            <Select
              label="グループを選択"
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={["", ...groups.map((g) => String(g.id))]}
              labels={["選択してください", ...groups.map((g) => `${g.name} (${g.memberCount}社)`)]}
            />
          )}
        </div>

        {/* メッセージ (承認済みテンプレート固定 + 変数入力) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--color-text-dark)]">メッセージ</p>
            {waTpl ? (
              <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D]">
                テンプレート: {waTpl.name}
              </span>
            ) : null}
          </div>

          {waTplNote ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{waTplNote}</p>
          ) : null}

          {waTpl && !waSendable ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-amber-800">
                WhatsApp へは送信されません（LINE・Messenger・メール のみ配信）
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                このテンプレートは {waTpl.category ?? "不明"} カテゴリのため、WhatsApp
                で送ると1通あたりの単価が大きく上がります。文面はそのまま他チャネルへの配信に使用します。
                UTILITY のテンプレートが承認されると、自動的に WhatsApp も配信対象になります。
              </p>
            </div>
          ) : null}

          {waTpl ? (
            <>
              <p className="mb-3 text-[11px] text-gray-500">
                会社名・担当者名・あなたの姓は自動で入ります。以下の項目を入力してください
                {waSendable ? "（全チャネル共通の文面として送信されます）" : "（LINE・メール等への配信文面になります）"}。
              </p>

              {/* 手入力の変数フォーム */}
              {manualFields.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {manualFields.map((f, i) => (
                    <div key={f.n}>
                      <label className="mb-0.5 block text-[11px] font-medium text-[var(--color-text-dark)]">
                        {f.label}
                      </label>
                      <input
                        type="text"
                        value={waValues[i] ?? ""}
                        onChange={(e) =>
                          setWaValues((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={f.example ? `例: ${f.example}` : ""}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              メール件名{" "}
              <span className="text-[10px] text-gray-400">
                (メール経由のパートナーのみに適用。空欄なら「【株式会社CROSLAN-人材事業部】ご連絡」)
              </span>
            </label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="例: 求人のご案内"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            />
          </div>

          {/* 画像添付 (LINE image message + メール添付として送る、最大 4 枚) */}
          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-dark)]">
                  📷 画像添付
                </label>
                <span className="ml-2 text-[10px] text-gray-400">
                  (LINE / メール 両方に添付。JPG / PNG, 1枚 ≤ 5MB, 最大 4 枚)
                </span>
              </div>
              <label
                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                  attachedImages.length >= 4 || uploadingImage
                    ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                    : "border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
                }`}
              >
                {uploadingImage ? "アップロード中..." : "+ 画像を追加"}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  disabled={attachedImages.length >= 4 || uploadingImage}
                  onChange={(e) => {
                    handleImagePick(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
            {uploadError ? (
              <div className="mb-2 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                {uploadError}
              </div>
            ) : null}
            {attachedImages.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {attachedImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative group rounded-lg border border-gray-200 overflow-hidden bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="w-20 h-20 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachedImage(img.id)}
                      title="削除"
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none flex items-center justify-center opacity-80 hover:opacity-100"
                    >
                      ×
                    </button>
                    <p className="text-[10px] text-gray-500 px-1 py-0.5 truncate w-20" title={img.filename}>
                      {img.filename}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">
                画像なし。案件チラシや会社ロゴを添付して LINE / メール で同時配信できます。
              </p>
            )}
          </div>
        </div>

        {/* 送信文面プレビュー (全チャネル共通) */}
        {previewMessage ? (
          <div className="bg-[#FAF9F5] rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--color-text-dark)]">送信文面プレビュー</p>
              <p className="text-[11px] text-gray-500">
                {previewPartnerName} 宛のサンプル
              </p>
            </div>
            <pre className="whitespace-pre-wrap text-[13px] text-[var(--color-text-dark)] font-sans">
              {previewMessage}
            </pre>
          </div>
        ) : null}
      </div>

      {/* 右: プレビュー
          - 外側 wrapper を relative + min-h-0 にして「自分の中身では行高さに影響しない」状態に
          - 中の card は absolute inset-0 で wrapper のサイズちょうど = 左カラムと同じ高さに固定
          - リスト本体は flex-1 min-h-0 overflow-y-auto でカード内スクロール
       */}
      <div className="relative min-h-0">
        <div className="absolute inset-0 flex flex-col bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm font-semibold text-[var(--color-text-dark)] mb-3">対象プレビュー ({targetCount} 社)</p>
        <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
          {targetPartners.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50">
              <div className="w-7 h-7 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                {p.name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-dark)] truncate">{p.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {parseCsv(p.introducibleNationalities).join(", ") || "—"} · {p.relationshipStatus ?? "未設定"}
                  {p.role ? ` · ${p.role}` : ""}
                  {p.rating ? ` · ★${p.rating}` : ""}
                </p>
              </div>
              <span className="ml-auto text-xs text-gray-400 shrink-0">
                {partnerChannelBadge(p)}
              </span>
            </div>
          ))}
          {targetPartners.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              {mode === "group" && !selectedGroup
                ? "グループを選択してください"
                : "対象パートナーがいません"}
            </p>
          )}
        </div>
        </div>
      </div>
      </div>

      {/* グリッド下: ボタン + 予約フォーム (左カラム幅に合わせる) */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-5">
          {/* LINE がライトプランの上限 (5000通/月) を超える見込みのときだけ警告表示 */}
          {usage && lineOverLimit ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900">
              <div className="font-semibold mb-2 flex items-center gap-1.5">
                <span>📊 今月の LINE 利用 + この配信の予測</span>
                <span className="rounded bg-red-600 text-white px-1.5 py-0.5 text-[10px]">
                  LINE 上限超過!
                </span>
              </div>
              <ul className="space-y-1">
                <li className="flex items-center gap-2">
                  <span className="font-medium w-20">LINE:</span>
                  <span className="font-semibold">
                    {lineUsage?.used ?? 0} 通 + 今回 {plannedUsage.line} 通
                    {" = "}
                    <span className="text-red-700 font-bold">{lineAfter}</span>
                    {lineUsage?.limit ? <> / {lineUsage.limit} 通 (ライトプラン)</> : null}
                  </span>
                </li>
              </ul>
              <p className="mt-2 pt-2 border-t border-red-200 text-[11px] leading-relaxed">
                ⚠️ LINE ライトプランの月 5000 通を超えるため、超過分は <strong>送信されません</strong>。
                <br />
                画像 1 枚 = +1 通、4 枚 = +4 通カウントされます。
              </p>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={() => requestSend(false)}
              disabled={sending}
              className="flex-1 bg-[var(--color-primary)] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {sending ? "送信中..." : `この内容で配信 (${targetCount}社)`}
            </button>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="border border-[var(--color-primary)] text-[var(--color-primary)] px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[var(--color-light)]"
            >
              予約
            </button>
          </div>

          {showSchedule && (
            <div className="bg-[var(--color-light)] border border-[var(--color-primary)]/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--color-text-dark)]">送信予約</p>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => requestSend(true)}
                disabled={sending}
                className="w-full bg-[var(--color-primary)] text-white py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                予約確定
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 確認 / 送信中 / 結果 モーダル (3 フェーズ) */}
      {(confirmingScheduled !== null || sending || sendResult) ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          // 送信中は外側クリックでも閉じない
          onClick={(e) => {
            if (sending) return;
            if (e.target === e.currentTarget && sendResult) {
              setSendResult(null);
              setConfirmingScheduled(null);
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[85vh] flex flex-col">
            {/* === Phase 1: 確認 (sending でも sendResult でもない) === */}
            {!sending && !sendResult && confirmingScheduled !== null ? (
              <>
                <div className="border-b border-gray-100 px-6 py-4">
                  <h2 className="text-lg font-bold text-[var(--color-text-dark)]">配信前の最終確認</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    以下 <span className="font-semibold text-[var(--color-text-dark)]">{targetPartners.length} 社</span>{" "}
                    のパートナーへ送信します。これ以外のパートナーには送信されません。
                  </p>
                  {targetPartners.some(
                    (p) =>
                      (p.channel === "mail" || p.channel === "メール" || p.channel === "Email") &&
                      p.email &&
                      /@/.test(p.email),
                  ) ? (
                    <p className="mt-2 text-[11px] text-gray-500">
                      📧 メール件名:{" "}
                      <span className="font-medium text-[var(--color-text-dark)]">
                        {emailSubject.trim() || "【株式会社CROSLAN-人材事業部】ご連絡"}
                      </span>
                    </p>
                  ) : null}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
                  <ul className="divide-y divide-gray-100">
                    {targetPartners.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2">
                        <span className="font-mono text-[11px] text-gray-400 shrink-0">#{p.id}</span>
                        <span className="text-sm text-[var(--color-text-dark)] truncate flex-1">{p.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{partnerChannelBadge(p)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingScheduled(null)}
                    className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const scheduled = confirmingScheduled ?? false;
                      void handleSend(scheduled);
                    }}
                    className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white shadow-md hover:bg-[var(--color-primary-hover)]"
                  >
                    {confirmingScheduled
                      ? `${targetPartners.length} 社へ予約確定`
                      : `${targetPartners.length} 社へ配信実行`}
                  </button>
                </div>
              </>
            ) : null}

            {/* === Phase 2: 送信中 === */}
            {sending ? (
              <div className="px-8 py-10 flex flex-col items-center text-center space-y-5">
                {/* スピナー */}
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-[var(--color-primary)]">
                    {targetPartners.length}
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg font-bold text-[var(--color-text-dark)]">
                    配信中です... ({targetPartners.length} 社)
                  </h2>
                  <p className="text-sm text-gray-600">
                    各パートナーへ順番に送信しています。<br />
                    経過時間: <span className="font-mono font-semibold tabular-nums">{elapsedSeconds} 秒</span>
                  </p>
                </div>

                <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left">
                  <p className="text-xs font-semibold text-amber-800">⚠️ 完了までこの画面を閉じないでください</p>
                  <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
                    <li>・ブラウザの戻る / リロード / タブを閉じる は控えてください</li>
                    <li>・件数が多い場合 数分かかることがあります (目安: 1 社あたり 1〜3 秒)</li>
                    <li>・他の画面 (別タブ) は使って大丈夫ですが、この画面は開いたままで</li>
                  </ul>
                </div>

                <p className="text-[10px] text-gray-400">
                  処理は実行中です。完了すると自動で結果が表示されます。
                </p>
              </div>
            ) : null}

            {/* === Phase 3: 結果表示 === */}
            {sendResult ? (
              <>
                <div className={`border-b border-gray-100 px-6 py-4 ${sendResult.ok ? "bg-emerald-50" : "bg-red-50"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${sendResult.ok ? "bg-emerald-500" : "bg-red-500"} text-white`}>
                      {sendResult.ok ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-[var(--color-text-dark)]">
                        {sendResult.ok ? "配信完了" : "配信失敗"}
                      </h2>
                      <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap font-sans">
                        {sendResult.summary}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* 失敗詳細リスト */}
                {sendResult.failures && sendResult.failures.length > 0 ? (
                  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">
                      失敗詳細 ({sendResult.failures.length} 件):
                    </p>
                    <ul className="divide-y divide-gray-100">
                      {sendResult.failures.map((f, i) => (
                        <li key={i} className="py-2">
                          <p className="text-sm text-[var(--color-text-dark)]">
                            <span className="text-[11px] text-gray-400 mr-2">[{f.channel}]</span>
                            {f.name}
                          </p>
                          <p className="text-[11px] text-red-600 mt-0.5 break-words">{f.error}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSendResult(null);
                      setConfirmingScheduled(null);
                    }}
                    className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white shadow-md hover:bg-[var(--color-primary-hover)]"
                  >
                    閉じる
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
      >
        {options.map((o, i) => (
          <option key={o} value={o}>
            {labels?.[i] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}
