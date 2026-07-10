// Shared Supabase project identity — public/anon values only. Used by both
// the browser-safe client (lib/supabase.ts, read-only per RLS) and the
// admin/service-role client (lib/supabase-admin.ts, server-only writes).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://edmysxanjsskjrdfkmaw.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_mPf4oJ538gA3mlpLihNSvA_Dtz45_Hj";
