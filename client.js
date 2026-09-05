// dsh-ticker-jp — Client half (dynamic-plugin form)
//
// 动态插件形态的 Client 半区：在页面右上角渲染可拖拽、可收起的悬浮行情窗，轮询
// getQuotes RPC 展示报价，并支持自选标的与显示别名。
//
// Dynamic-plugin client half: renders the draggable, collapsible floating quote
// window at the top-right of the page, polls the getQuotes RPC for quotes, and
// lets the user manage a watchlist with display aliases. Paste this whole file
// as cordis_define's code.client to load it.

const NEUTRAL = 'var(--dsw-alias-label-primary)'

const PALETTES = {
  jp: { up: '#ff3b30', down: '#00e08a' },
  us: { up: '#00e08a', down: '#ff3b30' },
}

const STORAGE_KEY = 'dsh-ticker-jp:syms'
const POS_KEY = 'dsh-ticker-jp:pos'
const PALETTE_KEY = 'dsh-ticker-jp:palette'
const LANG_KEY = 'dsh-ticker-jp:lang'

const DEFAULTS = ['1306.T', '^N225']

const RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/

// Local trading windows (open/close in local minutes) per Yahoo exchange
// timezone. Only weekends + hours are modelled — lunch breaks and holidays
// are skipped, and unknown timezones count as open.
const MARKET_HOURS = {
  'Asia/Tokyo': { open: 9 * 60, close: 15 * 60 + 30 },
  'Asia/Hong_Kong': { open: 9 * 60 + 30, close: 16 * 60 },
  'Asia/Shanghai': { open: 9 * 60 + 30, close: 15 * 60 },
  'America/New_York': { open: 9 * 60 + 30, close: 16 * 60 },
}
const ACTIVE_POLL_MS = 5000
const IDLE_CHECK_MS = 60000
const EDIT_WIDTH = 300
const MIN_VISIBLE = 40

// --- Localization -------------------------------------------------------
const LANG_KEYS = ['zhHans', 'zhHant', 'en', 'ja']
const LANG_LABELS = { zhHans: '简体中文', zhHant: '繁體中文', en: 'English', ja: '日本語' }

// navigator.language -> locale: zh-Hant/zh-TW/zh-HK/zh-MO is traditional,
// other zh is simplified, ja/en map directly, anything else falls back to en.
function detectLang(browserLang) {
  const tag = String(browserLang || '').toLowerCase()
  if (/^zh/.test(tag)) return /(hant|tw|hk|mo)/.test(tag) ? 'zhHant' : 'zhHans'
  if (/^ja/.test(tag)) return 'ja'
  return 'en'
}

function readLang() {
  let value = null
  if (canStore()) {
    try {
      value = localStorage.getItem(LANG_KEY)
    } catch (e) { value = null }
  }
  if (LANG_KEYS.indexOf(value) !== -1) return value
  return detectLang(typeof navigator !== 'undefined' ? navigator.language : '')
}

function writeLang(name) {
  if (!canStore()) return
  try {
    localStorage.setItem(LANG_KEY, name)
  } catch (e) { /* ignore quota / privacy errors */ }
}

