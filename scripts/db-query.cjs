const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL)

const [table, id] = process.argv.slice(2)

;(async () => {
  let rows
  if (table === 'usuarios') {
    rows = await sql`
      SELECT id, nombre, email, rol, activo, length(pin_hash) AS hash_len
      FROM soda_master.usuarios
      WHERE id = ${id}
    `
  } else if (table === 'mesas') {
    rows = await sql`
      SELECT id, numero, area, capacidad, estado
      FROM soda_master.mesas
      WHERE id = ${id}
    `
  } else if (table === 'ordenes') {
    rows = await sql`
      SELECT id, mesa_id, estado, total
      FROM soda_master.ordenes
      WHERE id = ${id}
    `
  } else if (table === 'pagos') {
    rows = await sql`
      SELECT id, orden_id, metodo, monto, propina, created_at
      FROM soda_master.pagos
      WHERE id = ${id}
    `
  } else if (table === 'configuracion') {
    rows = await sql`
      SELECT clave, valor, tipo
      FROM soda_master.configuracion
      ORDER BY clave
    `
  } else {
    console.error('Tabla no soportada')
    process.exit(2)
  }
  console.log(JSON.stringify(rows, null, 2))
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
