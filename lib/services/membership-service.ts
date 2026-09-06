import { db } from "@/lib/db"
import { ApiError } from "@/lib/api/error"
import { stripSiteSecrets } from "@/lib/services/site-service"
import {
  siteCan,
  ROLE_GRANT_CAPABILITY,
  type SiteCapability,
  type GrantableSiteRole,
} from "@/lib/permissions"

export async function getMembership(userId: string, siteId: string) {
  return db.siteMember.findUnique({
    where: { userId_siteId: { userId, siteId } },
  })
}

/** Read access for any member; throws 404 if the user is not a member. */
export async function getSiteForMember(siteId: string, userId: string) {
  const membership = await getMembership(userId, siteId)
  if (!membership) throw new ApiError("Site not found", 404)
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site) throw new ApiError("Site not found", 404)
  return { site: stripSiteSecrets(site), role: membership.role }
}

/** Guard a capability; returns the loaded site + membership. */
export async function requireSiteAccess(
  siteId: string,
  userId: string,
  capability: SiteCapability
) {
  const membership = await getMembership(userId, siteId)
  if (!membership) throw new ApiError("Site not found", 404)
  if (!siteCan(membership.role, capability)) {
    throw new ApiError("Forbidden", 403)
  }
  const site = await db.site.findUnique({ where: { id: siteId } })
  if (!site) throw new ApiError("Site not found", 404)
  return { site: stripSiteSecrets(site), membership }
}

export async function listMembers(siteId: string) {
  return db.siteMember.findMany({
    where: { siteId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
  })
}

export async function listPendingInvites(siteId: string) {
  return db.siteInvite.findMany({
    where: { siteId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Invite by email. If the email already has an account, membership is created
 * immediately; otherwise a PENDING invite is stored (claimed on next sign-in).
 */
export async function createInvite(
  siteId: string,
  inviterUserId: string,
  email: string,
  role: GrantableSiteRole
) {
  await requireSiteAccess(siteId, inviterUserId, ROLE_GRANT_CAPABILITY[role])
  const normalized = email.toLowerCase()

  const existing = await db.user.findUnique({ where: { email: normalized } })
  if (existing) {
    const current = await getMembership(existing.id, siteId)
    if (current?.role === "SITE_OWNER") {
      throw new ApiError("That user owns this site", 400)
    }
    await db.siteMember.upsert({
      where: { userId_siteId: { userId: existing.id, siteId } },
      create: { siteId, userId: existing.id, role },
      update: { role },
    })
    return { status: "added" as const }
  }

  await db.siteInvite.upsert({
    where: { siteId_email: { siteId, email: normalized } },
    create: {
      siteId,
      email: normalized,
      role,
      invitedById: inviterUserId,
      status: "PENDING",
    },
    update: { role, status: "PENDING", invitedById: inviterUserId },
  })
  return { status: "invited" as const }
}

export async function changeRole(
  siteId: string,
  actingUserId: string,
  targetUserId: string,
  newRole: GrantableSiteRole
) {
  const { membership: actor } = await requireSiteAccess(
    siteId,
    actingUserId,
    ROLE_GRANT_CAPABILITY[newRole]
  )
  const target = await getMembership(targetUserId, siteId)
  if (!target) throw new ApiError("Member not found", 404)
  if (target.role === "SITE_OWNER") {
    throw new ApiError("Cannot change the owner's role", 400)
  }
  // Touching an existing admin additionally requires MANAGE_ADMINS.
  if (target.role === "SITE_ADMIN" && !siteCan(actor.role, "MANAGE_ADMINS")) {
    throw new ApiError("Forbidden", 403)
  }
  return db.siteMember.update({
    where: { userId_siteId: { userId: targetUserId, siteId } },
    data: { role: newRole },
  })
}

export async function removeMember(
  siteId: string,
  actingUserId: string,
  targetUserId: string
) {
  const { membership: actor } = await requireSiteAccess(
    siteId,
    actingUserId,
    "MANAGE_MODERATORS"
  )
  const target = await getMembership(targetUserId, siteId)
  if (!target) throw new ApiError("Member not found", 404)
  if (target.role === "SITE_OWNER") {
    throw new ApiError("Cannot remove the owner", 400)
  }
  if (target.role === "SITE_ADMIN" && !siteCan(actor.role, "MANAGE_ADMINS")) {
    throw new ApiError("Forbidden", 403)
  }
  await db.siteMember.delete({
    where: { userId_siteId: { userId: targetUserId, siteId } },
  })
}

export async function revokeInvite(
  siteId: string,
  actingUserId: string,
  inviteId: string
) {
  const invite = await db.siteInvite.findFirst({
    where: { id: inviteId, siteId },
  })
  if (!invite || invite.status !== "PENDING") {
    throw new ApiError("Invite not found", 404)
  }
  // invite.role is SITE_ADMIN | SITE_MODERATOR (never SITE_OWNER for invites).
  await requireSiteAccess(
    siteId,
    actingUserId,
    ROLE_GRANT_CAPABILITY[invite.role as GrantableSiteRole]
  )
  await db.siteInvite.update({
    where: { id: inviteId },
    data: { status: "REVOKED" },
  })
}

/** Called from auth `events.signIn`; materializes any pending invites. */
export async function claimPendingInvites(userId: string, email: string) {
  const normalized = email.toLowerCase()
  const invites = await db.siteInvite.findMany({
    where: { email: normalized, status: "PENDING" },
  })
  if (invites.length === 0) return

  await db.$transaction([
    ...invites.map((inv) =>
      db.siteMember.upsert({
        where: { userId_siteId: { userId, siteId: inv.siteId } },
        // Never demote an existing owner via a stale invite.
        create: { siteId: inv.siteId, userId, role: inv.role },
        update: {},
      })
    ),
    ...invites.map((inv) =>
      db.siteInvite.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED" },
      })
    ),
  ])
}
