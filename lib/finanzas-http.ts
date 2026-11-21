/**
 * Esquemas zod `.strict()` de las rutas de Finanzas (sesión 14.5b-1, F31): activos, empleados,
 * proveedores y gastos. Los campos son los que mandan hoy las pestañas (`components/*-tab.tsx`);
 * un campo que no está aquí se rechaza con 400 y su nombre. El usuario de un gasto sale de la
 * sesión, nunca del body.
 */
import { z } from 'zod'
import { fechaYmd, limite, uuid } from '@/lib/validacion-http'
import { resolverDocumento } from '@/lib/rut'

const texto = (max: number) => z.string().trim().max(max)
const textoOpcional = (max: number) => texto(max).nullish()
const nombre = texto(120).min(1)
const dinero = z.number().finite().min(0).max(1_000_000_000)

export const ActivoSchema = z
  .object({
    nombre,
    categoria: texto(40).min(1).optional(),
    descripcion: textoOpcional(500),
    fecha_compra: fechaYmd.optional(),
    costo_compra: dinero,
    vida_util_meses: z.number().int().min(1).max(600),
    valor_residual: dinero.optional(),
    metodo_depreciacion: z.enum(['lineal']).optional(),
    proveedor_id: uuid.nullish(),
    ubicacion: textoOpcional(200),
    numero_serie: textoOpcional(120),
    // Al crear, el servidor lo ignora (el activo nace 'activo'); al editar lo guarda.
    estado: z.enum(['activo', 'baja', 'vendido', 'reparacion']).optional(),
    notas: textoOpcional(1000),
  })
  .strict()

export const ActivoPatchSchema = ActivoSchema.partial().strict()

const PERIODICIDAD_EMPLEADO = ['mensual', 'quincenal', 'semanal', 'diario', 'por_hora'] as const

export const EmpleadoSchema = z
  .object({
    nombre,
    cargo: textoOpcional(120),
    documento: textoOpcional(40),
    // Sesión 18: pasaporte o documento extranjero (no se valida el Módulo 11). Solo se usa al escribir; no se guarda.
    documento_otro: z.boolean().optional(),
    telefono: textoOpcional(40),
    email: textoOpcional(254),
    sueldo_base: dinero,
    periodicidad: z.enum(PERIODICIDAD_EMPLEADO).optional(),
    fecha_ingreso: fechaYmd.nullish(),
    // Al crear, el servidor ignora fecha_egreso y activo; al editar los guarda.
    fecha_egreso: fechaYmd.nullish(),
    activo: z.boolean().optional(),
    notas: textoOpcional(1000),
  })
  .strict()

export const EmpleadoPatchSchema = EmpleadoSchema.partial().strict()

export const ProveedorSchema = z
  .object({
    nombre,
    rut: textoOpcional(20),
    // Sesión 18: documento que no es RUT chileno (no se valida el Módulo 11). Solo se usa al escribir; no se guarda.
    documento_otro: z.boolean().optional(),
    contacto: textoOpcional(120),
    telefono: textoOpcional(40),
    email: textoOpcional(254),
    direccion: textoOpcional(300),
    notas: textoOpcional(1000),
    // Al crear, el servidor lo ignora (el proveedor nace activo); al editar lo guarda.
    activo: z.boolean().optional(),
  })
  .strict()

export const ProveedorPatchSchema = ProveedorSchema.partial().strict()

export const GastoPostSchema = z
  .object({
    fecha: fechaYmd.optional(),
    categoria: texto(60).min(1).optional(),
    descripcion: textoOpcional(500),
    monto: z.number().finite().gt(0).max(1_000_000_000),
    tipo: z.enum(['operativo', 'sueldo', 'servicio', 'impuesto', 'financiero', 'otros']).optional(),
    recurrente: z.boolean().optional(),
    periodicidad: z.enum(['mensual', 'quincenal', 'semanal', 'anual']).nullish(),
    proveedor_id: uuid.nullish(),
    empleado_id: uuid.nullish(),
    activo_id: uuid.nullish(),
    notas: textoOpcional(1000),
  })
  .strict()

/** Consulta de `GET /api/gastos`. */
export const GastosConsultaSchema = z
  .object({
    desde: fechaYmd.optional(),
    hasta: fechaYmd.optional(),
    tipo: z.enum(['all', 'operativo', 'sueldo', 'servicio', 'impuesto', 'financiero', 'otros']).optional(),
    resumen: z.enum(['true', 'false']).optional(),
    limite: limite(1000).optional(),
  })
  .strict()

/** Respuesta 400 de un RUT con el dígito verificador errado (sesión 18). */
export function respuestaRutInvalido(mensaje: string): Response {
  return Response.json({ error: mensaje, codigo: 'RUT_INVALIDO' }, { status: 400 })
}

/**
 * Lo que se guarda en `documento` (empleados) o `rut` (proveedores). `nuevo` es lo que llegó (undefined = el campo no vino: no se
 * toca), `actual` lo guardado (para no bloquear datos antiguos que el formulario reenvía) y `otro` la casilla "otro documento".
 * Devuelve `incluir: false` si no hay nada que escribir.
 */
export function resolverCampoDocumento(
  nuevo: string | null | undefined,
  actual: string | null | undefined,
  otro: boolean | undefined,
): { ok: true; incluir: false } | { ok: true; incluir: true; valor: string | null } | { ok: false; respuesta: Response } {
  if (nuevo === undefined) return { ok: true, incluir: false }
  const r = resolverDocumento(nuevo, actual, otro === true)
  if (!r.ok) return { ok: false, respuesta: respuestaRutInvalido(r.error) }
  return { ok: true, incluir: true, valor: r.valor }
}
