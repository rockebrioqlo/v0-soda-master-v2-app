// lib/print-ticket.ts
// Generador de tickets imprimibles, agnóstico de impresora.
// Produce un HTML autocontenido (html+css+body) que puede:
//  - mostrarse en un <iframe> para previsualizar exactamente lo que se imprime.
//  - dispararse a impresión vía iframe.contentWindow.print().
// El ancho del papel, fuente, tamaño y márgenes son configurables desde
// soda_master.configuracion, así sirve para impresoras térmicas 58mm/72mm/80mm,
// tickets ancho carta, e impresoras A4 sin necesidad de integración ESC/POS.
//
// Soporta:
//   - 'comanda'   → ticket interno con totales (lo usa POS para registrar)
//   - 'boleta'    → comprobante de pago con totales + método de pago + vuelto
//   - 'precuenta' → resumen para el cliente (sin método de pago, opcional propina)
//   - 'cocina'    → comanda para la estación de cocina (sin precios)
//   - 'bar'       → comanda para la estación de bar (sin precios)
//
// `buildMultiTicketHtml` permite imprimir varios tickets en un solo documento
// (con salto de página), útil para el "KDS doble": al enviar a cocina se imprime
// en un único trabajo de impresión la copia de cocina y la copia de bar.

import type { Comanda, ItemComanda, EstadoItem, Producto } from './types'
import { formatCurrency } from './helpers'

// ── Configuración persistible ────────────────────────────────────────────────
export interface TicketPrintConfig {
  /** Ancho del papel en milímetros (ej: 58, 72, 80, 110, 210=A4). */
  ancho_mm: number
  /** Familia tipográfica CSS (puede incluir fallbacks). */
  fuente: string
  /** Tamaño de fuente base en puntos (pt). */
  tamano_fuente_pt: number
  /** Margen interno del ticket en milímetros. */
  margen_mm: number
  /** Texto del encabezado bajo el nombre del negocio. */
  encabezado: string
  /** Texto del pie del ticket. */
  pie: string
  /** Si se muestra el nombre del negocio en mayor tamaño. */
  mostrar_logo: boolean
}

export const DEFAULT_PRINT_CONFIG: TicketPrintConfig = {
  ancho_mm: 80,
  fuente: 'monospace',
  tamano_fuente_pt: 11,
  margen_mm: 4,
  encabezado: '¡Gracias por su visita!',
  pie: 'Vuelva pronto - Soda Master',
  mostrar_logo: true,
}

/** Anchos predefinidos comunes en mm. */
export const PRESET_ANCHOS_MM = [
  { value: 58, label: '58 mm (térmica chica)' },
  { value: 72, label: '72 mm (térmica)' },
  { value: 80, label: '80 mm (térmica estándar)' },
  { value: 110, label: '110 mm (térmica ancha)' },
  { value: 210, label: '210 mm (A4)' },
]

