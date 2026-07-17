import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAssetBlobs, getAssetRevision, subscribeAssetChanges } from './assets'

interface Props { keys?: string[]; urls?: string[]; alt: string; className?: string; trackExportLoading?: boolean; eager?: boolean }

// Default-workspace files are served with long-lived immutable caching. Keep a
// small explicit version on direct image URLs so regenerated crops cannot be
// hidden behind an older browser-cached image with the same path.
const DEFAULT_WORKSPACE_ASSET_VERSION = '20260716-2'

function versionDefaultWorkspaceUrl(source: string) {
  if (!source.includes('/api/default-workspace/file?') || source.includes('assetVersion=')) return source
  return `${source}${source.includes('?') ? '&' : '?'}assetVersion=${DEFAULT_WORKSPACE_ASSET_VERSION}`
}

export default function AssetGallery({ keys = [], urls = [], alt, className, trackExportLoading = false, eager = false }: Props) {
  const [localUrls, setLocalUrls] = useState<string[]>([])
  const keySignature = keys.join('\u0000')
  const urlSignature = urls.join('\u0000')
  const assetSignature = `${keySignature}\u0001${urlSignature}`
  const [loadState, setLoadState] = useState<{ signature: string; status: 'loading' | 'ready' | 'error' }>(() => ({ signature: assetSignature, status: keys.length ? 'loading' : 'ready' }))
  const assetRevision = useSyncExternalStore(subscribeAssetChanges, getAssetRevision, getAssetRevision)

  useEffect(() => {
    let disposed = false
    let objectUrls: string[] = []
    // Drop the previous blob immediately when either keys or direct URLs
    // change; otherwise a long analysis image can remain visible after the
    // user navigates to another question.
    setLocalUrls([])
    setLoadState({ signature: assetSignature, status: keys.length ? 'loading' : 'ready' })
    getAssetBlobs(keys).then(blobs => {
      objectUrls = blobs.map(blob => URL.createObjectURL(blob))
      const hasMissingAssets = blobs.length < keys.length && !urls.some(Boolean)
      if (!disposed) { setLocalUrls(objectUrls); setLoadState({ signature: assetSignature, status: hasMissingAssets ? 'error' : 'ready' }) }
      else objectUrls.forEach(URL.revokeObjectURL)
    }).catch(() => { if (!disposed) { setLocalUrls([]); setLoadState({ signature: assetSignature, status: 'error' }) } })
    return () => { disposed = true; objectUrls.forEach(URL.revokeObjectURL) }
  }, [assetSignature, assetRevision])

  const sources = [...urls.filter(Boolean).map(versionDefaultWorkspaceUrl), ...(loadState.signature === assetSignature ? localUrls : [])]
  const exportState = loadState.signature === assetSignature ? loadState.status : keys.length ? 'loading' : 'ready'
  if (!sources.length && !trackExportLoading) return null
  return <div className={className || 'asset-gallery'} data-export-asset-state={trackExportLoading ? exportState : undefined}>{sources.map((source, index) => <img key={`${source}-${index}`} src={source} alt={`${alt}${sources.length > 1 ? ` ${index + 1}` : ''}`} loading={trackExportLoading || eager ? 'eager' : 'lazy'}/>)}</div>
}
