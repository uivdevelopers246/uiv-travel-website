import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// import type { Database } from "@/supabase/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
}

if (!supabasePublishableKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
}

//This client is for server-only code
// let client: ReturnType<typeof createServerClient<Database>> | null = null;

export async function createClient (){
    const cookieStore = await cookies()
    
    return createServerClient(
        supabaseUrl!,
        supabasePublishableKey!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options}) => cookieStore.set(name, value, options))
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                } 
            }
        }
    )
}
