import { db } from '@/lib/db'

// Accesos rápidos de la pantalla de login (solo nombre y email de usuarios
// activos). Solo rellenan el email: el PIN se escribe y pasa por el mismo
// /api/auth/login. Se apagan con ACCESOS_RAPIDOS=false, obligatorio antes
// de pasar a producción con el cliente (ROADMAP P1/P3).
export async function GET() {
  if (process.env.ACCESOS_RAPIDOS === 'false') {
    return Response.json([])
  }
  try {
    const usuarios = await db.getUsuarios()
    const lista = usuarios
      .filter((u) => u.activo !== false)
      .slice(0, 5)
      .map((u) => ({ nombre: u.nombre, email: u.email }))
    return Response.json(lista)
  } catch (error) {
    console.error('Get accesos-rapidos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
