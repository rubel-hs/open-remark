import { db } from "@/lib/db"
import { ApiError } from "@/lib/api/error"
import { sanitizeBody } from "@/lib/sanitize"
import { CommentStatus } from "@/generated/prisma/client"
import type { CreateCommentInput } from "@/lib/validators/comment"
import {
  notifyNewComment,
  notifyReply,
  notifyLike,
} from "@/lib/email/email-service"

function buildCommenterSelect() {
  return {
    id: true,
    name: true,
    email: true,
    username: true,
    image: true,
  }
}

function buildCommentSelect(userEmail?: string, commenterId?: string) {
  const likeWhere = userEmail ? { where: { userEmail } } : undefined

  const replyWhere = commenterId
    ? {
        OR: [
          { status: { in: [CommentStatus.APPROVED, CommentStatus.DELETED] } },
          { status: CommentStatus.PENDING, commenterId },
        ],
      }
    : { status: { in: [CommentStatus.APPROVED, CommentStatus.DELETED] } }

  return {
    id: true,
    body: true,
    imageUrls: true,
    status: true,
    createdAt: true,
    editedAt: true,
    parentId: true,
    commenterId: true,
    commenter: { select: buildCommenterSelect() },
    _count: { select: { likes: true } },
    likes: likeWhere ? { ...likeWhere, select: { id: true } } : undefined,
    replies: {
      where: replyWhere,
      select: {
        id: true,
        body: true,
        imageUrls: true,
        status: true,
        createdAt: true,
        editedAt: true,
        parentId: true,
        commenterId: true,
        commenter: { select: buildCommenterSelect() },
        _count: { select: { likes: true } },
        likes: likeWhere ? { ...likeWhere, select: { id: true } } : undefined,
      },
      orderBy: { createdAt: "asc" as const },
    },
  }
}

