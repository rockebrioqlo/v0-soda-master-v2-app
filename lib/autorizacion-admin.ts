/**
 * Autorización firmada de administrador (sesión 3 del ROADMAP).
 *
 * Cuando una acción necesita el visto bueno del admin en el dispositivo
 * de otra persona (descuento sobre el límite, cortesía de comanda no
 * pagada), el admin escribe su PIN y /api/auth/verificar-pin entrega un
 * token firmado que dura 5 minutos. Las rutas exigen ese token y ya no
 * aceptan un `autorizado_por` con el id del admin (cualquiera podía
 * mandar ese id).
 */
import { db } from '@/lib/db'
import { firmar, firmaValida } from '@/lib/sesion'
import { rolesEfectivos } from '@/lib/permisos-api'

const PROPOSITO = 'autorizacion-admin'
export const DURACION_AUTORIZACION_SEG = 5 * 60

export function emitirAutorizacionAdmin(adminId: string): { token: string; expira: string } {
  const exp = Date.now() + DURACION_AUTORIZACION_SEG * 1000
  const payload = Buffer.from(JSON.stringify({ a: adminId, exp })).toString('base64url')
  return { token: `${payload}.${firmar(PROPOSITO, payload)}`, expira: new Date(exp).toISOString() }
}

/**
 * Valida firma y vencimiento, y que el admin siga activo y siendo admin.
 * Devuelve el admin o null.
 */
export async function verificarAutorizacionAdmin(
  token: unknown,
): Promise<{ id: string; nombre: string } | null> {
  if (typeof token !== 'string' || token.length > 512) return null
  const punto = token.lastIndexOf('.')
  if (punto <= 0) return null
  const payload = token.slice(0, punto)
  const firma = token.slice(punto + 1)
  if (!firmaValida(PROPOSITO, payload, firma)) return null
  let datos: { a?: unknown; exp?: unknown }
  try {
    datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof datos.a !== 'string' || typeof datos.exp !== 'number' || datos.exp < Date.now()) {
    return null
  }
  const admin = await db.getUsuarioById(datos.a)
  if (!admin || admin.activo === false) return null
  if (!rolesEfectivos(admin.rol, admin.roles_adicionales).includes('admin')) return null
  return { id: admin.id, nombre: admin.nombre }
}
