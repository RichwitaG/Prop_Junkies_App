import { createClient } from "@supabase/supabase-js";

// The publishable key is meant to be public: what each visitor can read or change is decided
// by the database's row rules (supabase/migrations). Never put a secret/service_role key here.
export const SUPABASE_URL = "https://bhdipbiapkafegmpljpa.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dJa2iuylh6NJ4i0Ic1Hliw_4PngyqKY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // The sign-in link carries the session in the URL, so it works even when a phone's mail
    // app opens the link in a different browser than the one the user started in.
    flowType: "implicit",
    detectSessionInUrl: true,
    persistSession: true,
  },
});

if (import.meta.env.DEV) (window as unknown as { __supabase: typeof supabase }).__supabase = supabase;
