import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde') || undefined
    const hasta = searchParams.get('hasta') || undefined
    const tipo = searchParams.get('tipo') || undefined
    const limite = searchParams.get('limite') ? Number(searchParams.get('limite')) : undefined
    if (searchParams.get('resumen') === 'true') {
      const resumen = await db.getResumenGastos({ desde, hasta })
      return Response.json(resumen)
    }
    const data = await db.getGastos({ desde, hasta, tipo, limite })
    return Response.json(data)
  } catch (error) {
    console.error('GET gastos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const monto = Number(body.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      return Response.json({ error: 'monto inválido' }, { status: 400 })
    }
    const row = await db.crearGasto({
      fecha: body.fecha,
      categoria: body.categoria || 'otros',
      descripcion: body.descripcion,
      monto,
      tipo: body.tipo || 'operativo',
      recurrente: !!body.recurrente,
      periodicidad: body.periodicidad,
      proveedor_id: body.proveedor_id || null,
      empleado_id: body.empleado_id || null,
      activo_id: body.activo_id || null,
      usuario_id: body.usuario_id || null,
      notas: body.notas,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST gastos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
