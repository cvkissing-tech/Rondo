import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { Component, type ReactNode } from 'react'
class DiffBoundary extends Component<{ patch: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <>
        <p className="hint">代码视图无法解析此改动，显示原始差异。</p>
        <pre>{this.props.patch}</pre>
      </>
    ) : (
      this.props.children
    )
  }
}
export default function PatchView({
  patch,
  theme = 'github-light'
}: {
  patch: string
  theme?: string
}) {
  return (
    <DiffBoundary key={patch} patch={patch}>
      <Files patch={patch} theme={theme} />
    </DiffBoundary>
  )
}
function Files({ patch, theme }: { patch: string; theme: string }) {
  const files = parsePatchFiles(patch, undefined, true).flatMap((group) => group.files)
  if (!files.length) return <pre>{patch}</pre>
  return (
    <>
      {files.map((file, index) => (
        <FileDiff key={index} fileDiff={file} options={{ theme, diffStyle: 'unified' }} />
      ))}
    </>
  )
}
