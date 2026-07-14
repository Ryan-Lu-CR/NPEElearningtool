import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAssetBlobs, getAssetRevision, subscribeAssetChanges } from './assets'

interface Props { keys?: string[]; urls?: string[]; alt: string; className?: string; trackExportLoading?: boolean }

export default function AssetGallery({ keys = [], urls = [], alt, className, trackExportLoading = false }: Props) {
  const [localUrls, setLocalUrls] = useState<string[]>([])
  const [loadState, setLoadState] = useState<{ signature: string; status: 'loading' | 'ready' | 'error' }>(() => ({ signature: keys.join('\u0000'), status: keys.length ? 'loading' : 'ready' }))
  const keySignature = keys.join('\u0000')
  const assetRevision = useSyncExternalStore(subscribeAssetChanges, getAssetRevision, getAssetRevision)

  useEffect(() => {
    let disposed = false
    let objectUrls: string[] = []
    setLoadState({ signature: keySignature, status: keys.length ? 'loading' : 'ready' })
    getAssetBlobs(keys).then(blobs => {
      objectUrls = blobs.map(blob => URL.createObjectURL(blob))
      const hasMissingAssets = blobs.length < keys.length && !urls.some(Boolean)
      if (!disposed) { setLocalUrls(objectUrls); setLoadState({ signature: keySignature, status: hasMissingAssets ? 'error' : 'ready' }) }
      else objectUrls.forEach(URL.revokeObjectURL)
    }).catch(() => { if (!disposed) { setLocalUrls([]); setLoadState({ signature: keySignature, status: 'error' }) } })
    return () => { disposed = true; objectUrls.forEach(URL.revokeObjectURL) }
  }, [keySignature, assetRevision])

  const sources = [...urls.filter(Boolean), ...localUrls]
  const exportState = loadState.signature === keySignature ? loadState.status : keys.length ? 'loading' : 'ready'
  if (!sources.length && !trackExportLoading) return null
  return <div className={className || 'asset-gallery'} data-export-asset-state={trackExportLoading ? exportState : undefined}>{sources.map((source, index) => <img key={`${source}-${index}`} src={source} alt={`${alt}${sources.length > 1 ? ` ${index + 1}` : ''}`} loading={trackExportLoading ? 'eager' : 'lazy'}/>)}</div>
}
