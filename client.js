// dsh-ticker-jp — Client half (dynamic-plugin form)
//
// Paste this whole file into the Client `code.client` of `cordis_define` to
// load the plugin dynamically. It injects a draggable, collapsible floating
// quote window into `shell.overlay` and polls the `getQuotes` RPC — every 5s
// while at least one watched market is trading, otherwise only a 60s check
// that resumes 5s polls once a market opens. A poll already in flight is
// skipped, so a slow response never overlaps the next one.
//
// Dynamic-client environment: React, styles, host and console arrive as fixed
// closure symbols; ctx.get('slots') is an optional soft lookup, so none of
// those needs an `inject` entry. ctx.timeout is a timer verb, which the
// client-runner guard only exposes after declaring 'timer' below — that is
// the plugin's one hard dependency.
// The watch list is user-editable via the gear button: each entry is a code
// plus an optional display alias (editable inline), persisted when
// `localStorage` is available and otherwise kept for the page session.
//
// Window position and the up/down palette are persisted too (keys
// `dsh-ticker-jp:pos` / `dsh-ticker-jp:palette`; jp = red-up/green-down,
// us = green-up/red-down); positions are clamped to the viewport on read.
// Successful items echo the Yahoo exchange timezone: while every watched
// market is closed (weekend + approximate local hours only — lunch breaks and
// holidays are not modelled, unknown timezones count as open) the poll pauses
// and one snapshot is still fetched when the window is created or the
// watchlist changes.

const NEUTRAL = 'var(--dsw-alias-label-primary)'

const PALETTES = {
  jp: { up: '#ff3b30', down: '#00e08a' },
  us: { up: '#00e08a', down: '#ff3b30' },
}

const STORAGE_KEY = 'dsh-ticker-jp:syms'
const POS_KEY = 'dsh-ticker-jp:pos'
const PALETTE_KEY = 'dsh-ticker-jp:palette'

const DEFAULTS = ['1306.T', '^N225']

const DISPLAY = { '1306.T': 'TOPIX ETF', '^N225': '日経225' }

const RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/

const MARKET_HOURS = {
  'Asia/Tokyo': { open: 9 * 60, close: 15 * 60 + 30 },
  'Asia/Hong_Kong': { open: 9 * 60 + 30, close: 16 * 60 },
  'Asia/Shanghai': { open: 9 * 60 + 30, close: 15 * 60 },
  'America/New_York': { open: 9 * 60 + 30, close: 16 * 60 },
}
const ACTIVE_POLL_MS = 5000
const IDLE_CHECK_MS = 60000
const WIDGET_WIDTH = 232
const MIN_VISIBLE = 40

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

function readPos() {
  const fallback = { x: 16, y: 16 }
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
  const maxX = Math.max(0, window.innerWidth - WIDGET_WIDTH - MIN_VISIBLE)
  const maxY = Math.max(0, window.innerHeight - MIN_VISIBLE)
  return {
    x: Math.min(Math.max(0, Math.round(rawPos.x)), maxX),
    y: Math.min(Math.max(0, Math.round(rawPos.y)), maxY),
  }
}

