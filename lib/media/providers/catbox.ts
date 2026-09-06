import { ApiError } from "@/lib/api/error"
import { endpoints, postWithSingleRetry } from "./types"
import type { ProviderInput, UploadResult } from "./types"

export async function uploadToCatbox(
  input: ProviderInput
): Promise<UploadResult> {
  const form = new FormData()
  form.append("reqtype", "fileupload")
  // Copy into a plain Uint8Array: Buffer's SharedArrayBuffer-backed typing
  // does not satisfy the DOM BlobPart signature.
  const bytes = new Uint8Array(input.buffer)
  form.append(
    "fileToUpload",
    new Blob([bytes], { type: input.mime }),
    input.filename
  )
  const res = await postWithSingleRetry(endpoints.catbox, {
    method: "POST",
    body: form,
  })
  if (!res.ok) throw new ApiError("Image upload failed, try again", 502)
  const text = (await res.text()).trim()
  if (!text.startsWith("http")) {
    throw new ApiError("Image host rejected the upload", 502)
  }
  return { url: text }
}
