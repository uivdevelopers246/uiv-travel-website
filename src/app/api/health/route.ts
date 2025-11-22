import { NextResponse } from "next/server";

export async function GET () {
    return NextResponse.json(
        {
            ok: true,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        },
        { status: 200 }
    );
}