import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

export function useCanonicalUrl(canonicalUrl: string) {
  const router = useRouter()
  useEffect(() => {
    const location = router.history.location
    const currentUrl = `${location.pathname}${location.search}`
    if (currentUrl !== canonicalUrl) {
      router.history.replace(canonicalUrl)
    }
  }, [canonicalUrl, router])
}
