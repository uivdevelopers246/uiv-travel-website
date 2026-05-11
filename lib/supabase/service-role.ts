import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";

/**
 * Server-only Supabase client with the service role key (bypasses RLS).
 * Do not import from client components or expose this key to the browser.
 *
 * Env checks run here (not at module load) so `next build` can run without
 * `SUPABASE_SERVICE_ROLE_KEY` in the build environment.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
    }
    if (!serviceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    }

    return createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
