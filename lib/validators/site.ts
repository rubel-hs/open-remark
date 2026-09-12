import { z } from "zod"
import { MediaProvider } from "@/generated/prisma/client"

export const ThemeSchema = z.enum(["AUTO", "LIGHT", "DARK"])

const OriginSchema = z
  .string()
  .transform((v) => (v === "*" ? v : v.replace(/\/+$/, "")))
  .refine(
    (v) => v === "*" || z.string().url().safeParse(v).success,
    "Must be a valid URL or *"
  )

export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.:\/\-]+$/, "Invalid domain"),
  autoApprove: z.boolean().optional().default(false),
  allowedOrigins: z.array(OriginSchema).optional().default([]),
  theme: ThemeSchema.optional().default("AUTO"),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color")
    .optional()
    .default("#0891b2"),
  radius: z.number().int().min(0).max(24).optional().default(8),
})

export const UpdateSiteSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.:\/\-]+$/, "Invalid domain")
    .optional(),
  autoApprove: z.boolean().optional(),
  allowedOrigins: z.array(OriginSchema).optional(),
  theme: ThemeSchema.optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color")
    .optional(),
  radius: z.number().int().min(0).max(24).optional(),
  emailNotificationsEnabled: z.boolean().optional(),
  likeNotificationLimit: z.number().int().min(0).max(100).optional(),
  emailSubjectPrefix: z.string().max(50).nullable().optional(),
  emailLogoUrl: z.string().url("Must be a valid URL").nullable().optional(),
  emailAccentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color")
    .nullable()
    .optional(),
  emailFooterText: z.string().max(300).nullable().optional(),
  smtpHost: z.string().max(253).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpUser: z.string().max(255).nullable().optional(),
  smtpPass: z.string().max(255).nullable().optional(),
  smtpFrom: z.string().email("Must be a valid email").nullable().optional(),
  mediaEnabled: z.boolean().optional(),
  mediaProvider: z.nativeEnum(MediaProvider).optional(),
  mediaApiKey: z.string().max(255).nullable().optional(),
  mediaMaxImages: z.number().int().min(1).max(10).optional(),
  mediaMaxBytes: z.number().int().min(262144).max(33554432).optional(),
  mediaQuality: z.number().int().min(1).max(100).optional(),
})

export type CreateSiteInput = z.infer<typeof CreateSiteSchema>
export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>

export const TransferSiteSchema = z.object({
  email: z.string().email(),
})
export type TransferSiteInput = z.infer<typeof TransferSiteSchema>
