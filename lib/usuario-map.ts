/**
 * Lo que la API devuelve de un usuario (C11, sesiones 14.5a y 14.5b-2). Módulo puro, sin acceso a la
 * base, para poder probarlo solo (`scripts/pruebas/usuarios.cjs` lo importa con el type stripping de Node).
 *
 * LISTA BLANCA: el objeto sale con exactamente estos campos. Una columna nueva en la tabla (hash,
 * token, dato personal) o un `SELECT *` no sacan nada hacia afuera por defecto; hay que agregarla aquí
 * a propósito. Todo lo que lee el cliente está: id, nombre, email, rol, roles_adicionales, activo y
 * el estado de bloqueo por PIN; `created_at` y `updated_at` no los lee ninguna pantalla pero van en
 * todos los SELECT y no son sensibles.
 */
import type { Usuario } from './types'

export const ROLES_VALIDOS = new Set(['admin', 'administrador', 'mesero', 'cocina', 'bar', 'cajero'])

/** Los campos que puede tener un usuario hacia afuera (los usa también la prueba). */
export const CAMPOS_USUARIO_PUBLICO = [
  'id',
  'email',
  'nombre',
  'rol',
  'roles_adicionales',
  'activo',
  'created_at',
  'updated_at',
  'intentosFallidos',
  'bloqueadoHasta',
] as const

export function mapUsuario(row: any): Usuario {
  const { roles_adicionales, bloqueado_hasta, fallidos } = row
  const rolesAdicionales: string[] = Array.isArray(roles_adicionales)
    ? roles_adicionales.filter((r) => typeof r === 'string' && ROLES_VALIDOS.has(r))
    : []
  return {
    id: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol,
    activo: row.activo,
    created_at: row.created_at,
    updated_at: row.updated_at,
    roles_adicionales: rolesAdicionales,
    // Solo getUsuarios trae estos datos (join con intentos_login, sesión 4).
    intentosFallidos: Number(fallidos) || 0,
    bloqueadoHasta: bloqueado_hasta ? new Date(bloqueado_hasta).getTime() : null,
  } as Usuario
}
