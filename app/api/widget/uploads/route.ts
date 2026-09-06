import { NextRequest, NextResponse } from "next/server"
import { getSiteBySiteKey } from "@/lib/services/site-service"
import { uploadMedia } from "@/lib/services/media-service"
import { isCommenterBannedOnSite } from "@/lib/services/user-service"
import { verifyWidgetToken } from "@/lib/auth-widget"
import { isOriginAllowed, getEffectiveOrigin, corsHeaders } from "@/lib/cors"
import { rateLimit } from "@/lib/rate-limit"
import { handleApiError, ApiError } from "@/lib/api/error"

function buildCorsResponse(req: NextRequest, body: unknown, status = 200) {
  const origin = req.headers.get("origin") ?? ""
  return NextResponse.json(body, { status, headers: corsHeaders(origin) })
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? ""
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

// NOTE: uploaded-but-never-attached bytes live permanently against the site
// key (counted as provider usage, no DB row to GC). Uploads are rate-limited
// but total orphan volume is unbounded — fast-follow: upload tokens or GC sweep.
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown"
    const { ok: rateLimitOk } = rateLimit(`upload:${ip}`, 10, 60_000)
    if (!rateLimitOk) throw new ApiError("Rate limit exceeded", 429)
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer "))
      throw new ApiError("Unauthorized", 401)
    const payload = await verifyWidgetToken(authHeader.slice(7))
    if (!payload) throw new ApiError("Invalid token", 401)
    // Bound memory before buffering: reject absurd bodies before formData()
    // materializes them. 34MB = 32MB provider ceiling + multipart slack.
    // The per-site mediaMaxBytes check in uploadMedia stays authoritative
    // (incl. chunked / no-length bodies).
    const contentLength = Number(req.headers.get("content-length") ?? "0")
    if (contentLength > 34 * 1024 * 1024)
      throw new ApiError("Image is too large", 413)
    const form = await req.formData()
    const siteKey = form.get("siteKey")
    const file = form.get("file")
    if (typeof siteKey !== "string" || !(file instanceof File))
      throw new ApiError("siteKey and file are required", 400)
    const site = await getSiteBySiteKey(siteKey)
    if (await isCommenterBannedOnSite(site.id, payload.commenterId))
      throw new ApiError("Your account has been suspended on this site", 403)
    const effectiveOrigin = getEffectiveOrigin(req)
    if (!isOriginAllowed(effectiveOrigin, site.allowedOrigins, site.domain))
      throw new ApiError("Origin not allowed", 403)
    const result = await uploadMedia({
      site,
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name || "image",
    })
    return buildCorsResponse(req, result, 201)
  } catch (err) {
    return handleApiError(err, req.headers.get("origin") ?? undefined)
  }
}
