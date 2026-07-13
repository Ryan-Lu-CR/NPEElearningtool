import { useEffect, useState } from 'react'
import { getAssetBlobs } from './assets'

interface Props { keys?: string[]; urls?: string[]; alt: string; className?: string }

export default function AssetGallery({ keys = [], urls = [], alt, className }: Props) {
  const [localUrls, setLocalUrls] = useState<string[]>([])
  const keySignature = keys.join('\u0000')

  useEffect(() => {
    let disposed = false
    let objectUrls: string[] = []
    getAssetBlobs(keys).then(blobs => {
      objectUrls = blobs.map(blob => URL.createObjectURL(blob))
      if (!disposed) setLocalUrls(objectUrls)
      else objectUrls.forEach(URL.revokeObjectURL)
    }).catch(() => { if (!disposed) setLocalUrls([]) })
    return () => { disposed = true; objectUrls.forEach(URL.revokeObjectURL) }
  }, [keySignature])

  const sources = [...urls.filter(Boolean), ...localUrls]
  if (!sources.length) return null
  return <div className={className || 'asset-gallery'}>{sources.map((source, index) => <img key={`${source}-${index}`} src={source} alt={`${alt}${sources.length > 1 ? ` ${index + 1}` : ''}`} loading="lazy"/>)}</div>
}
