# Media Upload via Widget Comment Box — Design Spec

Date: 2026-09-06 · Status: approved design, not yet implemented · Author: brainstorm session with repo owner

## 1. Goal

Let visitors attach images to comments from the embed widget (Reddit-style:
thumbnail previews, click-to-expand), with a per-site on/off switch in dashboard
settings and storage on free third-party hosts via per-site API keys.

## 2. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Uploads go browser → OpenRemark server → host (server proxy), never browser → host | API keys stay secret; server validates type/size/auth before spending provider quota; avoids widget CORS per provider |
| D2 | API key is per-site (dashboard field), not global env | Free-tier quotas are per key; one abusive site must not burn the instance's quota |
| D3 | Images only for v1 (JPG, PNG, GIF, WebP) | Smallest abuse surface and simplest moderation story |
| D4 | Provider abstraction, v1 ships imgbb + catbox, imgur stubbed | imgbb: single-key POST API, 32 MB/image, direct links, `delete_url`, `expiration` param. catbox: keyless fallback, 200 MB, permanent direct links (user-funded, no SLA — zero-setup option). imgur rejected for v1: app-registration friction per site, 10 MB stills, recompression, hotlink discouragement, inactive-content purges |
| D5 | Optimize with `sharp` directly (WebP, quality 75) | `oi-optimize-images` is a bulk-folder CLI (files on disk → `-oi-out/` sibling); per-request use would mean temp-file I/O per upload. `sharp` is its engine — same bytes, buffer-in/buffer-out |
| D6 | Reddit-style attach model: `Comment.imageUrls`, max 4 per comment | Thumbnails below text, lightbox expand, preview strip with remove-before-post |
| D7 | Media off by default per site | Opt-in; existing sites see zero behavior change |

## 3. Non-goals (Phase 2+)

Video/audio/files; drag-drop reordering; test-upload button in dashboard;
cross-provider fallback on 5xx; at-rest encryption of stored keys; S3/R2
self-hosted provider (fits behind the same interface later); adding images
during comment edit (edit is remove-only in v1).

## 4. Architecture

Follows the layered rule: thin route → framework-agnostic service → Prisma.
New code lives in `lib/media/` (optimize + providers — no `next/*` imports)
and one new service module; routes stay ≤ 25 lines of parse/auth/call/respond.

```
widget --multipart--> POST /api/widget/uploads --Buffer--> lib/media/* --URL--> widget
widget --JSON {body, imageUrls}--> POST /api/widget/comments --> comment-service --> db
GET  /api/widget/comments returns imageUrls + { mediaEnabled, mediaMaxImages, mediaMaxBytes }
PATCH /api/v1/sites/:id persists media settings (MANAGE_SETTINGS-gated, key never echoed)
```

## 5. Data model

Prisma, additive migration (no backfill; existing rows get defaults):

```prisma
enum MediaProvider {
  IMGBB
  CATBOX
  IMGUR
}

model Site {
  mediaEnabled  Boolean       @default(false)
  mediaProvider MediaProvider @default(IMGBB)
  mediaApiKey   String?       // null for CATBOX; server-read only, never serialized to clients
  mediaMaxImages Int          @default(4)
  mediaMaxBytes  Int          @default(5242880) // 5 MB pre-optimization
}

model Comment {
  imageUrls String[] @default([]) // Postgres text[], direct host URLs; hidden on DELETED/SPAM render
}
```

Notes: provider is an enum per DB conventions (never free-form String).
Media fields stay inline on `Site` for consistency with the existing inline
settings clusters (`autoApprove`, email-*, theme-*). No new indexes:
`imageUrls` is never filtered and `mediaApiKey` is never queried by value.

## 6. Upload pipeline (`POST /api/widget/uploads`)

New widget route following the widget pattern: `OPTIONS` preflight,
`corsHeaders(origin)`, Bearer JWT via `verifyWidgetToken`, ban check via
`isCommenterBannedOnSite`, origin check via `isOriginAllowed` /
`getEffectiveOrigin`, `rateLimit` (10 uploads/min/IP). One file per request.

