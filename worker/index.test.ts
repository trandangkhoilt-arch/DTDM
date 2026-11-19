import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from './index'

type BoundStatement = { sql: string; values: unknown[] }

class FakeD1 {
  owner: string
  batches: BoundStatement[][] = []
  reads: BoundStatement[] = []

  constructor(owner = 'user-a') {
    this.owner = owner
  }

  prepare(sql: string) {
    const statement: BoundStatement = { sql, values: [] }
    return {
      bind: (...values: unknown[]) => {
        statement.values = values
        return {
          first: async () => this.first(statement),
          all: async () => this.all(statement),
          run: async () => ({ meta: { changes: 0 } }),
          statement,
        }
      },
      run: async () => ({ meta: { changes: 0 } }),
      statement,
    }
  }

  async first({ sql, values }: BoundStatement) {
    this.reads.push({ sql, values })
    if (sql.includes('FROM sessions')) return { user_id: this.owner }
    if (sql.includes('FROM categories WHERE id=?')) {
      return values[1] === 'user-a' ? { id: values[0] } : null
    }
    if (sql.includes('FROM tasks WHERE id=? AND user_id=?')) {
      return values[1] === 'user-a'
        ? { id: values[0], user_id: 'user-a', title: 'Ôn thi Toán', description: null, status: 'TODO', priority: 'MEDIUM', due_at: null, category_id: null, completed_at: null }
        : null
    }
    return null
  }

  async all({ sql, values }: BoundStatement) {
    this.reads.push({ sql, values })
    if (sql.includes('FROM tasks') && values[0] === 'user-a') {
      return { results: [{ id: 'task-a', title: 'Ôn thi Toán', description: 'Ôn đại số', status: 'TODO', priority: 'HIGH', due_at: null, category_id: null }] }
    }
    if (sql.includes('FROM categories')) return { results: [{ id: 'category-a', name: 'Học tập', color: '#6366F1' }] }
    return { results: [] }
  }

  async batch(statements: Array<{ statement?: BoundStatement }>) {
    this.batches.push(statements.map((item) => item.statement ?? { sql: '', values: [] }))
    return []
  }
}

