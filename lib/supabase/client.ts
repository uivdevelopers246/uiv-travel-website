import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/supabase/types/database"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
}

if (!supabasePublishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable is not set");
}


export const browserClient = createBrowserClient<Database>(
        supabaseUrl! as string,
        supabasePublishableKey! as string,
)

