/**
 * 候補者向け入力フォーム (/intake/[token]) の母国語表示。
 *
 * 国籍から言語を決め、質問文・見出し・ボタンをその言語で出す (下に日本語を小さく添える)。
 * 回答は本人の言葉のまま保存し、日本語訳は送信後に AI で付ける (app/api/intake/[token]/route.ts)。
 * 対応言語: ベトナム語 / インドネシア語 / ミャンマー語 / ネパール語 / クメール語 / 英語。
 * 国籍が分からないときは英語。翻訳が無い文言は日本語のまま出す。
 */

export type IntakeLang = "ja" | "en" | "vi" | "id" | "my" | "ne" | "km";

export const INTAKE_LANG_LABELS: Record<IntakeLang, string> = {
  ja: "日本語",
  en: "English",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  my: "မြန်မာ",
  ne: "नेपाली",
  km: "ខ្មែរ",
};

export function intakeLang(nationality: string | null | undefined): IntakeLang {
  const n = (nationality ?? "").trim();
  if (/ベトナム|viet/i.test(n)) return "vi";
  if (/インドネシア|indonesia/i.test(n)) return "id";
  if (/ミャンマー|myanmar|burm/i.test(n)) return "my";
  if (/ネパール|nepal/i.test(n)) return "ne";
  if (/カンボジア|cambodia|khmer/i.test(n)) return "km";
  if (/日本|japan/i.test(n)) return "ja";
  return "en";
}

type Dict = Record<string, string>;

