/**
 * Reglas de los derechos ARCOP (sesión 18, K1). Módulo puro, sin acceso a la base (lo importa la prueba
 * `scripts/pruebas/arco.cjs` con el type stripping de Node).
 *
 * Plazos (el usuario, 21-11-2026): 30 días corridos desde el ingreso, prorrogables UNA vez por 30 más en casos
 * justificados. El cálculo lo hace el SQL (`lib/arco-sql.ts`) con la fecha de Santiago.
 */

export const PLAZO_DIAS = 30
export const PRORROGA_DIAS = 30

/**
 * Decisión del usuario (21-11-2026), pendiente del contador: al anonimizar un empleado, ¿se anonimiza también el
 * sueldo base, el cargo y las fechas de ingreso y egreso? `false` = se CONSERVAN (obligación laboral y tributaria; el plazo laboral
 * está por confirmar con el contador). Es la opción reversible: se puede anonimizar después; lo contrario no.
 * Cambiar a `true` pone el sueldo en 0 y deja nulos el cargo y las fechas.
 */
export const ANONIMIZAR_SUELDO = false

export type TipoSolicitud = 'acceso' | 'rectificacion' | 'supresion' | 'oposicion' | 'portabilidad'
export type TitularTipo = 'usuario' | 'empleado' | 'proveedor'
export type CanalSolicitud = 'presencial' | 'correo' | 'formulario' | 'telefono' | 'otro'
export type EstadoSolicitud = 'pendiente' | 'resuelta' | 'rechazada'

export const TIPOS_SOLICITUD: readonly TipoSolicitud[] = ['acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad']
export const TITULARES_TIPO: readonly TitularTipo[] = ['usuario', 'empleado', 'proveedor']
export const CANALES: readonly CanalSolicitud[] = ['presencial', 'correo', 'formulario', 'telefono', 'otro']
export const ESTADOS: readonly EstadoSolicitud[] = ['pendiente', 'resuelta', 'rechazada']

/**
 * Las 10 columnas que guardan una COPIA del nombre de quien actuó (sección 2.2 del inventario), en 6 tablas.
 * Corregir o anonimizar al usuario NO las alcanza: la anonimización las actualiza por el id que les corresponde
 * (nunca por coincidencia de nombre). Una columna nueva con este patrón hace fallar la prueba de cobertura del
 * módulo `arco` hasta que se decida (agregarla aquí o a `COLUMNAS_NOMBRE_NO_PERSONALES`).
 *
 * Además, `auditoria_admin.entidad_nombre` copia el nombre del titular en las entradas de crear y modificar de la
 * sesión 17 (hallazgo de la sesión 18: es la 11.ª); se trata aparte porque su id es `entidad_id` y depende de `entidad`.
 */
export const COLUMNAS_NOMBRE_COPIADO: ReadonlyArray<{ tabla: string; nombre: string; id: string }> = [
  { tabla: 'pagos', nombre: 'cobrado_por_nombre', id: 'cobrado_por' },
  { tabla: 'cajas', nombre: 'usuario_apertura_nombre', id: 'usuario_apertura_id' },
  { tabla: 'cajas', nombre: 'usuario_cierre_nombre', id: 'usuario_cierre_id' },
  { tabla: 'movimientos_caja', nombre: 'usuario_nombre', id: 'usuario_id' },
  { tabla: 'perdidas_comanda', nombre: 'autorizado_por_nombre', id: 'autorizado_por' },
  { tabla: 'perdidas_comanda', nombre: 'responsable_nombre', id: 'responsable_id' },
  { tabla: 'perdidas_comanda', nombre: 'resuelto_por_nombre', id: 'resuelto_por_id' },
  { tabla: 'permisos_especiales', nombre: 'otorgado_por_nombre', id: 'otorgado_por' },
  { tabla: 'permisos_especiales', nombre: 'revocado_por_nombre', id: 'revocado_por' },
  { tabla: 'auditoria_admin', nombre: 'usuario_nombre', id: 'usuario_id' },
]

/** Columnas `*_nombre` que NO son el nombre de una persona (decididas): el nombre de una mesa. */
export const COLUMNAS_NOMBRE_NO_PERSONALES: readonly string[] = ['notificaciones.mesa_nombre']

/**
 * Exportar entrega datos personales: primero se REGISTRA en la auditoría y recién entonces se leen. Si el registro
 * falla, el error sube y no se lee ni se entrega nada (decisión del 21-11-2026: es más estricto que la regla de la
 * sesión 17 para lecturas, porque la exportación es la respuesta a una solicitud legal y el registro es su evidencia).
 */
export async function exportarConAuditoria<T>(registrar: () => Promise<unknown>, leer: () => Promise<T>): Promise<T> {
  await registrar()
  return leer()
}

