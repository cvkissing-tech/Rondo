// AgentCard row layout adapted from AionUi at 11cd2a9a20d1e033157636efc570b41384c66d85.
// Copyright 2025 AionUi. SPDX-License-Identifier: Apache-2.0. See NOTICE.md.
import { Bot, ChevronRight } from 'lucide-react'
import type { AgentInfo } from '../../../../shared/types'
export function AgentRow({
  agent,
  selected,
  custom,
  onConfigure
}: {
  agent: AgentInfo
  selected: boolean
  custom: boolean
  onConfigure: () => void
}) {
  return (
    <button
      type="button"
      data-upstream="aionui/AgentCard"
      className="agent-list-row"
      aria-current={selected ? 'true' : undefined}
      onClick={onConfigure}
    >
      <Bot className="size-5 shrink-0" aria-hidden="true" />
      <span className="agent-row-copy">
        <strong>{agent.name}</strong>
        <span>
          {custom ? '自定义 · ' : ''}
          {agent.available ? '已找到程序' : '未找到程序'}
        </span>
      </span>
      <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
    </button>
  )
}
