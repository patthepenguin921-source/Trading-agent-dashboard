// Symbol -> sector mapping, ported from the trading agent repo's sectors.py
// (keep the two in sync when a universe changes — the Python copy drives the
// sector-concentration risk cap; this copy only drives dashboard grouping).
// Buckets are grouped by *correlation*, not strict GICS classification —
// e.g. TSLA/RIVN/LCID/CVNA sit together in Automotive/EV because they move
// together, which is what both the risk cap and a grouped allocation view
// care about. Broad-market ETFs and bonds map to null (diversified ballast,
// not a concentration).

const SECTOR_MAP: Record<string, string | null> = {
  // Technology
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology",
  AMZN: "Technology", META: "Technology", ORCL: "Technology",
  CRM: "Technology", ADBE: "Technology", PLTR: "Technology",
  SHOP: "Technology", SQ: "Technology", BB: "Technology",
  NOK: "Technology", MSTR: "Technology", IONQ: "Technology",
  XLK: "Technology",
  // Semiconductors
  NVDA: "Semiconductors", AVGO: "Semiconductors", AMD: "Semiconductors",
  INTC: "Semiconductors", QCOM: "Semiconductors", MU: "Semiconductors",
  // Financials
  JPM: "Financials", V: "Financials", MA: "Financials",
  BAC: "Financials", GS: "Financials", MS: "Financials",
  C: "Financials", HOOD: "Financials", SOFI: "Financials",
  COIN: "Financials", XLF: "Financials",
  // Healthcare / Pharma
  UNH: "Healthcare", JNJ: "Healthcare", ABBV: "Healthcare",
  PFE: "Healthcare", MRNA: "Healthcare", LLY: "Healthcare",
  BMY: "Healthcare", XLV: "Healthcare",
  // Energy
  XOM: "Energy", CVX: "Energy", OXY: "Energy", SLB: "Energy", XLE: "Energy",
  // Consumer Staples
  PG: "Consumer Staples", KO: "Consumer Staples", PEP: "Consumer Staples",
  WMT: "Consumer Staples", COST: "Consumer Staples", XLP: "Consumer Staples",
  // Consumer Discretionary
  HD: "Consumer Discretionary", MCD: "Consumer Discretionary",
  NKE: "Consumer Discretionary", TGT: "Consumer Discretionary",
  GME: "Consumer Discretionary",
  // Communication Services / Media
  DIS: "Communication Services", NFLX: "Communication Services",
  RBLX: "Communication Services", AMC: "Communication Services",
  DJT: "Communication Services",
  // Automotive / EV
  TSLA: "Automotive/EV", RIVN: "Automotive/EV", LCID: "Automotive/EV",
  CVNA: "Automotive/EV",
  // Aerospace / Industrials
  RKLB: "Aerospace/Industrials",
  // Utilities
  XLU: "Utilities",
  // Broad-market / diversified index ETFs — no concentration bucket
  SPY: null, QQQ: null, DIA: null, IWM: null, VTI: null, VOO: null,
  // Bonds / treasuries — no concentration bucket
  BND: null, AGG: null, TLT: null, SHY: null,
};

// Alpaca's positions endpoint (and this dashboard's positions table) uses
// the unslashed form for crypto ("BONKUSD"), while orders/universe use
// "BONK/USD" — treat a trailing USD with no slash as crypto too.
function isCryptoSymbol(symbol: string): boolean {
  return symbol.includes("/") || (/USD$/.test(symbol) && !(symbol in SECTOR_MAP));
}

export function sectorOf(symbol: string): string {
  if (isCryptoSymbol(symbol)) return "Crypto";
  const mapped = SECTOR_MAP[symbol];
  if (mapped === null) return "Index / Bonds";
  return mapped ?? "Unclassified";
}
