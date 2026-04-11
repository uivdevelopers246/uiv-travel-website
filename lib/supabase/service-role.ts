import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
}

if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
}

/**
 * Server-only Supabase client using the service role key (bypasses RLS).
 * Use only in trusted server contexts (e.g. verified Stripe webhooks), never in client components.
 */
export function createServiceRoleClient (): SupabaseClient<Database> {
    return createClient<Database>(
        supabaseUrl!,
        serviceRoleKey!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        },
    ) as SupabaseClient<Database>;
}
