// dsh-ticker-jp — Client half (dynamic-plugin form)
//
// Paste this whole file into the Client `code.client` of `cordis_define` to
// load the plugin dynamically. It injects a draggable, collapsible floating
// quote window into `shell.overlay` and polls the `getQuotes` RPC every 5s.
// The watch list is user-editable via the gear button: each entry is a code
// plus an optional display alias (editable inline), persisted when
// `localStorage` is available and otherwise kept for the page session.

const UP = '#ff3b30'
const DOWN = '#00e08a'
const NEUTRAL = 'var(--dsw-alias-label-primary)'

const STORAGE_KEY = 'dsh-ticker-jp:syms'
const DEFAULTS = ['1306.T', '^N225']

const DISPLAY = { '1306.T': 'TOPIX ETF', '^N225': '日経225' }

const RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/

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
    function Row(item, name) {
      const c = (item && typeof item.changePct === 'number')
        ? (item.changePct > 0 ? UP : item.changePct < 0 ? DOWN : NEUTRAL)
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
      const [pos, setPos] = React.useState({ x: 16, y: 16 })
      const [collapsed, setCollapsed] = React.useState(false)
      const [editing, setEditing] = React.useState(false)
      const [syms, setSyms] = React.useState(readSyms)
      const [draft, setDraft] = React.useState('')
      const drag = React.useRef(null)

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

      React.useEffect(() => {
        let alive = true
        const codes = syms.map((e) => e.code)
        const load = async () => {
          try {
            const data = await host.call('getQuotes', { syms: codes })
            if (!alive) return
            if (data && data.ok) { setItems(data.items || []); setErr(null) }
            else setErr((data && data.error) || '获取失败')
          } catch (e) {
            if (alive) setErr(String((e && e.message) || e))
          }
        }
        load()
        const stop = ctx.interval(load, 5000)
        return () => { alive = false; stop() }
      }, [codesKey])

      const onDown = (e) => {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId)
      }
      const onMove = (e) => {
        if (!drag.current) return
        setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
      }
      const onUp = () => { drag.current = null }

      const openEditor = () => {
        setCollapsed(false)
        setEditing(true)
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
            React.createElement('div', { className: 'shq-edit-hint' }, '4位简码自动补 .T'),
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
            items.map((it) => Row(it, labelFor(it.code) || it.name))
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
