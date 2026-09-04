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
// to the raw code. Each Yahoo fetch is aborted after 5s so a hung upstream can
// never stall a poll cycle. Symbols are fetched with bounded concurrency, so
// the whole watch list completes in a handful of timeout windows instead of
// one per symbol.
//
// Dynamic-host environment: `harness` is the host-half closure symbol and the
// plugin body only uses ctx.effect, so the returned plugin needs no `inject`
// declaration.

const DEFAULTS = ['1306.T', '^N225']
const MAX_SYMBOLS = 15
const MAX_CONCURRENCY = 5
const FETCH_TIMEOUT_MS = 5000
const RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/

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

async function fetchOne(symbol) {
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
    return { ok: true, item: { name, code: symbol, price, changePct } }
  } catch (e) {
    const reason = (e && e.name === 'TimeoutError')
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

return {
  apply(ctx) {
    ctx.effect(() =>
      harness.handle('getQuotes', async (args) => {
        const symbols = collectSyms(args)
        const { items, errors } = await fetchQuotes(symbols)
        if (items.length === 0) {
          const errorMsg = errors.length ? errors.join('; ') : 'no quotes fetched'
          return { ok: false, error: errorMsg }
        }
        return { ok: true, items }
      })
    )
  },
}
