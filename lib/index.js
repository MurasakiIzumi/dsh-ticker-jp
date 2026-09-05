// dsh-ticker-jp — Host half (bundle entry)
//
// Bundle 形态的 Host 服务端入口：注册 /dsh-ticker-jp/quotes 路由。Client 轮询该路由，
// Host 按请求的符号列表（syms 参数，缺省为 1306.T 与 ^N225）向 Yahoo Finance 拉取行情，
// 返回 { ok, items } 或 { ok:false, error }。
//
// Bundle-form host entry: registers the /dsh-ticker-jp/quotes route. The client
// polls it and the host fetches quotes from Yahoo Finance for the requested
// symbols (defaults: 1306.T and ^N225), answering { ok, items } or
// { ok:false, error }.

export const name = 'dsh-ticker-jp'
export const inject = ['webServer']

const DEFAULTS = ['1306.T', '^N225']
const MAX_SYMBOLS = 15
const MAX_CONCURRENCY = 5
const FETCH_TIMEOUT_MS = 5000
const RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/

// Negative cache: 2 consecutive timeouts put a symbol on a 5-minute cooldown.
const NEGATIVE_FAIL_THRESHOLD = 2
const NEGATIVE_COOLDOWN_MS = 5 * 60 * 1000
const cooling = new Map() // symbol -> { fails, until }

// Whitelists a symbol; a bare 4-digit code is treated as Japan and expanded to 9984.T.
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

// Success clears the cooldown; only timeouts count — other errors are ignored.
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

// Fetches one symbol with a 5s cap (AbortSignal.timeout); a timed-out symbol
// cools down and never aborts the rest. timezone/exchange are echoed so the
// client can pause polling while every watched market is closed.
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

// Fetches the batch with bounded concurrency; results keep the input order.
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
      // GET /dsh-ticker-jp/quotes[?syms=a,b] -> { ok, items:[{name,code,price,changePct,timezone,exchange}] } | { ok:false, error }
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
