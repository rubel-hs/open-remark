import sharp from "sharp"

export type ImageKind = "jpeg" | "png" | "gif" | "webp"

export const DEFAULT_QUALITY = 70
const MAX_EDGE = 1600

const ORIGINAL_MIME: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
}

// Magic-byte sniffing — never trust extensions or client MIME.
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "webp"
  return null
}

export async function optimizeImage(
  bytes: Buffer,
  kind: ImageKind,
  quality: number = DEFAULT_QUALITY
): Promise<{ buffer: Buffer; mime: string }> {
  // Clamp defensively — callers validate, but a bad row must not crash sharp.
  const q = Math.min(100, Math.max(1, Math.round(quality) || DEFAULT_QUALITY))
  // `animated: kind === "gif"` preserves every frame of animated GIF input;
  // still WebP input is flattened to its first frame.
  const encoded = await sharp(bytes, { animated: kind === "gif" })
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: q, effort: 4 })
    .toBuffer()
  // Never-grow rule: keep the original when re-encoding costs bytes.
  if (encoded.length >= bytes.length)
    return { buffer: bytes, mime: ORIGINAL_MIME[kind] }
  return { buffer: encoded, mime: "image/webp" }
}
