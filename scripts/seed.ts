import { supabaseAdmin } from "@/lib/supabaseAdminClient";


async function main() {
    console.log("Seeding database...");

}

main().catch((error) => {
    console.error("Seeding failed:", error)
    process.exit(1);
})