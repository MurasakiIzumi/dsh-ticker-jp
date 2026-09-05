// dsh-ticker-jp — Client half (bundle entry)
//
// Bundle 形态的 Client：在页面右上角渲染可拖拽、可收起的悬浮行情窗，轮询
// /dsh-ticker-jp/quotes 路由展示报价，并支持自选标的与显示别名。
//
// Bundle-form client: renders the draggable, collapsible floating quote window
// at the top-right of the page, polls the /dsh-ticker-jp/quotes route for
// quotes, and lets the user manage a watchlist with display aliases.

window.__ModuleLoader__.load({
  id: "dsh-ticker-jp",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    var NEUTRAL = "var(--dsw-alias-label-primary)";

    var PALETTES = {
      jp: { up: "#ff3b30", down: "#00e08a" },
      us: { up: "#00e08a", down: "#ff3b30" },
    };

    var STORAGE_KEY = "dsh-ticker-jp:syms";
    var POS_KEY = "dsh-ticker-jp:pos";
    var PALETTE_KEY = "dsh-ticker-jp:palette";
    var LANG_KEY = "dsh-ticker-jp:lang";
    var DEFAULTS = ["1306.T", "^N225"];
    var RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/;

    // Local trading windows (open/close in local minutes) per Yahoo exchange
    // timezone. Only weekends + hours are modelled — lunch breaks and
    // holidays are skipped, and unknown timezones count as open.
    var MARKET_HOURS = {
      "Asia/Tokyo": { open: 9 * 60, close: 15 * 60 + 30 },
      "Asia/Hong_Kong": { open: 9 * 60 + 30, close: 16 * 60 },
      "Asia/Shanghai": { open: 9 * 60 + 30, close: 15 * 60 },
      "America/New_York": { open: 9 * 60 + 30, close: 16 * 60 },
    };
    var ACTIVE_POLL_MS = 5000;
    var IDLE_CHECK_MS = 60000;
    var EDIT_WIDTH = 300;
    var MIN_VISIBLE = 40;

    // --- Localization -------------------------------------------------------
    var LANG_KEYS = ["zhHans", "zhHant", "en", "ja", "fr", "de", "es", "it", "pt", "ru", "ko", "th", "vi", "id", "tr", "ar"];
    var LANG_LABELS = {
      zhHans: "简体中文", zhHant: "繁體中文", en: "English", ja: "日本語",
      fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", pt: "Português",
      ru: "Русский", ko: "한국어", th: "ไทย", vi: "Tiếng Việt", id: "Bahasa Indonesia",
      tr: "Türkçe", ar: "العربية",
    };

    // navigator.language -> canonical key. zh-Hant/zh-TW/zh-HK/zh-MO is traditional,
    // other zh is simplified; ja/en and the extended locales map by language prefix,
    // anything else falls back to en.
    function detectLang(browserLang) {
      var tag = String(browserLang || "").toLowerCase();
      var base = tag.split("-")[0];
      if (base === "zh") return /(hant|tw|hk|mo)/.test(tag) ? "zhHant" : "zhHans";
      var map = {
        ja: "ja", en: "en",
        fr: "fr", de: "de", es: "es", it: "it", pt: "pt", ru: "ru",
        ko: "ko", th: "th", vi: "vi", id: "id", tr: "tr", ar: "ar",
      };
      return map[base] || "en";
    }

    function readLang() {
      var value = null;
      if (canStore()) {
        try {
          value = localStorage.getItem(LANG_KEY);
        } catch (e) { value = null; }
      }
      if (LANG_KEYS.indexOf(value) !== -1) return value;
      var nav = (typeof navigator !== "undefined") ? navigator.language : "";
      return detectLang(nav);
    }

    function writeLang(name) {
      if (!canStore()) return;
      try {
        localStorage.setItem(LANG_KEY, name);
      } catch (e) { }
    }

    var T = {
      zhHans: {
        title: "行情", titleEdit: "自选行情", settings: "自选设置",
        expand: "展开", collapse: "收起",
        restore: "恢复默认", done: "完成", add: "添加", remove: "移除",
        namePh: "显示名（可选）", codePh: "股票代码，如 9984.T",
        hint1: "4 位简码仅日股，自动补 .T", hint2: "其它市场请输完整代码，如 AAPL / 0700.HK",
        langLabel: "语言", paletteLabel: "涨跌配色：",
        paletteJp: "红涨绿跌（日式）", paletteUs: "绿涨红跌（美式）",
        paletteTip: "点击切换配色（日式红涨绿跌 / 美式绿涨红跌）",
        loading: "加载中…", fetchFail: "获取失败", n225: "日经225",
      },
      zhHant: {
        title: "行情", titleEdit: "自選行情", settings: "自選設定",
        expand: "展開", collapse: "收起",
        restore: "恢復預設", done: "完成", add: "新增", remove: "移除",
        namePh: "顯示名稱（可選）", codePh: "股票代碼，如 9984.T",
        hint1: "4 位簡碼僅日股，自動補 .T", hint2: "其他市場請輸入完整代碼，如 AAPL / 0700.HK",
        langLabel: "語言", paletteLabel: "漲跌配色：",
        paletteJp: "紅漲綠跌（日式）", paletteUs: "綠漲紅跌（美式）",
        paletteTip: "點擊切換配色（日式紅漲綠跌 / 美式綠漲紅跌）",
        loading: "載入中…", fetchFail: "取得失敗", n225: "日經225",
      },
      en: {
        title: "Markets", titleEdit: "Watchlist", settings: "Watchlist settings",
        expand: "Expand", collapse: "Collapse",
        restore: "Restore default", done: "Done", add: "Add", remove: "Remove",
        namePh: "Display name (optional)", codePh: "Symbol, e.g. 9984.T",
        hint1: "4-digit short code: Japan only (adds .T)",
        hint2: "Full code for other markets (AAPL / 0700.HK)",
        langLabel: "Language", paletteLabel: "Colors: ",
        paletteJp: "Red-up / green-down (JP)", paletteUs: "Green-up / red-down (US)",
        paletteTip: "Click to switch: JP = red up / green down, US = green up / red down",
        loading: "Loading…", fetchFail: "Fetch failed", n225: "Nikkei 225",
      },
      ja: {
        title: "相場", titleEdit: "ウォッチリスト", settings: "ウォッチリスト設定",
        expand: "開く", collapse: "閉じる",
        restore: "初期化", done: "完了", add: "追加", remove: "削除",
        namePh: "表示名（任意）", codePh: "銘柄コード、例 9984.T",
        hint1: "4桁略号は日本株のみ（.T 補完）", hint2: "他市場は完全コード（AAPL / 0700.HK 等）",
        langLabel: "言語", paletteLabel: "色分け：",
        paletteJp: "値上がり赤・下がり緑（日本式）", paletteUs: "値上がり緑・下がり赤（米国式）",
        paletteTip: "配色を切替（日本式 上昇赤・下落緑 / 米国式 上昇緑・下落赤）",
        loading: "読み込み中…", fetchFail: "取得に失敗", n225: "日経225",
      },
      fr: {
        title: "Marchés", titleEdit: "Liste de suivi", settings: "Paramètres de la liste",
        expand: "Développer", collapse: "Réduire",
        restore: "Rétablir par défaut", done: "Terminé", add: "Ajouter", remove: "Supprimer",
        namePh: "Nom d'affichage (facultatif)", codePh: "Symbole, ex. 9984.T",
        hint1: "Code court à 4 chiffres : Japon uniquement (ajoute .T)", hint2: "Code complet pour les autres marchés (AAPL / 0700.HK)",
        langLabel: "Langue", paletteLabel: "Couleurs : ",
        paletteJp: "Hausse rouge / baisse verte (JP)", paletteUs: "Hausse verte / baisse rouge (US)",
        paletteTip: "Cliquer pour changer : JP = hausse rouge / baisse verte, US = hausse verte / baisse rouge",
        loading: "Chargement…", fetchFail: "Échec de la récupération", n225: "Nikkei 225",
      },
      de: {
        title: "Märkte", titleEdit: "Beobachtungsliste", settings: "Beobachtungslisten-Einstellungen",
        expand: "Erweitern", collapse: "Einklappen",
        restore: "Standard wiederherstellen", done: "Fertig", add: "Hinzufügen", remove: "Entfernen",
        namePh: "Anzeigename (optional)", codePh: "Symbol, z. B. 9984.T",
        hint1: "4-stelliger Kurzcode: nur Japan (ergänzt .T)", hint2: "Vollständiger Code für andere Märkte (AAPL / 0700.HK)",
        langLabel: "Sprache", paletteLabel: "Farben: ",
        paletteJp: "Anstieg rot / Rückgang grün (JP)", paletteUs: "Anstieg grün / Rückgang rot (US)",
        paletteTip: "Zum Wechseln klicken: JP = rot bei Anstieg / grün bei Rückgang, US = grün bei Anstieg / rot bei Rückgang",
        loading: "Wird geladen…", fetchFail: "Abruf fehlgeschlagen", n225: "Nikkei 225",
      },
      es: {
        title: "Mercados", titleEdit: "Lista de seguimiento", settings: "Ajustes de la lista",
        expand: "Expandir", collapse: "Contraer",
        restore: "Restablecer valores", done: "Hecho", add: "Añadir", remove: "Eliminar",
        namePh: "Nombre para mostrar (opcional)", codePh: "Símbolo, p. ej. 9984.T",
        hint1: "Código corto de 4 dígitos: solo Japón (añade .T)", hint2: "Código completo para otros mercados (AAPL / 0700.HK)",
        langLabel: "Idioma", paletteLabel: "Colores: ",
        paletteJp: "Sube rojo / baja verde (JP)", paletteUs: "Sube verde / baja rojo (US)",
        paletteTip: "Haz clic para cambiar: JP = subida roja / bajada verde, US = subida verde / bajada roja",
        loading: "Cargando…", fetchFail: "Error al obtener datos", n225: "Nikkei 225",
      },
      it: {
        title: "Mercati", titleEdit: "Lista di osservazione", settings: "Impostazioni della lista",
        expand: "Espandi", collapse: "Comprimi",
        restore: "Ripristina predefiniti", done: "Fine", add: "Aggiungi", remove: "Rimuovi",
        namePh: "Nome visualizzato (facoltativo)", codePh: "Codice, es. 9984.T",
        hint1: "Codice breve a 4 cifre: solo Giappone (aggiunge .T)", hint2: "Codice completo per altri mercati (AAPL / 0700.HK)",
        langLabel: "Lingua", paletteLabel: "Colori: ",
        paletteJp: "Rialzo rosso / ribasso verde (JP)", paletteUs: "Rialzo verde / ribasso rosso (US)",
        paletteTip: "Clicca per cambiare: JP = rialzo rosso / ribasso verde, US = rialzo verde / ribasso rosso",
        loading: "Caricamento…", fetchFail: "Recupero non riuscito", n225: "Nikkei 225",
      },
      pt: {
        title: "Mercados", titleEdit: "Lista de acompanhamento", settings: "Configurações da lista",
        expand: "Expandir", collapse: "Recolher",
        restore: "Restaurar padrão", done: "Concluir", add: "Adicionar", remove: "Remover",
        namePh: "Nome de exibição (opcional)", codePh: "Código, ex. 9984.T",
        hint1: "Código curto de 4 dígitos: apenas Japão (adiciona .T)", hint2: "Código completo para outros mercados (AAPL / 0700.HK)",
        langLabel: "Idioma", paletteLabel: "Cores: ",
        paletteJp: "Alta vermelha / baixa verde (JP)", paletteUs: "Alta verde / baixa vermelha (US)",
        paletteTip: "Clique para alternar: JP = alta vermelha / baixa verde, US = alta verde / baixa vermelha",
        loading: "Carregando…", fetchFail: "Falha ao buscar", n225: "Nikkei 225",
      },
      ru: {
        title: "Рынки", titleEdit: "Список наблюдения", settings: "Настройки списка",
        expand: "Развернуть", collapse: "Свернуть",
        restore: "Вернуть по умолчанию", done: "Готово", add: "Добавить", remove: "Удалить",
        namePh: "Отображаемое имя (необязательно)", codePh: "Код, напр. 9984.T",
        hint1: "Короткий код из 4 цифр: только Япония (добавляет .T)", hint2: "Полный код для других рынков (AAPL / 0700.HK)",
        langLabel: "Язык", paletteLabel: "Цвета: ",
        paletteJp: "Рост красный / падение зелёное (JP)", paletteUs: "Рост зелёный / падение красное (US)",
        paletteTip: "Нажмите, чтобы сменить: JP — рост красный / падение зелёное, US — рост зелёный / падение красное",
        loading: "Загрузка…", fetchFail: "Не удалось получить данные", n225: "Nikkei 225",
      },
      ko: {
        title: "시장", titleEdit: "관심 목록", settings: "관심 목록 설정",
        expand: "펼치기", collapse: "접기",
        restore: "기본값 복원", done: "완료", add: "추가", remove: "삭제",
        namePh: "표시 이름(선택)", codePh: "종목 코드, 예: 9984.T",
        hint1: "4자리 단축 코드: 일본만 해당(.T 자동 추가)", hint2: "다른 시장은 전체 코드 입력(AAPL / 0700.HK)",
        langLabel: "언어", paletteLabel: "색상: ",
        paletteJp: "상승 빨강 / 하락 초록 (일본식)", paletteUs: "상승 초록 / 하락 빨강 (미국식)",
        paletteTip: "클릭하여 전환: JP = 상승 빨강·하락 초록, US = 상승 초록·하락 빨강",
        loading: "불러오는 중…", fetchFail: "불러오기 실패", n225: "닛케이 225",
      },
      th: {
        title: "ตลาด", titleEdit: "รายการเฝ้าดู", settings: "การตั้งค่ารายการ",
        expand: "ขยาย", collapse: "ย่อ",
        restore: "คืนค่าเริ่มต้น", done: "เสร็จสิ้น", add: "เพิ่ม", remove: "ลบ",
        namePh: "ชื่อที่แสดง (ไม่บังคับ)", codePh: "รหัสหลักทรัพย์ เช่น 9984.T",
        hint1: "รหัสย่อ 4 หลัก: เฉพาะญี่ปุ่น (เติม .T อัตโนมัติ)", hint2: "ตลาดอื่นกรอกรหัสเต็ม เช่น AAPL / 0700.HK",
        langLabel: "ภาษา", paletteLabel: "สี: ",
        paletteJp: "ขึ้นแดง / ลงเขียว (แบบญี่ปุ่น)", paletteUs: "ขึ้นเขียว / ลงแดง (แบบสหรัฐฯ)",
        paletteTip: "คลิกเพื่อสลับ: JP = ขึ้นแดง/ลงเขียว, US = ขึ้นเขียว/ลงแดง",
        loading: "กำลังโหลด…", fetchFail: "โหลดข้อมูลไม่สำเร็จ", n225: "Nikkei 225",
      },
      vi: {
        title: "Thị trường", titleEdit: "Danh sách theo dõi", settings: "Cài đặt danh sách",
        expand: "Mở rộng", collapse: "Thu gọn",
        restore: "Khôi phục mặc định", done: "Xong", add: "Thêm", remove: "Xóa",
        namePh: "Tên hiển thị (tùy chọn)", codePh: "Mã chứng khoán, vd. 9984.T",
        hint1: "Mã ngắn 4 chữ số: chỉ Nhật Bản (tự thêm .T)", hint2: "Thị trường khác nhập mã đầy đủ (AAPL / 0700.HK)",
        langLabel: "Ngôn ngữ", paletteLabel: "Màu sắc: ",
        paletteJp: "Tăng đỏ / giảm xanh (kiểu Nhật)", paletteUs: "Tăng xanh / giảm đỏ (kiểu Mỹ)",
        paletteTip: "Nhấp để chuyển: JP = tăng đỏ/giảm xanh, US = tăng xanh/giảm đỏ",
        loading: "Đang tải…", fetchFail: "Không lấy được dữ liệu", n225: "Nikkei 225",
      },
      id: {
        title: "Pasar", titleEdit: "Daftar pantauan", settings: "Pengaturan daftar",
        expand: "Perluas", collapse: "Ciutkan",
        restore: "Pulihkan bawaan", done: "Selesai", add: "Tambah", remove: "Hapus",
        namePh: "Nama tampilan (opsional)", codePh: "Kode saham, mis. 9984.T",
        hint1: "Kode pendek 4 digit: khusus Jepang (menambah .T)", hint2: "Kode lengkap untuk pasar lain (AAPL / 0700.HK)",
        langLabel: "Bahasa", paletteLabel: "Warna: ",
        paletteJp: "Naik merah / turun hijau (JP)", paletteUs: "Naik hijau / turun merah (US)",
        paletteTip: "Klik untuk mengganti: JP = naik merah/turun hijau, US = naik hijau/turun merah",
        loading: "Memuat…", fetchFail: "Gagal mengambil data", n225: "Nikkei 225",
      },
      tr: {
        title: "Piyasalar", titleEdit: "İzleme listesi", settings: "Liste ayarları",
        expand: "Genişlet", collapse: "Daralt",
        restore: "Varsayılana dön", done: "Bitti", add: "Ekle", remove: "Kaldır",
        namePh: "Görünen ad (isteğe bağlı)", codePh: "Sembol, ör. 9984.T",
        hint1: "4 haneli kısa kod: yalnızca Japonya (.T ekler)", hint2: "Diğer piyasalar için tam kod (AAPL / 0700.HK)",
        langLabel: "Dil", paletteLabel: "Renkler: ",
        paletteJp: "Yükseliş kırmızı / düşüş yeşil (JP)", paletteUs: "Yükseliş yeşil / düşüş kırmızı (US)",
        paletteTip: "Değiştirmek için tıklayın: JP = yükseliş kırmızı / düşüş yeşil, US = yükseliş yeşil / düşüş kırmızı",
        loading: "Yükleniyor…", fetchFail: "Veri alınamadı", n225: "Nikkei 225",
      },
      ar: {
        title: "الأسواق", titleEdit: "قائمة المتابعة", settings: "إعدادات القائمة",
        expand: "توسيع", collapse: "طيّ",
        restore: "استعادة الافتراضي", done: "تم", add: "إضافة", remove: "إزالة",
        namePh: "الاسم المعروض (اختياري)", codePh: "الرمز، مثل 9984.T",
        hint1: "رمز مختصر من 4 أرقام: اليابان فقط (يضيف .T)", hint2: "رمز كامل للأسواق الأخرى (AAPL / 0700.HK)",
        langLabel: "اللغة", paletteLabel: "الألوان: ",
        paletteJp: "صعود أحمر / هبوط أخضر (JP)", paletteUs: "صعود أخضر / هبوط أحمر (US)",
        paletteTip: "انقر للتبديل: JP = صعود أحمر / هبوط أخضر، US = صعود أخضر / هبوط أحمر",
        loading: "جارٍ التحميل…", fetchFail: "فشل جلب البيانات", n225: "نيكاي 225",
      },
    };

    // Builtin short names for the two defaults, localized per UI language.
    function shortNameFor(code, lang) {
      if (code === "1306.T") return "TOPIX ETF";
      if (code === "^N225") return (T[lang] || T.en).n225;
      return "";
    }

    // --- Watch list ---------------------------------------------------------
    // "9984" -> "9984.T"; returns "" for empty / invalid input.
    function normalizeSymbol(raw) {
      var s = String(raw == null ? "" : raw).trim().toUpperCase();
      if (!s) return "";
      if (/^\d{4}$/.test(s)) s += ".T";
      return (RE_SYMBOL.test(s) && s.length <= 20) ? s : "";
    }

    // Accepts a string ("9984", "9984.T:软银", "9984.T：别名") or an entry
    // object { code, name? }. Returns { code, name? } or null when invalid.
    function parseEntry(raw) {
      var code = "";
      var name = "";
      if (typeof raw === "string") {
        var i = raw.search(/[:：]/);
        if (i === -1) code = raw;
        else { code = raw.slice(0, i); name = raw.slice(i + 1); }
      } else if (raw && typeof raw === "object") {
        code = raw.code;
        name = raw.name;
      }
      code = normalizeSymbol(code);
      name = String(name == null ? "" : name).trim();
      if (!code) return null;
      var entry = { code: code };
      if (name) entry.name = name;
      return entry;
    }

    function canStore() {
      try {
        return typeof localStorage !== "undefined" && localStorage !== null;
      } catch (e) {
        return false;
      }
    }

    // Yields a de-duplicated { code, name? } list. DEFAULTS fall back to codes.
    function readSyms() {
      var parsed = null;
      if (canStore()) {
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (raw) parsed = JSON.parse(raw);
        } catch (e) { parsed = null; }
      }
      var source = (Array.isArray(parsed) && parsed.length) ? parsed : DEFAULTS;
      var out = [];
      for (var i = 0; i < source.length; i++) {
        var entry = parseEntry(source[i]);
        if (!entry) continue;
        var dup = false;
        for (var j = 0; j < out.length; j++) {
          if (out[j].code === entry.code) { dup = true; break; }
        }
        if (dup) continue;
        out.push(entry);
      }
      if (out.length) return out;
      return DEFAULTS.map(function (c) { return { code: c }; });
    }

    function writeSyms(list) {
      if (!canStore()) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (e) { }
    }

    // --- Window position ----------------------------------------------------
    // pos = { x, y }: x is the CSS `right` offset (window anchored by its
    // RIGHT edge, so the collapse/expand button never moves when the width
    // changes), y is the top offset. Clamped so a grab area stays on screen;
    // the widest mode (EDIT_WIDTH) drives the left bound.
    function clampPos(raw, vw, vh) {
      var minX = MIN_VISIBLE;
      var maxX = Math.max(minX, vw - EDIT_WIDTH + MIN_VISIBLE);
      var maxY = Math.max(0, vh - MIN_VISIBLE);
      return {
        x: Math.min(Math.max(minX, Math.round(raw.x)), maxX),
        y: Math.min(Math.max(0, Math.round(raw.y)), maxY),
      };
    }

    function readPos() {
      var fallback = { x: 24, y: 16 };
      var parsed = null;
      if (canStore()) {
        try {
          var raw = localStorage.getItem(POS_KEY);
          if (raw) parsed = JSON.parse(raw);
        } catch (e) { parsed = null; }
      }
      var rawPos = (parsed && typeof parsed === "object" && typeof parsed.x === "number" && typeof parsed.y === "number")
        ? parsed
        : fallback;
      return clampPos(rawPos, window.innerWidth, window.innerHeight);
    }

    function writePos(pos) {
      if (!canStore()) return;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch (e) { }
    }

    // --- Palette preference (default jp) ------------------------------------
    function readPalette() {
      var value = null;
      if (canStore()) {
        try {
          value = localStorage.getItem(PALETTE_KEY);
        } catch (e) { value = null; }
      }
      return (value === "jp" || value === "us") ? value : "jp";
    }

    function writePalette(name) {
      if (!canStore()) return;
      try {
        localStorage.setItem(PALETTE_KEY, name);
      } catch (e) { }
    }

    // --- Market hours -------------------------------------------------------
    function zoneNow(tz, date) {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(date);
      function pick(type) {
        var p = parts.find(function (x) { return x.type === type; });
        return p ? p.value : "";
      }
      var hour = Number(pick("hour")) || 0;
      var minute = Number(pick("minute")) || 0;
      return { weekday: pick("weekday"), minutes: hour * 60 + minute };
    }

    function anyMarketOpen(tzs, date) {
      if (date === undefined) date = new Date();
      if (!tzs.length) return true;
      for (var i = 0; i < tzs.length; i++) {
        var hours = MARKET_HOURS[tzs[i]];
        if (!hours) return true;
        var local = zoneNow(tzs[i], date);
        if (local.weekday === "Sat" || local.weekday === "Sun") continue;
        if (local.minutes >= hours.open && local.minutes < hours.close) return true;
      }
      return false;
    }

    // --- Formatting ---------------------------------------------------------
    var DASH = "--"; // fallback shown when a value is unavailable (not localizable)
    function fmt(n) {
      var raw = Number(n);
      if (n == null || !Number.isFinite(raw)) return DASH;
      var v = Math.abs(raw) < 0.005 ? 0 : raw; // avoid "-0.00" for near-zero drops
      return v.toFixed(2);
    }
    function sign(n) {
      return n > 0 ? "+" : "";
    }

    var CSS = ".shq-widget{position:fixed;z-index:99999;width:232px;background:#1a1c23;background:color-mix(in srgb, var(--dsw-alias-bg-overlay,#1a1c23) 80%, transparent);color:var(--dsw-alias-label-primary,#eef0f4);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",sans-serif;user-select:none;-webkit-user-select:none;overflow:hidden}" +
      ".shq-widget.shq-collapsed{width:auto}" +
      ".shq-widget.shq-editing{width:300px}" +
      ".shq-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 12px;cursor:grab;touch-action:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}" +
      ".shq-collapsed .shq-head{border-bottom:none;padding:8px 12px 6px}" +
      ".shq-head:active{cursor:grabbing}" +
      ".shq-title{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#c7ccd6);white-space:nowrap}" +
      ".shq-collapse-face{display:inline-flex;align-items:center;gap:4px;height:14px;padding:0 3px 0 1px}" +
      ".shq-glyph{display:inline-flex;align-items:flex-end;gap:2px}" +
      ".shq-bar{width:3px;border-radius:1px;background:var(--dsw-alias-label-secondary,#c7ccd6);display:inline-block}" +
      ".shq-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.25);display:inline-block;flex:none}" +
      ".shq-dot-open{background:#00e08a;box-shadow:0 0 3px rgba(0,224,138,.55)}" +
      ".shq-dot-closed{background:#ff3b30;box-shadow:0 0 3px rgba(255,59,48,.55)}" +
      ".shq-tools{display:flex;align-items:center;gap:5px}" +
      ".shq-tool{width:18px;height:18px;border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.85;padding:0}" +
      ".shq-tool:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}" +
      ".shq-body{padding:5px 12px 8px}" +
      ".shq-row{display:flex;align-items:baseline;padding:6px 0}" +
      ".shq-row + .shq-row{border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}" +
      ".shq-name{font-size:12.5px;color:var(--dsw-alias-label-secondary,#c7ccd6);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px}" +
      ".shq-price{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;flex:none}" +
      ".shq-pct{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;width:64px;text-align:right;flex:none}" +
      ".shq-err{font-size:12px;color:var(--dsw-alias-label-secondary,#8f96a3);padding:4px 0}" +
      ".shq-edit{padding:8px 10px 10px}" +
      ".shq-edit-list{max-height:150px;overflow:auto}" +
      ".shq-edit-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.05))}" +
      ".shq-edit-code{flex:none;width:86px;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#aab0bc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".shq-edit-name{flex:1;min-width:0;border:1px solid transparent;border-radius:6px;background:rgba(255,255,255,.04);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:2px 6px;outline:none}" +
      ".shq-edit-name:focus{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.28));background:rgba(255,255,255,.06)}" +
      ".shq-edit-name::placeholder{color:var(--dsw-alias-label-secondary,#6d7280)}" +
      ".shq-edit-remove{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#8f96a3);cursor:pointer;font-size:13px;line-height:1;padding:0 2px}" +
      ".shq-edit-remove:hover{color:#ff3b30}" +
      ".shq-edit-remove:disabled{opacity:.35;cursor:default}" +
      ".shq-edit-add{display:flex;gap:6px;margin-top:10px}" +
      ".shq-edit-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:6px;background:rgba(255,255,255,.05);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:3px 8px;outline:none}" +
      ".shq-edit-input:focus{border-color:rgba(255,255,255,.35)}" +
      ".shq-edit-btn{border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;padding:3px 10px;flex:none}" +
      ".shq-edit-btn:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}" +
      ".shq-edit-hint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#8f96a3);margin-top:10px}" +
      ".shq-pref-row{display:flex;align-items:center;gap:8px;margin-top:10px}" +
      ".shq-pref-label{font-size:11px;color:var(--dsw-alias-label-secondary,#aab0bc);flex:none;white-space:nowrap}" +
      ".shq-lang{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:6px;background:rgba(255,255,255,.06);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:2px 6px;outline:none;cursor:pointer}" +
      ".shq-lang option{color:#111;background:#fff}" +
      ".shq-palette-btn{width:100%;margin-top:10px}" +
      ".shq-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:12px}";

    var TAG_ID = "dsh-ticker-jp/style.css";

    function injectStyle(css) {
      var tag = document.querySelector('style[data-plugin-css="' + TAG_ID + '"]');
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.plugin = "dsh-ticker-jp";
        tag.dataset.pluginCss = TAG_ID;
        tag.textContent = css;
        document.head.appendChild(tag);
      }
      return function disposeStyle() {
        tag.remove();
      };
    }

    var inject = ["slots"];

    function Row(item, name, up, down) {
      var c = (item && typeof item.changePct === "number")
        ? (item.changePct > 0 ? up : item.changePct < 0 ? down : NEUTRAL)
        : NEUTRAL;
      var label = name || (item && item.name) || DASH;
      return React.createElement("div", { className: "shq-row", key: item.code },
        React.createElement("span", { className: "shq-name", title: item.name }, label),
        React.createElement("span", { className: "shq-price", style: { color: c } }, fmt(item.price)),
        React.createElement("span", { className: "shq-pct", style: { color: c } }, sign(item.changePct) + fmt(item.changePct) + "%")
      );
    }

    function StockWidget() {
      var itemsState = React.useState(null);
      var items = itemsState[0], setItems = itemsState[1];
      var errState = React.useState(null);
      var err = errState[0], setErr = errState[1];
      var posState = React.useState(readPos);
      var pos = posState[0], setPos = posState[1];
      var collapsedState = React.useState(false);
      var collapsed = collapsedState[0], setCollapsed = collapsedState[1];
      var editingState = React.useState(false);
      var editing = editingState[0], setEditing = editingState[1];
      var symsState = React.useState(readSyms);
      var syms = symsState[0], setSyms = symsState[1];
      var draftState = React.useState("");
      var draft = draftState[0], setDraft = draftState[1];
      var paletteState = React.useState(readPalette);
      var paletteName = paletteState[0], setPaletteName = paletteState[1];
      var langState = React.useState(readLang);
      var lang = langState[0], setLang = langState[1];
      var nowTickState = React.useState(0);
      var nowTick = nowTickState[0], setNowTick = nowTickState[1];
      var drag = React.useRef(null);
      var posRef = React.useRef(null);
      var tzsRef = React.useRef([]);
      posRef.current = pos;
      var palette = PALETTES[paletteName] || PALETTES.jp;
      var t = T[lang] || T.en;

      function commitSyms(next) {
        var out = [];
        for (var i = 0; i < next.length; i++) {
          var entry = parseEntry(next[i]);
          if (!entry) continue;
          var dup = false;
          for (var j = 0; j < out.length; j++) {
            if (out[j].code === entry.code) { dup = true; break; }
          }
          if (dup) continue;
          out.push(entry);
        }
        var list = out.length ? out : DEFAULTS.map(function (c) { return { code: c }; });
        setSyms(list);
        writeSyms(list);
      }

      function renameAt(idx, name) {
        var next = syms.slice();
        var code = next[idx].code;
        var trimmed = String(name == null ? "" : name).trim();
        next[idx] = trimmed ? { code: code, name: trimmed } : { code: code };
        commitSyms(next);
      }

      function addDraft() {
        var entry = parseEntry(draft);
        if (!entry) return;
        var exists = -1;
        for (var i = 0; i < syms.length; i++) {
          if (syms[i].code === entry.code) { exists = i; break; }
        }
        if (exists === -1) commitSyms(syms.concat([entry]));
        else renameAt(exists, entry.name || "");
        setDraft("");
      }

      var codesKey = syms.map(function (e) { return e.code; }).join(",");

      // Poll cadence: every 5s while any watched market trades, otherwise a
      // 60s check that resumes 5s polls once a market opens (and keeps the
      // state dot fresh). One snapshot is fetched on mount / list / language
      // change.
      React.useEffect(function () {
        var alive = true;
        var busy = false;
        var timer = null;
        var codes = syms.map(function (e) { return e.code; });
        var texts = T[lang] || T.en;
        tzsRef.current = []; // unknown until first success -> conservative active
        function load() {
          if (busy) return;
          busy = true;
          var q = codes.map(function (s) { return encodeURIComponent(s); }).join(",");
          fetch("/dsh-ticker-jp/quotes?syms=" + q)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (!alive) return;
              if (data && data.ok) {
                setItems(data.items || []);
                setErr(null);
                var seen = [];
                var list = data.items || [];
                for (var i = 0; i < list.length; i++) {
                  var it = list[i];
                  if (it && it.timezone && seen.indexOf(it.timezone) === -1) seen.push(it.timezone);
                }
                if (seen.length) tzsRef.current = seen;
              } else setErr((data && data.error) || texts.fetchFail);
            })
            .catch(function (e) {
              if (alive) setErr(String((e && e.message) || e));
            })
            .then(function () { busy = false; });
        }
        function schedule() {
          var open = anyMarketOpen(tzsRef.current);
          timer = setTimeout(function () {
            if (open) load();
            else setNowTick(function (c) { return c + 1; });
            schedule();
          }, open ? ACTIVE_POLL_MS : IDLE_CHECK_MS);
        }
        load();
        schedule();
        return function () {
          alive = false;
          if (timer !== null) clearTimeout(timer);
        };
      }, [codesKey, lang]);

      function onDown(e) {
        drag.current = { dx: pos.x - (window.innerWidth - e.clientX), dy: pos.y - e.clientY };
        if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
      }
      function onMove(e) {
        if (!drag.current) return;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var next = clampPos(
          { x: (vw - e.clientX) + drag.current.dx, y: e.clientY + drag.current.dy },
          vw, vh
        );
        posRef.current = next;
        setPos(next);
      }
      function onUp() {
        if (drag.current && posRef.current) writePos(posRef.current);
        drag.current = null;
      }

      function togglePalette() {
        var next = paletteName === "us" ? "jp" : "us";
        setPaletteName(next);
        writePalette(next);
      }

      function setLanguage(next) {
        setLang(next);
        writeLang(next);
      }

      function labelFor(code) {
        for (var i = 0; i < syms.length; i++) {
          if (syms[i].code === code) {
            return (syms[i].name) || shortNameFor(code, lang) || "";
          }
        }
        return shortNameFor(code, lang) || "";
      }

      // Market-open state drives the collapsed dot. Re-computed when data, the
      // list or an idle tick changes: fetch success updates tzsRef together
      // with items, and while every market is closed the idle loop bumps
      // nowTick each minute so this re-evaluates without extra requests.
      var marketOpen = React.useMemo(function () {
        return anyMarketOpen(tzsRef.current);
      }, [nowTick, items, syms]);

      var body = null;
      if (!collapsed) {
        if (editing) {
          var rows = syms.map(function (e, idx) {
            return React.createElement("div", { className: "shq-edit-row", key: e.code },
              React.createElement("span", { className: "shq-edit-code" }, e.code),
              React.createElement("input", {
                className: "shq-edit-name",
                value: e.name || "",
                placeholder: shortNameFor(e.code, lang) || t.namePh,
                spellCheck: false,
                onChange: function (ev) { renameAt(idx, ev.target.value); },
              }),
              React.createElement("button", {
                className: "shq-edit-remove",
                title: t.remove,
                disabled: syms.length <= 1,
                onClick: function () {
                  if (syms.length <= 1) return;
                  var next = syms.slice();
                  next.splice(idx, 1);
                  commitSyms(next);
                },
              }, "✕")
            );
          });
          body = React.createElement("div", { className: "shq-edit" },
            React.createElement("div", { className: "shq-edit-list" }, rows),
            React.createElement("div", { className: "shq-edit-add" },
              React.createElement("input", {
                className: "shq-edit-input",
                value: draft,
                placeholder: t.codePh,
                spellCheck: false,
                onChange: function (ev) { setDraft(ev.target.value); },
                onKeyDown: function (ev) { if (ev.key === "Enter") addDraft(); },
              }),
              React.createElement("button", { className: "shq-edit-btn", onClick: addDraft }, t.add)
            ),
            React.createElement("div", { className: "shq-edit-hint" },
              React.createElement("div", null, t.hint1),
              React.createElement("div", null, t.hint2)
            ),
            React.createElement("div", { className: "shq-pref-row" },
              React.createElement("label", { className: "shq-pref-label", htmlFor: "dsh-ticker-jp-lang" }, t.langLabel),
              React.createElement("select", {
                id: "dsh-ticker-jp-lang",
                className: "shq-lang",
                value: lang,
                onChange: function (ev) { setLanguage(ev.target.value); },
              }, LANG_KEYS.map(function (k) {
                return React.createElement("option", { key: k, value: k }, LANG_LABELS[k]);
              }))
            ),
            React.createElement("button", {
              className: "shq-edit-btn shq-palette-btn",
              title: t.paletteTip,
              onClick: togglePalette,
            }, t.paletteLabel + (paletteName === "us" ? t.paletteUs : t.paletteJp)),
            React.createElement("div", { className: "shq-edit-foot" },
              React.createElement("button", {
                className: "shq-edit-btn",
                onClick: function () { commitSyms(DEFAULTS); },
              }, t.restore),
              React.createElement("button", {
                className: "shq-edit-btn",
                onClick: function () { setEditing(false); },
              }, t.done)
            )
          );
        } else if (!err && items && items.length) {
          body = React.createElement("div", { className: "shq-body" },
            items.map(function (it) { return Row(it, labelFor(it.code) || it.name, palette.up, palette.down); })
          );
        } else {
          body = React.createElement("div", { className: "shq-body" },
            React.createElement("div", { className: "shq-err" }, err || t.loading)
          );
        }
      }

      // Collapsed = compact pill: bar-chart glyph + state dot (no text, so the
      // title never varies with language width) and no gear button; the edit
      // panel widens to 300px. The dot glows green while any watched market
      // trades and red when all are closed.
      var widgetClass = collapsed
        ? "shq-widget shq-collapsed"
        : editing ? "shq-widget shq-editing" : "shq-widget";
      var title;
      if (collapsed) {
        title = React.createElement("span", {
          className: "shq-collapse-face",
          title: t.title,
          "aria-hidden": true,
        },
          React.createElement("span", { className: "shq-glyph" },
            React.createElement("i", { className: "shq-bar", style: { height: "6px" } }),
            React.createElement("i", { className: "shq-bar", style: { height: "10px" } }),
            React.createElement("i", { className: "shq-bar", style: { height: "8px" } })
          ),
          React.createElement("i", { className: marketOpen ? "shq-dot shq-dot-open" : "shq-dot shq-dot-closed" })
        );
      } else {
        title = React.createElement("span", { className: "shq-title" }, editing ? t.titleEdit : t.title);
      }
      var tools = [];
      if (!collapsed) {
        tools.push(React.createElement("button", {
          key: "settings",
          className: "shq-tool",
          title: t.settings,
          onPointerDown: function (e) { e.stopPropagation(); },
          onClick: function () { setEditing(function (v) { return !v; }); },
        }, "⚙"));
      }
      tools.push(React.createElement("button", {
        key: "collapse",
        className: "shq-tool",
        title: collapsed ? t.expand : t.collapse,
        onPointerDown: function (e) { e.stopPropagation(); },
        onClick: function () { setCollapsed(function (v) { return !v; }); },
      }, collapsed ? "+" : "−"));

      return React.createElement("div", { className: widgetClass, style: { right: pos.x + "px", top: pos.y + "px" } },
        React.createElement("div", {
          className: "shq-head",
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
        },
          title,
          React.createElement("span", { className: "shq-tools" }, tools)
        ),
        body
      );
    }

    function apply(ctx) {
      ctx.effect(function () {
        return injectStyle(CSS);
      }, "dsh-ticker-jp: styles");
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register(
          { name: "shell.overlay", id: "dsh-ticker-jp" },
          function () { return React.createElement(StockWidget); },
        );
      });
    }

    exports.name = "dsh-ticker-jp";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
