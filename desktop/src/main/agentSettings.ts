// Local configuration only. No shell parsing, Agent launch, or account mutation.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const agentConfigPath = () =>
  process.env.RONDO_AGENTS_CONFIG || join(homedir(), '.rondo', 'agents.json')
const revision = (raw: string) => createHash('sha256').update(raw).digest('hex')
export function readAgentSettings(path = agentConfigPath()) {
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const data = raw ? JSON.parse(raw) : { agents: {} }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !data.agents ||
    typeof data.agents !== 'object' ||
    Array.isArray(data.agents)
  )
    throw Error('Agent 配置格式错误。请打开配置文件修复；原文件未被覆盖。')
  for (const [id, argv] of Object.entries(data.agents)) validate(id, argv)
  if (Object.keys(data.agents).length > 40) throw Error('最多配置 40 个自定义 Agent')
  return { path, revision: revision(raw), agents: data.agents as Record<string, string[]>, data }
}
function validate(id: unknown, argv: unknown): asserts argv is string[] {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id))
    throw Error('标识需为 1–40 位小写字母、数字、短横线或下划线，以字母或数字开头')
  if (
    !Array.isArray(argv) ||
    !argv.length ||
    argv.length > 24 ||
    !argv.every((v) => typeof v === 'string' && v.length < 4096 && !/[\0\r\n]/.test(v)) ||
    !argv[0].trim()
  )
    throw Error('请选择程序并逐项填写参数；最多 23 个参数，每项少于 4096 字符')
}
export function updateAgentSettings(
  input: { id: string; argv: string[] | null; revision: string },
  path = agentConfigPath()
) {
  if (!input || typeof input.revision !== 'string') throw Error('缺少配置版本，请刷新后重试')
  if (input.argv !== null) validate(input.id, input.argv)
  else validate(input.id, ['delete'])
  const current = readAgentSettings(path)
  if (input.revision !== current.revision)
    throw Error('配置已被其他窗口或程序更新。请读取最新配置后再保存。')
  if (input.argv === null) delete current.data.agents[input.id]
  else current.data.agents[input.id] = input.argv
  if (Object.keys(current.data.agents).length > 40) throw Error('最多配置 40 个自定义 Agent')
  mkdirSync(dirname(path), { recursive: true })
  const temp = path + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temp, JSON.stringify(current.data, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    renameSync(temp, path)
  } finally {
    if (existsSync(temp)) unlinkSync(temp)
  }
  const saved = readAgentSettings(path)
  return { path: saved.path, revision: saved.revision, agents: saved.agents }
}
