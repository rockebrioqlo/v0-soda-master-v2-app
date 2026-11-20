import { manejarPatchOrden } from '@/lib/ordenes-patch'

// Misma lógica y mismas restricciones que PATCH /api/ordenes (sesión 6):
// el id de la URL manda; el body no puede traer otro.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return manejarPatchOrden(request, (body) => ({ ...body, id }))
}
