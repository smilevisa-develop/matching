/**
 * 案件ボード (パートナー向け /board) の画面の言葉。日本語・英語・ベトナム語・インドネシア語。
 * 画面のどこからでも読める (DB や cookie は使わない)。
 *
 * 言語は右上の切り替えで選ぶ (cookie board_lang)。選んでいなければ、パートナーの国から決める
 * (ベトナム → ベトナム語、インドネシア → インドネシア語、日本 → 日本語、それ以外 → 英語)。
 * 案件の中身 (社員が書いた日本語) の訳は lib/board-translate.ts が作る。
 */

export const BOARD_LANGS = ["ja", "en", "vi", "id"] as const;
export type BoardLang = (typeof BOARD_LANGS)[number];
export const BOARD_LANG_COOKIE = "board_lang";

/** 切り替えに出す名前 (その言語での呼び方) */
export const BOARD_LANG_NAMES: Record<BoardLang, string> = {
  ja: "日本語",
  en: "English",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
};

export function isBoardLang(v: unknown): v is BoardLang {
  return typeof v === "string" && (BOARD_LANGS as readonly string[]).includes(v);
}

/** パートナーの国から最初の言語を決める */
export function langForCountry(country: string | null | undefined): BoardLang {
  const c = (country ?? "").trim();
  if (!c) return "en";
  if (/ベトナム|vietnam|việt/i.test(c)) return "vi";
  if (/インドネシア|indonesia/i.test(c)) return "id";
  if (/日本|japan/i.test(c)) return "ja";
  return "en";
}

type Dict = Record<BoardLang, string>;