const T = {
  zhHans: {
    title: '行情', titleEdit: '自选行情', settings: '自选设置',
    expand: '展开', collapse: '收起',
    restore: '恢复默认', done: '完成', add: '添加', remove: '移除',
    namePh: '显示名（可选）', codePh: '股票代码，如 9984.T',
    hint1: '4 位简码仅日股，自动补 .T', hint2: '其它市场请输完整代码，如 AAPL / 0700.HK',
    langLabel: '语言', paletteLabel: '涨跌配色：',
    paletteJp: '红涨绿跌（日式）', paletteUs: '绿涨红跌（美式）',
    paletteTip: '点击切换配色（日式红涨绿跌 / 美式绿涨红跌）',
    loading: '加载中…', fetchFail: '获取失败', n225: '日经225',
  },
  zhHant: {
    title: '行情', titleEdit: '自選行情', settings: '自選設定',
    expand: '展開', collapse: '收起',
    restore: '恢復預設', done: '完成', add: '新增', remove: '移除',
    namePh: '顯示名稱（可選）', codePh: '股票代碼，如 9984.T',
    hint1: '4 位簡碼僅日股，自動補 .T', hint2: '其他市場請輸入完整代碼，如 AAPL / 0700.HK',
    langLabel: '語言', paletteLabel: '漲跌配色：',
    paletteJp: '紅漲綠跌（日式）', paletteUs: '綠漲紅跌（美式）',
    paletteTip: '點擊切換配色（日式紅漲綠跌 / 美式綠漲紅跌）',
    loading: '載入中…', fetchFail: '取得失敗', n225: '日經225',
  },
  en: {
    title: 'Markets', titleEdit: 'Watchlist', settings: 'Watchlist settings',
    expand: 'Expand', collapse: 'Collapse',
    restore: 'Restore default', done: 'Done', add: 'Add', remove: 'Remove',
    namePh: 'Display name (optional)', codePh: 'Symbol, e.g. 9984.T',
    hint1: '4-digit short code: Japan only (adds .T)',
    hint2: 'Full code for other markets (AAPL / 0700.HK)',
    langLabel: 'Language', paletteLabel: 'Colors: ',
    paletteJp: 'Red-up / green-down (JP)', paletteUs: 'Green-up / red-down (US)',
    paletteTip: 'Click to switch: JP = red up / green down, US = green up / red down',
    loading: 'Loading…', fetchFail: 'Fetch failed', n225: 'Nikkei 225',
  },
  ja: {
    title: '相場', titleEdit: 'ウォッチリスト', settings: 'ウォッチリスト設定',
    expand: '開く', collapse: '閉じる',
    restore: '初期化', done: '完了', add: '追加', remove: '削除',
    namePh: '表示名（任意）', codePh: '銘柄コード、例 9984.T',
    hint1: '4桁略号は日本株のみ（.T 補完）', hint2: '他市場は完全コード（AAPL / 0700.HK 等）',
    langLabel: '言語', paletteLabel: '色分け：',
    paletteJp: '値上がり赤・下がり緑（日本式）', paletteUs: '値上がり緑・下がり赤（米国式）',
    paletteTip: '配色を切替（日本式 上昇赤・下落緑 / 米国式 上昇緑・下落赤）',
    loading: '読み込み中…', fetchFail: '取得に失敗', n225: '日経225',
  },
}

// Builtin short names for the two defaults, localized per UI language.
function shortNameFor(code, lang) {
  if (code === '1306.T') return 'TOPIX ETF'
  if (code === '^N225') return (T[lang] || T.en).n225
  return ''
}

// --- Watch list ---------------------------------------------------------
// "9984" -> "9984.T"; returns "" for empty / invalid input.
function normalizeSymbol(raw) {
  let s = String(raw == null ? '' : raw).trim().toUpperCase()
  if (!s) return ''
  if (/^\d{4}$/.test(s)) s += '.T'
  return (RE_SYMBOL.test(s) && s.length <= 20) ? s : ''
}

// Accepts a string ("9984", "9984.T:软银", "9984.T：别名") or an entry object
// { code, name? }. Returns { code, name? } or null when invalid.
function parseEntry(raw) {
  let code = ''
  let name = ''
  if (typeof raw === 'string') {
    const i = raw.search(/[:：]/)
    if (i === -1) code = raw
    else { code = raw.slice(0, i); name = raw.slice(i + 1) }
  } else if (raw && typeof raw === 'object') {
    code = raw.code
    name = raw.name
  }
  code = normalizeSymbol(code)
  name = String(name == null ? '' : name).trim()
  if (!code) return null
  const entry = { code }
  if (name) entry.name = name
  return entry
}

function canStore() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch (e) {
    return false
  }
}

// Yields a de-duplicated { code, name? } list. DEFAULTS fall back to codes.
function readSyms() {
  let parsed = null
  if (canStore()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) parsed = JSON.parse(raw)
    } catch (e) { parsed = null }
  }
  const source = Array.isArray(parsed) && parsed.length ? parsed : DEFAULTS
  const out = []
  for (const item of source) {
    const entry = parseEntry(item)
    if (!entry) continue
    if (out.some((e) => e.code === entry.code)) continue
    out.push(entry)
  }
  return out.length ? out : DEFAULTS.map((c) => ({ code: c }))
}