/** 画面の文言 (ボタン・見出し・基本情報の項目名) */
const UI: Record<IntakeLang, Dict> = {
  ja: {
    formTitle: "事前質問フォーム",
    basicTitle: "基本情報",
    basicDesc: "はじめに、あなたのことを教えてください。",
    englishName: "お名前（ローマ字）",
    englishNameHint: "例：NGUYEN THI HUONG",
    birthDate: "生年月日",
    gender: "性別",
    phone: "電話番号",
    email: "メールアドレス",
    address: "現在のお住まい（住所）",
    addressHint: "例：東京都新宿区○○1-2-3 ○○マンション101",
    workTitle: "職歴",
    workDesc: "今までに働いた会社を、新しい順に書いてください。",
    companyName: "会社名（国名も）",
    companyHint: "例：A 会社（ベトナム）",
    startDate: "入社",
    endDate: "退社（働いている場合は空欄）",
    workContent: "仕事内容と、辞めた理由",
    workContentHint: "例：工場で機械の組み立て。もっと良い給料の仕事を探したいため退職。",
    addRow: "＋ 会社を追加",
    remove: "削除",
    customTitle: "担当者からの個別質問",
    back: "← 戻る",
    next: "次へ →",
    submit: "送信する",
    submitting: "送信中…",
    required: "必須の質問に回答してください。",
    thanksTitle: "送信完了",
    thanksBody: "ご回答ありがとうございました。",
    editAgain: "続けて編集する",
    noQuestions: "質問はありません",
    contactRecruiter: "担当者へご連絡ください。",
    uploading: "ファイルを送信しています…",
    sending: "送信しています",
    keepOpen: "この画面を閉じずにお待ちください。",
    chooseFile: "ファイルを選ぶ",
    change: "変更",
    unselected: "未選択",
    fileTooLarge: "ファイルが大きすぎます（20MBまで）。",
    fileReadError: "ファイルの読み込みに失敗しました。",
    uploadFailed: "ファイルの送信に失敗しました。通信環境の良い場所で、もう一度お試しください。",
    message:
      "{name} さん、こんにちは。SMILEVISA です。\n面談の前に、こちらのフォームへのご回答をお願いします (5分くらいで終わります)。\n{url}",
  },
  en: {
    formTitle: "Pre-interview form",
    basicTitle: "Basic information",
    basicDesc: "First, please tell us about yourself.",
    englishName: "Full name (Roman letters)",
    englishNameHint: "e.g. NGUYEN THI HUONG",
    birthDate: "Date of birth",
    gender: "Gender",
    phone: "Phone number",
    email: "Email address",
    address: "Current address",
    addressHint: "e.g. 1-2-3 ○○, Shinjuku-ku, Tokyo, ○○ Mansion 101",
    workTitle: "Work history",
    workDesc: "Please list the companies you have worked for, newest first.",
    companyName: "Company name (and country)",
    companyHint: "e.g. Company A (Vietnam)",
    startDate: "Started",
    endDate: "Left (leave blank if still working)",
    workContent: "Job description and reason for leaving",
    workContentHint: "e.g. Assembling machines in a factory. Left to find a better-paid job.",
    addRow: "+ Add a company",
    remove: "Remove",
    customTitle: "Questions from your recruiter",
    back: "← Back",
    next: "Next →",
    submit: "Submit",
    submitting: "Submitting…",
    required: "Please answer the required questions.",
    thanksTitle: "Thank you!",
    thanksBody: "Your answers have been submitted.",
    editAgain: "Edit again",
    noQuestions: "No questions",
    contactRecruiter: "Please contact the recruiter.",
    uploading: "Uploading files…",
    sending: "Submitting",
    keepOpen: "Please keep this screen open.",
    chooseFile: "Choose file",
    change: "Change",
    unselected: "Not selected",
    fileTooLarge: "File too large (max 20MB).",
    fileReadError: "Failed to read the file.",
    uploadFailed: "Failed to upload the file. Please try again with a better connection.",
    message:
      "Hello {name}, this is SMILEVISA.\nBefore the interview, please answer this form (about 5 minutes).\n{url}",
  },
  vi: {
    formTitle: "Phiếu câu hỏi trước phỏng vấn",
    basicTitle: "Thông tin cơ bản",
    basicDesc: "Trước tiên, hãy cho chúng tôi biết về bạn.",
    englishName: "Họ và tên (chữ La-tinh, không dấu)",
    englishNameHint: "Ví dụ: NGUYEN THI HUONG",
    birthDate: "Ngày sinh",
    gender: "Giới tính",
    phone: "Số điện thoại",
    email: "Địa chỉ email",
    address: "Địa chỉ hiện tại",
    addressHint: "Ví dụ: Tokyo-to Shinjuku-ku ○○ 1-2-3, ○○ Mansion 101",
    workTitle: "Kinh nghiệm làm việc",
    workDesc: "Hãy ghi các công ty bạn đã làm, công ty gần nhất ghi trước.",
    companyName: "Tên công ty (và quốc gia)",
    companyHint: "Ví dụ: Công ty A (Việt Nam)",
    startDate: "Ngày vào làm",
    endDate: "Ngày nghỉ (để trống nếu vẫn đang làm)",
    workContent: "Nội dung công việc và lý do nghỉ việc",
    workContentHint: "Ví dụ: Lắp ráp máy trong nhà máy. Nghỉ để tìm công việc lương tốt hơn.",
    addRow: "+ Thêm công ty",
    remove: "Xóa",
    customTitle: "Câu hỏi riêng từ người phụ trách",
    back: "← Quay lại",
    next: "Tiếp theo →",
    submit: "Gửi",
    submitting: "Đang gửi…",
    required: "Vui lòng trả lời các câu hỏi bắt buộc.",
    thanksTitle: "Đã gửi xong",
    thanksBody: "Cảm ơn bạn đã trả lời.",
    editAgain: "Tiếp tục chỉnh sửa",
    noQuestions: "Không có câu hỏi",
    contactRecruiter: "Vui lòng liên hệ với người phụ trách.",
    uploading: "Đang gửi tệp…",
    sending: "Đang gửi",
    keepOpen: "Vui lòng không đóng màn hình này.",
    chooseFile: "Chọn tệp",
    change: "Thay đổi",
    unselected: "Chưa chọn",
    fileTooLarge: "Tệp quá lớn (tối đa 20MB).",
    fileReadError: "Không đọc được tệp.",
    uploadFailed: "Gửi tệp thất bại. Vui lòng thử lại ở nơi có mạng tốt hơn.",
    message:
      "Chào {name}, đây là SMILEVISA.\nTrước buổi phỏng vấn, bạn vui lòng trả lời phiếu này nhé (khoảng 5 phút).\n{url}",
  },
  id: {
    formTitle: "Formulir pra-wawancara",
    basicTitle: "Informasi dasar",
    basicDesc: "Pertama, ceritakan tentang diri Anda.",
    englishName: "Nama lengkap (huruf Latin)",
    englishNameHint: "Contoh: SITI RAHMAWATI",
    birthDate: "Tanggal lahir",
    gender: "Jenis kelamin",
    phone: "Nomor telepon",
    email: "Alamat email",
    address: "Alamat saat ini",
    addressHint: "Contoh: Tokyo-to Shinjuku-ku ○○ 1-2-3, ○○ Mansion 101",
    workTitle: "Riwayat pekerjaan",
    workDesc: "Tuliskan perusahaan tempat Anda pernah bekerja, mulai dari yang terbaru.",
    companyName: "Nama perusahaan (dan negara)",
    companyHint: "Contoh: PT A (Indonesia)",
    startDate: "Mulai bekerja",
    endDate: "Berhenti (kosongkan jika masih bekerja)",
    workContent: "Isi pekerjaan dan alasan berhenti",
    workContentHint: "Contoh: Merakit mesin di pabrik. Berhenti untuk mencari pekerjaan dengan gaji lebih baik.",
    addRow: "+ Tambah perusahaan",
    remove: "Hapus",
    customTitle: "Pertanyaan dari penanggung jawab",
    back: "← Kembali",
    next: "Lanjut →",
    submit: "Kirim",
    submitting: "Mengirim…",
    required: "Mohon jawab pertanyaan yang wajib diisi.",
    thanksTitle: "Terkirim",
    thanksBody: "Terima kasih atas jawaban Anda.",
    editAgain: "Lanjut mengedit",
    noQuestions: "Tidak ada pertanyaan",
    contactRecruiter: "Silakan hubungi penanggung jawab.",
    uploading: "Mengunggah berkas…",
    sending: "Sedang mengirim",
    keepOpen: "Jangan tutup layar ini.",
    chooseFile: "Pilih berkas",
    change: "Ubah",
    unselected: "Belum dipilih",
    fileTooLarge: "Berkas terlalu besar (maks. 20MB).",
    fileReadError: "Gagal membaca berkas.",
    uploadFailed: "Gagal mengunggah berkas. Coba lagi di tempat dengan koneksi yang lebih baik.",
    message:
      "Halo {name}, ini SMILEVISA.\nSebelum wawancara, mohon isi formulir ini (sekitar 5 menit).\n{url}",
  },
  my: {
    formTitle: "အင်တာဗျူးမတိုင်မီ မေးခွန်းပုံစံ",
    basicTitle: "အခြေခံအချက်အလက်",
    basicDesc: "ပထမဦးစွာ သင့်အကြောင်း ပြောပြပါ။",
    englishName: "အမည်အပြည့်အစုံ (အင်္ဂလိပ်စာလုံး)",
    englishNameHint: "ဥပမာ - AUNG AUNG",
    birthDate: "မွေးသက္ကရာဇ်",
    gender: "ကျား/မ",
    phone: "ဖုန်းနံပါတ်",
    email: "အီးမေးလ်လိပ်စာ",
    address: "လက်ရှိနေရပ်လိပ်စာ",
    addressHint: "ဥပမာ - Tokyo-to Shinjuku-ku ○○ 1-2-3, ○○ Mansion 101",
    workTitle: "အလုပ်အကိုင်မှတ်တမ်း",
    workDesc: "လုပ်ခဲ့ဖူးသော ကုမ္ပဏီများကို နောက်ဆုံးလုပ်ခဲ့သည့်အလုပ်မှစ၍ ရေးပါ။",
    companyName: "ကုမ္ပဏီအမည် (နိုင်ငံပါ)",
    companyHint: "ဥပမာ - A ကုမ္ပဏီ (မြန်မာ)",
    startDate: "အလုပ်ဝင်သည့်ရက်",
    endDate: "အလုပ်ထွက်သည့်ရက် (ဆက်လုပ်နေပါက ကွက်လပ်ထားပါ)",
    workContent: "လုပ်ငန်းတာဝန်နှင့် အလုပ်ထွက်ရသည့်အကြောင်းရင်း",
    workContentHint: "ဥပမာ - စက်ရုံတွင် စက်ပစ္စည်းတပ်ဆင်ခြင်း။ လစာပိုကောင်းသောအလုပ်ရှာရန် ထွက်ခဲ့သည်။",
    addRow: "+ ကုမ္ပဏီထပ်ထည့်ရန်",
    remove: "ဖျက်ရန်",
    customTitle: "တာဝန်ခံထံမှ သီးသန့်မေးခွန်းများ",
    back: "← နောက်သို့",
    next: "ရှေ့သို့ →",
    submit: "ပေးပို့ရန်",
    submitting: "ပေးပို့နေသည်…",
    required: "မဖြစ်မနေဖြေရမည့် မေးခွန်းများကို ဖြေပါ။",
    thanksTitle: "ပေးပို့ပြီးပါပြီ",
    thanksBody: "ဖြေကြားပေးသည့်အတွက် ကျေးဇူးတင်ပါသည်။",
    editAgain: "ဆက်လက်ပြင်ဆင်ရန်",
    noQuestions: "မေးခွန်းမရှိပါ",
    contactRecruiter: "တာဝန်ခံထံ ဆက်သွယ်ပါ။",
    uploading: "ဖိုင်ပေးပို့နေသည်…",
    sending: "ပေးပို့နေသည်",
    keepOpen: "ဤစာမျက်နှာကို မပိတ်ဘဲ စောင့်ပါ။",
    chooseFile: "ဖိုင်ရွေးရန်",
    change: "ပြောင်းရန်",
    unselected: "မရွေးရသေးပါ",
    fileTooLarge: "ဖိုင်အရွယ်အစား ကြီးလွန်းသည် (အများဆုံး 20MB)။",
    fileReadError: "ဖိုင်ဖတ်၍ မရပါ။",
    uploadFailed: "ဖိုင်ပေးပို့ခြင်း မအောင်မြင်ပါ။ အင်တာနက်ကောင်းသောနေရာတွင် ထပ်ကြိုးစားပါ။",
    message:
      "မင်္ဂလာပါ {name}၊ SMILEVISA မှ ဖြစ်ပါသည်။\nအင်တာဗျူးမတိုင်မီ ဤပုံစံကို ဖြေပေးပါ (၅ မိနစ်ခန့်)။\n{url}",
  },
  ne: {
    formTitle: "अन्तर्वार्ता अघिको प्रश्न फारम",
    basicTitle: "आधारभूत जानकारी",
    basicDesc: "सुरुमा, आफ्नो बारेमा बताउनुहोस्।",
    englishName: "पूरा नाम (रोमन अक्षरमा)",
    englishNameHint: "उदाहरण: RAM BAHADUR THAPA",
    birthDate: "जन्म मिति",
    gender: "लिङ्ग",
    phone: "फोन नम्बर",
    email: "इमेल ठेगाना",
    address: "हालको ठेगाना",
    addressHint: "उदाहरण: Tokyo-to Shinjuku-ku ○○ 1-2-3, ○○ Mansion 101",
    workTitle: "कामको अनुभव",
    workDesc: "अहिलेसम्म काम गरेका कम्पनीहरू, पछिल्लो कामबाट सुरु गरेर लेख्नुहोस्।",
    companyName: "कम्पनीको नाम (र देश)",
    companyHint: "उदाहरण: A कम्पनी (नेपाल)",
    startDate: "काम सुरु गरेको मिति",
    endDate: "छोडेको मिति (अझै काम गर्दै हुनुहुन्छ भने खाली छोड्नुहोस्)",
    workContent: "कामको विवरण र छोड्नुको कारण",
    workContentHint: "उदाहरण: कारखानामा मेसिन जोड्ने काम। राम्रो तलबको काम खोज्न छोडें।",
    addRow: "+ कम्पनी थप्नुहोस्",
    remove: "हटाउनुहोस्",
    customTitle: "जिम्मेवार व्यक्तिका थप प्रश्नहरू",
    back: "← पछाडि",
    next: "अर्को →",
    submit: "पठाउनुहोस्",
    submitting: "पठाउँदै…",
    required: "कृपया अनिवार्य प्रश्नहरूको उत्तर दिनुहोस्।",
    thanksTitle: "पठाइयो",
    thanksBody: "उत्तर दिनुभएकोमा धन्यवाद।",
    editAgain: "फेरि सम्पादन गर्नुहोस्",
    noQuestions: "प्रश्न छैन",
    contactRecruiter: "कृपया जिम्मेवार व्यक्तिलाई सम्पर्क गर्नुहोस्।",
    uploading: "फाइल पठाउँदै…",
    sending: "पठाउँदै छ",
    keepOpen: "कृपया यो स्क्रिन बन्द नगर्नुहोस्।",
    chooseFile: "फाइल छान्नुहोस्",
    change: "परिवर्तन",
    unselected: "छानिएको छैन",
    fileTooLarge: "फाइल धेरै ठूलो छ (अधिकतम 20MB)।",
    fileReadError: "फाइल पढ्न सकिएन।",
    uploadFailed: "फाइल पठाउन सकिएन। राम्रो इन्टरनेट भएको ठाउँमा फेरि प्रयास गर्नुहोस्।",
    message:
      "नमस्ते {name} जी, SMILEVISA बाट।\nअन्तर्वार्ता अघि यो फारम भर्नुहोस् (करिब ५ मिनेट)।\n{url}",
  },
  km: {
    formTitle: "ទម្រង់សំណួរមុនសម្ភាសន៍",
    basicTitle: "ព័ត៌មានមូលដ្ឋាន",
    basicDesc: "ជាដំបូង សូមប្រាប់យើងអំពីអ្នក។",
    englishName: "ឈ្មោះពេញ (អក្សរឡាតាំង)",
    englishNameHint: "ឧទាហរណ៍៖ SOK DARA",
    birthDate: "ថ្ងៃខែឆ្នាំកំណើត",
    gender: "ភេទ",
    phone: "លេខទូរស័ព្ទ",
    email: "អាសយដ្ឋានអ៊ីមែល",
    address: "អាសយដ្ឋានបច្ចុប្បន្ន",
    addressHint: "ឧទាហរណ៍៖ Tokyo-to Shinjuku-ku ○○ 1-2-3, ○○ Mansion 101",
    workTitle: "ប្រវត្តិការងារ",
    workDesc: "សូមសរសេរក្រុមហ៊ុនដែលអ្នកធ្លាប់ធ្វើការ ដោយចាប់ពីថ្មីបំផុត។",
    companyName: "ឈ្មោះក្រុមហ៊ុន (និងប្រទេស)",
    companyHint: "ឧទាហរណ៍៖ ក្រុមហ៊ុន A (កម្ពុជា)",
    startDate: "ថ្ងៃចូលធ្វើការ",
    endDate: "ថ្ងៃឈប់ (ទុកចោលប្រសិនបើនៅធ្វើការ)",
    workContent: "ការងារដែលធ្វើ និងមូលហេតុឈប់",
    workContentHint: "ឧទាហរណ៍៖ ដំឡើងម៉ាស៊ីននៅរោងចក្រ។ ឈប់ដើម្បីរកការងារដែលមានប្រាក់ខែល្អជាង។",
    addRow: "+ បន្ថែមក្រុមហ៊ុន",
    remove: "លុប",
    customTitle: "សំណួរពីអ្នកទទួលខុសត្រូវ",
    back: "← ត្រឡប់",
    next: "បន្ទាប់ →",
    submit: "ផ្ញើ",
    submitting: "កំពុងផ្ញើ…",
    required: "សូមឆ្លើយសំណួរដែលតម្រូវ។",
    thanksTitle: "បានផ្ញើរួចរាល់",
    thanksBody: "សូមអរគុណសម្រាប់ចម្លើយរបស់អ្នក។",
    editAgain: "កែសម្រួលបន្ត",
    noQuestions: "គ្មានសំណួរ",
    contactRecruiter: "សូមទាក់ទងអ្នកទទួលខុសត្រូវ។",
    uploading: "កំពុងផ្ញើឯកសារ…",
    sending: "កំពុងផ្ញើ",
    keepOpen: "សូមកុំបិទអេក្រង់នេះ។",
    chooseFile: "ជ្រើសរើសឯកសារ",
    change: "ផ្លាស់ប្តូរ",
    unselected: "មិនទាន់ជ្រើសរើស",
    fileTooLarge: "ឯកសារធំពេក (អតិបរមា 20MB)។",
    fileReadError: "មិនអាចអានឯកសារបានទេ។",
    uploadFailed: "ការផ្ញើឯកសារបរាជ័យ។ សូមព្យាយាមម្តងទៀតនៅកន្លែងដែលមានអ៊ីនធឺណិតល្អ។",
    message:
      "សួស្តី {name}, នេះជា SMILEVISA។\nមុនពេលសម្ភាសន៍ សូមឆ្លើយទម្រង់នេះ (ប្រហែល ៥ នាទី)។\n{url}",
  },
};

