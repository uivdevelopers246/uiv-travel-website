import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
}

if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
}

//This client is for server-only code
let client: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseServerClient (){
    if (!client) {
        client = createClient<Database>(
            supabaseUrl as string,
            supabaseServiceRoleKey as string,
            {
                auth: { persistSession: false },        
            }
        );
    }
    return client;
}