function writePos(pos) {
  if (!canStore()) return
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  } catch (e) { /* ignore quota / privacy errors */ }
}

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
.shq-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:grab;touch-action:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}
.shq-head:active{cursor:grabbing}
.shq-title{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#c7ccd6)}
.shq-tools{display:flex;align-items:center;gap:5px}
.shq-tool{height:18px;border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.85;padding:0 4px}
.shq-tool:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}
.shq-body{padding:5px 12px 8px}
.shq-row{display:flex;align-items:baseline;padding:6px 0}
.shq-row + .shq-row{border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}
.shq-name{font-size:12.5px;color:var(--dsw-alias-label-secondary,#c7ccd6);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px}
.shq-price{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;flex:none}
.shq-pct{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;width:64px;text-align:right;flex:none}
.shq-err{font-size:12px;color:var(--dsw-alias-label-secondary,#8f96a3);padding:4px 0}
.shq-edit{padding:6px 10px 8px}
.shq-edit-list{max-height:150px;overflow:auto;margin-bottom:6px}
.shq-edit-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.05))}
.shq-edit-code{flex:none;width:86px;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#aab0bc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shq-edit-name{flex:1;min-width:0;border:1px solid transparent;border-radius:6px;background:rgba(255,255,255,.04);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:2px 6px;outline:none}
.shq-edit-name:focus{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.28));background:rgba(255,255,255,.06)}
.shq-edit-name::placeholder{color:var(--dsw-alias-label-secondary,#6d7280)}
.shq-edit-remove{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#8f96a3);cursor:pointer;font-size:13px;line-height:1;padding:0 2px}
.shq-edit-remove:hover{color:#ff3b30}
.shq-edit-remove:disabled{opacity:.35;cursor:default}
.shq-edit-add{display:flex;gap:6px;margin-top:6px}
.shq-edit-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:6px;background:rgba(255,255,255,.05);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:3px 8px;outline:none}
.shq-edit-input:focus{border-color:rgba(255,255,255,.35)}
.shq-edit-btn{border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;padding:3px 10px;flex:none}
.shq-edit-btn:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}
.shq-edit-hint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#8f96a3);margin-top:6px}
.shq-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}
`))

    // One quote row; `name` is already resolved (alias > builtin > Yahoo).
    // `up`/`down` are the palette colors for the current preference.
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
      const drag = React.useRef(null)
      const posRef = React.useRef(null)
      const tzsRef = React.useRef([])
      posRef.current = pos
      const palette = PALETTES[paletteName] || PALETTES.jp

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

      // Polling scheduler: fetch one snapshot immediately (window creation or
      // watchlist change), then poll every ACTIVE_POLL_MS while any watched
      // market is in its local trading window; while all are closed, stop
      // polling and only re-check at IDLE_CHECK_MS, resuming 5s polls the
      // moment some market opens (checked every 60s at most).
      React.useEffect(() => {
        let alive = true
        let busy = false
        let timer = null
        const codes = syms.map((e) => e.code)
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
            } else setErr((data && data.error) || '获取失败')
          } catch (e) {
            if (alive) setErr(String((e && e.message) || e))
          } finally {
            busy = false
          }
        }
        const schedule = () => {
          const delay = anyMarketOpen(tzsRef.current) ? ACTIVE_POLL_MS : IDLE_CHECK_MS
          timer = ctx.timeout(() => {
            if (anyMarketOpen(tzsRef.current)) load()
            schedule()
          }, delay)
        }
        load()
        schedule()
        return () => {
          alive = false
          if (timer) timer()
        }
      }, [codesKey])

      const onDown = (e) => {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId)
      }
      const onMove = (e) => {
        if (!drag.current) return
        const next = { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }
        posRef.current = next
        setPos(next)
      }
      const onUp = () => {
        if (drag.current) writePos(posRef.current)
        drag.current = null
      }

      const openEditor = () => {
        setCollapsed(false)
        setEditing(true)
      }

      const togglePalette = () => {
        const next = paletteName === 'us' ? 'jp' : 'us'
        setPaletteName(next)
        writePalette(next)
      }

      const labelFor = (code) => {
        const entry = syms.find((e) => e.code === code)
        return (entry && entry.name) || DISPLAY[code] || ''
      }

      let body = null
      if (!collapsed) {
        if (editing) {
          const rows = syms.map((e, idx) => React.createElement('div', { className: 'shq-edit-row', key: e.code },
            React.createElement('span', { className: 'shq-edit-code' }, e.code),
            React.createElement('input', {
              className: 'shq-edit-name',
              value: e.name || '',
              placeholder: DISPLAY[e.code] || '显示名（可选）',
              spellCheck: false,
              onChange: (ev) => renameAt(idx, ev.target.value),
            }),
            React.createElement('button', {
              className: 'shq-edit-remove',
              title: '移除',
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
                placeholder: '股票代码，如 9984.T',
                spellCheck: false,
                onChange: (ev) => setDraft(ev.target.value),
                onKeyDown: (ev) => { if (ev.key === 'Enter') addDraft() },
              }),
              React.createElement('button', { className: 'shq-edit-btn', onClick: addDraft }, '添加')
            ),
            React.createElement('div', { className: 'shq-edit-hint' },
              React.createElement('div', null, '4 位简码仅日股，自动补 .T'),
              React.createElement('div', null, '其它市场请输完整代码，如 AAPL / 0700.HK')
            ),
            React.createElement('button', {
              className: 'shq-edit-btn',
              style: { width: '100%', marginTop: '6px' },
              onClick: togglePalette,
            }, '涨跌配色：' + (paletteName === 'us' ? '绿涨红跌（美式）' : '红涨绿跌（日式）')),
            React.createElement('div', { className: 'shq-edit-foot' },
              React.createElement('button', {
                className: 'shq-edit-btn',
                onClick: () => commitSyms(DEFAULTS),
              }, '恢复默认'),
              React.createElement('button', {
                className: 'shq-edit-btn',
                onClick: () => setEditing(false),
              }, '完成')
            )
          )
        } else if (items && items.length) {
          body = React.createElement('div', { className: 'shq-body' },
            items.map((it) => Row(it, labelFor(it.code) || it.name, palette.up, palette.down))
          )
        } else {
          body = React.createElement('div', { className: 'shq-body' },
            React.createElement('div', { className: 'shq-err' }, err || '加载中…')
          )
        }
      }

      return React.createElement('div', { className: 'shq-widget', style: { left: pos.x + 'px', top: pos.y + 'px' } },
        React.createElement('div', {
          className: 'shq-head',
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
        },
          React.createElement('span', { className: 'shq-title' }, editing ? '自选行情' : '行情'),
          React.createElement('span', { className: 'shq-tools' },
            React.createElement('button', {
              className: 'shq-tool',
              title: '自选设置',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: () => {
                if (collapsed) openEditor()
                else setEditing((v) => !v)
              },
            }, '⚙'),
            React.createElement('button', {
              className: 'shq-tool',
              title: collapsed ? '展开' : '收起',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: () => setCollapsed((v) => !v),
            }, collapsed ? '+' : '—')
          )
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
