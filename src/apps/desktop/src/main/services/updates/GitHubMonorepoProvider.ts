import { URL } from 'node:url'

import {
  type CustomPublishOptions,
  HttpError,
  newError,
  parseXml,
  type UpdateInfo,
} from 'builder-util-runtime'
import {
  type AppUpdater,
  Provider,
  type ResolvedUpdateFileInfo,
} from 'electron-updater'
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider'
import yaml from 'js-yaml'
import semver from 'semver'

export interface GitHubMonorepoProviderOptions extends CustomPublishOptions {
  owner?: string
  repo?: string
  packageName?: string
}

export interface ReleaseTagInfo {
  rawTag: string
  decodedTag: string
  version: string
}

interface UpdateInfoWithTag extends UpdateInfo {
  tag?: string
}

/**
 * Official Custom Provider for electron-updater that natively understands
 * Changesets monorepo release tags: '@mr-tick/desktop@<version>' and
 * URL-encoded '%40mr-tick%2Fdesktop%40<version>', as well as standard 'v<version>'.
 */
export class GitHubMonorepoProvider extends Provider<UpdateInfo> {
  private readonly owner: string
  private readonly repo: string
  private readonly packageName: string
  private readonly baseUrl: URL
  private readonly basePath: string

  constructor(
    options: CustomPublishOptions,
    private readonly updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions,
  ) {
    super(runtimeOptions)
    const opts = options as GitHubMonorepoProviderOptions
    this.owner = opts.owner || 'Gustavohps10'
    this.repo = opts.repo || 'mr-tick'
    this.packageName = opts.packageName || '@mr-tick/desktop'
    this.baseUrl = new URL('https://github.com')
    this.basePath = `/${this.owner}/${this.repo}/releases`
  }

  /**
   * Parses a raw tag from the releases feed.
   * Accepts:
   *   - '@mr-tick/desktop@0.3.0-beta.3'
   *   - '%40mr-tick%2Fdesktop%400.3.0-beta.3'
   *   - 'v0.3.0-beta.3' or '0.3.0-beta.3'
   * Ignores tags for other monorepo packages (e.g. '@mr-tick/sdk@...').
   */
  public parseTag(rawTag: string): ReleaseTagInfo | null {
    const decoded = decodeURIComponent(rawTag)

    // Ignore tags belonging to other packages in the monorepo
    if (
      decoded.startsWith('@') &&
      !decoded.startsWith(`${this.packageName}@`)
    ) {
      return null
    }

    const prefix = `${this.packageName}@`
    let version = decoded
    if (decoded.startsWith(prefix)) {
      version = decoded.slice(prefix.length)
    } else if (decoded.startsWith('v')) {
      version = decoded.slice(1)
    }

    if (!semver.valid(version)) return null

    return {
      rawTag,
      decodedTag: decoded,
      version,
    }
  }

