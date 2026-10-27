import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAgentSettings, updateAgentSettings } from '../src/main/agentSettings.ts'
const folder = mkdtempSync(join(tmpdir(), 'rondo-settings-check-'))
const path = join(folder, 'agents.json')
const initial = readAgentSettings(path)
const argv = ['C:\\Program Files\\my agent.exe', '--acp', 'argument with spaces', '', '; echo ignored']
const saved = updateAgentSettings({ id: 'my-agent', argv, revision: initial.revision }, path)
assert.deepEqual(saved.agents['my-agent'], argv)
assert.throws(() => updateAgentSettings({ id: 'another', argv, revision: initial.revision }, path), /配置已被/)
writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), unrelated: { preserve: true } }))
let current = readAgentSettings(path)
assert.throws(() => updateAgentSettings({ id: '../bad', argv, revision: current.revision }, path))
assert.throws(() => updateAgentSettings({ id: 'bad', argv: ['program\nmalformed'], revision: current.revision }, path))
current = updateAgentSettings({ id: 'my-agent', argv: null, revision: current.revision }, path)
assert.equal(current.agents['my-agent'], undefined)
assert.deepEqual(readAgentSettings(path).data.unrelated, { preserve: true })
writeFileSync(path, '{invalid')
assert.throws(() => updateAgentSettings({ id: 'new', argv, revision: current.revision }, path))
assert.equal(readFileSync(path, 'utf8'), '{invalid')
console.log('Agent settings: argv preservation, stale edits, validation, removal, unknown fields and corrupt-file protection passed.')
