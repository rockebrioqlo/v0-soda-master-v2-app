const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL)

;(async () => {
  const constraints = await sql`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = to_regclass('soda_master.configuracion')
  `
  const rows = await sql`
    SELECT clave, valor, tipo FROM soda_master.configuracion ORDER BY clave
  `
  console.log(JSON.stringify({ constraints, rows }, null, 2))
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
