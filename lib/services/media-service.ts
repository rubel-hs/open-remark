import { ApiError } from "@/lib/api/error"
import { detectImageKind, optimizeImage } from "@/lib/media/optimize"
import {
  uploadToProvider,
  type UploadResult,
} from "@/lib/media/providers/types"
import type { MediaProvider } from "@/generated/prisma/client"

const ALLOWED_IMAGE_HOSTS = ["ibb.co", "catbox.moe"]

export function assertImageUrlsAllowed(imageUrls: string[]) {
  for (const u of imageUrls) {
    const allowed = ALLOWED_IMAGE_HOSTS.some((h) =>
      new URL(u).hostname.toLowerCase().endsWith(h)
    )
    if (!allowed) throw new ApiError("Image host not allowed", 400)
  }
}

export async function uploadMedia(input: {
  site: {
    id: string
    mediaEnabled: boolean
    mediaProvider: MediaProvider
    mediaApiKey: string | null
    mediaMaxBytes: number
  }
  bytes: Buffer
  filename: string
}): Promise<UploadResult> {
  const { site, bytes, filename } = input
  if (!site.mediaEnabled)
    throw new ApiError("Image uploads are disabled on this site", 403)
  if (bytes.length > site.mediaMaxBytes)
    throw new ApiError("Image is too large", 413)
  const kind = detectImageKind(bytes)
  if (!kind) throw new ApiError("Unsupported image type", 422)
  const optimized = await optimizeImage(bytes, kind)
  const ext = optimized.mime === "image/webp" ? "webp" : kind
  return uploadToProvider({
    buffer: optimized.buffer,
    filename: `${filename.replace(/\.[a-z0-9]+$/i, "")}.${ext}`,
    mime: optimized.mime,
    provider: site.mediaProvider,
    apiKey: site.mediaApiKey,
  })
}
