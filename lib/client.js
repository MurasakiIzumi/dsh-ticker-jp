// dsh-ticker-jp — Client half (bundle entry)
//
// Loaded by the DSH web bundle loader: injects a draggable, collapsible
// floating quote window into `shell.overlay` and polls the same-origin route
// `/dsh-ticker-jp/quotes` — every 5s while at least one watched market is
// trading, otherwise only a 60s check that resumes 5s polls once a market
// opens. A poll already in flight is skipped, so a slow response never
// overlaps the next one.
//
// Watch list: entries are stored as [{ code, name? }] under the localStorage
// key `dsh-ticker-jp:syms`; legacy string arrays and `code:别名` strings are
// read too. Defaults: 1306.T and ^N225. Adding accepts a bare 4-digit code
// (`9984` is expanded to `9984.T`), a full symbol (`9984.T`, `^N225`), or an
// alias form `代码:显示名`. Aliases are also editable inline per row and
// persist.
//
// Display names resolve as: user alias -> builtin short name -> Yahoo name ->
// code. Builtin short names cover only the defaults: Yahoo has no live TOPIX
// index, so its tracking ETF 1306.T shows as "TOPIX ETF", and ^N225 shows as
// "日経225" (localized per UI language, see T). Naming is display-only —
// requests always send the real codes. Persistence is best-effort: quota or
// privacy failures are silently ignored.
//
// UI strings are localized (zh-Hans / zh-Hant / en / ja). The language
// follows navigator.language on first run, can be overridden in the ⚙ panel,
// and is persisted under `dsh-ticker-jp:lang`. When collapsed the widget
// shrinks to a compact pill: the title is a market glyph (no text) and the ⚙
// button is hidden.
//
// Window position and the up/down palette are persisted too (keys
// `dsh-ticker-jp:pos` / `dsh-ticker-jp:palette`; jp = red-up/green-down,
// us = green-up/red-down); positions are clamped to the viewport on read.
// Successful items echo the Yahoo exchange timezone: while every watched
// market is closed (weekend + approximate local hours only — lunch breaks and
// holidays are not modelled, unknown timezones count as open) the poll pauses
// and one snapshot is still fetched when the window is created or the
// watchlist changes.

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

    var MARKET_HOURS = {
      "Asia/Tokyo": { open: 9 * 60, close: 15 * 60 + 30 },
      "Asia/Hong_Kong": { open: 9 * 60 + 30, close: 16 * 60 },
      "Asia/Shanghai": { open: 9 * 60 + 30, close: 15 * 60 },
      "America/New_York": { open: 9 * 60 + 30, close: 16 * 60 },
    };
    var ACTIVE_POLL_MS = 5000;
    var IDLE_CHECK_MS = 60000;
    var WIDGET_WIDTH = 232;
    var MIN_VISIBLE = 40;

    // --- Localization -------------------------------------------------------
    var LANG_KEYS = ["zhHans", "zhHant", "en", "ja"];
    var LANG_LABELS = { zhHans: "简体中文", zhHant: "繁體中文", en: "English", ja: "日本語" };

    // Pick a supported language from a navigator.language tag: zh-Hant /
    // zh-TW / zh-HK -> traditional Chinese, any other zh -> simplified,
    // ja / en -> their own, everything else falls back to English.
    function detectLang(browserLang) {
      var tag = String(browserLang || "").toLowerCase();
      if (/^zh/.test(tag)) return /(hant|tw|hk|mo)/.test(tag) ? "zhHant" : "zhHans";
      if (/^ja/.test(tag)) return "ja";
      return "en";
    }

    function readLang() {
      var value = null;
      try {
        value = localStorage.getItem(LANG_KEY);
      } catch (e) { value = null; }
      if (LANG_KEYS.indexOf(value) !== -1) return value;
      var nav = (typeof navigator !== "undefined") ? navigator.language : "";
      return detectLang(nav);
    }

    function writeLang(name) {
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
        loading: "載入中…", fetchFail: "取得失敗", n225: "日經225",
      },
      en: {
        title: "Markets", titleEdit: "Watchlist", settings: "Watchlist settings",
        expand: "Expand", collapse: "Collapse",
        restore: "Restore default", done: "Done", add: "Add", remove: "Remove",
        namePh: "Display name (optional)", codePh: "Symbol, e.g. 9984.T",
        hint1: "4-digit short code is Japan-only (.T auto-appended)",
        hint2: "Other markets need the full suffix, e.g. AAPL / 0700.HK",
        langLabel: "Language", paletteLabel: "Colors: ",
        paletteJp: "Red-up / green-down (JP)", paletteUs: "Green-up / red-down (US)",
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
        loading: "読み込み中…", fetchFail: "取得に失敗", n225: "日経225",
      },
    };

    // Builtin short display name for a default symbol, localized. Anything
    // else resolves through the user alias or the Yahoo name.
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

    // Yields a de-duplicated { code, name? } list. DEFAULTS fall back to codes.
    function readSyms() {
      var parsed = null;
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) parsed = JSON.parse(raw);
      } catch (e) { parsed = null; }
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
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (e) { }
    }

    // --- Window position ----------------------------------------------------
    function readPos() {
      var fallback = { x: 16, y: 16 };
      var parsed = null;
      try {
        var raw = localStorage.getItem(POS_KEY);
        if (raw) parsed = JSON.parse(raw);
      } catch (e) { parsed = null; }
      var rawPos = (parsed && typeof parsed === "object" && typeof parsed.x === "number" && typeof parsed.y === "number")
        ? parsed
        : fallback;
      var maxX = Math.max(0, window.innerWidth - WIDGET_WIDTH - MIN_VISIBLE);
      var maxY = Math.max(0, window.innerHeight - MIN_VISIBLE);
      return {
        x: Math.min(Math.max(0, Math.round(rawPos.x)), maxX),
        y: Math.min(Math.max(0, Math.round(rawPos.y)), maxY),
      };
    }

    function writePos(pos) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch (e) { }
    }

    // --- Palette preference (default jp) ------------------------------------
    function readPalette() {
      var value = null;
      try {
        value = localStorage.getItem(PALETTE_KEY);
      } catch (e) { value = null; }
      return (value === "jp" || value === "us") ? value : "jp";
    }

    function writePalette(name) {
      try {
        localStorage.setItem(PALETTE_KEY, name);
      } catch (e) { }
    }

    // --- Market hours -------------------------------------------------------
    function zoneNow(tz, date) {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(date);
      var hour = 0;
      var minute = 0;
      var weekday = "";
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part.type === "hour") hour = Number(part.value) || 0;
        else if (part.type === "minute") minute = Number(part.value) || 0;
        else if (part.type === "weekday") weekday = part.value;
      }
      return { weekday: weekday, minutes: hour * 60 + minute };
    }

    function anyMarketOpen(tzs, date) {
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
    function fmt(n) {
      var v = Number(n);
      return (n == null || !Number.isFinite(v)) ? "--" : v.toFixed(2);
    }
    function sign(n) {
      return n > 0 ? "+" : "";
    }

    var CSS = ".shq-widget{position:fixed;z-index:99999;width:232px;background:#1a1c23;background:color-mix(in srgb, var(--dsw-alias-bg-overlay,#1a1c23) 80%, transparent);color:var(--dsw-alias-label-primary,#eef0f4);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",sans-serif;user-select:none;-webkit-user-select:none;overflow:hidden}" +
      ".shq-widget.shq-collapsed{width:auto}" +
      ".shq-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 12px;cursor:grab;touch-action:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}" +
      ".shq-collapsed .shq-head{border-bottom:none;padding:5px 8px}" +
      ".shq-head:active{cursor:grabbing}" +
      ".shq-title{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#c7ccd6);white-space:nowrap}" +
      ".shq-icon{font-size:13px;line-height:1;padding:0 2px}" +
      ".shq-tools{display:flex;align-items:center;gap:5px}" +
      ".shq-tool{height:18px;border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.85;padding:0 4px}" +
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

    // One quote row; `name` is already resolved (alias > builtin > Yahoo).
    // `up`/`down` are the palette colors for the current preference.
    function Row(item, name, up, down) {
      var c = (item && typeof item.changePct === "number")
        ? (item.changePct > 0 ? up : item.changePct < 0 ? down : NEUTRAL)
        : NEUTRAL;
      var label = name || (item && item.name) || "--";
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

      // Polling scheduler: fetch one snapshot immediately (window creation or
      // watchlist/language change), then poll every ACTIVE_POLL_MS while any
      // watched market is in its local trading window; while all are closed,
      // stop polling and only re-check at IDLE_CHECK_MS, resuming 5s polls
      // the moment some market opens (checked every 60s at most).
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
          var delay = anyMarketOpen(tzsRef.current) ? ACTIVE_POLL_MS : IDLE_CHECK_MS;
          timer = setTimeout(function () {
            if (anyMarketOpen(tzsRef.current)) load();
            schedule();
          }, delay);
        }
        load();
        schedule();
        return function () {
          alive = false;
          if (timer !== null) clearTimeout(timer);
        };
      }, [codesKey, lang]);

      function onDown(e) {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
      }
      function onMove(e) {
        if (!drag.current) return;
        var next = { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy };
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
        } else if (items && items.length) {
          body = React.createElement("div", { className: "shq-body" },
            items.map(function (it) { return Row(it, labelFor(it.code) || it.name, palette.up, palette.down); })
          );
        } else {
          body = React.createElement("div", { className: "shq-body" },
            React.createElement("div", { className: "shq-err" }, err || t.loading)
          );
        }
      }

      var widgetClass = collapsed ? "shq-widget shq-collapsed" : "shq-widget";
      var title;
      if (collapsed) {
        title = React.createElement("span", { className: "shq-title shq-icon", "aria-hidden": true }, "📈");
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
      }, collapsed ? "+" : "—"));

      return React.createElement("div", { className: widgetClass, style: { left: pos.x + "px", top: pos.y + "px" } },
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
