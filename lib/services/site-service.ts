import { db } from "@/lib/db"
import { ApiError } from "@/lib/api/error"
import { CommentStatus } from "@/generated/prisma/client"
import type { CreateSiteInput, UpdateSiteInput } from "@/lib/validators/site"
import { lookupUserByEmail } from "@/lib/services/user-service"
import {
  requireSiteAccess,
  getSiteForMember,
} from "@/lib/services/membership-service"
import { siteCan } from "@/lib/permissions"

// Fields owned by the Email Notifications section — gated by MANAGE_EMAIL_SETTINGS
// so a SITE_ADMIN (who has MANAGE_SETTINGS) cannot change them via the API.
const EMAIL_SETTING_FIELDS = [
  "emailNotificationsEnabled",
  "likeNotificationLimit",
  "emailSubjectPrefix",
  "emailLogoUrl",
  "emailAccentColor",
  "emailFooterText",
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPass",
  "smtpFrom",
] as const satisfies readonly (keyof UpdateSiteInput)[]

export function stripSiteSecrets<T extends { mediaApiKey?: string | null }>(
  site: T
): Omit<T, "mediaApiKey"> & { hasMediaApiKey: boolean } {
  const { mediaApiKey, ...rest } = site
  return { ...rest, hasMediaApiKey: mediaApiKey != null && mediaApiKey !== "" }
}

export async function getSiteCountForUser(userId: string) {
  return db.site.count({ where: { members: { some: { userId } } } })
}