/** 選択肢 (日本語の値 → 各言語の表示) */
const OPTIONS: Record<string, Record<IntakeLang, string>> = {
  男性: { ja: "男性", en: "Male", vi: "Nam", id: "Laki-laki", my: "ကျား", ne: "पुरुष", km: "ប្រុស" },
  女性: { ja: "女性", en: "Female", vi: "Nữ", id: "Perempuan", my: "မ", ne: "महिला", km: "ស្រី" },
  その他: { ja: "その他", en: "Other", vi: "Khác", id: "Lainnya", my: "အခြား", ne: "अन्य", km: "ផ្សេងទៀត" },
  日本: { ja: "日本", en: "Japan", vi: "Nhật Bản", id: "Jepang", my: "ဂျပန်", ne: "जापान", km: "ជប៉ុន" },
  海外: { ja: "海外", en: "Overseas", vi: "Nước ngoài", id: "Luar negeri", my: "နိုင်ငံခြား", ne: "विदेश", km: "ក្រៅប្រទេស" },
  在職中: { ja: "在職中", en: "Currently working", vi: "Đang đi làm", id: "Masih bekerja", my: "အလုပ်လုပ်နေဆဲ", ne: "हाल काम गर्दै", km: "កំពុងធ្វើការ" },
  退職済み: { ja: "退職済み", en: "Not working now", vi: "Đã nghỉ việc", id: "Sudah berhenti", my: "အလုပ်ထွက်ပြီး", ne: "काम छोडिसकेको", km: "ឈប់ធ្វើការហើយ" },
  はい: { ja: "はい", en: "Yes", vi: "Có", id: "Ya", my: "ဟုတ်ကဲ့", ne: "हो", km: "បាទ/ចាស" },
  いいえ: { ja: "いいえ", en: "No", vi: "Không", id: "Tidak", my: "မဟုတ်ပါ", ne: "होइन", km: "ទេ" },
  あり: { ja: "あり", en: "Yes", vi: "Có", id: "Ada", my: "ရှိ", ne: "छ", km: "មាន" },
  なし: { ja: "なし", en: "No", vi: "Không", id: "Tidak ada", my: "မရှိ", ne: "छैन", km: "គ្មាន" },
  あいさつ程度: { ja: "あいさつ程度", en: "Greetings only", vi: "Chỉ chào hỏi", id: "Hanya salam", my: "နှုတ်ဆက်စကားလောက်", ne: "अभिवादन मात्र", km: "ត្រឹមតែស្វាគមន៍" },
  簡単な日常会話: { ja: "簡単な日常会話", en: "Simple daily conversation", vi: "Giao tiếp hàng ngày đơn giản", id: "Percakapan sehari-hari sederhana", my: "နေ့စဉ်သုံး ရိုးရှင်းသောစကား", ne: "सरल दैनिक कुराकानी", km: "សន្ទនាប្រចាំថ្ងៃសាមញ្ញ" },
  仕事の指示が分かる: { ja: "仕事の指示が分かる", en: "Understand work instructions", vi: "Hiểu chỉ thị công việc", id: "Paham instruksi kerja", my: "အလုပ်ညွှန်ကြားချက် နားလည်", ne: "कामको निर्देशन बुझ्छु", km: "យល់ការណែនាំការងារ" },
  自由に話せる: { ja: "自由に話せる", en: "Speak freely", vi: "Nói chuyện thoải mái", id: "Bisa bicara lancar", my: "လွတ်လပ်စွာ ပြောနိုင်", ne: "स्वतन्त्र रूपमा बोल्न सक्छु", km: "និយាយបានស្ទាត់" },
};