1. Parse `multipart/form-data` in the route (`req.formData()`), pass bytes + metadata to the service.
2. Reject when `!site.mediaEnabled` (403), banned (403), bad type by magic bytes not extension (422), over `site.mediaMaxBytes` (413).
3. Optimize (`lib/media/optimize.ts`, `sharp`): stills → WebP q75, fit-inside 1600 px longest edge (never upscale), strip EXIF/metadata; animated GIF → animated WebP q75 (frame-preserving); if output ≥ input, keep the original (never-grow rule).
4. Upload (`lib/media/providers/<imgbb|catbox|imgur>.ts` behind `uploadImage(buffer, { provider, apiKey })`): imgbb `POST api.imgbb.com/1/upload` (multipart, `expiration` unset = permanent); catbox `POST catbox.moe/user/api.php` (`reqtype=fileupload`, no key); imgur throws `ApiError(501)` until implemented.
5. Return `{ url, thumbUrl?, deleteUrl? }` (clients fall back to `url` when a provider supplies no thumbnail). Single retry on provider 5xx, then 502 — no silent cross-provider fallback in v1 (avoids surprise quota burn).

## 7. Comments API changes

- `CreateCommentSchema` gains `imageUrls: z.array(z.string().url()).max(4).optional()`; `createComment` throws 403 when images attached but `mediaEnabled` is false, and caps count at `site.mediaMaxImages`. Images inherit the comment's `PENDING/APPROVED` lifecycle — no separate moderation queue.
- All comment selectors/serializers (`buildCommentSelect`, `getApprovedCommentsForPage`, create/update/delete returns) include `imageUrls`.
- GET `/api/widget/comments` config block gains `mediaEnabled`, `mediaMaxImages`, `mediaMaxBytes` so the widget renders the image button only when allowed.
- `UpdateSiteSchema` gains the five media fields (`mediaMaxImages`: int 1–4, `mediaMaxBytes`: positive int ≤ 32 MB provider ceiling, `mediaProvider`: native enum, `mediaApiKey`: nullable string); the admin PATCH writes `mediaApiKey` but no GET serializes it (password semantics: UI shows saved/replace/clear, never the value).
- Edit comment: images removable, not addable. Delete: soft-delete unchanged; gallery hidden on DELETED/SPAM; provider `deleteUrl` fired best-effort, failures swallowed (free hosts are sticky).

## 8. Dashboard UI

New `MediaSection` client component in `components/dashboard/site-settings-form/`
(Card + `Switch` toggle + `Select` provider + `Input` password key +
native form + existing `useUpdateSite` mutation + sonner toasts), wired into
`SiteSettingsForm` orchestrator behind a new `media` entry in
`SETTINGS_SECTION_CAPABILITY` (`MANAGE_SETTINGS`). Dashboard comments table
renders thumbnails. No new Radix imports; token utilities only, no hardcoded colors.

## 9. Widget UX (shadow DOM, `widget/src/`)

Image button appears in the main form and inline reply forms only when
`config.mediaEnabled`. Client pre-checks MIME/size, uploads files one-by-one
with per-thumb progress, preview strip with remove-before-post; submit sends
`imageUrls` with `postComment`. Rendered comments show a thumbnail row under the
body; click opens a lightbox (Esc closes, focus-trapped, keyboard accessible).
Types: `CommentData.imageUrls: string[]`, `WidgetThemeConfig` gains the three
media flags. No new `__DEFINE__` constants needed — limits arrive from the server.

## 10. Abuse, limits, errors

| Case | Behavior |
|------|----------|
| Feature off / banned / disallowed origin | 403 before any bytes reach a provider |
| Wrong type / too large | 422 / 413 with plain message surfaced in widget error banner |
| Rate abuse | 429 via existing `rateLimit` |
| Provider outage | one retry → 502 "upload failed, try again" |
| Key compromise | per-site blast radius; owner rotates key in dashboard; old URLs stay live (hosts have no key-revocation for served bytes) |
| CSRF | n/a (widget is bearer-token, cookieless) |

## 11. Verification (repo has no test runner)

`pnpm typecheck`, `pnpm lint`, `pnpm dev` (regenerates Prisma client + widget
bundle), then manual matrix: media hidden when off; imgbb post renders;
catbox post with empty key renders; oversize/type rejected client- and
server-side; banned/anonymous blocked; per-site key absent from all network
responses; dashboard thumbnails visible; lightbox keyboard flow.
