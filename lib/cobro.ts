/**
 * Cálculo único del cobro (sesión 5 del ROADMAP, R2/A1).
 *
 * Lo usan el servidor (`db.crearPago`) y la pantalla de Pagos, para que la
 * lista de pendientes, el detalle, la boleta y el monto que registra el
 * servidor sean siempre la misma cifra. Función pura: sin acceso a la base
 * ni al navegador.
 *
 * Reglas (las mismas que mostraba la boleta antes de esta sesión):
 *  - Descuento sobre el subtotal de lo que se cobra en ESTE pago:
 *      porcentaje        → subtotal × valor / 100
 *      monto_fijo        → valor (tope: subtotal de toda la orden), prorrateado
 *      cortesia_parcial    por la parte de la orden que se cobra ahora
 *      cortesia_total    → todo el subtotal
 *  - IVA: los precios de la carta YA lo incluyen (como en Chile). Si el IVA
 *    está habilitado en configuración se DESGLOSA para la boleta
 *    (base − base / (1 + tasa)), pero no se suma al total: el total es la
 *    base (subtotal − descuento). Es lo que la boleta mostraba hasta ahora,
 *    porque el navegador nunca cargaba el IVA de la configuración. Con
 *    `preciosIncluyenIva: false` (clave de configuración
 *    `precios_incluyen_iva`) el IVA se suma sobre la base. Nunca grava la
 *    propina.
 *  - Propina: porcentaje de la base imponible, o monto fijo. No lleva IVA.
 *  - Todo se redondea a CLP entero.
 */

export type TipoDescuentoCobro =
  | 'porcentaje'
  | 'monto_fijo'
  | 'cortesia_parcial'
  | 'cortesia_total'

export interface ItemCobro {
  precio: number
  cantidad: number
}

export interface DescuentoCobro {
  tipo: TipoDescuentoCobro | null
  valor: number
}

export interface ConfigCobro {
  impuestoHabilitado: boolean
  tasaImpuesto: number
  propinasHabilitadas: boolean
  /** true (por defecto): los precios ya incluyen IVA y este solo se desglosa. */
  preciosIncluyenIva: boolean
}

export interface PropinaCobro {
  tipo: 'porcentaje' | 'monto'
  valor: number
}

export interface ResultadoCobro {
  /** Suma de precio × cantidad de lo que se cobra ahora. */
  subtotal: number
  descuento: number
  /** subtotal − descuento */
  base: number
  /** IVA de la boleta: desglosado (incluido en el total) o sumado, según la configuración. */
  impuesto: number
  /** Total fiscal sin propina. Es el `monto` del pago. */
  total: number
  propina: number
  /** Lo que entrega el cliente: total + propina. */
  totalAPagar: number
}

export function redondearCLP(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function subtotalItems(items: ReadonlyArray<ItemCobro>): number {
  return items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0)
}

export function descuentoDelPago(
  subtotal: number,
  subtotalOrden: number,
  descuento: DescuentoCobro,
): number {
  if (!descuento.tipo || subtotal <= 0) return 0
  const valor = Math.max(Number(descuento.valor) || 0, 0)
  switch (descuento.tipo) {
    case 'porcentaje':
      return redondearCLP(Math.min(subtotal * (Math.min(valor, 100) / 100), subtotal))
    case 'cortesia_total':
      return redondearCLP(subtotal)
    case 'monto_fijo':
    case 'cortesia_parcial': {
      if (subtotalOrden <= 0) return 0
      const tope = Math.min(valor, subtotalOrden)
      const ratio = Math.min(subtotal / subtotalOrden, 1)
      return redondearCLP(Math.min(tope * ratio, subtotal))
    }
    default:
      return 0
  }
}

export function propinaDelPago(
  base: number,
  propina: PropinaCobro | null | undefined,
  propinasHabilitadas: boolean,
): number {
  if (!propina || !propinasHabilitadas || base <= 0) return 0
  const valor = Math.max(Number(propina.valor) || 0, 0)
  return propina.tipo === 'porcentaje'
    ? redondearCLP(base * (valor / 100))
    : redondearCLP(valor)
}