  public async getLatestVersion(): Promise<UpdateInfo> {
    const atomUrl = new URL(`${this.basePath}.atom`, this.baseUrl)
    const feedXml = await this.httpRequest(atomUrl, {
      accept: 'application/xml, application/atom+xml, text/xml, */*',
    })

    if (!feedXml) {
      throw newError(
        'Empty release feed from GitHub',
        'ERR_UPDATER_INVALID_RELEASE_FEED',
      )
    }

    const feed = parseXml(feedXml)
    let tag: string | null = null
    let targetVersion: string | null = null
    let latestElement = feed.element(
      'entry',
      false,
      'No published versions on GitHub',
    )
    const hrefRegExp = /\/tag\/(v?[^/]+)$/

    const currentVersion = this.updater.currentVersion
      ? this.updater.currentVersion.toString()
      : '0.0.0'
    const currentChannel =
      this.updater.channel || semver.prerelease(currentVersion)?.[0] || null

    if (this.updater.allowPrerelease) {
      for (const element of feed.getElements('entry')) {
        const link = element.element('link')?.attribute('href')
        if (!link) continue

        const hrefMatch = hrefRegExp.exec(link)
        if (!hrefMatch) continue

        const parsed = this.parseTag(hrefMatch[1])
        if (!parsed) continue

        const hrefChannel = semver.prerelease(parsed.version)?.[0] || null
        const shouldFetchVersion =
          !currentChannel || ['alpha', 'beta'].includes(String(currentChannel))
        const isCustomChannel =
          hrefChannel !== null &&
          !['alpha', 'beta'].includes(String(hrefChannel))
        const channelMismatch =
          currentChannel === 'beta' && hrefChannel === 'alpha'

        if (shouldFetchVersion && !isCustomChannel && !channelMismatch) {
          tag = parsed.rawTag
          targetVersion = parsed.version
          latestElement = element
          break
        }
        if (hrefChannel && hrefChannel === currentChannel) {
          tag = parsed.rawTag
          targetVersion = parsed.version
          latestElement = element
          break
        }
      }
    } else {
      // Stable channel: find newest release without prerelease component
      for (const element of feed.getElements('entry')) {
        const link = element.element('link')?.attribute('href')
        if (!link) continue

        const hrefMatch = hrefRegExp.exec(link)
        if (!hrefMatch) continue

        const parsed = this.parseTag(hrefMatch[1])
        if (!parsed) continue

        if (semver.prerelease(parsed.version) === null) {
          tag = parsed.rawTag
          targetVersion = parsed.version
          latestElement = element
          break
        }
      }
    }

    if (!tag || !targetVersion) {
      throw newError(
        'No published versions on GitHub',
        'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
      )
    }

    // Determine preferred channel file: beta.yml if target is prerelease, else latest.yml
    const tagPrerelease = semver.prerelease(targetVersion)?.[0]
    const preferredChannel =
      tagPrerelease && this.updater.allowPrerelease
        ? this.getCustomChannelName(String(tagPrerelease))
        : this.getDefaultChannelName()

    let rawData: string | null = null
    let usedChannelFile = `${preferredChannel}.yml`
    let manifestUrl = new URL(
      `${this.basePath}/download/${tag}/${usedChannelFile}`,
      this.baseUrl,
    )

    try {
      rawData = await this.httpRequest(manifestUrl, null)
    } catch (err: unknown) {
      if (err instanceof HttpError && err.statusCode === 404 && tagPrerelease) {
        // Fallback to latest.yml
        usedChannelFile = `${this.getDefaultChannelName()}.yml`
        manifestUrl = new URL(
          `${this.basePath}/download/${tag}/${usedChannelFile}`,
          this.baseUrl,
        )
        rawData = await this.httpRequest(manifestUrl, null)
      } else {
        throw err
      }
    }

    if (!rawData) {
      throw newError(
        `Empty manifest returned from ${manifestUrl.href}`,
        'ERR_UPDATER_INVALID_UPDATE_INFO',
      )
    }

    const parsedYaml = yaml.load(rawData) as UpdateInfoWithTag
    if (!parsedYaml || typeof parsedYaml !== 'object') {
      throw newError(
        `Cannot parse update info from ${manifestUrl.href}`,
        'ERR_UPDATER_INVALID_UPDATE_INFO',
      )
    }

    if (!parsedYaml.releaseName) {
      parsedYaml.releaseName = latestElement.elementValueOrEmpty('title')
    }

    const content = latestElement.elementValueOrEmpty('content')
    if (content && content !== 'No content.' && !parsedYaml.releaseNotes) {
      parsedYaml.releaseNotes = content
    }

    // Store release tag so resolveFiles knows exact download path
    parsedYaml.tag = tag

    return parsedYaml
  }

  public resolveFiles(updateInfo: UpdateInfoWithTag): ResolvedUpdateFileInfo[] {
    const tag =
      updateInfo.tag ||
      encodeURIComponent(`${this.packageName}@${updateInfo.version}`)
    const files =
      updateInfo.files && updateInfo.files.length > 0
        ? updateInfo.files
        : updateInfo.path
          ? [{ url: updateInfo.path, sha512: updateInfo.sha512 }]
          : []

    if (files.length === 0) {
      throw newError(
        'No files provided in update info',
        'ERR_UPDATER_NO_FILES_PROVIDED',
      )
    }

    return files.map((fileInfo) => {
      const fileName = fileInfo.url.replace(/ /g, '-')
      const fileUrl = new URL(
        `${this.basePath}/download/${tag}/${fileName}`,
        this.baseUrl,
      )
      return {
        url: fileUrl,
        info: fileInfo,
      }
    })
  }
}
