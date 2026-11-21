/**
 * Tabla de permisos por ruta de la API (sesión 3 del ROADMAP).
 *
 * La usan `proxy.ts` (primer control, en cada petición a /api/**) y las
 * rutas vía `requireSesion()`. Regla: gana la primera coincidencia; lo que
 * no está en la tabla queda SOLO ADMIN (cerrado por defecto).
 *
 * Roles efectivos = rol principal + roles_adicionales. `administrador` se
 * normaliza a `admin`. Las reglas finas (p. ej. mermas que solo registra
 * el admin, el permiso temporal `apertura_mesa` del cajero) siguen dentro
 * de cada ruta o de lib/db.ts, ahora con el usuario de la sesión.
 */

export type RolApi = 'admin' | 'mesero' | 'cajero' | 'cocina' | 'bar'

/** 'publico' = sin sesión; 'sesion' = cualquier usuario logueado. */
export type Acceso = 'publico' | 'sesion' | readonly RolApi[]

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface Regla {
  ruta: RegExp
  metodos: readonly Metodo[] | '*'
  acceso: Acceso
}

const ADMIN: readonly RolApi[] = ['admin']
const SALON: readonly RolApi[] = ['admin', 'mesero', 'cajero']
const SALON_Y_COCINA: readonly RolApi[] = ['admin', 'mesero', 'cajero', 'cocina', 'bar']
const CAJA: readonly RolApi[] = ['admin', 'cajero']
const COCINA: readonly RolApi[] = ['admin', 'cocina', 'bar']
const MERMAS: readonly RolApi[] = ['admin', 'mesero', 'cocina', 'bar']

// Un segmento dinámico ([id]) = cualquier cosa sin "/".
const ID = '[^/]+'
const r = (patron: string) => new RegExp(`^/api/${patron}/?$`)

