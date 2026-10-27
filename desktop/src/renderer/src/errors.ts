// Shared human-readable IPC/MCP errors for task and Agent settings surfaces.
export function errorText(error: unknown): string {
  const message = String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /, '')
  try {
    const detail = JSON.parse(message.slice(message.indexOf('{')))
    if (typeof detail.code === 'string' && typeof detail.message === 'string') return detail.message
  } catch {
    /* Non-tool errors retain their original message. */
  }
  return message
}
