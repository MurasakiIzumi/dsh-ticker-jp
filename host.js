// dsh-ticker-jp — Host half (dynamic-plugin form)
//
// 动态插件形态的 Host 半区：为 Client 提供 getQuotes RPC（经 host.call 调用），从
// Yahoo Finance 拉取行情并返回 { ok, items } 或 { ok:false, error }。
//
// Dynamic-plugin host half: serves the getQuotes RPC (called via host.call) with
// quotes from Yahoo Finance, answering { ok, items } or { ok:false, error }.
// Paste this whole file as cordis_define's code.host to load it.

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

function collectSyms(args) {
  const raw = args && args.syms
  const tokens = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(',')
  const out = []
  for (const token of tokens) {
    const sym = normalizeSymbol(token)
    if (sym && !out.includes(sym)) out.push(sym)
    if (out.length >= MAX_SYMBOLS) break
  }
  return out.length ? out : DEFAULTS
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

// One symbol via ctx.web (result shape: { statusCode, body: { content } }),
// raced against ctx.timeout for the same 5s cap as the bundle host. Both race
// arms settle into tagged results so the loser never leaves an unhandled
// rejection; timezone/exchange are echoed for the client's market-hours logic.
async function fetchOne(symbol, web, ctx) {
  const now = Date.now()
  if (isCooling(symbol, now)) {
    return { ok: false, error: `[${symbol}] temporarily skipped (repeated timeouts)` }
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  try {
    const timeoutError = new Error('fetch timed out after 5s')
    timeoutError.name = 'TimeoutError'
    const result = await Promise.race([
      web.fetch({ url }).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      ),
      ctx.timeout(FETCH_TIMEOUT_MS).then(
        () => ({ ok: false, error: timeoutError }),
        () => ({ ok: false, error: timeoutError })
      )
    ])
    if (!result.ok) throw result.error
    const res = result.value
    if (!res || typeof res.statusCode !== 'number') throw new Error('no valid web response')
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`HTTP ${res.statusCode}`)
    const data = JSON.parse((res.body && res.body.content) || '')
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
async function fetchQuotes(symbols, web, ctx) {
  const items = []
  const errors = []
  let cursor = 0
  async function worker() {
    while (cursor < symbols.length) {
      const idx = cursor++
      const result = await fetchOne(symbols[idx], web, ctx)
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

return {
  // Dynamic host halves run in a node:vm sandbox that traps the native fetch,
  // so requests go through ctx.get('web') (a soft lookup, no inject entry) and
  // the 5s cap is a ctx.timeout race — hence inject: ['timer'].
  inject: ['timer'],
  apply(ctx) {
    ctx.effect(() =>
      harness.handle('getQuotes', async (args) => {
        const web = ctx.get('web')
        if (web === undefined) return { ok: false, error: 'web service unavailable' }
        const symbols = collectSyms(args)
        const { items, errors } = await fetchQuotes(symbols, web, ctx)
        if (items.length === 0) {
          const errorMsg = errors.length ? errors.join('; ') : 'no quotes fetched'
          return { ok: false, error: errorMsg }
        }
        return { ok: true, items }
      })
    )
  },
}