function request(path: string, db: FakeD1, options: { body?: unknown; authenticated?: boolean; ai?: unknown } = {}) {
  const headers = new Headers()
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.authenticated) headers.set('Cookie', 'taskflow_session=test-session')
  return app.fetch(
    new Request(`https://taskflow.test${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    { DB: db, AI: options.ai } as never,
    {} as never,
  )
}

describe('TaskFlow AI Worker routes', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('requires an authenticated session for assistant chat', async () => {
    const response = await request('/api/assistant/chat', new FakeD1(), { body: { message: 'Tóm tắt việc của tôi' } })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Chưa đăng nhập' })
  })

  it('reads only the signed-in user tasks and returns a proposal without writing', async () => {
    const db = new FakeD1()
    let ollamaRequest: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      ollamaRequest = JSON.parse(String(init?.body))
      return Response.json({
        message: {
          content: '',
          tool_calls: [{
            function: {
              name: 'propose_create_task',
              arguments: { title: 'Ôn thi Toán', description: 'Ôn tập', priority: 'HIGH', due_at: null, category_name: 'Học tập', subtasks: ['Ôn đại số'] },
            },
          }],
        },
      })
    }))

    const response = await request('/api/assistant/chat', db, {
      authenticated: true,
      body: { message: 'Tạo việc ôn thi Toán' },
    })
    const result = await response.json() as { actions: Array<{ type: string; category_id: string; subtasks: string[] }> }

    expect(response.status).toBe(200)
    expect(result.actions).toEqual([expect.objectContaining({ type: 'create_task', category_id: 'category-a', subtasks: ['Ôn đại số'] })])
    expect(db.reads.some(({ sql, values }) => sql.includes('FROM tasks') && values[0] === 'user-a')).toBe(true)
    expect(db.batches).toHaveLength(0)
    expect(ollamaRequest?.model).toBe('qwen2.5:3b')
  })

  it('uses Workers AI structured JSON to prepare task proposals', async () => {
    const db = new FakeD1()
    let modelName = ''
    let maxTokens: number | undefined
    const ai = {
      run: vi.fn(async (model: string, input: { tools?: unknown[]; max_tokens?: number }) => {
        modelName = model
        maxTokens = input.max_tokens
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                reply: 'Mình đã chuẩn bị đề xuất.',
                actions: [{
                  type: 'create_task',
                  title: 'Tạo từ Workers AI',
                  description: 'Đề xuất',
                  priority: 'MEDIUM',
                  due_at: '',
                  category_name: '',
                  subtasks: ['Bước một', 'Bước hai', 'Bước ba', 'Bước bốn', 'Bước năm', 'Bước sáu', 'Bước bảy'],
                }],
              }),
            },
          }],
        }
      }),
    }

    const response = await request('/api/assistant/chat', db, {
      authenticated: true,
      ai,
      body: { message: 'Tạo task mới' },
    })
    const result = await response.json() as { actions: Array<{ title: string }>; provider: string; model: string }

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      provider: 'workers-ai',
      model: '@cf/openai/gpt-oss-20b',
      actions: [expect.objectContaining({ title: 'Tạo từ Workers AI' })],
    })
    expect(modelName).toBe('@cf/openai/gpt-oss-20b')
    expect(ai.run.mock.calls[0][1].tools).toBeUndefined()
    expect(maxTokens).toBe(2048)
    expect(result.actions[0].subtasks).toHaveLength(7)
    expect(db.batches).toHaveLength(0)
  })

  it('returns an explicit error instead of a success-shaped blank model response', async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: '' } }] })),
    }
    const response = await request('/api/assistant/chat', new FakeD1(), {
      authenticated: true,
      ai,
      body: { message: 'Tôi nên bắt đầu từ đâu?' },
    })
    const result = await response.json() as { error: string }

    expect(response.status).toBe(502)
    expect(result.error).toContain('AI chưa tạo được nội dung trả lời')
  })

  it('does not clear task fields when an update proposal uses empty strings for unchanged values', async () => {
    const ai = {
      run: vi.fn(async () => ({
        response: JSON.stringify({
          reply: 'Đã chuẩn bị đề xuất sửa.',
          actions: [{ type: 'update_task', task_id: 'task-a', priority: 'HIGH', due_at: '', category_name: '' }],
        }),
      })),
    }
    const response = await request('/api/assistant/chat', new FakeD1(), {
      authenticated: true,
      ai,
      body: { message: 'Cập nhật ưu tiên công việc ôn thi' },
    })
    const result = await response.json() as { actions: Array<Record<string, unknown>> }

    expect(response.status).toBe(200)
    expect(result.actions).toEqual([
      expect.objectContaining({ type: 'update_task', task_id: 'task-a', priority: 'HIGH' }),
    ])
    expect(result.actions[0]).not.toHaveProperty('due_at')
    expect(result.actions[0]).not.toHaveProperty('category_id')
  })

  it('rejects applying an AI proposal unless the user confirms', async () => {
    const db = new FakeD1()
    const response = await request('/api/assistant/actions', db, {
      authenticated: true,
      body: { actions: [{ type: 'create_task', title: 'Task', priority: 'HIGH', subtasks: [] }] },
    })
    expect(response.status).toBe(400)
    expect(db.batches).toHaveLength(0)
  })

  it('persists a confirmed proposal through a D1 batch', async () => {
    const db = new FakeD1()
    const response = await request('/api/assistant/actions', db, {
      authenticated: true,
      body: { confirmed: true, actions: [{ type: 'create_task', title: 'Task được xác nhận', priority: 'HIGH', due_at: null, category_id: 'category-a', subtasks: ['Bước một'] }] },
    })
    const result = await response.json() as { ok: boolean; saved: Array<{ title: string }> }
    expect(response.status).toBe(200)
    expect(result).toEqual({ ok: true, saved: [expect.objectContaining({ title: 'Task được xác nhận' })] })
    expect(db.batches).toHaveLength(1)
    expect(db.batches[0]).toHaveLength(2)
  })

  it('prevents a different account from applying an update to another user task', async () => {
    const db = new FakeD1('user-b')
    const response = await request('/api/assistant/actions', db, {
      authenticated: true,
      body: { confirmed: true, actions: [{ type: 'update_task', task_id: 'task-a', priority: 'LOW', subtasks: [] }] },
    })
    expect(response.status).toBe(404)
    expect(db.batches).toHaveLength(0)
  })
})
