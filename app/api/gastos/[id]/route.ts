import { db } from '@/lib/db'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await db.eliminarGasto(id)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('DELETE gasto error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