type QText = { q: string; hint?: string };

/** 質問文 (key は lib/interview-questions.ts の key)。フォームに出る must の質問だけ */
const QUESTIONS: Record<string, Partial<Record<IntakeLang, QText>>> = {
  currentLocation: {
    en: { q: "Where do you live now?" },
    vi: { q: "Hiện nay bạn đang sống ở đâu?" },
    id: { q: "Saat ini Anda tinggal di mana?" },
    my: { q: "ယခု ဘယ်မှာနေပါသလဲ။" },
    ne: { q: "अहिले तपाईं कहाँ बस्नुहुन्छ?" },
    km: { q: "ឥឡូវនេះអ្នករស់នៅទីណា?" },
  },
  japanPurpose: {
    en: { q: "Why did you come (or want to come) to Japan?", hint: "e.g. To earn money for my family. To learn Japanese skills." },
    vi: { q: "Mục đích bạn đến (hoặc muốn đến) Nhật Bản là gì?", hint: "Ví dụ: Kiếm tiền cho gia đình. Học kỹ thuật của Nhật." },
    id: { q: "Apa tujuan Anda datang (atau ingin datang) ke Jepang?", hint: "Contoh: Mencari uang untuk keluarga. Belajar teknologi Jepang." },
    my: { q: "ဂျပန်ကို လာ (သို့) လာလိုသည့် ရည်ရွယ်ချက်ကို ပြောပြပါ။", hint: "ဥပမာ - မိသားစုအတွက် ငွေရှာရန်။ ဂျပန်နည်းပညာ သင်ယူရန်။" },
    ne: { q: "जापान आउनुको (वा आउन चाहनुको) उद्देश्य के हो?", hint: "उदाहरण: परिवारका लागि पैसा कमाउन। जापानी प्रविधि सिक्न।" },
    km: { q: "គោលបំណងដែលអ្នកមក (ឬចង់មក) ប្រទេសជប៉ុនគឺអ្វី?", hint: "ឧទាហរណ៍៖ រកលុយឲ្យគ្រួសារ។ រៀនបច្ចេកទេសជប៉ុន។" },
  },
  employmentStatus: {
    en: { q: "Are you currently working?" },
    vi: { q: "Tình trạng làm việc hiện tại của bạn?" },
    id: { q: "Bagaimana status pekerjaan Anda saat ini?" },
    my: { q: "ယခု အလုပ်အကိုင်အခြေအနေ ဘယ်လိုလဲ။" },
    ne: { q: "हाल तपाईंको कामको अवस्था के छ?" },
    km: { q: "ស្ថានភាពការងារបច្ចុប្បន្នរបស់អ្នក?" },
  },
  currentJob: {
    en: { q: "What is your current (or most recent) job?", hint: "e.g. I make boxed lunches at a factory." },
    vi: { q: "Công việc hiện tại (hoặc gần nhất) của bạn là gì?", hint: "Ví dụ: Làm cơm hộp trong nhà máy." },
    id: { q: "Apa pekerjaan Anda saat ini (atau yang terakhir)?", hint: "Contoh: Membuat bekal makanan di pabrik." },
    my: { q: "လက်ရှိ (သို့) နောက်ဆုံး အလုပ်က ဘာလဲ။", hint: "ဥပမာ - စက်ရုံတွင် ထမင်းဘူးပြုလုပ်ခြင်း။" },
    ne: { q: "तपाईंको हालको (वा पछिल्लो) काम के हो?", hint: "उदाहरण: कारखानामा खानाको बक्स बनाउने काम।" },
    km: { q: "ការងារបច្ចុប្បន្ន (ឬចុងក្រោយ) របស់អ្នកគឺអ្វី?", hint: "ឧទាហរណ៍៖ ធ្វើបាយប្រអប់នៅរោងចក្រ។" },
  },
  sameJobExperience: {
    en: { q: "How much experience do you have in the field you are applying for?", hint: "e.g. 3 years of caregiving. / No experience." },
    vi: { q: "Bạn có bao nhiêu kinh nghiệm trong ngành đang ứng tuyển?", hint: "Ví dụ: 3 năm làm điều dưỡng. / Chưa có kinh nghiệm." },
    id: { q: "Berapa lama pengalaman Anda di bidang yang dilamar?", hint: "Contoh: 3 tahun di bidang perawatan lansia. / Belum ada pengalaman." },
    my: { q: "လျှောက်ထားသည့် နယ်ပယ်တွင် အတွေ့အကြုံ ဘယ်လောက်ရှိပါသလဲ။", hint: "ဥပမာ - သူနာပြုစောင့်ရှောက်မှု ၃ နှစ်။ / အတွေ့အကြုံမရှိပါ။" },
    ne: { q: "आवेदन गर्ने क्षेत्रमा तपाईंको कति अनुभव छ?", hint: "उदाहरण: हेरचाह (केयर) को ३ वर्ष। / अनुभव छैन।" },
    km: { q: "អ្នកមានបទពិសោធន៍ប៉ុន្មានក្នុងវិស័យដែលដាក់ពាក្យ?", hint: "ឧទាហរណ៍៖ ថែទាំមនុស្សចាស់ ៣ ឆ្នាំ។ / គ្មានបទពិសោធន៍។" },
  },
  currentTakeHome: {
    en: { q: "What is your current take-home pay?", hint: "e.g. about 180,000 yen per month" },
    vi: { q: "Lương thực lĩnh hiện tại của bạn là bao nhiêu?", hint: "Ví dụ: khoảng 180.000 yên/tháng" },
    id: { q: "Berapa gaji bersih Anda saat ini?", hint: "Contoh: sekitar 180.000 yen per bulan" },
    my: { q: "လက်ရှိ လက်ထဲရောက်လစာ ဘယ်လောက်လဲ။", hint: "ဥပမာ - တစ်လ ယန်း ၁၈၀,၀၀၀ ခန့်" },
    ne: { q: "हालको हातमा आउने तलब कति हो?", hint: "उदाहरण: महिनाको करिब १,८०,००० येन" },
    km: { q: "ប្រាក់ខែសុទ្ធបច្ចុប្បន្នរបស់អ្នកប៉ុន្មាន?", hint: "ឧទាហរណ៍៖ ប្រហែល ១៨០,០០០ យ៉េនក្នុងមួយខែ" },
  },
  retirementReason: {
    en: { q: "Why did you leave (or want to leave) your job?", hint: "e.g. I want a more specialized job." },
    vi: { q: "Lý do bạn nghỉ (hoặc muốn nghỉ) việc là gì?", hint: "Ví dụ: Muốn thử công việc chuyên môn hơn." },
    id: { q: "Mengapa Anda berhenti (atau ingin berhenti) dari pekerjaan?", hint: "Contoh: Ingin pekerjaan yang lebih profesional." },
    my: { q: "အလုပ်ထွက် (သို့) ထွက်လိုသည့် အကြောင်းရင်းကို ပြောပြပါ။", hint: "ဥပမာ - ပိုမိုကျွမ်းကျင်သောအလုပ်ကို လုပ်လိုသောကြောင့်။" },
    ne: { q: "काम छोड्नुको (वा छोड्न चाहनुको) कारण के हो?", hint: "उदाहरण: थप विशेषज्ञ काम गर्न चाहन्छु।" },
    km: { q: "មូលហេតុដែលអ្នកឈប់ (ឬចង់ឈប់) ពីការងារ?", hint: "ឧទាហរណ៍៖ ចង់ធ្វើការងារដែលមានជំនាញជាងនេះ។" },
  },
  motivation: {
    en: { q: "Why did you apply for this job?", hint: "e.g. There is a dormitory and I can work for a long time." },
    vi: { q: "Lý do bạn ứng tuyển công việc này là gì?", hint: "Ví dụ: Có ký túc xá và có thể làm lâu dài." },
    id: { q: "Mengapa Anda melamar pekerjaan ini?", hint: "Contoh: Ada asrama dan bisa bekerja lama." },
    my: { q: "ဤအလုပ်ကို လျှောက်ထားသည့် အကြောင်းရင်းကို ပြောပြပါ။", hint: "ဥပမာ - အဆောင်ရှိပြီး ကြာရှည်လုပ်နိုင်မည်ဟု ထင်သောကြောင့်။" },
    ne: { q: "यो कामका लागि आवेदन गर्नुको कारण के हो?", hint: "उदाहरण: छात्रावास छ र लामो समय काम गर्न सकिन्छ।" },
    km: { q: "ហេតុអ្វីបានជាអ្នកដាក់ពាក្យការងារនេះ?", hint: "ឧទាហរណ៍៖ មានអន្តេវាសិកដ្ឋាន ហើយអាចធ្វើការបានយូរ។" },
  },
  preferredLocation: {
    en: { q: "Where would you like to work (area)?", hint: "e.g. Tokyo / Kanagawa, or anywhere is fine" },
    vi: { q: "Bạn muốn làm việc ở khu vực nào?", hint: "Ví dụ: Tokyo, Kanagawa / Ở đâu cũng được" },
    id: { q: "Di daerah mana Anda ingin bekerja?", hint: "Contoh: Tokyo / Kanagawa, atau di mana saja" },
    my: { q: "ဘယ်ဒေသမှာ အလုပ်လုပ်ချင်ပါသလဲ။", hint: "ဥပမာ - တိုကျို / ကာနာဂါဝ / ဘယ်နေရာမဆို" },
    ne: { q: "तपाईं कुन क्षेत्रमा काम गर्न चाहनुहुन्छ?", hint: "उदाहरण: टोकियो / कानागावा, वा जहाँ पनि" },
    km: { q: "អ្នកចង់ធ្វើការនៅតំបន់ណា?", hint: "ឧទាហរណ៍៖ តូក្យូ / កាណាហ្កាវ៉ា ឬកន្លែងណាក៏បាន" },
  },
  desiredTakeHome: {
    en: { q: "What take-home pay would you like?", hint: "e.g. 200,000 yen or more per month" },
    vi: { q: "Bạn mong muốn lương thực lĩnh bao nhiêu?", hint: "Ví dụ: từ 200.000 yên/tháng trở lên" },
    id: { q: "Berapa gaji bersih yang Anda harapkan?", hint: "Contoh: 200.000 yen atau lebih per bulan" },
    my: { q: "လိုချင်သော လက်ထဲရောက်လစာ ဘယ်လောက်လဲ။", hint: "ဥပမာ - တစ်လ ယန်း ၂၀၀,၀၀၀ အထက်" },
    ne: { q: "तपाईंले चाहेको हातमा आउने तलब कति हो?", hint: "उदाहरण: महिनाको २,००,००० येन वा बढी" },
    km: { q: "អ្នកចង់បានប្រាក់ខែសុទ្ធប៉ុន្មាន?", hint: "ឧទាហរណ៍៖ ២០០,០០០ យ៉េនឡើងទៅក្នុងមួយខែ" },
  },
  interviewAvailability: {
    en: { q: "When are you available for an interview?", hint: "e.g. Weekday afternoons. Weekends are also fine." },
    vi: { q: "Bạn có thể phỏng vấn vào thời gian nào?", hint: "Ví dụ: Buổi chiều các ngày trong tuần. Cuối tuần cũng được." },
    id: { q: "Kapan Anda bisa mengikuti wawancara?", hint: "Contoh: Sore hari kerja. Akhir pekan juga bisa." },
    my: { q: "အင်တာဗျူး ဘယ်အချိန်မှာ လုပ်နိုင်ပါသလဲ။", hint: "ဥပမာ - အလုပ်ရက် နေ့လယ်ပိုင်း။ စနေ/တနင်္ဂနွေလည်း ရပါသည်။" },
    ne: { q: "अन्तर्वार्ताका लागि कहिले समय मिल्छ?", hint: "उदाहरण: हप्ताका दिन दिउँसो। शनिबार-आइतबार पनि ठीक छ।" },
    km: { q: "អ្នកអាចសម្ភាសន៍នៅពេលណា?", hint: "ឧទាហរណ៍៖ រសៀលថ្ងៃធ្វើការ។ ចុងសប្តាហ៍ក៏បាន។" },
  },
  availableStartDate: {
    en: { q: "When can you start working?", hint: "e.g. From October 2025 / Immediately" },
    vi: { q: "Khi nào bạn có thể bắt đầu đi làm?", hint: "Ví dụ: Từ tháng 10/2025 / Ngay lập tức" },
    id: { q: "Kapan Anda bisa mulai bekerja?", hint: "Contoh: Mulai Oktober 2025 / Segera" },
    my: { q: "ဘယ်အချိန်ကစ၍ အလုပ်ဝင်နိုင်ပါသလဲ။", hint: "ဥပမာ - ၂၀၂၅ အောက်တိုဘာမှစ၍ / ချက်ချင်း" },
    ne: { q: "तपाईं कहिलेदेखि काम सुरु गर्न सक्नुहुन्छ?", hint: "उदाहरण: २०२५ अक्टोबरदेखि / तुरुन्तै" },
    km: { q: "អ្នកអាចចាប់ផ្តើមធ្វើការនៅពេលណា?", hint: "ឧទាហរណ៍៖ ចាប់ពីខែតុលា ២០២៥ / ភ្លាមៗ" },
  },
  desiredWorkYears: {
    en: { q: "How long would you like to work in Japan?", hint: "e.g. 5 years or more / As long as possible" },
    vi: { q: "Bạn muốn làm việc ở Nhật trong bao lâu?", hint: "Ví dụ: Trên 5 năm / Càng lâu càng tốt" },
    id: { q: "Berapa lama Anda ingin bekerja di Jepang?", hint: "Contoh: 5 tahun atau lebih / Selama mungkin" },
    my: { q: "ဂျပန်မှာ ဘယ်လောက်ကြာကြာ အလုပ်လုပ်ချင်ပါသလဲ။", hint: "ဥပမာ - ၅ နှစ်အထက် / တတ်နိုင်သမျှ ကြာကြာ" },
    ne: { q: "तपाईं जापानमा कति समय काम गर्न चाहनुहुन्छ?", hint: "उदाहरण: ५ वर्ष वा बढी / सकेसम्म लामो" },
    km: { q: "អ្នកចង់ធ្វើការនៅជប៉ុនរយៈពេលប៉ុន្មាន?", hint: "ឧទាហរណ៍៖ ៥ ឆ្នាំឡើងទៅ / ឲ្យបានយូរបំផុត" },
  },
  futurePlan: {
    en: { q: "What kind of work and life do you want in Japan in the future?", hint: "e.g. I want to become a team leader. I want to bring my family to Japan." },
    vi: { q: "Trong tương lai, bạn muốn làm công việc và cuộc sống như thế nào ở Nhật?", hint: "Ví dụ: Muốn trở thành tổ trưởng. Muốn đưa gia đình sang Nhật." },
    id: { q: "Di masa depan, pekerjaan dan kehidupan seperti apa yang Anda inginkan di Jepang?", hint: "Contoh: Ingin menjadi pemimpin tim. Ingin membawa keluarga ke Jepang." },
    my: { q: "အနာဂတ်မှာ ဂျပန်တွင် ဘယ်လိုအလုပ်နှင့် ဘဝကို လိုချင်ပါသလဲ။", hint: "ဥပမာ - လုပ်ငန်းခွင်ခေါင်းဆောင် ဖြစ်ချင်သည်။ မိသားစုကို ဂျပန်ခေါ်ချင်သည်။" },
    ne: { q: "भविष्यमा जापानमा कस्तो काम र जीवन चाहनुहुन्छ?", hint: "उदाहरण: टिम लिडर बन्न चाहन्छु। परिवारलाई जापान ल्याउन चाहन्छु।" },
    km: { q: "នាពេលអនាគត អ្នកចង់ធ្វើការងារ និងរស់នៅបែបណានៅជប៉ុន?", hint: "ឧទាហរណ៍៖ ចង់ក្លាយជាប្រធានក្រុម។ ចង់នាំគ្រួសារមកជប៉ុន។" },
  },
  japaneseCertification: {
    en: { q: "Which Japanese language certificates do you have?", hint: "e.g. JLPT N3 (Dec 2024) / JFT-Basic passed / None" },
    vi: { q: "Bạn có chứng chỉ tiếng Nhật nào?", hint: "Ví dụ: JLPT N3 (12/2024) / Đỗ JFT-Basic / Không có" },
    id: { q: "Sertifikat bahasa Jepang apa yang Anda miliki?", hint: "Contoh: JLPT N3 (Des 2024) / Lulus JFT-Basic / Tidak ada" },
    my: { q: "ဂျပန်ဘာသာ အောင်လက်မှတ် ဘာရှိပါသလဲ။", hint: "ဥပမာ - JLPT N3 (၂၀၂၄ ဒီဇင်ဘာ) / JFT-Basic အောင် / မရှိ" },
    ne: { q: "तपाईंसँग जापानी भाषाको कुन प्रमाणपत्र छ?", hint: "उदाहरण: JLPT N3 (डिसेम्बर २०२४) / JFT-Basic पास / छैन" },
    km: { q: "អ្នកមានវិញ្ញាបនបត្រភាសាជប៉ុនអ្វីខ្លះ?", hint: "ឧទាហរណ៍៖ JLPT N3 (ធ្នូ ២០២៤) / ជាប់ JFT-Basic / គ្មាន" },
  },
  japaneseConversationLevel: {
    en: { q: "How well can you speak Japanese?" },
    vi: { q: "Bạn nói tiếng Nhật được ở mức nào?" },
    id: { q: "Seberapa baik Anda bisa berbicara bahasa Jepang?" },
    my: { q: "ဂျပန်စကား ဘယ်လောက် ပြောနိုင်ပါသလဲ။" },
    ne: { q: "तपाईं जापानी भाषा कति बोल्न सक्नुहुन्छ?" },
    km: { q: "អ្នកអាចនិយាយភាសាជប៉ុនបានកម្រិតណា?" },
  },
};

