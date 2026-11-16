// 本番・確認用データベースの初期化：マイグレーションの適用と初期データの投入
// 実行例: DATABASE_URL="postgresql://..." SEED_MODE=demo npm run db:setup
// （SEED_MODE を省略すると clean：店舗・料金表・初期オーナーのみ）
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL を設定してください（Supabase の Transaction pooler の接続文字列）')
    process.exit(1)
  }
  const started = Date.now()
  const { getDb } = await import('../src/db/client')
  const t = await import('../src/db/schema')
  const { count } = await import('drizzle-orm')
  const db = await getDb() // 接続 → マイグレーション → 初期データ（未投入の場合のみ）
  const n = async (table: typeof t.members | typeof t.visits | typeof t.users | typeof t.stores) => (await db.select({ n: count() }).from(table))[0].n
  console.log(`完了（${((Date.now() - started) / 1000).toFixed(1)}秒）`)
  console.log(`店舗 ${await n(t.stores)}・アカウント ${await n(t.users)}・会員 ${await n(t.members)}・来店 ${await n(t.visits)}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('失敗しました：', e instanceof Error ? e.message : e)
  process.exit(1)
})