/** Error de las rutas de solicitudes ARCOP (código, estado HTTP y mensaje para el administrador). */
export class ErrorArco extends Error {
  codigo: string
  status: number
  constructor(codigo: string, status: number, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorArco'
    this.codigo = codigo
    this.status = status
  }
}

const e = (codigo: string, status: number, mensaje: string) => new ErrorArco(codigo, status, mensaje)

export const ERR = {
  solicitudNoEncontrada: () => e('SOLICITUD_NO_ENCONTRADA', 404, 'La solicitud no existe'),
  titularNoEncontrado: () => e('TITULAR_NO_ENCONTRADO', 404, 'El titular no existe'),
  duplicada: () => e('SOLICITUD_DUPLICADA', 409, 'Ya hay una solicitud pendiente de ese tipo para este titular'),
  yaResuelta: () => e('SOLICITUD_YA_RESUELTA', 409, 'La solicitud ya fue resuelta'),
  prorrogaUsada: () => e('PRORROGA_YA_USADA', 409, 'La solicitud ya se prorrogó una vez; no se puede prorrogar de nuevo'),
  vencida: () => e('SOLICITUD_VENCIDA', 409, 'La solicitud ya venció; no se puede prorrogar'),
  usarSuprimir: () => e('USAR_SUPRIMIR', 409, 'Una supresión no se da por atendida aquí: use "Suprimir" para anonimizar al titular (o rechácela con un motivo)'),
  tipoNoExportable: () => e('TIPO_NO_EXPORTABLE', 409, 'Solo las solicitudes de acceso y de portabilidad se exportan'),
  tipoNoEsSupresion: () => e('TIPO_NO_ES_SUPRESION', 409, 'La solicitud no es de supresión'),
  yaAnonimizado: () => e('TITULAR_YA_ANONIMIZADO', 409, 'El titular ya está anonimizado'),
  autoModificacion: () => e('AUTO_MODIFICACION', 409, 'No puede anonimizarse a sí mismo; pídalo a otro administrador'),
  confirmacionRequerida: () =>
    e('CONFIRMACION_REQUERIDA', 400, 'Para anonimizar un proveedor confirme que es una persona natural (es_persona_natural: true); una empresa no es titular de datos personales'),
  ultimoAdmin: () => e('ULTIMO_ADMIN', 409, 'Es el último administrador activo: debe haber otro antes de anonimizarlo'),
}

/** Hechos que devuelve el statement de prórroga (`lib/arco-sql.ts`). */
export interface HechosProrroga {
  existe: number
  aplicado: number
  estado: string
  prorrogada: boolean
  vence_pasada: boolean
}

/** Qué error corresponde a una prórroga que no se aplicó (la carrera cae en "ya usada"). */
export function decidirProrroga(h: HechosProrroga): ErrorArco | null {
  if (h.aplicado === 1) return null
  if (h.existe === 0) return ERR.solicitudNoEncontrada()
  if (h.estado !== 'pendiente') return ERR.yaResuelta()
  if (h.prorrogada) return ERR.prorrogaUsada()
  if (h.vence_pasada) return ERR.vencida()
  return ERR.prorrogaUsada() // otra prórroga simultánea ganó
}

export interface HechosResolucion {
  existe: number
  aplicado: number
  tipo: string | null
  estado: string | null
}

export function decidirResolucion(h: HechosResolucion, resultado: 'atendida' | 'rechazada'): ErrorArco | null {
  if (h.aplicado === 1) return null
  if (h.existe === 0) return ERR.solicitudNoEncontrada()
  if (h.estado !== 'pendiente') return ERR.yaResuelta()
  if (h.tipo === 'supresion' && resultado === 'atendida') return ERR.usarSuprimir()
  return ERR.yaResuelta()
}

export interface HechosSupresion {
  sol_existe: number
  sol_tipo: string | null
  sol_estado: string | null
  existe: number
  ya: boolean
  self: boolean
  ultimo: boolean
  aplicado: number
}

/** Orden de las reglas de una supresión: la solicitud, el titular, ya anonimizado, uno mismo, último admin, carrera. */
export function decidirSupresion(h: HechosSupresion): ErrorArco | null {
  if (h.aplicado === 1) return null
  if (h.sol_existe === 0) return ERR.solicitudNoEncontrada()
  if (h.sol_tipo !== 'supresion') return ERR.tipoNoEsSupresion()
  if (h.sol_estado !== 'pendiente') return ERR.yaResuelta()
  if (h.existe === 0) return ERR.titularNoEncontrado()
  if (h.ya) return ERR.yaAnonimizado()
  if (h.self) return ERR.autoModificacion()
  if (h.ultimo) return ERR.ultimoAdmin()
  return ERR.yaResuelta() // otra supresión simultánea de la misma solicitud ganó
}

