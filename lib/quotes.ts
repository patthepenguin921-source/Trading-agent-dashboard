// Thin wrapper around financial data endpoints for the compare page benchmark
// and position sparklines. Uses stooq.com as the primary source for range
// queries (more reliable from Vercel server IPs than Yahoo Finance, which
// blocks Vercel's egress ranges) with Yahoo Finance as a fallback.

export type QuotePoint = { date: string; close: number };

// ---- stooq.com (primary for range queries) ---------------------------------
// Free, no API key, reliable from Vercel server IPs.
// Returns CSV: Date,Open,High,Low,Close,Volume (dates as YYYY-MM-DD).
// Stooq uses a ".us" suffix for US-listed tickers (VTI → vti.us).

function fmtStooqDate(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchStooqRange(
  symbol: string,
  period1Sec: number,
  period2Sec: number
): Promise<QuotePoint[]> {
  const d1 = fmtStooqDate(period1Sec - 86400); // one day buffer
  const d2 = fmtStooqDate(period2Sec);
  const ticker = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker)}&d1=${d1}&d2=${d2}&i=d`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TradingDashboard/1.0)" },
    next: { revalidate: 3600 },
    // 5-second hard timeout — stooq is unreachable from some Vercel egress IPs
    // and without this the serverless function silently hangs until execution
    // limit, swallowing the benchmark series entirely.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const text = await res.text();

  // Stooq returns "No data" in the body when a ticker isn't found
  if (text.trim().startsWith("No data") || text.trim().length < 20) {
    throw new Error(`Stooq: no data for ${symbol}`);
  }

  const lines = text.trim().split("\n");
  const points: QuotePoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols.length < 5) continue;
    const date = cols[0].trim();
    const close = parseFloat(cols[4]);
    if (!date || isNaN(close)) continue;
    // Stooq dates are already YYYY-MM-DD
    points.push({ date: `${date}T12:00:00Z`, close });
  }
  if (points.length < 2) throw new Error(`Stooq: too few points for ${symbol}`);
  return points;
}

// ---- Yahoo Finance (fallback) ----------------------------------------------
// Tries query1 then query2. Unreliable from Vercel IPs but worth attempting
// as a fallback since stooq only covers equities/ETFs with a .us suffix.

type YahooChartResult = {
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
};

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchYahooRange(
  symbol: string,
  period1Sec: number,
  period2Sec: number,
  interval: string
): Promise<QuotePoint[]> {
  let lastError: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url =
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${period1Sec}&period2=${period2Sec}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        next: { revalidate: 3600 },
      });
      if (!res.ok) { lastError = new Error(`Yahoo ${host} HTTP ${res.status}`); continue; }
      const data = await res.json();
      const result: YahooChartResult | undefined = data?.chart?.result?.[0];
      if (!result) continue;
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points: QuotePoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c == null) continue;
        points.push({ date: new Date(timestamps[i] * 1000).toISOString(), close: c });
      }
      if (points.length > 1) return points;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error(`Yahoo: no data for ${symbol}`);
}

// ---- Public API ------------------------------------------------------------

// Arbitrary historical window — used for the compare page's VTI benchmark.
// Tries stooq first (5-second hard timeout so it fails fast if unreachable),
// Yahoo as fallback. Always requests daily bars — pickInterval() was returning
// "5m" for short ranges (< 6 days), which Yahoo blocks from Vercel IPs and is
// wrong for a daily benchmark comparison chart.
export async function fetchRangeSeries(
  symbol: string,
  period1Sec: number,
  period2Sec: number
): Promise<QuotePoint[]> {
  try {
    return await fetchStooqRange(symbol, period1Sec, period2Sec);
  } catch (stooqErr) {
    // Stooq failed (timeout or blocked) — try Yahoo Finance with daily bars.
    // We always use "1d" here; intraday intervals are wrong for a benchmark
    // comparison and frequently rate-limited on Vercel IPs.
    try {
      return await fetchYahooRange(symbol, period1Sec, period2Sec, "1d");
    } catch (yahooErr) {
      // Both failed — rethrow the original stooq error with Yahoo context
      throw new Error(
        `All sources failed for ${symbol}: stooq(${stooqErr}), yahoo(${yahooErr})`
      );
    }
  }
}

// Today's session at 5-minute bars — used for position sparklines.
// Yahoo is the only source that has live intraday bars, so no stooq here.
export async function fetchTodaySeries(symbol: string): Promise<QuotePoint[]> {
  let lastError: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url =
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?range=1d&interval=5m&includePrePost=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TradingDashboard/1.0)" },
        next: { revalidate: 300 },
      });
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
      const data = await res.json();
      const result: YahooChartResult | undefined = data?.chart?.result?.[0];
      if (!result) continue;
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points: QuotePoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c == null) continue;
        points.push({ date: new Date(timestamps[i] * 1000).toISOString(), close: c });
      }
      if (points.length > 1) return points;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error(`No intraday data for ${symbol}`);
}