export async function getCommentsBySite(
  siteId: string,
  filters: {
    status?: CommentStatus
    slug?: string
    page?: number
    limit?: number
    search?: string
  } = {}
) {
  const { status, slug, page = 1, limit = 50, search } = filters
  const skip = (page - 1) * limit

  const searchFilter = search
    ? {
        OR: [
          { body: { contains: search, mode: "insensitive" as const } },
          {
            commenter: {
              name: { contains: search, mode: "insensitive" as const },
            },
          },
          {
            commenter: {
              email: { contains: search, mode: "insensitive" as const },
            },
          },
        ],
      }
    : undefined

  const [comments, total] = await Promise.all([
    db.comment.findMany({
      where: {
        page: { siteId, ...(slug && { slug }) },
        ...(status && { status }),
        ...(searchFilter && searchFilter),
      },
      include: {
        page: { select: { slug: true, url: true } },
        commenter: { select: buildCommenterSelect() },
        replies: {
          where: {
            status: { in: [CommentStatus.APPROVED, CommentStatus.DELETED] },
          },
          orderBy: { createdAt: "desc" as const },
          include: { commenter: { select: buildCommenterSelect() } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.comment.count({
      where: {
        page: { siteId, ...(slug && { slug }) },
        ...(status && { status }),
        ...(searchFilter && searchFilter),
      },
    }),
  ])

  return { comments, total, page, limit }
}

export async function getApprovedCommentsForPage(
  siteId: string,
  slug: string,
  userEmail?: string,
  commenterId?: string
) {
  const page = await db.page.findUnique({
    where: { siteId_slug: { siteId, slug } },
  })
  if (!page) return []

  const select = buildCommentSelect(userEmail, commenterId)

  const [approvedRaw, pendingRaw] = await Promise.all([
    db.comment.findMany({
      where: {
        pageId: page.id,
        status: { in: [CommentStatus.APPROVED, CommentStatus.DELETED] },
        parentId: null,
      },
      select,
      orderBy: { createdAt: "desc" },
    }),
    commenterId
      ? db.comment.findMany({
          where: {
            pageId: page.id,
            status: CommentStatus.PENDING,
            parentId: null,
            commenterId,
          },
          select,
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ])

  const raw = [...approvedRaw, ...pendingRaw].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )

  // Collect commenterIds of deleted comments to check ban status
  const deletedCommenterIds = [
    ...new Set(
      raw
        .filter((c) => c.status === CommentStatus.DELETED)
        .map((c) => c.commenterId)
    ),
  ]

  const bannedRecords =
    deletedCommenterIds.length > 0
      ? await db.bannedCommenter.findMany({
          where: {
            siteId,
            commenterId: { in: deletedCommenterIds },
          },
          select: { commenterId: true },
        })
      : []
  const bannedSet = new Set(bannedRecords.map((b) => b.commenterId))

  return raw.map((c) => ({
    id: c.id,
    body: c.body,
    imageUrls: c.imageUrls ?? [],
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    likeCount: c._count.likes,
    hasLiked: userEmail ? c.likes.length > 0 : false,
    parentId: c.parentId,
    commenter: c.commenter,
    banned:
      c.status === CommentStatus.DELETED
        ? bannedSet.has(c.commenterId)
        : undefined,
    replies: c.replies.map((r) => ({
      id: r.id,
      body: r.body,
      imageUrls: r.imageUrls ?? [],
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      likeCount: r._count.likes,
      hasLiked: userEmail ? r.likes.length > 0 : false,
      parentId: r.parentId,
      commenter: r.commenter,
      banned:
        r.status === CommentStatus.DELETED
          ? bannedSet.has(r.commenterId)
          : undefined,
      replies: [],
    })),
  }))
}

export async function createComment(
  data: CreateCommentInput,
  commenterId: string,
  autoApprove: boolean
) {
  const sanitized = sanitizeBody(data.body)
  if (!sanitized) throw new ApiError("Comment body is empty", 400)

  const site = await db.site.findUniqueOrThrow({
    where: { siteKey: data.siteKey },
    select: {
      id: true,
      domain: true,
      mediaEnabled: true,
      mediaMaxImages: true,
      emailNotificationsEnabled: true,
      emailSubjectPrefix: true,
      emailLogoUrl: true,
      emailAccentColor: true,
      emailFooterText: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      owner: { select: { email: true } },
    },
  })

  const imageUrls = data.imageUrls ?? []
  if (imageUrls.length > 0) {
    if (!site.mediaEnabled)
      throw new ApiError("Image uploads are disabled on this site", 403)
    if (imageUrls.length > site.mediaMaxImages)
      throw new ApiError("Too many images", 400)
  }

  const page = await db.page.upsert({
    where: { siteId_slug: { siteId: site.id, slug: data.slug } },
    update: data.url ? { url: data.url } : {},
    create: { siteId: site.id, slug: data.slug, url: data.url },
    select: { id: true, slug: true, url: true },
  })

  const raw = await db.comment.create({
    data: {
      body: sanitized,
      imageUrls,
      pageId: page.id,
      parentId: data.parentId ?? null,
      commenterId,
      status: autoApprove ? "APPROVED" : "PENDING",
    },
    select: buildCommentSelect(),
  })

  const parent = data.parentId
    ? await db.comment.findUnique({
        where: { id: data.parentId },
        select: {
          id: true,
          body: true,
          commenterId: true,
          commenter: {
            select: {
              name: true,
              email: true,
              notificationsEnabled: true,
              notificationToken: true,
            },
          },
        },
      })
    : null

  const alreadyNotified = new Set<string>([raw.commenter.email])
  const pageInfo = { slug: page.slug, url: page.url ?? null }
  const replyInfo = { id: raw.id, body: raw.body }
  const replierInfo = { name: raw.commenter.name }

  // Suppress notifyNewComment when this reply goes directly to the owner
  // (they'll get notifyReply instead, avoiding a duplicate email)
  const isDirectReplyToOwner = parent?.commenter.email === site.owner.email

  if (!isDirectReplyToOwner) {
    const ownerCommenter = await db.commenter.findUnique({
      where: { email: site.owner.email },
      select: { notificationsEnabled: true },
    })
    if (ownerCommenter?.notificationsEnabled !== false) {
      await notifyNewComment(replyInfo, replierInfo, pageInfo, site, {
        email: site.owner.email,
      })
    }
  }

  if (parent && parent.commenterId !== commenterId) {
    alreadyNotified.add(parent.commenter.email)
    await notifyReply(
      replyInfo,
      replierInfo,
      { id: parent.id, body: parent.body },
      parent.commenter,
      pageInfo,
      site
    )
  }

  // When the widget collapses a nested reply, it sends the exact comment ID
  // that was clicked (replyToId) so we can notify its author with precise context.
  if (data.replyToId) {
    const replyToComment = await db.comment.findUnique({
      where: { id: data.replyToId },
      select: {
        id: true,
        body: true,
        commenter: {
          select: {
            name: true,
            email: true,
            notificationsEnabled: true,
            notificationToken: true,
          },
        },
      },
    })
    if (
      replyToComment &&
      !alreadyNotified.has(replyToComment.commenter.email)
    ) {
      alreadyNotified.add(replyToComment.commenter.email)
      await notifyReply(
        replyInfo,
        replierInfo,
        { id: replyToComment.id, body: replyToComment.body },
        replyToComment.commenter,
        pageInfo,
        site
      )
    }
  }

  // Notify any additional @mentioned commenters in this thread
  if (raw.parentId) {
    const mentionedUsernames = [...raw.body.matchAll(/@([a-z0-9]+)/g)].map(
      (m) => m[1]
    )
    if (mentionedUsernames.length > 0) {
      const mentionedComments = await db.comment.findMany({
        where: {
          parentId: raw.parentId,
          commenter: {
            username: { in: mentionedUsernames },
            email: { notIn: [...alreadyNotified] },
          },
        },
        select: {
          id: true,
          body: true,
          commenter: {
            select: {
              name: true,
              email: true,
              notificationsEnabled: true,
              notificationToken: true,
            },
          },
        },
        orderBy: { createdAt: "desc" as const },
        distinct: ["commenterId"],
      })
      for (const mentioned of mentionedComments) {
        await notifyReply(
          replyInfo,
          replierInfo,
          { id: mentioned.id, body: mentioned.body },
          mentioned.commenter,
          pageInfo,
          site
        )
      }
    }
  }

  return {
    id: raw.id,
    body: raw.body,
    imageUrls: raw.imageUrls ?? [],
    status: raw.status,
    createdAt: raw.createdAt.toISOString(),
    editedAt: raw.editedAt?.toISOString() ?? null,
    likeCount: 0,
    hasLiked: false,
    parentId: raw.parentId,
    commenter: raw.commenter,
    replies: [],
  }
}

export async function updateCommentBody(commentId: string, body: string) {
  const sanitized = sanitizeBody(body)
  if (!sanitized) throw new ApiError("Comment body is empty", 400)

  const raw = await db.comment.update({
    where: { id: commentId },
    data: { body: sanitized, editedAt: new Date() },
    select: buildCommentSelect(),
  })

  return {
    id: raw.id,
    body: raw.body,
    imageUrls: raw.imageUrls ?? [],
    status: raw.status,
    createdAt: raw.createdAt.toISOString(),
    editedAt: raw.editedAt?.toISOString() ?? null,
    likeCount: raw._count.likes,
    hasLiked: false,
    parentId: raw.parentId,
    commenter: raw.commenter,
    replies: [],
  }
}

export async function deleteComment(commentId: string) {
  const raw = await db.comment.update({
    where: { id: commentId },
    data: { status: "DELETED" },
    select: buildCommentSelect(),
  })

  return {
    id: raw.id,
    body: raw.body,
    imageUrls: raw.imageUrls ?? [],
    status: raw.status,
    createdAt: raw.createdAt.toISOString(),
    editedAt: raw.editedAt?.toISOString() ?? null,
    likeCount: raw._count.likes,
    hasLiked: false,
    parentId: raw.parentId,
    commenter: raw.commenter,
    replies: [],
  }
}

export async function updateCommentImages(
  commentId: string,
  imageUrls: string[]
) {
  const raw = await db.comment.update({
    where: { id: commentId },
    data: { imageUrls, editedAt: new Date() },
    select: buildCommentSelect(),
  })
  return {
    id: raw.id,
    body: raw.body,
    imageUrls: raw.imageUrls ?? [],
    status: raw.status,
    createdAt: raw.createdAt.toISOString(),
    editedAt: raw.editedAt?.toISOString() ?? null,
    likeCount: raw._count.likes,
    hasLiked: false,
    parentId: raw.parentId,
    commenter: raw.commenter,
    replies: [],
  }
}

export async function toggleCommentLike(commentId: string, userEmail: string) {
  const existing = await db.commentLike.findUnique({
    where: { commentId_userEmail: { commentId, userEmail } },
  })

  if (existing) {
    await db.commentLike.delete({ where: { id: existing.id } })
    const count = await db.commentLike.count({ where: { commentId } })
    return { liked: false, count }
  }

  await db.commentLike.create({ data: { commentId, userEmail } })
  const count = await db.commentLike.count({ where: { commentId } })

  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      body: true,
      likeNotifiedCount: true,
      commenter: {
        select: {
          email: true,
          name: true,
          notificationsEnabled: true,
          notificationToken: true,
        },
      },
      page: {
        select: {
          slug: true,
          url: true,
          site: {
            select: {
              id: true,
              domain: true,
              emailNotificationsEnabled: true,
              likeNotificationLimit: true,
              emailSubjectPrefix: true,
              emailLogoUrl: true,
              emailAccentColor: true,
              emailFooterText: true,
              smtpHost: true,
              smtpPort: true,
              smtpUser: true,
              smtpPass: true,
              smtpFrom: true,
            },
          },
        },
      },
    },
  })

  if (
    comment &&
    comment.commenter.email !== userEmail &&
    comment.page.site.likeNotificationLimit > 0 &&
    count > comment.likeNotifiedCount &&
    count <= comment.page.site.likeNotificationLimit
  ) {
    await Promise.all([
      notifyLike(
        { id: comment.id, body: comment.body },
        comment.commenter,
        { slug: comment.page.slug, url: comment.page.url ?? null },
        comment.page.site,
        count
      ),
      db.comment.update({
        where: { id: commentId },
        data: { likeNotifiedCount: count },
      }),
    ])
  }

  return { liked: true, count }
}
