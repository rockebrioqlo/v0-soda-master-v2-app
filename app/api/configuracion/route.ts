import { z } from 'zod'
import { db } from '@/lib/db'
import { requireSesion, requireAcceso } from '@/lib/sesion'
import {
  CLAVE_INACTIVIDAD_KDS_MIN,
  CLAVE_INACTIVIDAD_MIN,
  INACTIVIDAD_MIN_MAXIMO,
  INACTIVIDAD_MIN_MINIMO,
} from '@/lib/sesion-reglas'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const config = await db.getConfiguracion()
    return Response.json(config)
  } catch (error) {
    console.error('Get configuracion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Sesión 14.5a (F42): el body se valida con zod `.strict()`: solo las claves que manda la pantalla de
// Configuración (22) más `precios_incluyen_iva` (lo lee el cobro) y los minutos de inactividad. Una
// clave desconocida o un tipo equivocado → 400 (antes cualquier clave y cualquier valor se guardaban).
const texto = (max: number) => z.string().max(max)
const numero = (min: number, max: number) => z.number().finite().min(min).max(max)

const ConfiguracionSchema = z
  .object({
    nombre_negocio: texto(120),
    direccion: texto(240),
    telefono: texto(40),
    moneda: texto(10),
    tasa_impuesto: numero(0, 100),
    impuesto_habilitado: z.boolean(),
    precios_incluyen_iva: z.boolean(),
    propinas_habilitadas: z.boolean(),
    propina_default: numero(0, 100),
    impresora_habilitada: z.boolean(),
    impresora_ip: texto(100),
    impresora_ancho_mm: numero(20, 500),
    impresora_fuente: texto(200),
    impresora_tamano_fuente_pt: numero(4, 72),
    impresora_margen_mm: numero(0, 100),
    impresora_encabezado: texto(1000),
    impresora_pie: texto(1000),
    impresora_mostrar_logo: z.boolean(),
    impresora_copias_auto: z.boolean(),
    notificaciones_habilitadas: z.boolean(),
    sonido_habilitado: z.boolean(),
    kds_auto_completar: z.boolean(),
    kds_tiempo_auto_completar: numero(0, 86_400),
    // Minutos de inactividad (F42): general (POS, Pagos, Caja, admin) y KDS (0 = sin cierre).
    [CLAVE_INACTIVIDAD_MIN]: z.number().int().min(INACTIVIDAD_MIN_MINIMO).max(INACTIVIDAD_MIN_MAXIMO),
    [CLAVE_INACTIVIDAD_KDS_MIN]: z.union([
      z.literal(0),
      z.number().int().min(INACTIVIDAD_MIN_MINIMO).max(INACTIVIDAD_MIN_MAXIMO),
    ]),
  })
  .partial()
  .strict()

export async function PATCH(request: Request) {
  try {
    // Solo el admin cambia la configuración (el proxy ya lo exige; aquí se vuelve a verificar).
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const crudo = await request.json().catch(() => null)
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
      return Response.json(
        { error: 'Body debe ser un objeto clave-valor', codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }
    const parsed = ConfiguracionSchema.safeParse(crudo)
    if (!parsed.success) {
      const detalle = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .slice(0, 5)
        .join('; ')
      return Response.json(
        { error: `Configuración inválida (${detalle})`, codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }
    const updated = await db.actualizarConfiguracion(parsed.data)
    return Response.json(updated)
  } catch (error) {
    console.error('Update configuracion error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export const PUT = PATCH