/** Familias tipográficas seguras para tickets. */
export const FUENTES_DISPONIBLES = [
  { value: 'monospace', label: 'Monospace (por defecto)' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: "Consolas, 'Cascadia Mono', monospace", label: 'Consolas' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: 'Helvetica' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
]

/** Categorías de producto que se enrutan a la estación BAR (las demás van a cocina). */
export const CATEGORIAS_BAR = ['bebidas', 'cervezas', 'jugos_bebidas', 'tragos']

// ── Datos del ticket ─────────────────────────────────────────────────────────
export interface TicketItem {
  cantidad: number
  nombre: string
  variante?: string | null
  notas?: string | null
  precio_unitario: number
  /** Estado del ítem (solo se muestra cuando `mostrar_estado_items=true`, ej: precuenta). */
  estado?: EstadoItem | null
  /** Modificadores estándar (ej: lechuga, tomate). Útil para tickets de cocina. */
  modificadores?: string[]
  /** Ingredientes especiales (estrella) - se destacan en cocina. */
  especiales?: string[]
  /** Salsa(s) seleccionadas. */
  salsa?: string | null
}

export interface TicketTotales {
  subtotal: number
  descuento?: number | null
  descuento_label?: string | null
  impuesto?: number | null
  impuesto_label?: string | null
  propina?: number | null
  total: number
  pagado?: number | null
  vuelto?: number | null
}

export type TipoTicket = 'comanda' | 'boleta' | 'precuenta' | 'cocina' | 'bar'

export interface TicketData {
  tipo: TipoTicket
  nombre_negocio: string
  mesa: string
  atendido_por?: string | null
  fecha: number
  metodo_pago?: string | null
  dividido_en?: number | null
  monto_por_persona?: number | null
  items: TicketItem[]
  totales: TicketTotales
  /**
   * Si es `true`, junto a cada ítem se imprime su estado actual ("En preparación",
   * "Pendiente", "Con problema") cuando no es "listo". Útil para precuentas en
   * mesa donde el cliente quiere ver qué le falta llegar.
   */
  mostrar_estado_items?: boolean
  /** Número de copia (opcional, ej: "Copia 1 de 2"). */
  numero_copia?: string | null
}

// ── Helpers de mapeo desde Comanda ───────────────────────────────────────────
export function comandaToTicketItems(comanda: Comanda): TicketItem[] {
  return comanda.items.map((item: ItemComanda) => ({
    cantidad: item.cantidad,
    nombre: item.productoNombre,
    variante: item.variante,
    notas: item.notaEspecial || item.notas || null,
    precio_unitario: item.precio,
    estado: item.estado,
    modificadores: item.ingredientesEstandar || [],
    especiales: (item.ingredientesEspeciales || []).map((esp) => esp.nombre),
    salsa: item.salsaSeleccionada || null,
  }))
}

const ESTADO_ITEM_LABEL: Record<EstadoItem, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  problema: 'Con problema',
}

/** Decide si un item es de bar (caso contrario es cocina). */
export function isItemDeBar(item: ItemComanda, productos: Producto[]): boolean {
  if (item.categoria) return CATEGORIAS_BAR.includes(item.categoria as string)
  const producto = productos.find((p) => p.id === item.productoId)
  return CATEGORIAS_BAR.includes((producto?.categoria as string) || '')
}

/**
 * Divide los ítems de una comanda entre cocina y bar y arma los `TicketData`
 * correspondientes para impresión física. Si una de las estaciones no tiene
 * ítems, ese ticket no se incluye.
 *
 * Cuando se pasa `soloPendientes=true`, sólo se incluyen ítems en estados
 * `pendiente` o `en_preparacion`, ideal para imprimir al enviar a cocina
 * (no reimprimir cosas ya listas).
 */
export function splitComandaParaEstaciones(
  comanda: Comanda,
  productos: Producto[],
  options: {
    nombreNegocio: string
    soloPendientes?: boolean
  },
): { cocina: TicketData | null; bar: TicketData | null } {
  const itemsRelevantes = options.soloPendientes
    ? comanda.items.filter((it) => it.estado === 'pendiente' || it.estado === 'en_preparacion')
    : comanda.items

  const itemsCocina = itemsRelevantes.filter((it) => !isItemDeBar(it, productos))
  const itemsBar = itemsRelevantes.filter((it) => isItemDeBar(it, productos))

  const baseTotales: TicketTotales = { subtotal: 0, total: 0 }
  const buildData = (tipo: 'cocina' | 'bar', items: ItemComanda[]): TicketData => ({
    tipo,
    nombre_negocio: options.nombreNegocio,
    mesa: comanda.mesaNombre,
    atendido_por: comanda.usuarioNombre,
    fecha: Date.now(),
    items: items.map((item) => ({
      cantidad: item.cantidad,
      nombre: item.productoNombre,
      variante: item.variante,
      notas: item.notaEspecial || item.notas || null,
      precio_unitario: 0,
      estado: item.estado,
      modificadores: item.ingredientesEstandar || [],
      especiales: (item.ingredientesEspeciales || []).map((esp) => esp.nombre),
      salsa: item.salsaSeleccionada || null,
    })),
    totales: baseTotales,
  })

  return {
    cocina: itemsCocina.length > 0 ? buildData('cocina', itemsCocina) : null,
    bar: itemsBar.length > 0 ? buildData('bar', itemsBar) : null,
  }
}

