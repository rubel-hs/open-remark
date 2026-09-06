import { ApiError } from "@/lib/api/error"
import type { MediaProvider } from "@/generated/prisma/client"

export type UploadResult = {
  url: string
  thumbUrl?: string
  deleteUrl?: string
}

export type ProviderInput = {
  buffer: Buffer
  filename: string
  mime: string
  provider: MediaProvider
  apiKey: string | null
}

// Overridable in tests only — production defaults hit the real hosts.
export const endpoints = {
  imgbb: process.env.IMGBB_ENDPOINT ?? "https://api.imgbb.com/1/upload",
  catbox: process.env.CATBOX_ENDPOINT ?? "https://catbox.moe/user/api.php",
}

export async function postWithSingleRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    try {
      res = await fetch(url, init)
    } catch {
      throw new ApiError("Image upload failed, try again", 502)
    }
    return res
  }
  if (res.status >= 500) {
    try {
      res = await fetch(url, init)
    } catch {
      throw new ApiError("Image upload failed, try again", 502)
    }
  }
  return res
}

export async function uploadToProvider(
  input: ProviderInput
): Promise<UploadResult> {
  const { uploadToImgbb } = await import("./imgbb")
  const { uploadToCatbox } = await import("./catbox")
  const { uploadToImgur } = await import("./imgur")
  switch (input.provider) {
    case "IMGBB":
      return uploadToImgbb(input)
    case "CATBOX":
      return uploadToCatbox(input)
    case "IMGUR":
      return uploadToImgur()
    default:
      throw new ApiError("Image upload failed, try again", 502)
  }
}
