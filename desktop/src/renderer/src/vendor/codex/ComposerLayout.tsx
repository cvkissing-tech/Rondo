// Recovered product CSS is verbatim; this React adapter replaces private editor
// and application state dependencies. It does not import the Codex application.
import type { ReactNode } from 'react'
import './composer.css'

export function ComposerLayout({
  children,
  leading,
  trailing,
  dark
}: {
  children: ReactNode
  leading: ReactNode
  trailing: ReactNode
  dark: boolean
}) {
  return (
    <div
      className="codex-composer _ComposerLayoutRoot_1q7o3_2"
      data-upstream="codex/ComposerLayout"
      data-theme={dark ? 'dark' : 'light'}
      data-composer-density="comfortable"
      data-composer-radius-variant="large"
      data-composer-surface-variant="opaque"
      data-composer-layout="multiline"
    >
      <div className="_ComposerLayoutBody_1q7o3_2" data-composer-layout="multiline">
        <div className="_ComposerLayoutAttachments_1q7o3_2" />
        <div
          className="_ComposerLayoutInput_1q7o3_2"
          data-composer-layout="multiline"
          data-composer-spacing="default"
        >
          {children}
        </div>
        <div
          className="_ComposerLayoutFooter_1q7o3_2"
          data-composer-layout="multiline"
          data-composer-spacing="default"
        >
          <div>{leading}</div>
          <div />
          <div className="flex min-w-0 justify-end">{trailing}</div>
        </div>
      </div>
    </div>
  )
}