function writeSyms(list) {
  if (!canStore()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (e) { /* ignore quota / privacy errors */ }
}

// --- Window position ----------------------------------------------------
// pos = { x, y }: x is the CSS `right` offset (window anchored by its RIGHT
// edge, so the collapse/expand button never moves when the width changes),
// y is the top offset. Stored positions are clamped so at least one grab
// area stays on screen; the widest mode (EDIT_WIDTH) drives the left bound.
function clampPos(raw, vw, vh) {
  const minX = MIN_VISIBLE
  const maxX = Math.max(minX, vw - EDIT_WIDTH + MIN_VISIBLE)
  const maxY = Math.max(0, vh - MIN_VISIBLE)
  return {
    x: Math.min(Math.max(minX, Math.round(raw.x)), maxX),
    y: Math.min(Math.max(0, Math.round(raw.y)), maxY),
  }
}

function readPos() {
  const fallback = { x: 24, y: 16 }
  let parsed = null
  if (canStore()) {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (raw) parsed = JSON.parse(raw)
    } catch (e) { parsed = null }
  }
  const rawPos = (parsed && typeof parsed === 'object' && typeof parsed.x === 'number' && typeof parsed.y === 'number')
    ? parsed
    : fallback
  return clampPos(rawPos, window.innerWidth, window.innerHeight)
}

function writePos(pos) {
  if (!canStore()) return
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  } catch (e) { /* ignore quota / privacy errors */ }
}

// --- Palette preference (default jp) ------------------------------------
function readPalette() {
  let value = null
  if (canStore()) {
    try {
      value = localStorage.getItem(PALETTE_KEY)
    } catch (e) { value = null }
  }
  return (value === 'jp' || value === 'us') ? value : 'jp'
}

function writePalette(name) {
  if (!canStore()) return
  try {
    localStorage.setItem(PALETTE_KEY, name)
  } catch (e) { /* ignore quota / privacy errors */ }
}

// --- Market hours -------------------------------------------------------
function zoneNow(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => {
    const p = parts.find((x) => x.type === type)
    return p ? p.value : ''
  }
  const hour = Number(pick('hour')) || 0
  const minute = Number(pick('minute')) || 0
  return { weekday: pick('weekday'), minutes: hour * 60 + minute }
}

function anyMarketOpen(tzs, date = new Date()) {
  if (!tzs.length) return true
  for (const tz of tzs) {
    const hours = MARKET_HOURS[tz]
    if (!hours) return true
    const local = zoneNow(tz, date)
    if (local.weekday === 'Sat' || local.weekday === 'Sun') continue
    if (local.minutes >= hours.open && local.minutes < hours.close) return true
  }
  return false
}