/** セクション見出し (日本語 → 各言語) */
const SECTIONS: Record<string, Partial<Record<IntakeLang, string>>> = {
  はじめに: { en: "Getting started", vi: "Bắt đầu", id: "Pembukaan", my: "စတင်ရန်", ne: "सुरुमा", km: "ចាប់ផ្តើម" },
  日本に来た目的: { en: "Purpose of coming to Japan", vi: "Mục đích đến Nhật", id: "Tujuan ke Jepang", my: "ဂျပန်လာရသည့် ရည်ရွယ်ချက်", ne: "जापान आउनुको उद्देश्य", km: "គោលបំណងមកជប៉ុន" },
  日本語について: { en: "Japanese language", vi: "Về tiếng Nhật", id: "Tentang bahasa Jepang", my: "ဂျပန်ဘာသာစကား", ne: "जापानी भाषा", km: "អំពីភាសាជប៉ុន" },
  "分野の経験・仕事内容・今の給料": { en: "Experience, current job and salary", vi: "Kinh nghiệm, công việc và lương hiện tại", id: "Pengalaman, pekerjaan dan gaji saat ini", my: "အတွေ့အကြုံ၊ အလုပ်နှင့် လက်ရှိလစာ", ne: "अनुभव, हालको काम र तलब", km: "បទពិសោធន៍ ការងារ និងប្រាក់ខែបច្ចុប្បន្ន" },
  転職の理由: { en: "Reason for changing jobs", vi: "Lý do chuyển việc", id: "Alasan pindah kerja", my: "အလုပ်ပြောင်းရသည့် အကြောင်းရင်း", ne: "काम परिवर्तनको कारण", km: "មូលហេតុប្តូរការងារ" },
  "今の住まい（アパート）について": { en: "Current housing", vi: "Nơi ở hiện tại", id: "Tempat tinggal saat ini", my: "လက်ရှိနေထိုင်ရာ", ne: "हालको बसोबास", km: "លំនៅដ្ឋានបច្ចុប្បន្ន" },
  "応募理由・希望エリア・希望の給料": { en: "Why you applied, preferred area and salary", vi: "Lý do ứng tuyển, khu vực và lương mong muốn", id: "Alasan melamar, daerah dan gaji yang diinginkan", my: "လျှောက်ထားရသည့်အကြောင်း၊ လိုချင်သောဒေသနှင့် လစာ", ne: "आवेदनको कारण, चाहेको क्षेत्र र तलब", km: "មូលហេតុដាក់ពាក្យ តំបន់ និងប្រាក់ខែដែលចង់បាន" },
  "面接・入社の可否": { en: "Interview and start date", vi: "Phỏng vấn và ngày đi làm", id: "Wawancara dan tanggal mulai", my: "အင်တာဗျူးနှင့် အလုပ်ဝင်ရက်", ne: "अन्तर्वार्ता र काम सुरु गर्ने मिति", km: "សម្ភាសន៍ និងថ្ងៃចូលធ្វើការ" },
  日本での将来の目標: { en: "Future goals in Japan", vi: "Mục tiêu tương lai ở Nhật", id: "Tujuan masa depan di Jepang", my: "ဂျပန်တွင် အနာဂတ်ရည်မှန်းချက်", ne: "जापानमा भविष्यको लक्ष्य", km: "គោលដៅអនាគតនៅជប៉ុន" },
};

