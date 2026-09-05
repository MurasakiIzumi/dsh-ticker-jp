// dsh-ticker-jp — Host half (dynamic-plugin form)
//
// Paste this whole file into the Host `code.host` of `cordis_define` to load
// the plugin dynamically. It exposes the Package-private RPC `getQuotes`,
// which serves market quotes fetched from Yahoo Finance's chart API.
//
// The Client calls `host.call('getQuotes', { syms: [...] })`; syms may be an
// array or a comma-separated string and defaults to ['1306.T', '^N225'].
// Symbols are trimmed/uppercased, validated against a whitelist, de-duplicated
// and capped; a bare 4-digit code (9984) is expanded to `9984.T`. Per-symbol
// failures never abort the batch — the RPC answers { ok:true, items } for
// partial success and { ok:false, error } only when nothing could be fetched.
// Display names come from the Yahoo meta (longName -> shortName), falling back
// to the raw code.
//
// Why this file differs from the bundle Host (lib/index.js): a dynamic host
// half runs inside a node:vm sandbox that traps the native `fetch` (and has no
// `AbortSignal`), so requests go through the cordis web service instead —
// `ctx.get('web')` is an optional soft lookup (no `inject` entry needed). Each
// call races the web fetch against ctx.timeout for the same 5s cap the bundle
// uses; ctx.timeout is a timer verb, so `inject: ['timer']` is declared on the
// returned plugin — its one hard dependency. Symbols are fetched with bounded
// concurrency, so the whole watch list completes in a handful of timeout
// windows instead of one per symbol. Symbols that time out repeatedly enter a
// short cooling period; successful items echo the exchange timezone so the
// client can pause polling while every watched market is closed.

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

// One Yahoo quote via ctx.web. `web` is the cordis web service (result shape:
// { statusCode, body: { content } }) and `ctx` supplies the timeout race.
// Always resolves { ok, item } or { ok:false, error } — never throws.
async function fetchOne(symbol, web, ctx) {
  const now = Date.now()
  if (isCooling(symbol, now)) {
    return { ok: false, error: `[${symbol}] temporarily skipped (repeated timeouts)` }
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  try {
    const timeoutError = new Error('fetch timed out after 5s')
    timeoutError.name = 'TimeoutError'
    // Race the web fetch against the 5s cap. Both arms settle into a tagged
    // result (never a raw rejection), so the losing promise can never surface
    // an unhandled rejection once the race has settled.
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