const UI = {
  headerTitle: { ja: "案件ボード", en: "Job Board", vi: "Bảng việc làm", id: "Papan Lowongan" },
  language: { ja: "言語", en: "Language", vi: "Ngôn ngữ", id: "Bahasa" },

  // 入れないとき
  signedOutInvalidTitle: {
    ja: "このリンクは使えません",
    en: "This link is no longer valid",
    vi: "Đường link này không còn dùng được",
    id: "Tautan ini sudah tidak berlaku",
  },
  signedOutTitle: {
    ja: "専用リンクから開いてください",
    en: "Please open the board from your personal link",
    vi: "Vui lòng mở bảng việc làm từ đường link riêng của quý công ty",
    id: "Silakan buka papan ini dari tautan khusus Anda",
  },
  signedOutBody: {
    ja: "案件ボードは、登録済みのパートナー様だけが見られます。リンクが分からない場合は、スマイルリンクの担当者にご連絡ください。",
    en: "The board is for registered partners only. Please contact your SMILELINK representative for your link.",
    vi: "Bảng việc làm chỉ dành cho đối tác đã đăng ký. Nếu không có đường link, vui lòng liên hệ người phụ trách của SMILELINK.",
    id: "Papan ini hanya untuk mitra terdaftar. Jika Anda tidak memiliki tautan, silakan hubungi petugas SMILELINK.",
  },

  // 一覧
  tabJobs: { ja: "案件", en: "Jobs", vi: "Việc làm", id: "Lowongan" },
  tabMine: { ja: "推薦した人", en: "My candidates", vi: "Ứng viên đã giới thiệu", id: "Kandidat saya" },
  field: { ja: "分野", en: "Field", vi: "Ngành", id: "Bidang" },
  all: { ja: "すべて", en: "All", vi: "Tất cả", id: "Semua" },
  openOnly: { ja: "推薦できる案件だけ", en: "Open jobs only", vi: "Chỉ việc còn nhận", id: "Hanya yang masih dibuka" },
  matchOnly: {
    ja: "貴社の分野に合う案件だけ",
    en: "Matches your fields",
    vi: "Chỉ việc hợp ngành của quý công ty",
    id: "Sesuai bidang Anda",
  },
  countJobs: { ja: "{n} 件", en: "{n} jobs", vi: "{n} việc", id: "{n} lowongan" },
  emptyNone: {
    ja: "いま公開中の案件はありません。新しい案件が出たらお知らせします。",
    en: "No jobs are open right now. We will let you know when new jobs are posted.",
    vi: "Hiện chưa có việc nào đang tuyển. Chúng tôi sẽ thông báo khi có việc mới.",
    id: "Saat ini belum ada lowongan. Kami akan memberi tahu jika ada lowongan baru.",
  },
  emptyFiltered: {
    ja: "この条件に合う案件はありません。条件を外すと {n} 件の案件が見られます。",
    en: "No jobs match these filters. Clear the filters to see all {n} jobs.",
    vi: "Không có việc nào khớp bộ lọc. Bỏ bộ lọc để xem tất cả {n} việc.",
    id: "Tidak ada lowongan yang cocok. Hapus filter untuk melihat semua {n} lowongan.",
  },
  yourField: { ja: "貴社の分野", en: "Your field", vi: "Ngành của quý công ty", id: "Bidang Anda" },
  area: { ja: "勤務地", en: "Work area", vi: "Khu vực làm việc", id: "Lokasi kerja" },
  monthly: { ja: "月給", en: "Monthly pay", vi: "Lương tháng", id: "Gaji bulanan" },
  fee: { ja: "紹介料", en: "Your fee", vi: "Phí giới thiệu", id: "Biaya rujukan" },
  slots: { ja: "推薦枠", en: "Slots", vi: "Suất giới thiệu", id: "Kuota" },
  slotsValue: {
    ja: "貴社 {a}/{b} ・ 全体 {c}/{d}",
    en: "You {a}/{b} · Total {c}/{d}",
    vi: "Quý công ty {a}/{b} · Tổng {c}/{d}",
    id: "Anda {a}/{b} · Total {c}/{d}",
  },
  deadline: { ja: "締切", en: "Deadline", vi: "Hạn chót", id: "Batas waktu" },
  updated: { ja: "更新", en: "Updated", vi: "Cập nhật", id: "Diperbarui" },
  qaCount: { ja: "Q&A {n} 件", en: "Q&A {n}", vi: "Hỏi đáp {n}", id: "Tanya jawab {n}" },
  noRecs: {
    ja: "まだ推薦していません。案件ページから推薦できます。",
    en: "You have not recommended anyone yet. You can recommend from a job page.",
    vi: "Quý công ty chưa giới thiệu ai. Có thể giới thiệu từ trang việc làm.",
    id: "Anda belum merekomendasikan siapa pun. Anda bisa merekomendasikan dari halaman lowongan.",
  },
  thCandidate: { ja: "候補者", en: "Candidate", vi: "Ứng viên", id: "Kandidat" },
  thJob: { ja: "案件", en: "Job", vi: "Việc làm", id: "Lowongan" },
  thStatus: { ja: "状況", en: "Status", vi: "Tình trạng", id: "Status" },
  thSent: { ja: "推薦日", en: "Sent", vi: "Ngày giới thiệu", id: "Tanggal dikirim" },
  badgeClosed: { ja: "締切", en: "Closed", vi: "Đã đóng", id: "Ditutup" },
  badgeFull: { ja: "満枠", en: "Full", vi: "Đã đủ", id: "Penuh" },
  badgeOpen: { ja: "募集中", en: "Open", vi: "Đang tuyển", id: "Dibuka" },

  // 案件のページ
  back: { ja: "← 案件一覧", en: "← All jobs", vi: "← Tất cả việc làm", id: "← Semua lowongan" },
  jobNo: { ja: "案件番号 {id}", en: "Job #{id}", vi: "Mã việc {id}", id: "Lowongan #{id}" },
  posted: { ja: "掲載", en: "Posted", vi: "Đăng", id: "Diterbitkan" },
  lastUpdated: { ja: "最終更新", en: "Last updated", vi: "Cập nhật lần cuối", id: "Terakhir diperbarui" },
  conditions: { ja: "条件", en: "Conditions", vi: "Điều kiện", id: "Ketentuan" },
  areaRegion: { ja: "勤務地の地域", en: "Work area", vi: "Khu vực làm việc", id: "Wilayah kerja" },
  openings: { ja: "募集人数", en: "Openings", vi: "Số lượng tuyển", id: "Jumlah lowongan" },
  openingsValue: { ja: "{n} 名", en: "{n}", vi: "{n} người", id: "{n} orang" },
  jobChange: {
    ja: "業務の変更の範囲",
    en: "Scope of job changes",
    vi: "Phạm vi thay đổi công việc",
    id: "Cakupan perubahan pekerjaan",
  },
  placeChange: {
    ja: "就業場所の変更の範囲",
    en: "Scope of workplace changes",
    vi: "Phạm vi thay đổi nơi làm việc",
    id: "Cakupan perubahan tempat kerja",
  },
  renewal: {
    ja: "契約更新の上限",
    en: "Contract renewal limit",
    vi: "Giới hạn gia hạn hợp đồng",
    id: "Batas perpanjangan kontrak",
  },
  detailsPreparing: {
    ja: "詳しい条件は準備中です。質問からお問い合わせください。",
    en: "Details are being prepared. Please ask a question below.",
    vi: "Điều kiện chi tiết đang được chuẩn bị. Vui lòng đặt câu hỏi bên dưới.",
    id: "Detail ketentuan sedang disiapkan. Silakan ajukan pertanyaan di bawah.",
  },
  employerHidden: {
    ja: "会社名と所在地は、推薦をお受けしたあとにお伝えします。",
    en: "The employer's name and address are shared after we accept your recommendation.",
    vi: "Tên và địa chỉ công ty sẽ được thông báo sau khi chúng tôi nhận hồ sơ giới thiệu.",
    id: "Nama dan alamat perusahaan akan diberitahukan setelah kami menerima rekomendasi Anda.",
  },
  requirements: { ja: "推薦の必須条件", en: "Must-have requirements", vi: "Điều kiện bắt buộc", id: "Syarat wajib" },
  feeLabel: {
    ja: "紹介料 (貴社の取り分)",
    en: "Your fee",
    vi: "Phí giới thiệu (phần của quý công ty)",
    id: "Biaya rujukan (bagian Anda)",
  },
  myRecs: { ja: "貴社の推薦", en: "Your recommendations", vi: "Quý công ty đã giới thiệu", id: "Rekomendasi Anda" },
  allRecs: { ja: "全体の推薦", en: "All recommendations", vi: "Tổng số giới thiệu", id: "Total rekomendasi" },
  people: { ja: "{a} / {b} 名", en: "{a} / {b}", vi: "{a} / {b} người", id: "{a} / {b} orang" },
  recommend: { ja: "候補者を推薦する", en: "Recommend a candidate", vi: "Giới thiệu ứng viên", id: "Rekomendasikan kandidat" },
  blockedPreview: {
    ja: "社員のプレビューです。推薦と質問はパートナーの画面からだけできます。",
    en: "This is a staff preview. Only partners can recommend candidates or ask questions.",
    vi: "Đây là bản xem trước của nhân viên. Chỉ đối tác mới có thể giới thiệu và đặt câu hỏi.",
    id: "Ini pratinjau staf. Hanya mitra yang dapat merekomendasikan kandidat dan bertanya.",
  },
  blockedClosed: {
    ja: "この案件は締め切りました。",
    en: "This job is closed.",
    vi: "Việc này đã đóng.",
    id: "Lowongan ini sudah ditutup.",
  },
  blockedFull: {
    ja: "推薦枠が埋まりました。",
    en: "All recommendation slots are filled.",
    vi: "Đã đủ số suất giới thiệu.",
    id: "Semua kuota rekomendasi sudah terisi.",
  },
  blockedMine: {
    ja: "貴社の推薦枠 ({n} 名) を使い切りました。",
    en: "You have used all {n} of your slots.",
    vi: "Quý công ty đã dùng hết {n} suất giới thiệu.",
    id: "Anda sudah memakai semua {n} kuota Anda.",
  },
  yourCandidates: { ja: "貴社の推薦", en: "Your candidates", vi: "Ứng viên của quý công ty", id: "Kandidat Anda" },
  withdraw: { ja: "取り下げ", en: "Withdraw", vi: "Rút lại", id: "Tarik" },
  withdrawConfirm: {
    ja: "この推薦を取り下げますか？",
    en: "Withdraw this recommendation?",
    vi: "Rút lại giới thiệu này?",
    id: "Tarik rekomendasi ini?",
  },
  qa: { ja: "質問と回答", en: "Q&A", vi: "Hỏi đáp", id: "Tanya jawab" },
  qaNote: {
    ja: "回答は、この案件を見る全パートナーに公開します。質問する前に、同じ質問がないか確かめてください。",
    en: "Answers are shared with all partners who can see this job. Please check existing answers first.",
    vi: "Câu trả lời sẽ được chia sẻ với tất cả đối tác xem việc này. Vui lòng xem các câu hỏi đã có trước khi hỏi.",
    id: "Jawaban akan dibagikan kepada semua mitra yang melihat lowongan ini. Periksa jawaban yang sudah ada terlebih dahulu.",
  },
  qaSearch: { ja: "Q&A を探す", en: "Search Q&A", vi: "Tìm trong hỏi đáp", id: "Cari tanya jawab" },
  privateAnswer: {
    ja: "(貴社だけに回答)",
    en: "(answered only to you)",
    vi: "(chỉ trả lời cho quý công ty)",
    id: "(hanya dijawab untuk Anda)",
  },
  waitingAnswer: { ja: "回答を準備中です", en: "Waiting for an answer", vi: "Đang chờ trả lời", id: "Menunggu jawaban" },
  noQuestions: { ja: "まだ質問はありません", en: "No questions yet.", vi: "Chưa có câu hỏi nào.", id: "Belum ada pertanyaan." },
  askPlaceholder: {
    ja: "この案件について質問する (どの言語でも大丈夫です)",
    en: "Ask about this job (any language is fine)",
    vi: "Đặt câu hỏi về việc này (dùng ngôn ngữ nào cũng được)",
    id: "Tanyakan tentang lowongan ini (bahasa apa pun boleh)",
  },
  sentQ: {
    ja: "送信しました。回答はこのページに出ます。",
    en: "Sent. The answer will appear on this page.",
    vi: "Đã gửi. Câu trả lời sẽ hiện ở trang này.",
    id: "Terkirim. Jawaban akan muncul di halaman ini.",
  },
  sending: { ja: "送信中…", en: "Sending…", vi: "Đang gửi…", id: "Mengirim…" },
  sendQ: { ja: "質問を送る", en: "Send question", vi: "Gửi câu hỏi", id: "Kirim pertanyaan" },
  sendFailed: { ja: "送信できませんでした", en: "Could not send", vi: "Không gửi được", id: "Gagal mengirim" },
  close: { ja: "閉じる", en: "Close", vi: "Đóng", id: "Tutup" },
  reqCheck: {
    ja: "必須条件をすべて満たしていますか？",
    en: "Does the candidate meet every requirement?",
    vi: "Ứng viên có đáp ứng tất cả điều kiện bắt buộc không?",
    id: "Apakah kandidat memenuhi semua syarat wajib?",
  },
  fName: { ja: "氏名 *", en: "Name *", vi: "Họ tên *", id: "Nama *" },
  fNationality: { ja: "国籍", en: "Nationality", vi: "Quốc tịch", id: "Kewarganegaraan" },
  fAge: { ja: "年齢", en: "Age", vi: "Tuổi", id: "Usia" },
  fGender: { ja: "性別", en: "Gender", vi: "Giới tính", id: "Jenis kelamin" },
  male: { ja: "男性", en: "Male", vi: "Nam", id: "Laki-laki" },
  female: { ja: "女性", en: "Female", vi: "Nữ", id: "Perempuan" },
  fLocation: { ja: "いまいる場所", en: "Current location", vi: "Nơi đang ở", id: "Lokasi saat ini" },
  inJapan: { ja: "日本国内", en: "In Japan", vi: "Ở Nhật Bản", id: "Di Jepang" },
  overseas: { ja: "海外", en: "Overseas", vi: "Ở nước ngoài", id: "Di luar negeri" },
  fVisa: { ja: "在留資格", en: "Visa status", vi: "Tư cách lưu trú", id: "Status visa" },
  fVisaPh: { ja: "例: 特定技能1号", en: "e.g. SSW (i)", vi: "VD: Kỹ năng đặc định số 1", id: "Contoh: SSW (i)" },
  fJapanese: { ja: "日本語", en: "Japanese level", vi: "Trình độ tiếng Nhật", id: "Tingkat bahasa Jepang" },
  fJapanesePh: { ja: "例: N3", en: "e.g. N3", vi: "VD: N3", id: "Contoh: N3" },
  fExperience: { ja: "経験", en: "Experience", vi: "Kinh nghiệm", id: "Pengalaman" },
  fResume: { ja: "履歴書のリンク", en: "Resume link", vi: "Đường link sơ yếu lý lịch", id: "Tautan CV" },
  fNotes: { ja: "推薦の理由・補足", en: "Notes", vi: "Lý do giới thiệu, ghi chú", id: "Alasan rekomendasi, catatan" },
  consent: {
    ja: "候補者本人から、この情報をスマイルリンクと求人企業に提供することの同意を得ています。",
    en: "The candidate has agreed to share this information with SMILELINK and the employer.",
    vi: "Ứng viên đã đồng ý cung cấp thông tin này cho SMILELINK và công ty tuyển dụng.",
    id: "Kandidat telah setuju informasi ini diberikan kepada SMILELINK dan perusahaan.",
  },
  checkAll: {
    ja: "必須条件にすべてチェックすると送れます。",
    en: "Check every requirement to continue.",
    vi: "Hãy đánh dấu tất cả điều kiện bắt buộc để gửi.",
    id: "Centang semua syarat wajib untuk melanjutkan.",
  },
  sendRec: { ja: "推薦を送る", en: "Send recommendation", vi: "Gửi giới thiệu", id: "Kirim rekomendasi" },

  // 訳について
  translatedNote: {
    ja: "",
    en: "Job details on this page are machine-translated. The Japanese original is the official version.",
    vi: "Nội dung việc làm trên trang này được dịch máy. Bản gốc tiếng Nhật là bản chính thức.",
    id: "Isi lowongan di halaman ini diterjemahkan mesin. Teks asli bahasa Jepang adalah versi resmi.",
  },
  showOriginal: {
    ja: "日本語の原文を見る",
    en: "Show Japanese original",
    vi: "Xem bản gốc tiếng Nhật",
    id: "Lihat teks asli bahasa Jepang",
  },
  showTranslation: { ja: "訳を見る", en: "Show translation", vi: "Xem bản dịch", id: "Lihat terjemahan" },
  translating: {
    ja: "",
    en: "Some parts are still being translated and are shown in Japanese for now.",
    vi: "Một số phần đang được dịch, tạm thời hiển thị bằng tiếng Nhật.",
    id: "Sebagian masih diterjemahkan dan sementara ditampilkan dalam bahasa Jepang.",
  },
} satisfies Record<string, Dict>;

