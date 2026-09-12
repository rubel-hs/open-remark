export type Theme = "AUTO" | "LIGHT" | "DARK"

export type Site = {
  id: string
  name: string
  siteKey: string
  domain: string
  autoApprove: boolean
  allowedOrigins: string
  theme: Theme
  primaryColor: string
  radius: number
  emailNotificationsEnabled: boolean
  likeNotificationLimit: number
  emailSubjectPrefix: string | null
  emailLogoUrl: string | null
  emailAccentColor: string | null
  emailFooterText: string | null
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  smtpPass: string | null
  smtpFrom: string | null
  mediaEnabled: boolean
  mediaProvider: "IMGBB" | "CATBOX" | "IMGUR"
  mediaMaxImages: number
  mediaMaxBytes: number
  mediaQuality: number
  hasMediaApiKey: boolean
}
