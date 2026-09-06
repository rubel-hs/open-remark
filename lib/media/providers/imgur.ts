import { ApiError } from "@/lib/api/error"
import type { ProviderInput, UploadResult } from "./types"

export async function uploadToImgur(
  _input: ProviderInput
): Promise<UploadResult> {
  throw new ApiError("Imgur uploads are not enabled yet", 501)
}
