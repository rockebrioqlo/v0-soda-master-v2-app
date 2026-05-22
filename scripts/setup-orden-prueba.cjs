const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL)

;(async () => {
  const usuarios = await sql`SELECT id FROM soda_master.usuarios WHERE rol = 'admin' LIMIT 1`
  if (!usuarios[0]) {
    console.error('No hay usuario admin para crear la orden')
    process.exit(1)
  }
  const mesas = await sql`
    SELECT id, numero, estado FROM soda_master.mesas ORDER BY numero LIMIT 1
  `
  if (!mesas[0]) {
    console.error('No hay mesas')
    process.exit(1)
  }
  await sql`
    UPDATE soda_master.mesas SET estado = 'ocupada' WHERE id = ${mesas[0].id}
  `
  const orden = await sql`
    INSERT INTO soda_master.ordenes (mesa_id, usuario_id, estado, subtotal, impuesto, total)
    VALUES (${mesas[0].id}, ${usuarios[0].id}, 'listo', 5000, 0, 5000)
    RETURNING id, mesa_id, estado, total
  `
  console.log(JSON.stringify({ orden: orden[0], mesaId: mesas[0].id }, null, 2))
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