/** Propina dentro de lo permitido: 0–100 % o, en monto, hasta la base imponible. */
export function propinaPermitida(
  base: number,
  propina: PropinaCobro | null | undefined,
  propinasHabilitadas: boolean,
): boolean {
  if (!propina) return true
  const valor = Number(propina.valor)
  if (!Number.isFinite(valor) || valor < 0) return false
  if (!propinasHabilitadas) return valor === 0
  if (propina.tipo === 'porcentaje') return valor <= 100
  return valor <= Math.max(base, 0)
}

export function calcularCobro(input: {
  /** Ítems que se cobran en este pago (con la cantidad que se cobra). */
  items: ReadonlyArray<ItemCobro>
  /** Subtotal de TODA la orden (incluye lo ya pagado): prorratea el descuento fijo. */
  subtotalOrden: number
  descuento: DescuentoCobro
  config: ConfigCobro
  propina?: PropinaCobro | null
}): ResultadoCobro {
  const subtotal = redondearCLP(subtotalItems(input.items))
  const descuento = descuentoDelPago(subtotal, redondearCLP(input.subtotalOrden), input.descuento)
  const base = Math.max(subtotal - descuento, 0)
  const tasa = Number(input.config.tasaImpuesto) || 0
  const incluido = input.config.preciosIncluyenIva
  const impuesto = !input.config.impuestoHabilitado
    ? 0
    : incluido
      ? redondearCLP(base - base / (1 + tasa / 100))
      : redondearCLP(base * (tasa / 100))
  const total = incluido ? base : base + impuesto
  const propina = propinaDelPago(base, input.propina, input.config.propinasHabilitadas)
  return { subtotal, descuento, base, impuesto, total, propina, totalAPagar: total + propina }
}

/**
 * Reparte un total en `n` cuotas enteras. Las primeras n−1 valen
 * floor(total / n) y la última absorbe el resto, así la suma es exactamente
 * el total.
 */
export function repartirCuotas(total: number, n: number): number[] {
  const partes = Math.max(Math.floor(Number(n) || 1), 1)
  const t = redondearCLP(total)
  if (partes === 1) return [t]
  const base = Math.floor(t / partes)
  const cuotas = Array.from({ length: partes - 1 }, () => base)
  cuotas.push(t - base * (partes - 1))
  return cuotas
}

/** Códigos de error del cobro y su estado HTTP (los usa la ruta y el cliente). */
export const ERRORES_COBRO: Record<string, { status: number; mensaje: string }> = {
  ORDEN_YA_PAGADA: { status: 409, mensaje: 'Esta orden ya fue pagada.' },
  ITEMS_YA_PAGADOS: { status: 409, mensaje: 'Alguno de esos ítems ya fue pagado.' },
  ORDEN_CAMBIO: {
    status: 409,
    mensaje: 'La orden cambió mientras cobrabas. Revisa los montos e intenta de nuevo.',
  },
  ORDEN_NO_COBRABLE: { status: 409, mensaje: 'Esta orden no se puede cobrar (cancelada o perdida).' },
  MONTO_DISTINTO: {
    status: 409,
    mensaje: 'El monto en pantalla no coincide con el de la orden. Se actualizó el cálculo.',
  },
  CAJA_CERRADA: {
    status: 409,
    mensaje: 'No hay caja abierta. Abre la caja para cobrar en efectivo (o cobra con tarjeta).',
  },
  ORDEN_NO_ENCONTRADA: { status: 404, mensaje: 'La orden no existe.' },
  ITEM_INVALIDO: { status: 400, mensaje: 'Alguno de los ítems no pertenece a la orden.' },
  SIN_ITEMS: { status: 400, mensaje: 'No hay ítems para cobrar.' },
  PROPINA_INVALIDA: { status: 400, mensaje: 'La propina no es válida.' },
  EFECTIVO_INSUFICIENTE: {
    status: 400,
    mensaje: 'El efectivo recibido es menor que el total a pagar.',
  },
}
