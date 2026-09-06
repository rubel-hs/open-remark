export type WidgetConfig = {
  siteKey: string
  slug: string
  container: HTMLElement
  appUrl: string
  onThemeChange?: (theme: "light" | "dark") => void
}

export type Commenter = {
  id: string
  name: string
  username: string
  image: string | null
}

export type CommentData = {
  id: string
  body: string
  imageUrls: string[]
  status: "PENDING" | "APPROVED" | "DELETED" | "SPAM"
  createdAt: string
  editedAt: string | null
  likeCount: number
  hasLiked: boolean
  parentId: string | null
  commenter: Commenter
  banned?: boolean
  replies: CommentData[]
}

export type AuthUser = {
  name: string
  email: string
  image?: string
  commenterId: string
}

export type AuthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authenticated"; token: string; user: AuthUser }
  | { status: "error"; message: string }

export type WidgetThemeConfig = {
  theme: "AUTO" | "LIGHT" | "DARK"
  primaryColor: string
  radius: number
  currentUser?: { isBanned: boolean; notificationsEnabled: boolean }
  enable: boolean
  poweredByHtml: string
}
