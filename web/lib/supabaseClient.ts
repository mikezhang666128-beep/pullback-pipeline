import { createClient } from "@supabase/supabase-js";

// Browser client — uses the anon key + the logged-in lab member's session (RLS applies).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