const SECTION_DESC: Record<string, Partial<Record<IntakeLang, string>>> = {
  "最初に 1 つだけ教えてください。この回答で、あとの質問が少し変わります。": {
    en: "Just one question first. Your answer changes the next questions a little.",
    vi: "Trước tiên chỉ 1 câu. Câu trả lời này sẽ thay đổi một chút các câu hỏi sau.",
    id: "Satu pertanyaan dulu. Jawaban ini sedikit mengubah pertanyaan berikutnya.",
    my: "ပထမ မေးခွန်းတစ်ခုသာ။ ဤအဖြေအပေါ်မူတည်၍ နောက်မေးခွန်းများ အနည်းငယ် ပြောင်းပါမည်။",
    ne: "सुरुमा एउटा मात्र प्रश्न। यस उत्तरले पछिका प्रश्नहरू अलिकति बदलिन्छन्।",
    km: "សំណួរមួយជាមុនសិន។ ចម្លើយនេះនឹងផ្លាស់ប្តូរសំណួរបន្ទាប់បន្តិច។",
  },
};

export function tUi(lang: IntakeLang, key: string): string {
  return UI[lang]?.[key] ?? UI.ja[key] ?? key;
}

/** 日本語の文言 (母国語の下に小さく添える用)。母国語が日本語なら空 */
export function tUiJa(lang: IntakeLang, key: string): string {
  return lang === "ja" ? "" : UI.ja[key] ?? "";
}

