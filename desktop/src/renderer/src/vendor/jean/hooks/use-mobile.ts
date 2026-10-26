// Adapted from coollabsio/jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3; see vendor/jean/NOTICE.md.
import * as React from 'react'
import { MOBILE_BREAKPOINT, isMobileViewport } from '@jean/lib/viewport'

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(isMobileViewport)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(isMobileViewport())
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
