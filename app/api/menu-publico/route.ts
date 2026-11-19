import { db } from '@/lib/db'

// Menú QR que ven los clientes sin login (app/menu). Solo lectura y solo
// los campos que muestra la carta: no expone costos, stock exacto ni la
// configuración completa. Las rutas /api/productos y /api/configuracion
// siguen exigiendo sesión.
export async function GET() {
  try {
    const [productos, config] = await Promise.all([db.getProductos(), db.getConfiguracion()])
    const visibles = (productos as any[])
      .filter((p) => p.activo !== false && !(typeof p.stock === 'number' && p.stock <= 0))
      .map((p) => ({
        id: String(p.id),
        nombre: String(p.nombre ?? ''),
        descripcion: p.descripcion ?? null,
        precio: Number(p.precio) || 0,
        categoria: p.categoria ?? null,
      }))
    return Response.json({
      nombre_negocio: typeof config?.nombre_negocio === 'string' ? config.nombre_negocio : null,
      productos: visibles,
    })
  } catch (error) {
    console.error('Get menu-publico error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
