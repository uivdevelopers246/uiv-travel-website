import type { Database } from "@/supabase/types/database";

/** Row from `orders`; RLS scopes reads/writes to the owning user (or service role for webhooks). */
export type Order = Database["public"]["Tables"]["orders"]["Row"];
