const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL)

;(async () => {
  console.log('Antes:')
  const before = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'soda_master' AND table_name = 'pagos'
    ORDER BY ordinal_position
  `
  console.log(JSON.stringify(before, null, 2))

  const ct = await sql`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = to_regclass('soda_master.pagos') AND conname = 'pagos_metodo_check'
  `
  console.log('Constraint actual:', JSON.stringify(ct, null, 2))

  await sql`ALTER TABLE soda_master.pagos ADD COLUMN IF NOT EXISTS descuento NUMERIC(10,2) DEFAULT 0`
  await sql`ALTER TABLE soda_master.pagos ADD COLUMN IF NOT EXISTS dividido_en INTEGER DEFAULT 1`

  const noValidos = await sql`
    SELECT id, metodo FROM soda_master.pagos
    WHERE metodo NOT IN ('efectivo', 'tarjeta')
  `
  if (noValidos.length > 0) {
    console.log('Normalizando metodos a "efectivo":', JSON.stringify(noValidos))
    await sql`
      UPDATE soda_master.pagos
      SET metodo = 'efectivo'
      WHERE metodo NOT IN ('efectivo', 'tarjeta')
    `
  } else {
    console.log('No hay pagos con metodos fuera de (efectivo, tarjeta).')
  }

  await sql`ALTER TABLE soda_master.pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check`
  await sql`
    ALTER TABLE soda_master.pagos
    ADD CONSTRAINT pagos_metodo_check
    CHECK (metodo IN ('efectivo', 'tarjeta'))
  `

  console.log('Despues:')
  const after = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'soda_master' AND table_name = 'pagos'
    ORDER BY ordinal_position
  `
  console.log(JSON.stringify(after, null, 2))
  const ct2 = await sql`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = to_regclass('soda_master.pagos') AND conname = 'pagos_metodo_check'
  `
  console.log('Constraint nuevo:', JSON.stringify(ct2, null, 2))
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
