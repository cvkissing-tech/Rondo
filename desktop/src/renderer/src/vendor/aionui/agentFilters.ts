// Adapted from AionUi AgentSettings/agentFilters.ts, 11cd2a9a20d1e033157636efc570b41384c66d85.
// Copyright 2025 AionUi. SPDX-License-Identifier: Apache-2.0. See NOTICE.md.
import type { AgentInfo } from '../../../../shared/types'
export type AgentAvailabilityFilter = 'all' | 'available' | 'unavailable'
const isAgentAvailable = (agent: AgentInfo): boolean => agent.available
export const getAgentAvailabilityFilterStats = (agents: AgentInfo[]) => ({
  all: agents.length,
  available: agents.filter(isAgentAvailable).length,
  unavailable: agents.filter((agent) => !isAgentAvailable(agent)).length
})
export const filterAgentsByAvailability = (
  agents: AgentInfo[],
  filter: AgentAvailabilityFilter
) => {
  if (filter === 'available') return agents.filter(isAgentAvailable)
  if (filter === 'unavailable') return agents.filter((agent) => !isAgentAvailable(agent))
  return agents
}
