import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import * as schema from './schema'

export type DB = PgliteDatabase<typeof schema>
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

interface Conn {
  db: DB
  /** 複数ステートメントの SQL をそのまま実行（マイグレーション用） */
  exec: (sqlText: string) => Promise<void>
}

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'migrations')

async function connect(): Promise<Conn> {
  const url = process.env.DATABASE_URL
  if (url) {
    // 本番：PostgreSQL（Supabase 東京リージョンなど）
    const { default: postgres } = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const client = postgres(url, { prepare: false, max: 5 })
    return { db: drizzle(client, { schema }) as unknown as DB, exec: async (s) => void (await client.unsafe(s)) }
  }
  // 開発：組み込み PostgreSQL（PGlite）。データは ./.data/pglite に保存
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite')
  fs.mkdirSync(dir, { recursive: true })
  const client = new PGlite(dir)
  return { db: drizzle(client, { schema }), exec: async (s) => void (await client.exec(s)) }
}

async function migrate(conn: Conn) {
  await conn.exec('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())')
  // PGlite は { rows }、postgres-js は配列を返すため両方に対応
  const res = (await conn.db.execute(sql`select name from _migrations`)) as unknown as { rows?: { name: string }[] } | { name: string }[]
  const done = new Set((Array.isArray(res) ? res : (res.rows ?? [])).map((r) => r.name))
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) continue
    await conn.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    await conn.db.execute(sql`insert into _migrations (name) values (${f})`)
  }
}

async function init(): Promise<DB> {
  const conn = await connect()
  await migrate(conn)
  const { ensureSeed } = await import('./seed')
  await ensureSeed(conn.db)
  return conn.db
}

const g = globalThis as unknown as { __harnesDb?: Promise<DB> }

/** アプリ全体で 1 つの接続（開発サーバーのホットリロードでも使い回す） */
export function getDb(): Promise<DB> {
  if (!g.__harnesDb) g.__harnesDb = init().catch((e) => {
    g.__harnesDb = undefined
    throw e
  })
  return g.__harnesDb
}

export interface RlsContext {
  role: 'owner' | 'staff'
  storeId: string | null
  userId: string
}

/**
 * データベース側の権限制御を有効にしてクエリを実行する。
 * トランザクション内で app_user ロールに切り替え、スタッフは所属店舗の行しか扱えない（Row Level Security）。
 */
export async function withRls<T>(ctx: RlsContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb()
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.role', ${ctx.role}, true), set_config('app.store_id', ${ctx.storeId ?? ''}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    )
    await tx.execute(sql`set local role app_user`)
    return fn(tx)
  })
}
