import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If the env vars aren't set (e.g. local dev without a .env, or a fork that
// hasn't configured Supabase yet), we deliberately don't throw here — labs
// fall back to their local question sets instead. See useQuestions.js.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
