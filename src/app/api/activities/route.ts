import { NextResponse } from "next/server";
import { createActivity, listActivities, hasValidCoordinates, type ActivityCategory } from "@/lib/activities/service";
import { createClient } from "@/lib/supabase/server";

const validCategories = new Set<ActivityCategory>([
    "water-sports", "wildlife", "adventure", "culture", "nature"
]);

export async function POST(req: Request) {
    const supabase = await createClient();

    const body = await req.json();

    //Verify user context
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Input validation
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (title.length > 255) {
        return NextResponse.json({ error: "Title is too long (max 255 characters)" }, { status: 400 });
    }

    const category = body.category as ActivityCategory;
    if (!category || !validCategories.has(category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Validate numeric fields if provided
    if (body.duration_hours !== undefined && body.duration_hours !== null) {
        if (typeof body.duration_hours !== "number" || body.duration_hours < 0 || body.duration_hours > 24) {
            return NextResponse.json({ error: "Duration must be between 0 and 24 hours" }, { status: 400 });
        }
    }

    if (body.price_per_person !== undefined && body.price_per_person !== null) {
        if (typeof body.price_per_person !== "number" || body.price_per_person < 0) {
            return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
        }
    }

    if (body.max_capacity !== undefined && body.max_capacity !== null) {
        if (typeof body.max_capacity !== "number" || body.max_capacity < 1 || body.max_capacity > 1000) {
            return NextResponse.json({ error: "Max capacity must be between 1 and 1000" }, { status: 400 });
        }
    }

    const hasLat = body.latitude !== undefined;
    const hasLng = body.longitude !== undefined;
    if ( hasLat || hasLng ) {
        if ( !hasLat || !hasLng ) {
            return NextResponse.json(
                { error: "Provide both latitude and longitude, or omit both"},
                { status: 400}
            );
        }
        if (!hasValidCoordinates(body.latitude, body.longitude)) {
            return NextResponse.json(
                { error: "Latitude must be between -90 and 90, longitude between -180 and 180." },
                { status: 400 }
            );
        }

    }
    
    try {
        const createPayload = {
            title,
            description: body.description ?? null,
            location: body.location ?? null,
            category,
            duration_hours: body.duration_hours ?? null,
            price_per_person: body.price_per_person ?? null,
            max_capacity: body.max_capacity ?? null,
            image_url: body.image_url ?? null,
        } as Parameters<typeof createActivity>[1];
        if (body.latitude !== undefined && body.longitude !== undefined && hasValidCoordinates(body.latitude, body.longitude)) {
            createPayload.latitude = body.latitude;
            createPayload.longitude = body.longitude;
        }
        const created = await createActivity(supabase, createPayload);
        

        return NextResponse.json(created, { status: 201})
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create activity";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function GET(req: Request) {
    const supabase = await createClient();

    const {searchParams} = new URL(req.url);
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined;

    try {
        const activities = await listActivities(supabase, { limit, offset });
        return NextResponse.json(activities, { status: 200 });
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to list activities";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}