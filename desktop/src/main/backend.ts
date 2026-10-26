import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export class Backend {
  private client?: Client
  private connecting?: Promise<Client>
  private closing = false
  private count = 0
  constructor(
    readonly root: string,
    readonly database: string
  ) {}
  private connect(): Promise<Client> {
    if (this.closing) return Promise.reject(new Error('工作台正在关闭'))
    if (this.client) return Promise.resolve(this.client)
    return (this.connecting ??= this.open().finally(() => {
      this.connecting = undefined
    }))
  }
  private async open(): Promise<Client> {
    const python =
      process.env.ARL_PYTHON ??
      join(this.root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    if (!existsSync(python))
      throw new Error('未找到 Python 环境，请先按 README 安装后端，或设置 ARL_PYTHON。')
    const args = ['-X', 'utf8', '-m', 'agent_review_loop', 'serve', '--db', this.database]
    for (const [env, flag] of [
      ['ARL_TASK_ROOT', '--task-root'],
      ['ARL_REVIEW_ROOT', '--review-root'],
      ['ARL_CODEX_EXECUTABLE', '--codex-executable'],
      ['ARL_CHECK_CONFIG', '--check-config']
    ]) {
      if (process.env[env]) args.push(flag, process.env[env]!)
    }
    const transport = new StdioClientTransport({
      command: python,
      args,
      cwd: this.root,
      stderr: 'pipe'
    })
    transport.stderr?.on('data', () => {
      /* Drain diagnostics; stdout belongs to MCP. */
    })
    const client = new Client({ name: 'agent-review-loop-desktop', version: '0.8.1' })
    client.onclose = () => {
      if (this.client === client) this.client = undefined
    }
    try {
      await client.connect(transport)
      const catalog = await client.listTools()
      if (!catalog.tools.some((tool) => tool.name === 'get_task_changes'))
        throw new Error('请更新后端至 0.8.1')
      this.count = catalog.tools.length
      this.client = client
      return client
    } catch (error) {
      await client.close().catch(() => {})
      throw error
    }
  }
  async status() {
    try {
      await this.connect()
      return { connected: true, tools: this.count, database: this.database }
    } catch (error) {
      return { connected: false, tools: 0, database: this.database, error: String(error) }
    }
  }
  async call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const client = await this.connect()
    const result = await client.callTool({ name, arguments: args })
    if (result.isError)
      throw new Error(
        result.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n')
      )
    if (!result.structuredContent) throw new Error('后端未返回结构化结果')
    return result.structuredContent as T
  }
  async close() {
    this.closing = true
    await this.connecting?.catch(() => {})
    await this.client?.close()
    this.client = undefined
  }
}
