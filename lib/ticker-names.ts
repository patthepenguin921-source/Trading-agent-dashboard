// Static symbol -> name lookup for the fixed Plutus + Helios trading
// universe (see PLUTUS_UNIVERSE / HELIOS_UNIVERSE in the agent repo's
// config.py). No external API call needed since the universe is fixed.
const TICKER_NAMES: Record<string, string> = {
  // Broad market / sector ETFs
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
  DIA: "SPDR Dow Jones Industrial Average ETF",
  IWM: "iShares Russell 2000 ETF",
  VTI: "Vanguard Total Stock Market ETF",
  VOO: "Vanguard S&P 500 ETF",
  XLK: "Technology Select Sector SPDR Fund",
  XLF: "Financial Select Sector SPDR Fund",
  XLE: "Energy Select Sector SPDR Fund",
  XLV: "Health Care Select Sector SPDR Fund",
  XLP: "Consumer Staples Select Sector SPDR Fund",
  XLU: "Utilities Select Sector SPDR Fund",
  // Bonds / treasuries
  BND: "Vanguard Total Bond Market ETF",
  AGG: "iShares Core U.S. Aggregate Bond ETF",
  TLT: "iShares 20+ Year Treasury Bond ETF",
  SHY: "iShares 1-3 Year Treasury Bond ETF",
  // Large-cap tech
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  GOOGL: "Alphabet Inc.",
  AMZN: "Amazon.com Inc.",
  NVDA: "NVIDIA Corp.",
  META: "Meta Platforms Inc.",
  TSLA: "Tesla Inc.",
  AVGO: "Broadcom Inc.",
  ORCL: "Oracle Corp.",
  CRM: "Salesforce Inc.",
  ADBE: "Adobe Inc.",
  NFLX: "Netflix Inc.",
  // Other large-cap / dividend blue chips
  JPM: "JPMorgan Chase & Co.",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  UNH: "UnitedHealth Group Inc.",
  HD: "Home Depot Inc.",
  PG: "Procter & Gamble Co.",
  KO: "Coca-Cola Co.",
  PEP: "PepsiCo Inc.",
  WMT: "Walmart Inc.",
  DIS: "Walt Disney Co.",
  BAC: "Bank of America Corp.",
  XOM: "Exxon Mobil Corp.",
  CVX: "Chevron Corp.",
  JNJ: "Johnson & Johnson",
  ABBV: "AbbVie Inc.",
  COST: "Costco Wholesale Corp.",
  MCD: "McDonald's Corp.",
  NKE: "Nike Inc.",
};

export function getTickerName(symbol: string): string | null {
  return TICKER_NAMES[symbol] ?? null;
}
