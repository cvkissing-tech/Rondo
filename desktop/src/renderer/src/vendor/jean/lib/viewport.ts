// Adapted from coollabsio/jean cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3; see vendor/jean/NOTICE.md.
/** Viewport width below which Jean renders its mobile layout. */
export const MOBILE_BREAKPOINT = 768

/** Non-reactive mobile check for store actions and event handlers. */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
}
