import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/types/database"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
}

if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set");
}

// This client uses the *public / publishable* key and is safe for browser use
export const supabaseClient = createClient<Database>(
    supabaseUrl,
    supabaseAnonKey
  );