export function tOption(lang: IntakeLang, ja: string): string {
  return OPTIONS[ja]?.[lang] ?? ja;
}

/** 質問文。翻訳が無ければ日本語をそのまま返す */
export function tQuestion(lang: IntakeLang, key: string, jaQuestion: string, jaHint?: string): QText {
  const t = QUESTIONS[key]?.[lang];
  if (lang === "ja" || !t) return { q: jaQuestion, hint: jaHint };
  return { q: t.q, hint: t.hint ?? jaHint };
}

export function tSection(lang: IntakeLang, jaTitle: string): string {
  return (lang === "ja" ? null : SECTIONS[jaTitle]?.[lang]) ?? jaTitle;
}

export function tSectionDesc(lang: IntakeLang, jaDesc: string | undefined): string | undefined {
  if (!jaDesc) return undefined;
  return (lang === "ja" ? null : SECTION_DESC[jaDesc]?.[lang]) ?? jaDesc;
}

/** 候補者にフォームの URL を送るときの文面 (母国語 + 日本語) */
export function buildIntakeMessage(lang: IntakeLang, name: string, url: string): string {
  const fill = (s: string) => s.replace("{name}", name).replace("{url}", url);
  const native = fill(tUi(lang, "message"));
  if (lang === "ja") return native;
  // 日本語も付けて、担当者が内容を確認できるようにする
  return `${native}\n\n${fill(UI.ja.message)}`;
}
