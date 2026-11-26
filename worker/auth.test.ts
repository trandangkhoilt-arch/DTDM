import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import app from './index'

it('switches between accounts without invalidating a session on another device', async () => {
  const sql = new DatabaseSync(':memory:')
  try {
    sql.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
    type Value = string | number | null
    const prepare = (query: string) => {
      const stmt = sql.prepare(query)
      const bind = (...values: Value[]) => ({
        first: async () => stmt.get(...values) ?? null,
        run: async () => stmt.run(...values),
      })
      return { ...bind(), bind }
    }
    const db = {
      prepare,
      batch: async (statements: ReturnType<ReturnType<typeof prepare>['bind']>[]) => {
        sql.exec('BEGIN')
        try {
          const results = await Promise.all(statements.map((stmt) => stmt.run()))
          sql.exec('COMMIT')
          return results
        } catch (err) {
          sql.exec('ROLLBACK')
          throw err
        }
      },
    }
    const auth = (action: string, cookie?: string, body?: object) => {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (cookie) headers.set('Cookie', cookie)
      return app.fetch(new Request(`https://taskflow.test/api/auth/${action}`, {
        headers,
        method: action === 'me' ? 'GET' : 'POST',
        body: body ? JSON.stringify(body) : undefined,
      }), { DB: db } as never)
    }
    const cookie = (res: Response) => res.headers.get('Set-Cookie')?.split(';')[0]
    const a = { email: 'first@example.test', password: 'first-password' }
    const b = { email: 'second@example.test', password: 'second-password' }
    const first = await auth('register', undefined, { ...a, name: 'First' })
    const second = await auth('register', undefined, { ...b, name: 'Second' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(cookie(first)).toBeTruthy()
    expect(cookie(second)).toBeTruthy()

    const rejected = await auth('login', cookie(first), { ...b, password: 'wrong-password' })
    expect(rejected.status).toBe(401)
    expect((await auth('me', cookie(first))).status).toBe(200)

    const switched = await auth('login', cookie(first), b)
    expect(switched.status).toBe(200)
    const active = await auth('me', cookie(switched))
    expect(active.headers.get('Cache-Control')).toBe('no-store')
    expect(await active.json()).toMatchObject({ user: { email: b.email } })
    expect((await auth('me', cookie(first))).status).toBe(401)

    const switchedBack = await auth('login', cookie(switched), a)
    expect(switchedBack.status).toBe(200)
    expect(await (await auth('me', cookie(switchedBack))).json()).toMatchObject({ user: { email: a.email } })
    expect((await auth('logout', cookie(switchedBack))).status).toBe(200)
    expect((await auth('me', cookie(switchedBack))).status).toBe(401)
    expect(await (await auth('me', cookie(second))).json()).toMatchObject({ user: { email: b.email } })
  } finally {
    sql.close()
  }
})
