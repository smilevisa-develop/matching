/**
 * 開発者用プレビュー (lib/dev-preview.ts) で使う見本のデータ。実在の人・会社ではない。
 */
import type { ChecklistItemView } from "@/app/checklist/[token]/ChecklistView";
import type { DocumentDeliveryItem } from "@/lib/company-document";

export const SAMPLE_PERSON = {
  name: "グエン・ヴァン・アン",
  englishName: "NGUYEN VAN AN",
  residenceStatus: "特定技能1号",
};

export const SAMPLE_COMPANY_NAME = "株式会社サンプル食品";

export const SAMPLE_INTAKE_CUSTOM_QUESTIONS = [
  { key: "sample_q1", label: "日本で一番やってみたいことは何ですか", required: false, type: "textarea" as const },
];

export const SAMPLE_CHECKLIST_ITEMS: ChecklistItemView[] = [
  { key: "job", jaLabel: "仕事の内容", jaValue: "食品工場での製造ライン作業 (弁当の盛り付け・包装)", trLabel: "Nội dung công việc", trValue: "Làm việc trên dây chuyền sản xuất tại nhà máy thực phẩm (bày cơm hộp, đóng gói)" },
  { key: "place", jaLabel: "働く場所", jaValue: "愛知県名古屋市", trLabel: "Nơi làm việc", trValue: "Thành phố Nagoya, tỉnh Aichi" },
  { key: "pay", jaLabel: "月給 (総支給)", jaValue: "220,000円", trLabel: "Lương tháng (tổng)", trValue: "220.000 yên" },
  { key: "hours", jaLabel: "勤務時間", jaValue: "8:00〜17:00 (休憩60分)", trLabel: "Giờ làm việc", trValue: "8:00–17:00 (nghỉ 60 phút)" },
  { key: "housing", jaLabel: "住まい", jaValue: "会社の寮 (家賃 月25,000円)", trLabel: "Nhà ở", trValue: "Ký túc xá công ty (tiền nhà 25.000 yên/tháng)" },
];

export const SAMPLE_DOCUMENT_TITLE = "入社前のご案内";

export const SAMPLE_DOCUMENT_ITEMS: DocumentDeliveryItem[] = [
  {
    key: "philosophy",
    kind: "read",
    title: "私たちの考え方",
    body: "お客様においしく安全な食事を届けることを一番に考えています。",
    trTitle: "Suy nghĩ của chúng tôi",
    trBody: "Chúng tôi luôn đặt việc mang đến bữa ăn ngon và an toàn cho khách hàng lên hàng đầu.",
  },
  {
    key: "uniform",
    kind: "check",
    title: "制服と身だしなみ",
    body: "工場に入る前に、制服・帽子・マスクを着けます。爪は短く切り、アクセサリーは外します。",
    trTitle: "Đồng phục và vệ sinh cá nhân",
    trBody: "Trước khi vào nhà máy, mặc đồng phục, đội mũ và đeo khẩu trang. Cắt móng tay ngắn và tháo trang sức.",
  },
  {
    key: "absence",
    kind: "check",
    title: "休むときの連絡",
    body: "休むときは、始業の1時間前までにリーダーへ電話で連絡します。",
    trTitle: "Liên lạc khi nghỉ",
    trBody: "Khi nghỉ, gọi điện cho trưởng nhóm trước giờ làm việc 1 tiếng.",
  },
];
