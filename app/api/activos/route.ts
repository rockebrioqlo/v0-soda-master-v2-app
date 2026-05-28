import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const incluirBaja = searchParams.get('incluir_baja') === 'true'
    const data = await db.getActivos(!incluirBaja)
    return Response.json(data)
  } catch (error) {
    console.error('GET activos error:', error)
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
    const costo = Number(body.costo_compra)
    if (!Number.isFinite(costo) || costo < 0) {
      return Response.json({ error: 'costo_compra inválido' }, { status: 400 })
    }
    const vida = Number(body.vida_util_meses)
    if (!Number.isFinite(vida) || vida < 1) {
      return Response.json({ error: 'vida_util_meses inválido' }, { status: 400 })
    }
    const row = await db.crearActivo({
      nombre,
      categoria: body.categoria || 'maquinaria',
      descripcion: body.descripcion,
      fecha_compra: body.fecha_compra,
      costo_compra: costo,
      vida_util_meses: vida,
      valor_residual: Number(body.valor_residual) || 0,
      metodo_depreciacion: body.metodo_depreciacion || 'lineal',
      proveedor_id: body.proveedor_id || null,
      ubicacion: body.ubicacion,
      numero_serie: body.numero_serie,
      notas: body.notas,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST activos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
