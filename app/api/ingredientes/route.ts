import { db } from '@/lib/db'

export async function GET() {
  try {
    const data = await db.getIngredientes(true)
    return Response.json(data)
  } catch (error) {
    console.error('GET ingredientes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const nombre = String(body?.nombre || '').trim()
    if (!nombre) {
      return Response.json({ error: 'nombre requerido' }, { status: 400 })
    }
    const row = await db.crearIngrediente({
      nombre,
      categoria: body.categoria ? String(body.categoria) : 'insumos',
      unidad_medida: body.unidad_medida ? String(body.unidad_medida) : 'unidad',
      stock_actual: Number(body.stock_actual) || 0,
      stock_minimo: Number(body.stock_minimo) || 0,
      costo_unitario: Number(body.costo_unitario) || 0,
      tipo: ['comida', 'negocio', 'otro'].includes(body.tipo) ? body.tipo : 'comida',
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST ingredientes error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
