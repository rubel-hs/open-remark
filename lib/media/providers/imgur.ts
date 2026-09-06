import { ApiError } from "@/lib/api/error"
import type { UploadResult } from "./types"

export async function uploadToImgur(): Promise<UploadResult> {
  throw new ApiError("Imgur uploads are not enabled yet", 501)
}
