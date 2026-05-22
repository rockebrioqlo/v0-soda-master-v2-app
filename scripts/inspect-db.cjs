const { neon } = require('@neondatabase/serverless')

const sql = neon(process.env.DATABASE_URL)

const TABLES = [
  'usuarios',
  'mesas',
  'ordenes',
  'items_orden',
  'pagos',
  'configuracion',
  'inventario',
]

;(async () => {
  const out = {}
  for (const t of TABLES) {
    const cols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'soda_master' AND table_name = ${t}
      ORDER BY ordinal_position
    `
    out[t] = cols
  }

  const constraintRows = await sql`
    SELECT conname, conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid IN (
      to_regclass('soda_master.ordenes'),
      to_regclass('soda_master.mesas'),
      to_regclass('soda_master.pagos'),
      to_regclass('soda_master.usuarios'),
      to_regclass('soda_master.configuracion')
    )
    AND contype = 'c'
  `

  console.log(JSON.stringify({ tables: out, constraints: constraintRows }, null, 2))
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
