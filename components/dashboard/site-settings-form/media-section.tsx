"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUpdateSite, useSiteMediaKey } from "@/lib/queries/sites"
import type { Site } from "./types"

type Props = {
  site: Site
}

export function MediaSection({ site }: Props) {
  const updateSite = useUpdateSite(site.id)
  const revealMediaKey = useSiteMediaKey(site.id)
  const [mediaEnabled, setMediaEnabled] = useState(site.mediaEnabled)
  const [mediaProvider, setMediaProvider] = useState(site.mediaProvider)
  const [mediaApiKey, setMediaApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [mediaMaxImages, setMediaMaxImages] = useState(
    String(site.mediaMaxImages)
  )
  const [mediaMaxBytesMB, setMediaMaxBytesMB] = useState(
    (site.mediaMaxBytes / 1048576).toFixed(1)
  )

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    updateSite.mutate(
      {
        mediaEnabled,
        mediaProvider,
        // Empty input leaves the saved key untouched; typing a value replaces
        // it. (There is intentionally no delete affordance — switching to a
        // keyless provider like Catbox simply ignores any stored key.)
        ...(mediaApiKey.trim() !== ""
          ? { mediaApiKey: mediaApiKey.trim() }
          : {}),
        mediaMaxImages: Math.max(
          1,
          Math.min(10, parseInt(mediaMaxImages, 10) || 4)
        ),
        mediaMaxBytes: Math.max(
          262144,
          Math.min(
            33554432,
            Math.round((parseFloat(mediaMaxBytesMB) || 5) * 1048576)
          )
        ),
      },
      {
        onSuccess: () => {
          toast.success("Media settings saved")
          setMediaApiKey("")
        },
      }
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Media uploads</CardTitle>
          {mediaProvider !== "CATBOX" &&
            (site.hasMediaApiKey ? (
              <Badge>Key saved</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">no key</span>
            ))}
        </div>
        <CardDescription>
          Let visitors attach images to comments. Images upload through your
          server to the host — the key never reaches visitors&apos; browsers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable image uploads</p>
              <p className="text-xs text-muted-foreground">
                Show the image picker in the comment widget
              </p>
            </div>
            <Switch
              checked={mediaEnabled}
              onCheckedChange={setMediaEnabled}
              aria-label="Enable image uploads"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="media-provider">Provider</Label>
            <Select
              value={mediaProvider}
              onValueChange={(v) => setMediaProvider(v as typeof mediaProvider)}
            >
              <SelectTrigger id="media-provider" className="w-44 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="IMGBB" className="rounded-md">
                  ImgBB
                </SelectItem>
                <SelectItem value="CATBOX" className="rounded-md">
                  Catbox
                </SelectItem>
              </SelectContent>
            </Select>
            {mediaProvider === "CATBOX" && (
              <p className="text-xs text-muted-foreground">
                Catbox needs no API key — nothing to configure here.
              </p>
            )}
          </div>

          {mediaProvider !== "CATBOX" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="media-api-key">API key</Label>
              <div className="relative">
                <Input
                  id="media-api-key"
                  type={showKey ? "text" : "password"}
                  placeholder={
                    site.hasMediaApiKey ? "•••••••• (saved)" : "Enter API key"
                  }
                  value={mediaApiKey}
                  onChange={(e) => setMediaApiKey(e.target.value)}
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={async () => {
                    // First reveal fetches the saved key once, then it behaves
                    // like typed text (editable, savable).
                    if (!showKey && mediaApiKey === "" && site.hasMediaApiKey) {
                      const result = await revealMediaKey.refetch()
                      if (result.error || !result.data?.apiKey) {
                        toast.error("Could not load saved key")
                        return
                      }
                      setMediaApiKey(result.data.apiKey)
                    }
                    setShowKey((v) => !v)
                  }}
                  disabled={revealMediaKey.isFetching}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="media-max-images">Max images (1–10)</Label>
              <Input
                id="media-max-images"
                name="mediaMaxImages"
                type="number"
                min={1}
                max={10}
                value={mediaMaxImages}
                onChange={(e) => setMediaMaxImages(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="media-max-bytes">Max size per image (MB)</Label>
              <Input
                id="media-max-bytes"
                name="mediaMaxBytesMB"
                type="number"
                min={0.25}
                max={32}
                step="any"
                value={mediaMaxBytesMB}
                onChange={(e) => setMediaMaxBytesMB(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Button type="submit" disabled={updateSite.isPending}>
              {updateSite.isPending ? "Saving…" : "Save media settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