// ── Helpers de saneo ─────────────────────────────────────────────────────────
function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function normalizePrintConfig(input: Partial<TicketPrintConfig> | null | undefined): TicketPrintConfig {
  const cfg = { ...DEFAULT_PRINT_CONFIG, ...(input ?? {}) }
  cfg.ancho_mm = clamp(Number(cfg.ancho_mm) || DEFAULT_PRINT_CONFIG.ancho_mm, 40, 297)
  cfg.tamano_fuente_pt = clamp(Number(cfg.tamano_fuente_pt) || DEFAULT_PRINT_CONFIG.tamano_fuente_pt, 6, 24)
  cfg.margen_mm = clamp(Number(cfg.margen_mm) || DEFAULT_PRINT_CONFIG.margen_mm, 0, 30)
  cfg.fuente = cfg.fuente || DEFAULT_PRINT_CONFIG.fuente
  cfg.encabezado = cfg.encabezado ?? ''
  cfg.pie = cfg.pie ?? ''
  cfg.mostrar_logo = cfg.mostrar_logo !== false
  return cfg
}

function formatFecha(ts: number) {
  try {
    return new Date(ts).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(ts).toString()
  }
}

// ── Render del cuerpo (sin <html>/<head>) ────────────────────────────────────
/**
 * Devuelve el `<div class="ticket">…</div>` para un único ticket, usando el CSS
 * global que inyecta `buildTicketHtml` / `buildMultiTicketHtml`. Se aísla esta
 * pieza para poder concatenar varios cuerpos en un solo documento de impresión.
 */
