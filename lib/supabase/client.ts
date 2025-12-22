import { createBrowserClient } from "@supabase/ssr"
// import type { Database } from "@/supabase/types/database"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
}

if (!supabasePublishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable is not set");
}

// This client uses the *public / publishable* key and is safe for browser use
// let client: ReturnType<typeof createClient<Database>> | null = null;

export function createClient() {
    return createBrowserClient(
        supabaseUrl!,
        supabasePublishableKey!,
    )
}


// export function createSupabaseBrowserClient() {
//     if (!client) {
//         client = createClient<Database>(
//             supabaseUrl as string,
//             supabaseAnonKey as string
//         );
//     }
//     return client;
// }