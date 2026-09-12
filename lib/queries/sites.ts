import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api-client"
import type { Site } from "@/components/dashboard/site-settings-form/types"

export const siteKeys = {
  detail: (id: string) => ["sites", id] as const,
}

export function useSite(id: string, initialData: Site) {
  return useQuery({
    queryKey: siteKeys.detail(id),
    queryFn: () => apiFetch<Site>(`/api/v1/sites/${id}`),
    initialData,
  })
}

type CreateSiteInput = {
  name: string
  domain: string
  autoApprove: boolean
  allowedOrigins: string[]
}

export function useCreateSite() {
  return useMutation({
    mutationFn: (body: CreateSiteInput) =>
      apiFetch<Site>("/api/v1/sites", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  })
}

// Wire shape for PATCH /api/v1/sites/:id — mirrors UpdateSiteSchema. Differs
// from the `Site` response type for `allowedOrigins`: the API accepts/returns
// it as a JSON-stringified array, but the PATCH body must send a real array.
type UpdateSiteInput = Partial<Omit<Site, "allowedOrigins">> & {
  allowedOrigins?: string[]
  mediaApiKey?: string | null
}

export function useUpdateSite(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateSiteInput) =>
      apiFetch<Site>(`/api/v1/sites/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: siteKeys.detail(id) })
      const { allowedOrigins, ...rest } = body
      const previous = qc.getQueryData<Site>(siteKeys.detail(id))
      qc.setQueryData<Site>(siteKeys.detail(id), (old) =>
        old
          ? {
              ...old,
              ...rest,
              ...(allowedOrigins && {
                allowedOrigins: JSON.stringify(allowedOrigins),
              }),
            }
          : old
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(siteKeys.detail(id), ctx.previous)
    },
    onSuccess: (updated) => {
      qc.setQueryData(siteKeys.detail(id), updated)
    },
  })
}

export function useDeleteSite(id: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(`/api/v1/sites/${id}`, { method: "DELETE" }),
  })
}

// One-shot reveal of the stored media provider key (eye button). Disabled by
// default — call refetch() on demand. Never cached (secrets don't belong in
// the query cache); errors surfaced by the caller, not the global toast.
export function useSiteMediaKey(id: string) {
  return useQuery({
    queryKey: ["sites", id, "media-key"],
    queryFn: () =>
      apiFetch<{ apiKey: string | null }>(`/api/v1/sites/${id}/media-key`),
    enabled: false,
    staleTime: 0,
    gcTime: 0,
    meta: { silent: true },
  })
}

type LookupUser = { id: string; name: string | null; email: string }

export function useLookupUser() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<LookupUser>(
        `/api/v1/users/lookup?email=${encodeURIComponent(email)}`
      ),
    meta: { silent: true },
  })
}

export function useTransferSite(id: string) {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<Site>(`/api/v1/sites/${id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    meta: { silent: true },
  })
}
