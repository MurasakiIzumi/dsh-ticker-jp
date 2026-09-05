// dsh-ticker-jp — Host half (bundle entry)
//
// Registers the same-origin HTTP route `/dsh-ticker-jp/quotes` and serves
// market quotes fetched from Yahoo Finance's chart API. The client bundle
// polls this route every 5s and may pass `?syms=` (comma-separated, URL-encoded)
// to override the default watch list (defaults: 1306.T, ^N225).
//
// Symbol handling: each token is trimmed, uppercased, and validated against a
// whitelist; a bare 4-digit code (9984) is expanded to `9984.T`; the list is
// de-duplicated and capped. Per-symbol failures never abort the whole batch —
// the route answers { ok, items } for partial success and { ok:false, error }
// only when nothing could be fetched. Display names come from the Yahoo meta
// (longName -> shortName), falling back to the raw code. Each Yahoo fetch is
// aborted after 5s so a hung upstream can never stall a poll cycle. Symbols
// are fetched with bounded concurrency, so the whole watch list completes in
// a handful of timeout windows instead of one per symbol. Symbols that time
// out repeatedly enter a short cooling period; successful items echo the
// exchange timezone so the client can pause polling while every watched
// market is closed.

export const name = 'dsh-ticker-jp'
export const inject = ['webServer']

const DEFAULTS = ['1306.T', '^N225']
const MAX_SYMBOLS = 15
const MAX_CONCURRENCY = 5
const FETCH_TIMEOUT_MS = 5000
const RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/

const NEGATIVE_FAIL_THRESHOLD = 2
const NEGATIVE_COOLDOWN_MS = 5 * 60 * 1000
const cooling = new Map() // symbol -> { fails, until }

function normalizeSymbol(raw) {
  let s = String(raw == null ? '' : raw).trim().toUpperCase()
  if (!s) return ''
  if (/^\d{4}$/.test(s)) s += '.T'
  return RE_SYMBOL.test(s) && s.length <= 20 ? s : ''
}

function tryDecode(token) {
  try {
    return decodeURIComponent(token)
  } catch {
    return token
  }
}

function parseSyms(input) {
  const out = []
  for (const token of String(input || '').split(',')) {
    const decoded = tryDecode(token)
    const sym = normalizeSymbol(decoded)
    if (sym && !out.includes(sym)) out.push(sym)
    if (out.length >= MAX_SYMBOLS) break
  }
  return out
}

function readSymsQuery(reqUrl) {
  const query = String(reqUrl || '').split('?')[1]
  if (!query) return []
  const params = new Map()
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    const key = eq < 0 ? part : part.slice(0, eq)
    const val = eq < 0 ? '' : part.slice(eq + 1)
    if (!params.has(key)) params.set(key, val)
  }
  const raw = params.get('syms')
  if (!raw) return []
  return parseSyms(raw)
}

function isCooling(symbol, now) {
  const rec = cooling.get(symbol)
  if (!rec) return false
  if (now < rec.until) return true
  cooling.delete(symbol)
  return false
}

function recordResult(symbol, timedOut, ok, now) {
  if (ok) {
    cooling.delete(symbol)
    return
  }
  if (!timedOut) return
  const rec = cooling.get(symbol) || { fails: 0, until: 0 }
  rec.fails += 1
  if (rec.fails >= NEGATIVE_FAIL_THRESHOLD) {
    rec.fails = 0
    rec.until = now + NEGATIVE_COOLDOWN_MS
  }
  cooling.set(symbol, rec)
}

async function fetchOne(symbol) {
  const now = Date.now()
  if (isCooling(symbol, now)) {
    return { ok: false, error: `[${symbol}] temporarily skipped (repeated timeouts)` }
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) throw new Error('no meta in response')
    const price = meta.regularMarketPrice
    const changePct = meta.regularMarketChangePercent
    if (price == null || changePct == null) throw new Error('no price/change data')
    const name = meta.longName || meta.shortName || symbol
    const item = { name, code: symbol, price, changePct }
    if (meta.exchangeTimezoneName) item.timezone = meta.exchangeTimezoneName
    if (meta.exchange) item.exchange = meta.exchange
    recordResult(symbol, false, true, now)
    return { ok: true, item }
  } catch (e) {
    const timedOut = !!(e && e.name === 'TimeoutError')
    recordResult(symbol, timedOut, false, now)
    const reason = timedOut
      ? 'fetch timed out after 5s'
      : String((e && e.message) || e)
    return { ok: false, error: `[${symbol}] ${reason}` }
  }
}

async function fetchQuotes(symbols) {
  const items = []
  const errors = []
  let cursor = 0
  async function worker() {
    while (cursor < symbols.length) {
      const idx = cursor++
      const result = await fetchOne(symbols[idx])
      if (result.ok) items[idx] = result.item
      else errors.push(result.error)
    }
  }
  const poolSize = Math.min(MAX_CONCURRENCY, symbols.length)
  const workers = []
  for (let i = 0; i < poolSize; i++) workers.push(worker())
  await Promise.all(workers)
  return { items: items.filter(Boolean), errors }
}

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-ticker-jp/quotes',
      handler: async (req, res) => {
        try {
          const custom = readSymsQuery(req.url)
          const symbols = custom.length ? custom : DEFAULTS
          const { items, errors } = await fetchQuotes(symbols)
          const body = JSON.stringify(
            items.length
              ? { ok: true, items }
              : { ok: false, error: errors.length ? errors.join('; ') : 'no quotes fetched' }
          )
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(body)
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
        }
      },
    }),
    'dsh-ticker-jp: /quotes route'
  )
}
