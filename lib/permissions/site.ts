// lib/permissions/site.ts
// SINGLE SOURCE OF TRUTH for per-site authorization rules.
// Dependency-free (no Next.js, no Prisma client) so it is safe to import from
// edge middleware, Node services, and client components alike.

export type SiteRole = "SITE_OWNER" | "SITE_ADMIN" | "SITE_MODERATOR"

export type SiteCapability =
  | "MODERATE"
  | "MANAGE_SETTINGS"
  | "MANAGE_EMAIL_SETTINGS"
  | "MANAGE_MODERATORS"
  | "MANAGE_ADMINS"
  | "DELETE_SITE"
  | "TRANSFER_SITE"

const SITE_PERMISSIONS: Record<SiteRole, readonly SiteCapability[]> = {
  SITE_OWNER: [
    "MODERATE",
    "MANAGE_SETTINGS",
    "MANAGE_EMAIL_SETTINGS",
    "MANAGE_MODERATORS",
    "MANAGE_ADMINS",
    "DELETE_SITE",
    "TRANSFER_SITE",
  ],
  SITE_ADMIN: ["MODERATE", "MANAGE_SETTINGS", "MANAGE_MODERATORS"],
  SITE_MODERATOR: ["MODERATE"],
}

export const siteCan = (role: SiteRole, cap: SiteCapability): boolean =>
  SITE_PERMISSIONS[role].includes(cap)

// Settings page sections gated by capability — consumed by the settings form
// (SSOT for which role sees which section). General/install/appearance need
// only MANAGE_SETTINGS; the rest are owner-only.
export type SettingsSection =
  | "general"
  | "install"
  | "appearance"
  | "media"
  | "transfer"
  | "email"
  | "danger"

export const SETTINGS_SECTION_CAPABILITY: Record<
  SettingsSection,
  SiteCapability
> = {
  general: "MANAGE_SETTINGS",
  install: "MANAGE_SETTINGS",
  appearance: "MANAGE_SETTINGS",
  media: "MANAGE_SETTINGS",
  transfer: "TRANSFER_SITE",
  email: "MANAGE_EMAIL_SETTINGS",
  danger: "DELETE_SITE",
}

// Roles that can be granted via the team UI / invites (never SITE_OWNER).
export type GrantableSiteRole = Extract<
  SiteRole,
  "SITE_ADMIN" | "SITE_MODERATOR"
>

// Which capability is required to grant/remove a given role.
export const ROLE_GRANT_CAPABILITY: Record<GrantableSiteRole, SiteCapability> =
  {
    SITE_ADMIN: "MANAGE_ADMINS",
    SITE_MODERATOR: "MANAGE_MODERATORS",
  }

// Roles a given site role may grant — consumed by the invite form (SSOT for UI).
export const GRANTABLE_SITE_ROLES: Record<
  SiteRole,
  readonly GrantableSiteRole[]
> = {
  SITE_OWNER: ["SITE_ADMIN", "SITE_MODERATOR"],
  SITE_ADMIN: ["SITE_MODERATOR"],
  SITE_MODERATOR: [],
}