export async function getSitesForUser(userId: string) {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const [sites, pendingByPage, recentActivity] = await Promise.all([
    db.site.findMany({
      where: { members: { some: { userId } } },
      include: {
        _count: { select: { pages: true } },
        pages: {
          select: { id: true, _count: { select: { comments: true } } },
        },
        // The caller's membership only — used to gate per-card actions by role.
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.comment.groupBy({
      by: ["pageId"],
      where: {
        status: CommentStatus.PENDING,
        page: { site: { members: { some: { userId } } } },
      },
      _count: { _all: true },
    }),
    db.comment.findMany({
      where: {
        page: { site: { members: { some: { userId } } } },
        createdAt: { gte: twoWeeksAgo },
      },
      select: { createdAt: true, page: { select: { siteId: true } } },
    }),
  ])

  const pendingByPageId = new Map(
    pendingByPage.map((r) => [r.pageId, r._count._all])
  )

  // Build 14-day daily buckets per site
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(twoWeeksAgo)
    d.setDate(d.getDate() + i + 1)
    return d.toISOString().slice(0, 10)
  })
  const activityBySite = new Map<string, Map<string, number>>()
  for (const c of recentActivity) {
    const siteId = c.page.siteId
    const day = c.createdAt.toISOString().slice(0, 10)
    if (!activityBySite.has(siteId)) activityBySite.set(siteId, new Map())
    const m = activityBySite.get(siteId)!
    m.set(day, (m.get(day) ?? 0) + 1)
  }

  return sites.map((site) => {
    const dayMap = activityBySite.get(site.id) ?? new Map()
    const { members, ...rest } = site
    return {
      ...stripSiteSecrets(rest),
      role: members[0].role,
      totalComments: site.pages.reduce((acc, p) => acc + p._count.comments, 0),
      pendingComments: site.pages.reduce(
        (acc, p) => acc + (pendingByPageId.get(p.id) ?? 0),
        0
      ),
      sparkline: days.map((d) => dayMap.get(d) ?? 0),
    }
  })
}

export async function getSiteByIdForUser(siteId: string, userId: string) {
  const { site } = await getSiteForMember(siteId, userId)
  return site
}

export async function getSiteBySiteKey(siteKey: string) {
  const site = await db.site.findUnique({ where: { siteKey } })
  if (!site) throw new ApiError("Site not found", 404)
  return site
}

export async function createSite(ownerId: string, input: CreateSiteInput) {
  return db.$transaction(async (tx) => {
    const site = await tx.site.create({
      data: {
        name: input.name,
        domain: input.domain,
        autoApprove: input.autoApprove,
        allowedOrigins: JSON.stringify(input.allowedOrigins),
        theme: input.theme,
        primaryColor: input.primaryColor,
        radius: input.radius,
        ownerId,
      },
    })
    await tx.siteMember.create({
      data: { siteId: site.id, userId: ownerId, role: "SITE_OWNER" },
    })
    return site
  })
}

export async function updateSite(
  siteId: string,
  userId: string,
  input: UpdateSiteInput
) {
  const { membership } = await requireSiteAccess(
    siteId,
    userId,
    "MANAGE_SETTINGS"
  )
  const touchesEmailSettings = EMAIL_SETTING_FIELDS.some(
    (field) => input[field] !== undefined
  )
  if (
    touchesEmailSettings &&
    !siteCan(membership.role, "MANAGE_EMAIL_SETTINGS")
  ) {
    throw new ApiError("Forbidden", 403)
  }
  return stripSiteSecrets(
    await db.site.update({
      where: { id: siteId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.domain && { domain: input.domain }),
        ...(typeof input.autoApprove === "boolean" && {
          autoApprove: input.autoApprove,
        }),
        ...(input.allowedOrigins && {
          allowedOrigins: JSON.stringify(input.allowedOrigins),
        }),
        ...(input.theme && { theme: input.theme }),
        ...(input.primaryColor && { primaryColor: input.primaryColor }),
        ...(typeof input.radius === "number" && { radius: input.radius }),
        ...(typeof input.emailNotificationsEnabled === "boolean" && {
          emailNotificationsEnabled: input.emailNotificationsEnabled,
        }),
        ...(typeof input.likeNotificationLimit === "number" && {
          likeNotificationLimit: input.likeNotificationLimit,
        }),
        ...(input.emailSubjectPrefix !== undefined && {
          emailSubjectPrefix: input.emailSubjectPrefix,
        }),
        ...(input.emailLogoUrl !== undefined && {
          emailLogoUrl: input.emailLogoUrl,
        }),
        ...(input.emailAccentColor !== undefined && {
          emailAccentColor: input.emailAccentColor,
        }),
        ...(input.emailFooterText !== undefined && {
          emailFooterText: input.emailFooterText,
        }),
        ...(input.smtpHost !== undefined && { smtpHost: input.smtpHost }),
        ...(input.smtpPort !== undefined && { smtpPort: input.smtpPort }),
        ...(input.smtpUser !== undefined && { smtpUser: input.smtpUser }),
        ...(input.smtpPass !== undefined && { smtpPass: input.smtpPass }),
        ...(input.smtpFrom !== undefined && { smtpFrom: input.smtpFrom }),
      },
    })
  )
}

export async function deleteSite(siteId: string, userId: string) {
  await requireSiteAccess(siteId, userId, "DELETE_SITE")
  await db.site.delete({ where: { id: siteId } })
}

export async function transferSite(
  siteId: string,
  currentUserId: string,
  newOwnerEmail: string
) {
  await requireSiteAccess(siteId, currentUserId, "TRANSFER_SITE")
  const newOwner = await lookupUserByEmail(newOwnerEmail)
  if (newOwner.id === currentUserId) {
    throw new ApiError("Cannot transfer to yourself", 400)
  }
  return db.$transaction(async (tx) => {
    // Demote current owner to admin (retains access).
    await tx.siteMember.update({
      where: { userId_siteId: { userId: currentUserId, siteId } },
      data: { role: "SITE_ADMIN" },
    })
    // Promote / create the new owner's membership.
    await tx.siteMember.upsert({
      where: { userId_siteId: { userId: newOwner.id, siteId } },
      create: { siteId, userId: newOwner.id, role: "SITE_OWNER" },
      update: { role: "SITE_OWNER" },
    })
    return tx.site.update({
      where: { id: siteId },
      data: { ownerId: newOwner.id },
    })
  })
}
