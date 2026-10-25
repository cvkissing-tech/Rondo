import type { DesktopAPI } from '../shared/types'
declare global {
  interface Window {
    workbench: DesktopAPI | undefined
  }
}
