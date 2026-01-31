import { NextResponse } from "next/server";
import { createActivity } from "@/lib/activities/service";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
    const supabase = await createClient();

    const body = await req.json();

    //Verify user context
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    try {
        const created = await createActivity(supabase, {
            vendor_id: body.vendor_id,
            title: body.title,
            description: body.description ?? null,
            location: body.location ?? null,
            category: body.category,
            duration_hours: body.duration_hours ?? null,
            price_per_person: body.price_per_person ?? null,
            max_capacity: body.max_capacity ?? null,
            image_url: body.image_url ?? null,
        });

        return NextResponse.json(created, { status: 201})
    } catch (error: any) {
        return NextResponse.json({ error: error?.message ?? "Failed to create activity" }, { status: 400 });
    }
}