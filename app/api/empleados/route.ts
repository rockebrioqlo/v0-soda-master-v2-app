import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const incluirInactivos = searchParams.get('incluir_inactivos') === 'true'
    const data = await db.getEmpleados(!incluirInactivos)
    return Response.json(data)
  } catch (error) {
    console.error('GET empleados error:', error)
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
    const sueldo = Number(body.sueldo_base)
    if (!Number.isFinite(sueldo) || sueldo < 0) {
      return Response.json({ error: 'sueldo_base inválido' }, { status: 400 })
    }
    const row = await db.crearEmpleado({
      nombre,
      cargo: body.cargo,
      documento: body.documento,
      telefono: body.telefono,
      email: body.email,
      sueldo_base: sueldo,
      periodicidad: body.periodicidad || 'mensual',
      fecha_ingreso: body.fecha_ingreso,
      usuario_id: body.usuario_id || null,
      notas: body.notas,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST empleados error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