function renderTicketBody(data: TicketData, cfg: TicketPrintConfig, opts: { isLast: boolean }): string {
  const isBoleta = data.tipo === 'boleta'
  const isPrecuenta = data.tipo === 'precuenta'
  const isCocina = data.tipo === 'cocina'
  const isBar = data.tipo === 'bar'
  const isEstacion = isCocina || isBar
  const titulo = isBoleta
    ? 'Boleta'
    : isPrecuenta
    ? 'Precuenta'
    : isCocina
    ? 'COCINA'
    : isBar
    ? 'BAR'
    : 'Comanda'

  const mostrarEstados = !!data.mostrar_estado_items
  const itemsNoListos = mostrarEstados
    ? data.items.filter((it) => it.estado && it.estado !== 'listo').length
    : 0

  // ── Items ─────────────────────────────────────────────────────────────────
  const itemsHtml = data.items
    .map((item) => {
      const variante = item.variante ? ` <span class="muted">(${escapeHtml(item.variante)})</span>` : ''
      const notas = item.notas ? `<div class="nota">★ ${escapeHtml(item.notas)}</div>` : ''
      const estadoBadge =
        mostrarEstados && item.estado && item.estado !== 'listo'
          ? `<div class="estado-item">${escapeHtml(ESTADO_ITEM_LABEL[item.estado])}</div>`
          : ''
      // Bloque de modificadores / salsa / especiales sólo en estación (cocina/bar)
      // o cuando hay info útil (en boleta/comanda/precuenta basta con la línea base).
      const modificadoresHtml =
        isEstacion && item.modificadores && item.modificadores.length > 0
          ? `<div class="mods">+ ${escapeHtml(item.modificadores.join(', '))}</div>`
          : ''
      const especialesHtml =
        isEstacion && item.especiales && item.especiales.length > 0
          ? `<div class="mods especial">★ Especial: ${escapeHtml(item.especiales.join(', '))}</div>`
          : ''
      const salsaHtml =
        isEstacion && item.salsa
          ? `<div class="mods">Salsa: ${escapeHtml(item.salsa)}</div>`
          : ''

      if (isEstacion) {
        // En cocina/bar NO mostramos precios, sólo cantidad + nombre destacados.
        return `
          <div class="row station">
            <div class="row-left big">${item.cantidad}× ${escapeHtml(item.nombre)}${variante}</div>
          </div>
          ${modificadoresHtml}
          ${especialesHtml}
          ${salsaHtml}
          ${notas}
        `.trim()
      }

      const subtotal = item.precio_unitario * item.cantidad
      return `
        <div class="row">
          <div class="row-left">${item.cantidad}× ${escapeHtml(item.nombre)}${variante}</div>
          <div class="row-right">${escapeHtml(formatCurrency(subtotal))}</div>
        </div>
        ${estadoBadge}
        ${notas}
      `.trim()
    })
    .join('\n')

  // ── Totales / Pago ────────────────────────────────────────────────────────
  const totalesHtml: string[] = []
  if (!isEstacion) {
    totalesHtml.push(`
      <div class="row">
        <div class="row-left">Subtotal</div>
        <div class="row-right">${escapeHtml(formatCurrency(data.totales.subtotal))}</div>
      </div>
    `)
    if (data.totales.descuento && data.totales.descuento > 0) {
      totalesHtml.push(`
        <div class="row">
          <div class="row-left">${escapeHtml(data.totales.descuento_label || 'Descuento')}</div>
          <div class="row-right">-${escapeHtml(formatCurrency(data.totales.descuento))}</div>
        </div>
      `)
    }
    if (data.totales.impuesto && data.totales.impuesto > 0) {
      totalesHtml.push(`
        <div class="row">
          <div class="row-left">${escapeHtml(data.totales.impuesto_label || 'Impuesto')}</div>
          <div class="row-right">+${escapeHtml(formatCurrency(data.totales.impuesto))}</div>
        </div>
      `)
    }
    if (data.totales.propina && data.totales.propina > 0) {
      totalesHtml.push(`
        <div class="row">
          <div class="row-left">Propina</div>
          <div class="row-right">+${escapeHtml(formatCurrency(data.totales.propina))}</div>
        </div>
      `)
    }
    totalesHtml.push(`
      <div class="row total">
        <div class="row-left">TOTAL</div>
        <div class="row-right">${escapeHtml(formatCurrency(data.totales.total))}</div>
      </div>
    `)
  }

  const pagoHtml: string[] = []
  if (isBoleta && data.metodo_pago) {
    pagoHtml.push(`<div class="muted center">Método: ${escapeHtml(data.metodo_pago.toUpperCase())}</div>`)
  }
  if (isBoleta && data.dividido_en && data.dividido_en > 1 && data.monto_por_persona) {
    pagoHtml.push(`
      <div class="muted center">
        Dividido entre ${data.dividido_en} personas: ${escapeHtml(formatCurrency(data.monto_por_persona))} c/u
      </div>
    `)
  }
  if (isBoleta && data.totales.pagado != null) {
    pagoHtml.push(`
      <div class="row">
        <div class="row-left">Recibido</div>
        <div class="row-right">${escapeHtml(formatCurrency(data.totales.pagado))}</div>
      </div>
    `)
  }
  if (isBoleta && data.totales.vuelto != null && data.totales.vuelto > 0) {
    pagoHtml.push(`
      <div class="row">
        <div class="row-left">Vuelto</div>
        <div class="row-right">${escapeHtml(formatCurrency(data.totales.vuelto))}</div>
      </div>
    `)
  }

  // ── Bloques de encabezado especiales ──────────────────────────────────────
  const subtituloPrecuenta = isPrecuenta
    ? `<div class="aviso">PRECUENTA</div><div class="header-line muted">No es comprobante de pago</div>`
    : ''
  const subtituloEstacion = isEstacion
    ? `<div class="aviso big-title">${titulo}</div>`
    : ''
  const avisoEnPreparacion =
    isPrecuenta && itemsNoListos > 0
      ? `<div class="header-line muted">* Hay ${itemsNoListos} ${itemsNoListos === 1 ? 'ítem' : 'ítems'} aún en preparación</div>`
      : ''
  const numeroCopia = data.numero_copia
    ? `<div class="header-line muted">${escapeHtml(data.numero_copia)}</div>`
    : ''

  const mostrarPie = !!cfg.pie && !isPrecuenta && !isEstacion
  const mostrarEncabezado = !!cfg.encabezado && !isPrecuenta && !isEstacion
  const mostrarLogo = cfg.mostrar_logo && !isEstacion

  return `
    <div class="ticket ${isLastClass(opts.isLast)}">
      ${mostrarLogo ? `<div class="negocio">${escapeHtml(data.nombre_negocio)}</div>` : ''}
      ${isEstacion ? `<div class="estacion-negocio muted">${escapeHtml(data.nombre_negocio)}</div>` : ''}
      ${subtituloPrecuenta}
      ${subtituloEstacion}
      ${mostrarEncabezado ? `<div class="header-line muted">${escapeHtml(cfg.encabezado)}</div>` : ''}
      <div class="header-line ${isEstacion ? 'big-fecha' : 'muted'}">${escapeHtml(formatFecha(data.fecha))}</div>
      ${numeroCopia}
      <hr class="sep" />
      <div class="meta">
        <div class="row"><div class="row-left ${isEstacion ? 'big' : ''}">${escapeHtml(data.mesa)}</div>${
    isEstacion ? '' : `<div class="row-right">${escapeHtml(titulo)}</div>`
  }</div>
        ${data.atendido_por ? `<div class="muted">Atendido por: ${escapeHtml(data.atendido_por)}</div>` : ''}
      </div>
      <hr class="sep" />
      ${itemsHtml || '<div class="muted center">Sin items</div>'}
      ${avisoEnPreparacion}
      ${!isEstacion ? `<hr class="sep" />${totalesHtml.join('')}` : ''}
      ${pagoHtml.length ? `<hr class="sep" />${pagoHtml.join('')}` : ''}
      ${mostrarPie ? `<hr class="sep" /><div class="pie muted">${escapeHtml(cfg.pie)}</div>` : ''}
    </div>
  `.trim()
}