// --- Formatting ---------------------------------------------------------
const fmt = (n) => {
  const v = Number(n)
  return (n == null || !Number.isFinite(v)) ? '--' : v.toFixed(2)
}
const sign = (n) => (n > 0 ? '+' : '')

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    ctx.effect(() => styles.insert(`
.shq-widget{position:fixed;z-index:99999;width:232px;background:#1a1c23;background:color-mix(in srgb, var(--dsw-alias-bg-overlay,#1a1c23) 80%, transparent);color:var(--dsw-alias-label-primary,#eef0f4);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;user-select:none;-webkit-user-select:none;overflow:hidden}
.shq-widget.shq-collapsed{width:auto}
.shq-widget.shq-editing{width:300px}
.shq-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 12px;cursor:grab;touch-action:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}
.shq-collapsed .shq-head{border-bottom:none;padding:8px 12px 6px}
.shq-head:active{cursor:grabbing}
.shq-title{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#c7ccd6);white-space:nowrap}
.shq-collapse-face{display:inline-flex;align-items:center;gap:4px;height:14px;padding:0 3px 0 1px}
.shq-glyph{display:inline-flex;align-items:flex-end;gap:2px}
.shq-bar{width:3px;border-radius:1px;background:var(--dsw-alias-label-secondary,#c7ccd6);display:inline-block}
.shq-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.25);display:inline-block;flex:none}
.shq-dot-open{background:#00e08a;box-shadow:0 0 3px rgba(0,224,138,.55)}
.shq-dot-closed{background:#ff3b30;box-shadow:0 0 3px rgba(255,59,48,.55)}
.shq-tools{display:flex;align-items:center;gap:5px}
.shq-tool{width:18px;height:18px;border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.85;padding:0}
.shq-tool:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}
.shq-body{padding:5px 12px 8px}
.shq-row{display:flex;align-items:baseline;padding:6px 0}
.shq-row + .shq-row{border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}
.shq-name{font-size:12.5px;color:var(--dsw-alias-label-secondary,#c7ccd6);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px}
.shq-price{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;flex:none}
.shq-pct{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;width:64px;text-align:right;flex:none}
.shq-err{font-size:12px;color:var(--dsw-alias-label-secondary,#8f96a3);padding:4px 0}
.shq-edit{padding:8px 10px 10px}
.shq-edit-list{max-height:150px;overflow:auto}
.shq-edit-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.05))}
.shq-edit-code{flex:none;width:86px;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#aab0bc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shq-edit-name{flex:1;min-width:0;border:1px solid transparent;border-radius:6px;background:rgba(255,255,255,.04);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:2px 6px;outline:none}
.shq-edit-name:focus{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.28));background:rgba(255,255,255,.06)}
.shq-edit-name::placeholder{color:var(--dsw-alias-label-secondary,#6d7280)}
.shq-edit-remove{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#8f96a3);cursor:pointer;font-size:13px;line-height:1;padding:0 2px}
.shq-edit-remove:hover{color:#ff3b30}
.shq-edit-remove:disabled{opacity:.35;cursor:default}
.shq-edit-add{display:flex;gap:6px;margin-top:10px}
.shq-edit-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:6px;background:rgba(255,255,255,.05);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:3px 8px;outline:none}
.shq-edit-input:focus{border-color:rgba(255,255,255,.35)}
.shq-edit-btn{border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;padding:3px 10px;flex:none}
.shq-edit-btn:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}
.shq-edit-hint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#8f96a3);margin-top:10px}
.shq-pref-row{display:flex;align-items:center;gap:8px;margin-top:10px}
.shq-pref-label{font-size:11px;color:var(--dsw-alias-label-secondary,#aab0bc);flex:none;white-space:nowrap}
.shq-lang{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:6px;background:rgba(255,255,255,.06);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:2px 6px;outline:none;cursor:pointer}
.shq-palette-btn{width:100%;margin-top:10px}
.shq-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:12px}
`))

    function Row(item, name, up, down) {
      const c = (item && typeof item.changePct === 'number')
        ? (item.changePct > 0 ? up : item.changePct < 0 ? down : NEUTRAL)
        : NEUTRAL
      const label = name || (item && item.name) || '--'
      return React.createElement('div', { className: 'shq-row', key: item.code },
        React.createElement('span', { className: 'shq-name', title: item.name }, label),
        React.createElement('span', { className: 'shq-price', style: { color: c } }, fmt(item.price)),
        React.createElement('span', { className: 'shq-pct', style: { color: c } }, sign(item.changePct) + fmt(item.changePct) + '%')
      )
    }

    function StockWidget() {
      const [items, setItems] = React.useState(null)
      const [err, setErr] = React.useState(null)
      const [pos, setPos] = React.useState(readPos)
      const [collapsed, setCollapsed] = React.useState(false)
      const [editing, setEditing] = React.useState(false)
      const [syms, setSyms] = React.useState(readSyms)
      const [draft, setDraft] = React.useState('')
      const [paletteName, setPaletteName] = React.useState(readPalette)
      const [lang, setLang] = React.useState(readLang)
      const [nowTick, setNowTick] = React.useState(0)
      const drag = React.useRef(null)
      const posRef = React.useRef(null)
      const tzsRef = React.useRef([])
      posRef.current = pos
      const palette = PALETTES[paletteName] || PALETTES.jp
      const t = T[lang] || T.en

      const commitSyms = (next) => {
        const out = []
        for (const item of next) {
          const entry = parseEntry(item)
          if (!entry) continue
          if (out.some((e) => e.code === entry.code)) continue
          out.push(entry)
        }
        const list = out.length ? out : DEFAULTS.map((c) => ({ code: c }))
        setSyms(list)
        writeSyms(list)
      }

      const renameAt = (idx, name) => {
        const next = syms.slice()
        const code = next[idx].code
        const trimmed = String(name == null ? '' : name).trim()
        next[idx] = trimmed ? { code, name: trimmed } : { code }
        commitSyms(next)
      }

      const addDraft = () => {
        const entry = parseEntry(draft)
        if (!entry) return
        const exists = syms.findIndex((e) => e.code === entry.code)
        if (exists === -1) commitSyms(syms.concat([entry]))
        else renameAt(exists, entry.name || '')
        setDraft('')
      }

      const codesKey = syms.map((e) => e.code).join(',')

      // Poll cadence: every 5s while any watched market trades, otherwise a
      // 60s check that resumes 5s polls once a market opens (and keeps the
      // state dot fresh). One snapshot is fetched on mount / list / language
      // change.
      React.useEffect(() => {
        let alive = true
        let busy = false
        let timer = null
        const codes = syms.map((e) => e.code)
        const texts = T[lang] || T.en
        tzsRef.current = [] // unknown until first success -> conservative active
        const load = async () => {
          if (busy) return
          busy = true
          try {
            const data = await host.call('getQuotes', { syms: codes })
            if (!alive) return
            if (data && data.ok) {
              setItems(data.items || [])
              setErr(null)
              const seen = []
              for (const it of data.items || []) {
                if (it && it.timezone && !seen.includes(it.timezone)) seen.push(it.timezone)
              }
              if (seen.length) tzsRef.current = seen
            } else setErr((data && data.error) || texts.fetchFail)
          } catch (e) {
            if (alive) setErr(String((e && e.message) || e))
          } finally {
            busy = false
          }
        }
        const schedule = () => {
          const open = anyMarketOpen(tzsRef.current)
          timer = ctx.timeout(() => {
            if (open) load()
            else setNowTick((c) => c + 1) // keep the state dot re-evaluated while closed
            schedule()
          }, open ? ACTIVE_POLL_MS : IDLE_CHECK_MS)
        }
        load()
        schedule()
        return () => {
          alive = false
          if (timer) timer()
        }
      }, [codesKey, lang])

      const onDown = (e) => {
        drag.current = { dx: pos.x - (window.innerWidth - e.clientX), dy: pos.y - e.clientY }
        if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId)
      }
      const onMove = (e) => {
        if (!drag.current) return
        const vw = window.innerWidth
        const vh = window.innerHeight
        const next = clampPos(
          { x: (vw - e.clientX) + drag.current.dx, y: e.clientY + drag.current.dy },
          vw, vh
        )
        posRef.current = next
        setPos(next)
      }
      const onUp = () => {
        if (drag.current) writePos(posRef.current)
        drag.current = null
      }

      const togglePalette = () => {
        const next = paletteName === 'us' ? 'jp' : 'us'
        setPaletteName(next)
        writePalette(next)
      }

      const setLanguage = (next) => {
        setLang(next)
        writeLang(next)
      }

      const labelFor = (code) => {
        const entry = syms.find((e) => e.code === code)
        return (entry && entry.name) || shortNameFor(code, lang) || ''
      }

      let body = null
      if (!collapsed) {
        if (editing) {
          const rows = syms.map((e, idx) => React.createElement('div', { className: 'shq-edit-row', key: e.code },
            React.createElement('span', { className: 'shq-edit-code' }, e.code),
            React.createElement('input', {
              className: 'shq-edit-name',
              value: e.name || '',
              placeholder: shortNameFor(e.code, lang) || t.namePh,
              spellCheck: false,
              onChange: (ev) => renameAt(idx, ev.target.value),
            }),
            React.createElement('button', {
              className: 'shq-edit-remove',
              title: t.remove,
              disabled: syms.length <= 1,
              onClick: () => {
                if (syms.length <= 1) return
                const next = syms.slice()
                next.splice(idx, 1)
                commitSyms(next)
              },
            }, '✕')
          ))
          body = React.createElement('div', { className: 'shq-edit' },
            React.createElement('div', { className: 'shq-edit-list' }, rows),
            React.createElement('div', { className: 'shq-edit-add' },
              React.createElement('input', {
                className: 'shq-edit-input',
                value: draft,
                placeholder: t.codePh,
                spellCheck: false,
                onChange: (ev) => setDraft(ev.target.value),
                onKeyDown: (ev) => { if (ev.key === 'Enter') addDraft() },
              }),
              React.createElement('button', { className: 'shq-edit-btn', onClick: addDraft }, t.add)
            ),
            React.createElement('div', { className: 'shq-edit-hint' },
              React.createElement('div', null, t.hint1),
              React.createElement('div', null, t.hint2)
            ),
            React.createElement('div', { className: 'shq-pref-row' },
              React.createElement('label', { className: 'shq-pref-label', htmlFor: 'dsh-ticker-jp-lang' }, t.langLabel),
              React.createElement('select', {
                id: 'dsh-ticker-jp-lang',
                className: 'shq-lang',
                value: lang,
                onChange: (ev) => setLanguage(ev.target.value),
              }, LANG_KEYS.map((k) => React.createElement('option', { key: k, value: k }, LANG_LABELS[k])))
            ),
            React.createElement('button', {
              className: 'shq-edit-btn shq-palette-btn',
              title: t.paletteTip,
              onClick: togglePalette,
            }, t.paletteLabel + (paletteName === 'us' ? t.paletteUs : t.paletteJp)),
            React.createElement('div', { className: 'shq-edit-foot' },
              React.createElement('button', {
                className: 'shq-edit-btn',
                onClick: () => commitSyms(DEFAULTS),
              }, t.restore),
              React.createElement('button', {
                className: 'shq-edit-btn',
                onClick: () => setEditing(false),
              }, t.done)
            )
          )
        } else if (items && items.length) {
          body = React.createElement('div', { className: 'shq-body' },
            items.map((it) => Row(it, labelFor(it.code) || it.name, palette.up, palette.down))
          )
        } else {
          body = React.createElement('div', { className: 'shq-body' },
            React.createElement('div', { className: 'shq-err' }, err || t.loading)
          )
        }
      }

      // Collapsed = compact pill: bar-chart glyph + state dot (no text, so the
      // title never varies with language width) and no gear button; the edit
      // panel widens to 300px. The dot glows green while any watched market
      // trades and red when all are closed.
      const widgetClass = collapsed
        ? 'shq-widget shq-collapsed'
        : editing ? 'shq-widget shq-editing' : 'shq-widget'
      let title
      if (collapsed) {
        title = React.createElement('span', {
          className: 'shq-collapse-face',
          title: t.title,
          'aria-hidden': true,
        },
          React.createElement('span', { className: 'shq-glyph' },
            React.createElement('i', { className: 'shq-bar', style: { height: '6px' } }),
            React.createElement('i', { className: 'shq-bar', style: { height: '10px' } }),
            React.createElement('i', { className: 'shq-bar', style: { height: '8px' } })
          ),
          React.createElement('i', { className: anyMarketOpen(tzsRef.current) ? 'shq-dot shq-dot-open' : 'shq-dot shq-dot-closed' })
        )
      } else {
        title = React.createElement('span', { className: 'shq-title' }, editing ? t.titleEdit : t.title)
      }
      const tools = []
      if (!collapsed) {
        tools.push(React.createElement('button', {
          key: 'settings',
          className: 'shq-tool',
          title: t.settings,
          onPointerDown: (e) => e.stopPropagation(),
          onClick: () => setEditing((v) => !v),
        }, '⚙'))
      }
      tools.push(React.createElement('button', {
        key: 'collapse',
        className: 'shq-tool',
        title: collapsed ? t.expand : t.collapse,
        onPointerDown: (e) => e.stopPropagation(),
        onClick: () => setCollapsed((v) => !v),
      }, collapsed ? '+' : '−'))

      return React.createElement('div', { className: widgetClass, style: { right: pos.x + 'px', top: pos.y + 'px' } },
        React.createElement('div', {
          className: 'shq-head',
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
        },
          title,
          React.createElement('span', { className: 'shq-tools' }, tools)
        ),
        body
      )
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'shq-floating' },
      () => React.createElement(StockWidget),
    ))
  },
}
