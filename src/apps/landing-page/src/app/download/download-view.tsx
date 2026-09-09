'use client'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@mr-tick/ui/components'
import { cn } from '@mr-tick/ui/lib'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronsUpDown,
  Clock,
  Copy,
  Download,
  FileText,
  FolderArchive,
  GitCommit,
  GitPullRequest,
  HardDrive,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'
import { FaApple, FaLinux, FaWindows } from 'react-icons/fa'

import type { DesktopReleaseInfo } from '../../lib/github-release'
import { Footer } from '../components/footer'
import { Navbar } from '../components/navbar'

interface DownloadViewProps {
  releases: DesktopReleaseInfo[]
  defaultVersion?: string
}

export function DownloadView({ releases, defaultVersion }: DownloadViewProps) {
  const [selectedVersion, setSelectedVersion] = React.useState<string>(() => {
    if (defaultVersion && releases.some((r) => r.version === defaultVersion)) {
      return defaultVersion
    }
    const latest = releases.find((r) => r.isLatest)
    return latest?.version ?? releases[0]?.version ?? ''
  })

  const release = React.useMemo(() => {
    return (
      releases.find((r) => r.version === selectedVersion) ?? releases[0] ?? null
    )
  }, [releases, selectedVersion])

  const betaReleases = React.useMemo(
    () => releases.filter((r) => r.isBeta),
    [releases],
  )
  const stableReleases = React.useMemo(
    () => releases.filter((r) => !r.isBeta),
    [releases],
  )

  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirmInstallerOpen, setConfirmInstallerOpen] = React.useState(false)
  const [confirmPortableOpen, setConfirmPortableOpen] = React.useState(false)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const installerSha = release?.installer?.sha256
  const portableSha = release?.portable?.sha256

  return (
    <div className="bg-background text-foreground selection:bg-foreground selection:text-background flex min-h-screen flex-col font-mono">
      <Navbar />

      <main className="flex-1 pt-28 pb-24">
        {/* Header Hero Area */}
        <div className="container mx-auto px-6 text-center lg:px-8">
          <div className="border-border/80 bg-muted/50 text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-medium shadow-xs backdrop-blur-md transition-colors">
            <Sparkles
              className={`size-3 ${release?.isBeta ? 'text-amber-400' : 'text-emerald-500'}`}
            />
            <span>
              {release?.version
                ? `${release.isBeta ? 'Beta Release' : 'Latest Release'} · ${release.version}`
                : 'Latest Desktop Release'}
            </span>
          </div>

          <h1 className="text-foreground text-4xl font-normal tracking-tight sm:text-5xl md:text-6xl">
            Download
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
            Download the official desktop application or follow upcoming
            self-hosted deployment updates.
          </p>
        </div>

        <div className="container mx-auto mt-12 max-w-6xl px-6 lg:px-8">
          {/* Section Header: | Latest Builds */}
          <div className="mb-6 flex items-center gap-2.5">
            <div className="bg-primary h-6 w-1 rounded-full" />
            <h2 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
              Latest Builds
            </h2>
          </div>

          {/* 1. Latest Build Banner (Neutral RPCS3 Style) */}
          <div className="border-border/80 bg-card/80 relative mb-10 overflow-hidden rounded-xl border p-6 shadow-xl backdrop-blur-md sm:p-8">
            <div className="from-foreground/5 pointer-events-none absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l to-transparent" />

            <div className="flex flex-col gap-5">
              {/* Top: App Icon + Build Title + Release Date */}
              <div className="flex items-start gap-4 sm:items-center sm:gap-5">
                <div className="border-border/80 bg-muted/60 flex size-14 shrink-0 items-center justify-center rounded-lg border shadow-inner">
                  <Image
                    src="/logo-icon.svg"
                    alt="Mr. Tick Icon"
                    width={32}
                    height={38}
                    className="h-8 w-auto object-contain dark:invert"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-foreground text-lg font-semibold sm:text-xl">
                      Build
                    </h3>

                    {releases.length > 0 ? (
                      <Popover open={open} onOpenChange={setOpen} modal={false}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            role="combobox"
                            aria-expanded={open}
                            className="border-border/80 bg-muted/40 hover:bg-muted/70 focus-visible:ring-ring flex h-7.5 w-auto min-w-[150px] cursor-pointer items-center justify-between gap-2.5 rounded-md border px-2.5 py-1 font-mono text-xs font-medium shadow-xs transition-colors outline-none focus-visible:ring-2"
                          >
                            <div className="flex items-center gap-2">
                              <span>
                                {release?.version ?? 'Select version'}
                              </span>
                              {release?.isBeta && (
                                <span className="py-0.2 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 text-[9px] font-semibold text-amber-400">
                                  Beta
                                </span>
                              )}
                              {release?.isLatest && (
                                <span className="py-0.2 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 text-[9px] font-semibold text-emerald-400">
                                  Latest
                                </span>
                              )}
                            </div>
                            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[210px] p-0 font-mono"
                        >
                          <Command>
                            <CommandList>
                              <CommandEmpty>No version found.</CommandEmpty>
                              {betaReleases.length > 0 && (
                                <CommandGroup heading="Pre-releases / Beta">
                                  {betaReleases.map((r) => (
                                    <CommandItem
                                      key={r.version}
                                      value={r.version}
                                      onSelect={() => {
                                        setSelectedVersion(r.version)
                                        setOpen(false)
                                      }}
                                      className="flex cursor-pointer items-center justify-between text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Check
                                          className={cn(
                                            'size-3.5',
                                            selectedVersion === r.version
                                              ? 'opacity-100'
                                              : 'opacity-0',
                                          )}
                                        />
                                        <span>{r.version}</span>
                                      </div>
                                      <span className="py-0.2 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 text-[9px] font-semibold text-amber-400">
                                        Beta
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}

                              {stableReleases.length > 0 && (
                                <CommandGroup heading="Stable">
                                  {stableReleases.map((r) => (
                                    <CommandItem
                                      key={r.version}
                                      value={r.version}
                                      onSelect={() => {
                                        setSelectedVersion(r.version)
                                        setOpen(false)
                                      }}
                                      className="flex cursor-pointer items-center justify-between text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Check
                                          className={cn(
                                            'size-3.5',
                                            selectedVersion === r.version
                                              ? 'opacity-100'
                                              : 'opacity-0',
                                          )}
                                        />
                                        <span>{r.version}</span>
                                      </div>
                                      {r.isLatest && (
                                        <span className="py-0.2 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 text-[9px] font-semibold text-emerald-400">
                                          Latest
                                        </span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-foreground text-lg font-semibold sm:text-xl">
                        {release?.version ?? ''}
                      </span>
                    )}
                  </div>
                  {release?.formattedDate && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      This build was released on {release.formattedDate}
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom Row: Todo o resto na extrema esquerda do Release Notes */}
              <div className="border-border/60 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Extrema esquerda: Pull Request, Commit, Submitted by */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Pull Request Pill */}
                  {release?.pr?.number && (
                    <a
                      href={
                        release.pr.url ||
                        `https://github.com/Gustavohps10/mr-tick/pull/${release.pr.number}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="border-border/80 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-colors"
                    >
                      <GitPullRequest className="size-3.5" />
                      <span>Pull Request</span>
                      <span className="border-border/70 bg-background/80 text-foreground rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                        #{release.pr.number}
                      </span>
                    </a>
                  )}

                  {/* Commit Pill */}
                  {release?.commit && (
                    <a
                      href={release.commit.url}
                      target="_blank"
                      rel="noreferrer"
                      className="border-border/80 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-colors"
                    >
                      <GitCommit className="size-3.5" />
                      <span>Commit</span>
                      <span className="border-border/80 bg-background/90 text-foreground rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-2xs">
                        {release.commit.shortSha}
                      </span>
                    </a>
                  )}

                  {/* Submitted by Pill */}
                  {release?.commit?.author && (
                    <a
                      href={release.commit.author.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="border-border/80 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-colors"
                      title={`Commit author: ${release.commit.author.name}`}
                    >
                      <Image
                        src={release.commit.author.avatarUrl}
                        alt={release.commit.author.login}
                        width={18}
                        height={18}
                        className="ring-border/50 size-4.5 rounded-full object-cover ring-1"
                        unoptimized
                      />
                      <span>
                        Submitted by{' '}
                        <strong className="text-foreground font-semibold">
                          @{release.commit.author.login}
                        </strong>
                      </span>
                    </a>
                  )}
                </div>

                {/* Extrema direita: Release Notes */}
                {release?.releaseUrl && (
                  <div className="shrink-0">
                    <a
                      href={release.releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="border-border/80 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-colors"
                    >
                      <FileText className="size-3.5" />
                      <span>Release Notes</span>
                      <ArrowUpRight className="size-3 opacity-60" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Platform OS Matrix (Windows, Linux, macOS) */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* WINDOWS CARD (ACTIVE) */}
            <div className="border-border bg-card relative flex flex-col justify-between overflow-hidden rounded-xl border p-6 shadow-xl transition-all">
              <div className="pointer-events-none absolute top-0 right-0 h-28 w-28 bg-gradient-to-bl from-blue-500/10 to-transparent" />

              <div>
                {/* Header: OS Icon + Title + Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FaWindows className="size-6 text-blue-400" />
                    <h3 className="text-foreground text-lg font-semibold">
                      Windows
                    </h3>
                  </div>
                  <span className="border-border/80 bg-muted text-foreground inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold">
                    64-bit
                  </span>
                </div>

                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  For a wide range of hardware setups on both laptops and
                  desktops with support for Windows 10 and 11.
                </p>

                {/* SHA-256 Section */}
                {(installerSha || portableSha) && (
                  <div className="mt-5">
                    <h4 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                      SHA-256
                    </h4>

                    <div className="mt-2 space-y-2">
                      {/* Row 1: x64 Setup */}
                      {installerSha && (
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                            x64
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(installerSha, 'win-setup')
                            }
                            className="border-border/70 bg-muted/40 hover:bg-muted/70 hover:border-border text-muted-foreground hover:text-foreground group flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border px-2.5 py-1 text-left font-mono text-[10px] transition-colors"
                            title="Click to copy SHA-256"
                          >
                            <span className="truncate">{installerSha}</span>
                            {copiedId === 'win-setup' ? (
                              <Check className="size-3 shrink-0 text-emerald-400" />
                            ) : (
                              <Copy className="size-3 shrink-0 opacity-40 group-hover:opacity-100" />
                            )}
                          </button>
                        </div>
                      )}

                      {/* Row 2: Portable zip */}
                      {portableSha && (
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                            zip
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(portableSha, 'win-zip')
                            }
                            className="border-border/70 bg-muted/40 hover:bg-muted/70 hover:border-border text-muted-foreground hover:text-foreground group flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border px-2.5 py-1 text-left font-mono text-[10px] transition-colors"
                            title="Click to copy SHA-256"
                          >
                            <span className="truncate">{portableSha}</span>
                            {copiedId === 'win-zip' ? (
                              <Check className="size-3 shrink-0 text-emerald-400" />
                            ) : (
                              <Copy className="size-3 shrink-0 opacity-40 group-hover:opacity-100" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Download Packages Section */}
              <div className="mt-6">
                <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                  Download Packages
                </h4>

                <div className="flex flex-col gap-2">
                  {/* Button 1: Download for x64 */}
                  {release?.installer &&
                    (release.isBeta ? (
                      <Popover
                        open={confirmInstallerOpen}
                        onOpenChange={setConfirmInstallerOpen}
                        modal={false}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="border-border text-foreground group flex w-full cursor-pointer items-center justify-between rounded-lg border bg-amber-500/10 p-2.5 shadow-xs transition-all hover:border-amber-500/50 hover:bg-amber-500/15"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500 text-[10px] font-bold text-black">
                                x64
                              </span>
                              <div className="flex flex-col text-left">
                                <span className="text-xs font-semibold">
                                  Download for x64 ({release.version})
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {release.installer.sizeFormatted}
                                </span>
                              </div>
                            </div>
                            <Download className="size-4 text-amber-500 transition-colors group-hover:text-amber-400" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="center"
                          className="w-[320px] p-4 font-mono"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2.5">
                              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/15 text-amber-500">
                                <AlertTriangle className="size-4" />
                              </div>
                              <div>
                                <h5 className="text-foreground text-xs font-semibold">
                                  Versão Beta Experimental
                                </h5>
                                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                                  Você está realizando o download de uma versão
                                  Beta (
                                  <span className="font-semibold text-amber-400">
                                    {release.version}
                                  </span>
                                  ). Por se tratar de um pré-lançamento em teste
                                  ativo, ela pode conter instabilidades ou
                                  comportamentos inesperados.
                                </p>
                              </div>
                            </div>
                            <div className="border-border/60 flex items-center justify-end gap-2 border-t pt-2">
                              <button
                                type="button"
                                onClick={() => setConfirmInstallerOpen(false)}
                                className="border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer rounded border px-2.5 py-1 text-[11px] font-medium transition-colors"
                              >
                                Cancelar
                              </button>
                              <a
                                href={release.installer.downloadUrl}
                                download
                                onClick={() => setConfirmInstallerOpen(false)}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-amber-500 px-3 py-1 text-[11px] font-semibold text-black shadow-xs transition-colors hover:bg-amber-400"
                              >
                                <Download className="size-3" />
                                <span>Prosseguir</span>
                              </a>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <a
                        href={release.installer.downloadUrl}
                        download
                        className="border-border hover:border-primary/50 bg-primary/10 hover:bg-primary/15 text-foreground group flex cursor-pointer items-center justify-between rounded-lg border p-2.5 shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold">
                            x64
                          </span>
                          <div className="flex flex-col text-left">
                            <span className="text-xs font-semibold">
                              Download for x64 ({release.version})
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                              {release.installer.sizeFormatted}
                            </span>
                          </div>
                        </div>
                        <Download className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
                      </a>
                    ))}

                  {/* Button 2: Download Portable .zip */}
                  {release?.portable &&
                    (release.isBeta ? (
                      <Popover
                        open={confirmPortableOpen}
                        onOpenChange={setConfirmPortableOpen}
                        modal={false}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="border-border/80 bg-muted/30 hover:bg-muted/60 text-foreground group flex w-full cursor-pointer items-center justify-between rounded-lg border p-2.5 shadow-xs transition-all hover:border-amber-500/40"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="border-border bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold">
                                zip
                              </span>
                              <div className="flex flex-col text-left">
                                <span className="text-xs font-semibold">
                                  Download Portable ({release.version})
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {release.portable.sizeFormatted}
                                </span>
                              </div>
                            </div>
                            <FolderArchive className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="center"
                          className="w-[320px] p-4 font-mono"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2.5">
                              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/15 text-amber-500">
                                <AlertTriangle className="size-4" />
                              </div>
                              <div>
                                <h5 className="text-foreground text-xs font-semibold">
                                  Versão Beta Experimental
                                </h5>
                                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                                  Você está realizando o download de uma versão
                                  Beta (
                                  <span className="font-semibold text-amber-400">
                                    {release.version}
                                  </span>
                                  ). Por se tratar de um pré-lançamento em teste
                                  ativo, ela pode conter instabilidades ou
                                  comportamentos inesperados.
                                </p>
                              </div>
                            </div>
                            <div className="border-border/60 flex items-center justify-end gap-2 border-t pt-2">
                              <button
                                type="button"
                                onClick={() => setConfirmPortableOpen(false)}
                                className="border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer rounded border px-2.5 py-1 text-[11px] font-medium transition-colors"
                              >
                                Cancelar
                              </button>
                              <a
                                href={release.portable.downloadUrl}
                                download
                                onClick={() => setConfirmPortableOpen(false)}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-amber-500 px-3 py-1 text-[11px] font-semibold text-black shadow-xs transition-colors hover:bg-amber-400"
                              >
                                <FolderArchive className="size-3" />
                                <span>Prosseguir</span>
                              </a>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <a
                        href={release.portable.downloadUrl}
                        download
                        className="border-border hover:border-border/80 bg-muted/30 hover:bg-muted/60 text-foreground group flex cursor-pointer items-center justify-between rounded-lg border p-2.5 shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="border-border bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold">
                            zip
                          </span>
                          <div className="flex flex-col text-left">
                            <span className="text-xs font-semibold">
                              Download Portable ({release.version})
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                              {release.portable.sizeFormatted}
                            </span>
                          </div>
                        </div>
                        <FolderArchive className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
                      </a>
                    ))}
                </div>
              </div>
            </div>

            {/* LINUX CARD (Coming Soon) */}
            <div className="border-border bg-card/60 relative flex flex-col justify-between overflow-hidden rounded-xl border p-6 shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FaLinux className="size-6 text-[#fcc624]" />
                    <h3 className="text-foreground text-lg font-semibold">
                      Linux
                    </h3>
                  </div>
                  <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    Coming Soon
                  </span>
                </div>

                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  For a wide range of hardware setups on both laptops and
                  desktops with support for most common distros.
                </p>

                {/* SHA-256 Section */}
                <div className="mt-5">
                  <h4 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    SHA-256
                  </h4>

                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold">
                        x64
                      </span>
                      <div className="border-border/50 bg-muted/20 text-muted-foreground/60 flex min-w-0 flex-1 items-center justify-between rounded-md border px-2.5 py-1 font-mono text-[10px]">
                        <span className="truncate">
                          Build pipeline in progress...
                        </span>
                        <Clock className="size-3 shrink-0 text-amber-400" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold">
                        arm
                      </span>
                      <div className="border-border/50 bg-muted/20 text-muted-foreground/60 flex min-w-0 flex-1 items-center justify-between rounded-md border px-2.5 py-1 font-mono text-[10px]">
                        <span className="truncate">
                          Build pipeline in progress...
                        </span>
                        <Clock className="size-3 shrink-0 text-amber-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Download Packages Section */}
              <div className="mt-6">
                <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                  Download Packages
                </h4>

                <div className="flex flex-col gap-2">
                  <div className="border-border/60 bg-muted/20 text-muted-foreground/60 flex cursor-not-allowed items-center justify-between rounded-lg border p-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="border-border bg-muted/40 text-muted-foreground/60 flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold">
                        x64
                      </span>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-semibold">
                          Download for x64
                        </span>
                        <span className="text-[10px]">AppImage</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px]">Coming Soon</span>
                  </div>

                  <div className="border-border/60 bg-muted/20 text-muted-foreground/60 flex cursor-not-allowed items-center justify-between rounded-lg border p-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="border-border bg-muted/40 text-muted-foreground/60 flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold">
                        arm
                      </span>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-semibold">
                          Download for arm64
                        </span>
                        <span className="text-[10px]">Flatpak</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px]">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>

            {/* MACOS CARD (Coming Soon) */}
            <div className="border-border bg-card/60 relative flex flex-col justify-between overflow-hidden rounded-xl border p-6 shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FaApple className="text-foreground size-6" />
                    <h3 className="text-foreground text-lg font-semibold">
                      macOS
                    </h3>
                  </div>
                  <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    Coming Soon
                  </span>
                </div>

                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  For Apple Silicon or Intel hardware with native support on
                  macOS 13 or later.
                </p>

                {/* SHA-256 Section */}
                <div className="mt-5">
                  <h4 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    SHA-256
                  </h4>

                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold">
                        arm
                      </span>
                      <div className="border-border/50 bg-muted/20 text-muted-foreground/60 flex min-w-0 flex-1 items-center justify-between rounded-md border px-2.5 py-1 font-mono text-[10px]">
                        <span className="truncate">
                          Notarization in progress...
                        </span>
                        <Clock className="size-3 shrink-0 text-amber-400" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold">
                        x64
                      </span>
                      <div className="border-border/50 bg-muted/20 text-muted-foreground/60 flex min-w-0 flex-1 items-center justify-between rounded-md border px-2.5 py-1 font-mono text-[10px]">
                        <span className="truncate">
                          Notarization in progress...
                        </span>
                        <Clock className="size-3 shrink-0 text-amber-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Download Packages Section */}
              <div className="mt-6">
                <h4 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                  Download Packages
                </h4>

                <div className="flex flex-col gap-2">
                  <div className="border-border/60 bg-muted/20 text-muted-foreground/60 flex cursor-not-allowed items-center justify-between rounded-lg border p-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="border-border bg-muted/40 text-muted-foreground/60 flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold">
                        arm
                      </span>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-semibold">
                          Download for arm64
                        </span>
                        <span className="text-[10px]">Apple Silicon .dmg</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px]">Coming Soon</span>
                  </div>

                  <div className="border-border/60 bg-muted/20 text-muted-foreground/60 flex cursor-not-allowed items-center justify-between rounded-lg border p-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="border-border bg-muted/40 text-muted-foreground/60 flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold">
                        x64
                      </span>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-semibold">
                          Download for x64
                        </span>
                        <span className="text-[10px]">Intel .dmg</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px]">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Self-Hosted & Backend Section */}
          <div className="border-border bg-card mt-14 overflow-hidden rounded-xl border p-6 shadow-xl sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="text-primary inline-flex items-center gap-1.5">
                    <Server className="size-4" />
                    Self-Hosted & Enterprise
                  </span>
                  <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    Coming Soon
                  </span>
                </div>
                <h2 className="text-foreground mt-2 text-xl font-normal tracking-tight sm:text-2xl">
                  Self-Hosted Sync Server
                </h2>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed sm:text-sm">
                  Run your own private replication backend for RxDB and
                  encrypted multi-device telemetry synchronization without
                  relying on third-party cloud servers.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  <span className="border-border bg-muted/50 text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px]">
                    <ShieldCheck className="size-3.5 text-emerald-400" />
                    Zero Cloud Dependency
                  </span>
                  <span className="border-border bg-muted/50 text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px]">
                    <HardDrive className="size-3.5 text-blue-400" />
                    SQLite & PostgreSQL Support
                  </span>
                </div>
              </div>

              <Link
                href="/docs/sync-engine"
                className="border-border hover:bg-muted text-foreground inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-4 text-xs font-medium transition-colors"
              >
                <Terminal className="size-3.5" />
                <span>View Server Docs</span>
                <ArrowUpRight className="size-3 opacity-60" />
              </Link>
            </div>

            {/* Self-Hosted Coming Soon Banner */}
            <div className="border-border/70 bg-muted/20 mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <div className="border-border bg-muted/60 mb-3 flex size-10 items-center justify-center rounded-full border">
                <Clock className="size-5 text-amber-400" />
              </div>
              <h3 className="text-foreground text-sm font-semibold">
                Deployment Packages Coming Soon
              </h3>
              <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
                Production Docker images, Compose templates, and automated
                deployment scripts for self-hosting the synchronization server
                will be published in an upcoming release.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
