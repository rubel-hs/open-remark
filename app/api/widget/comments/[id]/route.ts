import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { UpdateCommentSchema } from "@/lib/validators/comment"
import {
  updateCommentBody,
  updateCommentImages,
  deleteComment,
} from "@/lib/services/comment-service"
import { isCommenterBannedOnSite } from "@/lib/services/user-service"
import { assertImageUrlsAllowed } from "@/lib/services/media-service"
import { verifyWidgetToken } from "@/lib/auth-widget"
import { corsHeaders } from "@/lib/cors"
import { db } from "@/lib/db"
import { ApiError, handleApiError } from "@/lib/api/error"

function buildCorsResponse(req: NextRequest, body: unknown, status = 200) {
  const origin = req.headers.get("origin") ?? ""
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(origin),
  })
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? ""
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError("Unauthorized", 401)
    }
    const token = authHeader.slice(7)
    const payload = await verifyWidgetToken(token)
    if (!payload) throw new ApiError("Invalid token", 401)

    const body = await req.json()
    const parsed = UpdateCommentSchema.safeParse(body)
    if (!parsed.success) {
      return buildCorsResponse(
        req,
        { error: z.flattenError(parsed.error) },
        422
      )
    }

    // Verify ownership
    const comment = await db.comment.findUnique({
      where: { id },
      select: {
        commenterId: true,
        body: true,
        imageUrls: true,
        page: { select: { siteId: true } },
      },
    })
    if (!comment) throw new ApiError("Comment not found", 404)
    if (comment.commenterId !== payload.commenterId) {
      throw new ApiError("Forbidden", 403)
    }

    const isBanned = await isCommenterBannedOnSite(
      comment.page.siteId,
      payload.commenterId
    )
    if (isBanned) {
      throw new ApiError("Your account has been suspended on this site", 403)
    }

    if (parsed.data.status !== undefined) {
      const updated = await deleteComment(id)
      return buildCorsResponse(req, updated)
    }

    let updated
    // The resulting comment must keep text or images — an edit may clear
    // the body only when images remain (and vice versa).
    const effectiveBody = parsed.data.body ?? comment.body
    const effectiveImages = parsed.data.imageUrls ?? comment.imageUrls ?? []
    if (effectiveBody.trim() === "" && effectiveImages.length === 0)
      throw new ApiError("Comment must have text or images", 400)
    if (parsed.data.imageUrls !== undefined) {
      const siteCheck = await db.comment.findUnique({
        where: { id },
        select: {
          page: {
            select: {
              site: { select: { mediaEnabled: true, mediaMaxImages: true } },
            },
          },
        },
      })
      if (!siteCheck?.page.site.mediaEnabled)
        throw new ApiError("Image uploads are disabled on this site", 403)
      if (parsed.data.imageUrls.length > siteCheck.page.site.mediaMaxImages)
        throw new ApiError("Too many images", 400)
      assertImageUrlsAllowed(parsed.data.imageUrls)
      updated = await updateCommentImages(id, parsed.data.imageUrls)
    }

    if (parsed.data.body !== undefined) {
      updated = await updateCommentBody(id, parsed.data.body, {
        allowEmpty: true,
      })
    }

    if (updated !== undefined) {
      return buildCorsResponse(req, updated)
    }

    throw new ApiError("Invalid update", 400)
  } catch (err) {
    return handleApiError(err, req.headers.get("origin") ?? undefined)
  }
}