export const REGLAS: readonly Regla[] = [
  // ── Públicas (sin sesión) ─────────────────────────────────────────
  { ruta: r('auth/login'), metodos: ['POST'], acceso: 'publico' },
  { ruta: r('auth/logout'), metodos: ['POST'], acceso: 'publico' },
  { ruta: r('auth/sesion'), metodos: ['GET'], acceso: 'publico' }, // la ruta responde 401 si no hay sesión
  { ruta: r('auth/accesos-rapidos'), metodos: ['GET'], acceso: 'publico' },
  { ruta: r('menu-publico'), metodos: ['GET'], acceso: 'publico' }, // menú QR de clientes
  { ruta: r('hora'), metodos: ['GET'], acceso: 'publico' },
  // Base vacía sin usuarios: el seed sigue cerrado por PERMITIR_SEED (lib/seed-guard.ts).
  { ruta: r('seed'), metodos: ['POST'], acceso: 'publico' },

  // ── Autenticación con sesión ──────────────────────────────────────
  { ruta: r('auth/verificar-pin'), metodos: ['POST'], acceso: 'sesion' },
  { ruta: r('auth/desbloquear'), metodos: ['POST'], acceso: ADMIN },

  // ── Lecturas que usa toda la app ──────────────────────────────────
  {
    ruta: r('(productos|productos/especiales|mesas|ordenes|configuracion|permisos-descuento|usuarios|recetas|items-orden|cuentas-persona)'),
    metodos: ['GET'],
    acceso: 'sesion',
  },
  { ruta: r('notificaciones'), metodos: ['GET', 'POST'], acceso: 'sesion' }, // la ruta filtra por el usuario de la sesión
  { ruta: r(`notificaciones/${ID}`), metodos: ['PATCH'], acceso: 'sesion' },
  { ruta: r('sondeo'), metodos: ['GET'], acceso: 'sesion' }, // sondeo agrupado órdenes+mesas+notificaciones (sesión 10); las notificaciones salen del usuario de la sesión
  { ruta: r('permisos-especiales'), metodos: ['GET'], acceso: 'sesion' }, // no admin: solo los propios

  // ── Salón, POS y KDS ──────────────────────────────────────────────
  // Sesión 14.5a (F38): cocina y bar ya no usan PATCH /api/ordenes (el KDS usa items-orden/estado).
  { ruta: r('ordenes'), metodos: ['PATCH'], acceso: SALON },
  { ruta: r(`ordenes/${ID}`), metodos: ['PATCH'], acceso: SALON },
  { ruta: r('items-orden'), metodos: ['PATCH'], acceso: SALON_Y_COCINA },
  { ruta: r('items-orden/estado'), metodos: ['POST'], acceso: SALON_Y_COCINA }, // varios ítems de una orden a un estado, todo o nada (sesión 13); la matriz por rol está en lib/items-reglas.ts
  { ruta: r('ordenes'), metodos: ['POST', 'DELETE'], acceso: SALON },
  { ruta: r('ordenes/enviar'), metodos: ['POST'], acceso: SALON }, // orden + ítems en una transacción (sesión 8)
  { ruta: r('items-orden'), metodos: ['POST', 'DELETE'], acceso: SALON },
  { ruta: r('mesas'), metodos: ['PATCH'], acceso: SALON },
  { ruta: r('cuentas-persona'), metodos: ['POST', 'PATCH', 'DELETE'], acceso: SALON },
  { ruta: r('cuentas-persona/asignaciones'), metodos: ['POST'], acceso: SALON },
  { ruta: r('descuentos'), metodos: ['POST'], acceso: SALON },
  { ruta: r('kds/historial'), metodos: ['GET'], acceso: COCINA },

  // ── Cobro y caja ──────────────────────────────────────────────────
  { ruta: r('pagos'), metodos: ['GET', 'POST'], acceso: CAJA },
  { ruta: r('perdidas'), metodos: ['GET'], acceso: CAJA },
  { ruta: r('perdidas'), metodos: ['POST'], acceso: ADMIN }, // registrar un perro muerto: solo admin (sesión 7)
  { ruta: r('perdidas/resolver'), metodos: ['POST'], acceso: CAJA },
  { ruta: r('caja'), metodos: ['GET', 'POST'], acceso: CAJA },
  { ruta: r('caja/(cerrar|movimiento)'), metodos: ['POST'], acceso: CAJA },
  { ruta: r('caja/historial'), metodos: ['GET'], acceso: CAJA },
  { ruta: r(`caja/${ID}`), metodos: ['GET'], acceso: CAJA },

  // ── Mermas ────────────────────────────────────────────────────────
  { ruta: r('mermas'), metodos: ['GET', 'POST'], acceso: MERMAS },

  // ── Reportes y dashboard ──────────────────────────────────────────
  { ruta: r('reportes/(ventas|ventas-semana|ventas-categoria|top-productos|metodos-pago)'), metodos: ['GET'], acceso: CAJA },
  { ruta: r('mermas/resumen'), metodos: ['GET'], acceso: CAJA },
  { ruta: r('descuentos'), metodos: ['GET'], acceso: CAJA },

  // Todo lo demás (usuarios, configuración, inventario, productos, recetas,
  // compras, proveedores, empleados, gastos, activos, márgenes, seeds de
  // demo y recetas, permisos…) cae en el default: solo admin.
]

export const ACCESO_POR_DEFECTO: Acceso = ADMIN

const ROLES_VALIDOS = new Set<RolApi>(['admin', 'mesero', 'cajero', 'cocina', 'bar'])

export function normalizarRolApi(rol: unknown): RolApi | null {
  if (typeof rol !== 'string') return null
  const r = rol.trim().toLowerCase()
  if (r === 'administrador') return 'admin'
  return ROLES_VALIDOS.has(r as RolApi) ? (r as RolApi) : null
}

export function rolesEfectivos(rol: unknown, adicionales?: unknown): RolApi[] {
  const set = new Set<RolApi>()
  const principal = normalizarRolApi(rol)
  if (principal) set.add(principal)
  if (Array.isArray(adicionales)) {
    for (const a of adicionales) {
      const n = normalizarRolApi(a)
      if (n) set.add(n)
    }
  }
  return [...set]
}

export function tieneAlgunRol(roles: readonly RolApi[], permitidos: readonly RolApi[]): boolean {
  return roles.some((r) => permitidos.includes(r))
}

export function accesoParaRuta(pathname: string, metodo: string): Acceso {
  const m = metodo.toUpperCase()
  for (const regla of REGLAS) {
    if (!regla.ruta.test(pathname)) continue
    if (regla.metodos === '*' || (regla.metodos as readonly string[]).includes(m)) {
      return regla.acceso
    }
  }
  return ACCESO_POR_DEFECTO
}
