import { db } from '@/lib/db'
import { neon } from '@neondatabase/serverless'

export async function GET() {
  try {
    const inventario = await db.getInventarioCompleto()
    return Response.json(inventario)
  } catch (error) {
    console.error('Get inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { producto_id, stock_actual, stock_minimo } = await request.json()
    if (!producto_id) return Response.json({ error: 'producto_id requerido' }, { status: 400 })

    const sql = neon(process.env.DATABASE_URL!)
    const result = await sql`
      UPDATE soda_master.inventario
      SET stock_actual  = COALESCE(${stock_actual  ?? null}, stock_actual),
          stock_minimo  = COALESCE(${stock_minimo  ?? null}, stock_minimo),
          updated_at    = CURRENT_TIMESTAMP
      WHERE producto_id = ${producto_id}
      RETURNING *
    `
    return Response.json(result[0])
  } catch (error) {
    console.error('Update inventario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