export type BoardUiKey = keyof typeof UI;

/** 画面の言葉を引く。{n} などは vars で置き換える */
export function bt(lang: BoardLang, key: BoardUiKey, vars?: Record<string, string | number>): string {
  let s: string = UI[key][lang] || UI[key].en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** 推薦の状況 (保存は日本語のまま。画面では選んだ言語で出す) */
export const BOARD_REC_STATUS_I18N: Record<string, Dict> = {
  受付: { ja: "受付", en: "Received", vi: "Đã nhận", id: "Diterima" },
  書類確認中: { ja: "書類確認中", en: "Screening", vi: "Đang xem hồ sơ", id: "Pemeriksaan dokumen" },
  企業に推薦: { ja: "企業に推薦", en: "Sent to employer", vi: "Đã giới thiệu cho công ty", id: "Diajukan ke perusahaan" },
  面接: { ja: "面接", en: "Interview", vi: "Phỏng vấn", id: "Wawancara" },
  内定: { ja: "内定", en: "Offer", vi: "Trúng tuyển", id: "Diterima kerja" },
  見送り: { ja: "見送り", en: "Not selected", vi: "Không được chọn", id: "Tidak lolos" },
  取り下げ: { ja: "取り下げ", en: "Withdrawn", vi: "Đã rút lại", id: "Ditarik" },
};

export function recStatusLabel(lang: BoardLang, status: string): string {
  return BOARD_REC_STATUS_I18N[status]?.[lang] ?? status;
}

/** 求人票の条件の見出し (lib/board.ts の BOARD_CONDITION_FIELDS の key ごと) */
export const BOARD_CONDITION_LABELS: Record<string, Dict> = {
  jobDescription: { ja: "仕事内容", en: "Job description", vi: "Nội dung công việc", id: "Deskripsi pekerjaan" },
  headcount: { ja: "募集人数", en: "Openings", vi: "Số lượng tuyển", id: "Jumlah lowongan" },
  gender: { ja: "性別", en: "Gender", vi: "Giới tính", id: "Jenis kelamin" },
  nationality: { ja: "国籍", en: "Nationality", vi: "Quốc tịch", id: "Kewarganegaraan" },
  monthlyGross: { ja: "月の総支給", en: "Monthly gross pay", vi: "Tổng lương tháng", id: "Gaji kotor bulanan" },
  basicSalary: { ja: "基本給", en: "Base salary", vi: "Lương cơ bản", id: "Gaji pokok" },
  salaryCalcMethod: { ja: "計算方法", en: "Pay basis", vi: "Cách tính lương", id: "Dasar perhitungan gaji" },
  housingAllowance: { ja: "住宅手当", en: "Housing allowance", vi: "Trợ cấp nhà ở", id: "Tunjangan perumahan" },
  nightShiftAllowance: { ja: "夜勤手当", en: "Night allowance", vi: "Trợ cấp ca đêm", id: "Tunjangan shift malam" },
  commuteAllowance: { ja: "通勤手当", en: "Commute allowance", vi: "Trợ cấp đi lại", id: "Tunjangan transportasi" },
  fixedOvertimePay: { ja: "固定残業代", en: "Fixed overtime pay", vi: "Tiền tăng ca cố định", id: "Upah lembur tetap" },
  salaryIncrease: { ja: "昇給", en: "Raises", vi: "Tăng lương", id: "Kenaikan gaji" },
  bonus: { ja: "賞与", en: "Bonus", vi: "Thưởng", id: "Bonus" },
  monthlyDeduction: { ja: "月の控除の目安", en: "Monthly deductions", vi: "Khoản khấu trừ hằng tháng", id: "Potongan bulanan" },
  socialInsurance: { ja: "社会保険", en: "Social insurance", vi: "Bảo hiểm xã hội", id: "Asuransi sosial" },
  incomeTax: { ja: "所得税", en: "Income tax", vi: "Thuế thu nhập", id: "Pajak penghasilan" },
  residentTax: { ja: "住民税", en: "Resident tax", vi: "Thuế cư trú", id: "Pajak penduduk" },
  otherDeductions: { ja: "その他の控除", en: "Other deductions", vi: "Khấu trừ khác", id: "Potongan lain" },
  workTime: { ja: "勤務時間", en: "Working hours", vi: "Giờ làm việc", id: "Jam kerja" },
  avgMonthlyOvertime: { ja: "月の平均残業", en: "Average overtime", vi: "Tăng ca trung bình/tháng", id: "Rata-rata lembur" },
  holidays: { ja: "休日", en: "Days off", vi: "Ngày nghỉ", id: "Hari libur" },
  holidayCategory: { ja: "休日の区分", en: "Holiday type", vi: "Loại ngày nghỉ", id: "Jenis hari libur" },
  trialPeriodDetails: { ja: "試用期間", en: "Probation", vi: "Thời gian thử việc", id: "Masa percobaan" },
  dormProvision: { ja: "寮", en: "Dormitory", vi: "Ký túc xá", id: "Asrama" },
  dormAmount: { ja: "寮費", en: "Dorm fee", vi: "Phí ký túc xá", id: "Biaya asrama" },
  dormOccupants: { ja: "寮の人数", en: "People per dorm", vi: "Số người mỗi phòng", id: "Jumlah penghuni" },
  bedroomShared: { ja: "寝室の共有", en: "Shared bedroom", vi: "Ở chung phòng ngủ", id: "Kamar tidur bersama" },
  dormCommuteTime: { ja: "寮からの通勤", en: "Commute from dorm", vi: "Đi làm từ ký túc xá", id: "Perjalanan dari asrama" },
  utilitiesAmount: { ja: "水道光熱費", en: "Utilities", vi: "Điện nước", id: "Biaya utilitas" },
  mealProvision: { ja: "食事", en: "Meals", vi: "Bữa ăn", id: "Makan" },
  movingSupportDetails: { ja: "引越の補助", en: "Moving support", vi: "Hỗ trợ chuyển nhà", id: "Bantuan pindahan" },
  japaneseLevel: { ja: "日本語", en: "Japanese level", vi: "Trình độ tiếng Nhật", id: "Tingkat bahasa Jepang" },
  experienceYears: { ja: "経験", en: "Experience", vi: "Kinh nghiệm", id: "Pengalaman" },
  requiredQualifications: { ja: "必要な資格", en: "Qualifications", vi: "Bằng cấp cần có", id: "Kualifikasi" },
  overseasApplication: { ja: "海外からの応募", en: "Applicants abroad", vi: "Ứng tuyển từ nước ngoài", id: "Pelamar dari luar negeri" },
  foreignWorkers: { ja: "外国人の同僚", en: "Foreign coworkers", vi: "Đồng nghiệp người nước ngoài", id: "Rekan kerja asing" },
  selectionFlow: { ja: "選考の流れ", en: "Selection steps", vi: "Quy trình tuyển chọn", id: "Tahapan seleksi" },
  preferredInterviewDate: { ja: "面接の時期", en: "Interview timing", vi: "Thời gian phỏng vấn", id: "Waktu wawancara" },
  preferredEntryDate: { ja: "入社・入国の時期", en: "Start / entry timing", vi: "Thời gian vào công ty / nhập cảnh", id: "Waktu mulai kerja / masuk Jepang" },
};

/** 条件のまとまりの見出し */
export const BOARD_CONDITION_GROUPS: Record<string, Dict> = {
  job: { ja: "仕事", en: "Job", vi: "Công việc", id: "Pekerjaan" },
  pay: { ja: "給与", en: "Pay", vi: "Lương", id: "Gaji" },
  deductions: { ja: "控除", en: "Deductions", vi: "Khấu trừ", id: "Potongan" },
  work: { ja: "勤務", en: "Work", vi: "Làm việc", id: "Kerja" },
  housing: { ja: "住まい", en: "Housing", vi: "Nhà ở", id: "Tempat tinggal" },
  requirements: { ja: "応募条件", en: "Requirements", vi: "Điều kiện ứng tuyển", id: "Syarat lamaran" },
  selection: { ja: "選考", en: "Selection", vi: "Tuyển chọn", id: "Seleksi" },
};
