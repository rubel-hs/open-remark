import { ApiError } from "@/lib/api/error"
import { endpoints, postWithSingleRetry } from "./types"
import type { ProviderInput, UploadResult } from "./types"

type ImgbbResponse = {
  data?: {
    url?: string
    display_url?: string
    thumb?: { url?: string }
    delete_url?: string
  }
}

export async function uploadToImgbb(
  input: ProviderInput
): Promise<UploadResult> {
  if (!input.apiKey) {
    throw new ApiError("Image provider key is not configured", 400)
  }
  const form = new FormData()
  // Copy into a plain Uint8Array: Buffer's SharedArrayBuffer-backed typing
  // does not satisfy the DOM BlobPart signature.
  const bytes = new Uint8Array(input.buffer)
  form.append("image", new Blob([bytes], { type: input.mime }), input.filename)
  form.append("name", input.filename)
  const url = `${endpoints.imgbb}?key=${encodeURIComponent(input.apiKey)}`
  const res = await postWithSingleRetry(url, { method: "POST", body: form })
  if (!res.ok) throw new ApiError("Image upload failed, try again", 502)
  const json = (await res.json()) as ImgbbResponse
  if (!json.data?.url) {
    throw new ApiError("Image host rejected the upload", 502)
  }
  return {
    url: json.data.url,
    thumbUrl: json.data.thumb?.url,
    deleteUrl: json.data.delete_url,
  }
}
