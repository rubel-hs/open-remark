import type { CommentData, WidgetThemeConfig } from "./types"

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "UnauthorizedError"
  }
}

export async function fetchComments(
  appUrl: string,
  siteKey: string,
  slug: string,
  token?: string
): Promise<{ comments: CommentData[]; config: WidgetThemeConfig }> {
  const url = `${appUrl}/api/widget/comments?siteKey=${encodeURIComponent(siteKey)}&slug=${encodeURIComponent(slug)}`
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError()
    throw new Error("Failed to fetch comments")
  }
  return res.json()
}

export async function postComment(
  appUrl: string,
  token: string,
  payload: {
    body: string
    siteKey: string
    slug: string
    url?: string
    parentId?: string
    replyToId?: string
  }
): Promise<CommentData> {
  const res = await fetch(`${appUrl}/api/widget/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to post comment")
  }
  return res.json()
}

export async function likeComment(
  appUrl: string,
  token: string,
  commentId: string
): Promise<{ liked: boolean; count: number }> {
  const res = await fetch(`${appUrl}/api/widget/comments/${commentId}/like`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to toggle like")
  }
  return res.json()
}

export async function updateComment(
  appUrl: string,
  token: string,
  commentId: string,
  body?: string,
  imageUrls?: string[]
): Promise<CommentData> {
  const res = await fetch(`${appUrl}/api/widget/comments/${commentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...(body !== undefined && { body }),
      ...(imageUrls !== undefined && { imageUrls }),
    }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to update comment")
  }
  return res.json()
}

export async function deleteComment(
  appUrl: string,
  token: string,
  commentId: string
): Promise<CommentData> {
  const res = await fetch(`${appUrl}/api/widget/comments/${commentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "DELETED" }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to delete comment")
  }
  return res.json()
}

export async function searchCommenters(
  appUrl: string,
  siteKey: string,
  q: string
): Promise<
  Array<{ id: string; name: string; username: string; image: string | null }>
> {
  const url = `${appUrl}/api/widget/commenters?siteKey=${encodeURIComponent(siteKey)}&q=${encodeURIComponent(q)}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return data.commenters ?? []
}

export async function updateNotificationPreference(
  appUrl: string,
  token: string,
  notificationsEnabled: boolean
): Promise<void> {
  const res = await fetch(`${appUrl}/api/widget/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ notificationsEnabled }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to update preference")
  }
}

export async function exchangeGoogleToken(
  appUrl: string,
  code: string,
  codeVerifier: string
): Promise<string> {
  const res = await fetch(`${appUrl}/api/widget/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier }),
  })
  if (!res.ok) throw new Error("Auth failed")
  const { token } = await res.json()
  return token
}
