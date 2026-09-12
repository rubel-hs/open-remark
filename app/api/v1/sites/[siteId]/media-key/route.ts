import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { getSiteMediaKey } from "@/lib/services/site-service"
import { handleApiError, ApiError } from "@/lib/api/error"

type Params = { params: Promise<{ siteId: string }> }

// Reveal the stored media provider key. Same MANAGE_SETTINGS gate as editing
// it; fetched on demand (eye button) and never cached.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { siteId } = await params
    const session = await auth()
    if (!session?.user?.id) throw new ApiError("Unauthorized", 401)
    const apiKey = await getSiteMediaKey(siteId, session.user.id)
    return NextResponse.json(
      { apiKey },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
