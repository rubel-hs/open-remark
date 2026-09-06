import { z } from "zod"
import { CommentStatus } from "@/generated/prisma/client"

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  siteKey: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().url().optional(),
  parentId: z.string().cuid().optional(),
  replyToId: z.string().cuid().optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
})

export const UpdateCommentStatusSchema = z.object({
  status: z.nativeEnum(CommentStatus),
})

export const BulkUpdateCommentStatusSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  status: z.nativeEnum(CommentStatus),
})

export const UpdateCommentSchema = z
  .object({
    body: z.string().min(1).max(5000).optional(),
    status: z.nativeEnum(CommentStatus).optional(),
    imageUrls: z.array(z.string().url()).max(4).optional(),
  })
  .refine(
    (data) =>
      data.body !== undefined ||
      data.status !== undefined ||
      data.imageUrls !== undefined,
    {
      message: "Either body or status is required",
    }
  )

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>
export type UpdateCommentStatusInput = z.infer<typeof UpdateCommentStatusSchema>
export type UpdateCommentInput = z.infer<typeof UpdateCommentSchema>
export type BulkUpdateCommentStatusInput = z.infer<
  typeof BulkUpdateCommentStatusSchema
>
