import { supabaseAdmin } from "@/lib/supabase/server";


async function main() {
    console.log("Seeding database...");

}

main().catch((error) => {
    console.error("Seeding failed:", error)
    process.exit(1);
})