function isLastClass(isLast: boolean) {
  return isLast ? '' : 'page-break'
}

function buildStyles(cfg: TicketPrintConfig) {
  const fontFamily = cfg.fuente.replace(/[<>]/g, '')
  const ancho = cfg.ancho_mm
  const margen = cfg.margen_mm
  const fontSize = cfg.tamano_fuente_pt

  return `
    @page {
      size: ${ancho}mm auto;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
    }
    body {
      font-family: ${fontFamily};
      font-size: ${fontSize}pt;
      line-height: 1.35;
    }
    .ticket {
      width: ${ancho}mm;
      padding: ${margen}mm;
      margin: 0 auto;
    }
    .ticket.page-break {
      page-break-after: always;
      break-after: page;
    }
    .center { text-align: center; }
    .muted { color: #444; }
    .negocio {
      font-size: ${Math.round(fontSize * (cfg.mostrar_logo ? 1.4 : 1))}pt;
      font-weight: 700;
      text-align: center;
      margin: 0 0 2mm 0;
    }
    .estacion-negocio {
      text-align: center;
      font-size: ${Math.max(fontSize - 1, 6)}pt;
      margin: 0 0 1mm 0;
    }
    .big-title {
      font-size: ${Math.round(fontSize * 1.8)}pt;
      letter-spacing: 2px;
      margin: 1mm 0 2mm 0;
    }
    .big-fecha {
      text-align: center;
      font-weight: 700;
      font-size: ${Math.round(fontSize * 1.1)}pt;
    }
    .header-line {
      text-align: center;
      margin: 0 0 1mm 0;
    }
    .meta {
      margin: 1mm 0;
    }
    .meta .row-left { font-weight: 700; }
    .sep {
      border: 0;
      border-top: 1px dashed #000;
      margin: 2mm 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 4mm;
      align-items: flex-start;
    }
    .row.station {
      margin: 1.5mm 0 0.5mm 0;
    }
    .row-left { flex: 1 1 auto; word-break: break-word; }
    .row-left.big {
      font-size: ${Math.round(fontSize * 1.35)}pt;
      font-weight: 700;
    }
    .row-right {
      flex: 0 0 auto;
      text-align: right;
      white-space: nowrap;
    }
    .nota {
      font-size: ${Math.max(fontSize - 1, 6)}pt;
      color: #000;
      font-weight: 700;
      padding: 1mm 2mm;
      margin: 0 0 1mm 0;
      border: 1px dashed #000;
    }
    .mods {
      font-size: ${Math.max(fontSize - 1, 6)}pt;
      padding-left: 4mm;
      margin-bottom: 0.5mm;
    }
    .mods.especial {
      font-weight: 700;
    }
    .estado-item {
      font-size: ${Math.max(fontSize - 1, 6)}pt;
      color: #555;
      padding-left: 4mm;
      margin-bottom: 1mm;
      font-style: italic;
    }
    .aviso {
      text-align: center;
      font-weight: 700;
      margin: 1mm 0;
    }
    .total {
      font-weight: 700;
      font-size: ${Math.round(fontSize * 1.15)}pt;
      margin-top: 1mm;
    }
    .pie {
      text-align: center;
      margin-top: 2mm;
    }
    @media print {
      html, body { width: ${ancho}mm; }
    }
  `
}

