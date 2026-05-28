import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const incluirInactivos = searchParams.get('incluir_inactivos') === 'true'
    const data = await db.getProveedores(!incluirInactivos)
    return Response.json(data)
  } catch (error) {
    console.error('GET proveedores error:', error)
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
    const row = await db.crearProveedor({
      nombre,
      rut: body.rut ? String(body.rut) : undefined,
      contacto: body.contacto ? String(body.contacto) : undefined,
      telefono: body.telefono ? String(body.telefono) : undefined,
      email: body.email ? String(body.email) : undefined,
      direccion: body.direccion ? String(body.direccion) : undefined,
      notas: body.notas ? String(body.notas) : undefined,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST proveedores error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
