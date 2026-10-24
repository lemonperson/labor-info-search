import type { SourceClassification, SourceRegistry, SourceType } from '../../shared/types'

function hostnameOf(value: string): string | undefined {
  try {
    const candidate = (value.includes('://') ? new URL(value).hostname : value.trim().toLowerCase().replace(/\.$/, '')).replace(/^www\./, '')
    return candidate && !candidate.includes('/') ? candidate : undefined
  } catch { return undefined }
}

/** Classify solely from the enabled, explicit source registry and host metadata. */
export function classifySource(url: string, publisher: string, registry: SourceRegistry): SourceClassification {
  const urlHost = hostnameOf(url)
  const publisherHost = hostnameOf(publisher)
  const hosts = [urlHost, publisherHost].filter((host): host is string => Boolean(host))
  const entries = registry.sources.filter(({ enabled }) => enabled).map((entry) => ({
    entry, host: hostnameOf(entry.homepageUrl)
  })).filter((candidate): candidate is { entry: SourceRegistry['sources'][number]; host: string } => Boolean(candidate.host))
  const matches = entries.filter(({ host }) => hosts.some((candidate) => candidate === host || candidate.endsWith(`.${host}`)))
    .sort((a, b) => b.host.length - a.host.length || a.entry.id.localeCompare(b.entry.id))
  const matched = matches[0]
  if (matched) return { sourceType: matched.entry.sourceType, claimStatus: 'unverified', registryId: matched.entry.id }

  // Government classification is a hostname rule, activated only when the registry
  // explicitly enables a government source. Courts above win through the longer match.
  const governmentEnabled = entries.some(({ entry, host }) => entry.sourceType === 'government' && host.endsWith('.gov.cn'))
  if (governmentEnabled && hosts.some((host) => host.endsWith('.gov.cn'))) {
    const entry = entries.find(({ entry, host }) => entry.sourceType === 'government' && host.endsWith('.gov.cn'))!.entry
    return { sourceType: 'government', claimStatus: 'unverified', registryId: entry.id }
  }
  const sourceType: SourceType = 'other'
  return { sourceType, claimStatus: 'unverified' }
}