function htmlTitle(tickets: TicketData[]): string {
  const labels = tickets.map((t) => {
    switch (t.tipo) {
      case 'boleta':
        return `Boleta ${t.mesa}`
      case 'precuenta':
        return `Precuenta ${t.mesa}`
      case 'cocina':
        return `Cocina ${t.mesa}`
      case 'bar':
        return `Bar ${t.mesa}`
      default:
        return `Comanda ${t.mesa}`
    }
  })
  return labels.join(' · ')
}

// ── Generadores públicos ─────────────────────────────────────────────────────
/**
 * Construye un documento HTML imprimible para un único ticket.
 * El HTML define `@page { size: <ancho>mm auto }` para que el navegador
 * use el ancho exacto del papel configurado (útil en impresoras térmicas).
 */
export function buildTicketHtml(data: TicketData, configIn: Partial<TicketPrintConfig> | TicketPrintConfig): string {
  return buildMultiTicketHtml([data], configIn)
}

/**
 * Construye un documento HTML imprimible que contiene varios tickets en
 * páginas separadas (`page-break-after: always`).
 *
 * Caso de uso principal: KDS doble. Al "Enviar a cocina" desde el POS se
 * generan los tickets físicos de cocina y bar como un único trabajo de
 * impresión, así una sola interacción del usuario imprime ambas copias.
 *
 * Si la lista está vacía, retorna un HTML vacío con un mensaje de aviso.
 */
export function buildMultiTicketHtml(
  tickets: TicketData[],
  configIn: Partial<TicketPrintConfig> | TicketPrintConfig,
): string {
  const cfg = normalizePrintConfig(configIn)
  const validos = tickets.filter(Boolean)
  const styles = buildStyles(cfg)
  const title = validos.length > 0 ? htmlTitle(validos) : 'Ticket'

  const body = validos.length === 0
    ? `<div class="muted center" style="padding:8mm">Sin tickets para imprimir</div>`
    : validos
        .map((t, i) => renderTicketBody(t, cfg, { isLast: i === validos.length - 1 }))
        .join('\n')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
${body}
</body>
</html>`
}

// ── Lectura desde state.configuracion ────────────────────────────────────────
/**
 * Lee la configuración de impresión desde el objeto `Configuracion` global,
 * cayendo a defaults razonables.
 */
export function readPrintConfigFromState(configuracion: any): TicketPrintConfig {
  if (!configuracion || typeof configuracion !== 'object') return { ...DEFAULT_PRINT_CONFIG }
  return normalizePrintConfig({
    ancho_mm: configuracion.impresora_ancho_mm,
    fuente: configuracion.impresora_fuente,
    tamano_fuente_pt: configuracion.impresora_tamano_fuente_pt,
    margen_mm: configuracion.impresora_margen_mm,
    encabezado: configuracion.impresora_encabezado ?? configuracion.encabezadoTicket,
    pie: configuracion.impresora_pie ?? configuracion.pieTicket,
    mostrar_logo: configuracion.impresora_mostrar_logo,
  })
}
