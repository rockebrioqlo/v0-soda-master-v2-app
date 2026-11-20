import { neon, NeonQueryFunction } from '@neondatabase/serverless'
import bcryptjs from 'bcryptjs'
import type { Usuario, Mesa, Producto, Orden, ItemOrden, Pago, Inventario } from './types'
import {
  calcularCobro,
  propinaPermitida,
  repartirCuotas,
  ERRORES_COBRO,
  type ConfigCobro,
  type DescuentoCobro,
  type PropinaCobro,
  type TipoDescuentoCobro,
} from './cobro'
import { ORIGENES_VALIDOS, esEstadoTerminal, type DestinoPatch } from './ordenes-reglas'
import { ESTADOS_ITEM, ESTADOS_ITEM_EDITABLES, type EstadoItem } from './items-reglas'
import { formatCurrency } from './helpers'

// Lazy initialization to avoid build-time errors
let _sql: NeonQueryFunction<false, false> | null = null

function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    _sql = neon(process.env.DATABASE_URL)
  }
  return _sql
}

function toDatabaseMesaEstado(estado?: string | null) {
  if (!estado) return null
  if (!['libre', 'ocupada', 'reservada'].includes(estado)) {
    throw new Error(`Estado de mesa inválido: ${estado}`)
  }
  return estado === 'libre' ? 'disponible' : estado
}

function mapMesa(row: any): Mesa {
  return {
    ...row,
    estado: row.estado === 'disponible' ? 'libre' : row.estado,
  } as Mesa
}

// Hash bcrypt de un valor aleatorio descartado; solo se usa para igualar tiempos en verificarPIN.
const HASH_RELLENO = '$2b$10$icawp9UmJE0PBbIsfgs..e2FY0BvOF5MEZLd8QBGd0kj/gDC3PiJC'

const ROLES_VALIDOS = new Set(['admin', 'administrador', 'mesero', 'cocina', 'bar', 'cajero'])

function mapUsuario(row: any): Usuario {
  const { pin_hash, pinHash, pin, password, roles_adicionales, bloqueado_hasta, fallidos, ...safeUsuario } = row
  const rolesAdicionales: string[] = Array.isArray(roles_adicionales)
    ? roles_adicionales.filter((r) => typeof r === 'string' && ROLES_VALIDOS.has(r))
    : []
  return {
    ...safeUsuario,
    roles_adicionales: rolesAdicionales,
    // Solo getUsuarios trae estos datos (join con intentos_login, sesión 4).
    intentosFallidos: Number(fallidos) || 0,
    bloqueadoHasta: bloqueado_hasta ? new Date(bloqueado_hasta).getTime() : null,
  } as Usuario
}

function normalizarRol(rol?: string | null): string | null {
  if (!rol) return null
  if (rol === 'administrador') return 'admin'
  return rol
}

/**
 * Limpia y deduplica un array de roles adicionales. Excluye el rol
 * principal (no tiene sentido tenerlo dos veces) y los valores
 * inválidos. Si el rol principal es admin/administrador, devolvemos
 * array vacío: el admin ya puede todo.
 */
function normalizarRolesAdicionales(
  rolPrincipal: string | null | undefined,
  raw: unknown,
): string[] {
  if (!Array.isArray(raw)) return []
  const principal = normalizarRol(rolPrincipal || '') || ''
  if (principal === 'admin') return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of raw) {
    if (typeof r !== 'string') continue
    const normalized = normalizarRol(r) || r
    if (!ROLES_VALIDOS.has(normalized)) continue
    if (normalized === principal) continue
    if (normalized === 'admin' || normalized === 'administrador') continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

const METODOS_PAGO_DB = ['efectivo', 'tarjeta']

function normalizarMetodoPago(metodo?: string | null): string {
  if (!metodo) return 'efectivo'
  if (METODOS_PAGO_DB.includes(metodo)) return metodo
  return 'efectivo'
}

function mapPago(row: any): Pago {
  const monto = row.monto !== undefined ? Number(row.monto) : 0
  const propina = row.propina !== undefined ? Number(row.propina) : 0
  const descuento = row.descuento !== undefined && row.descuento !== null ? Number(row.descuento) : 0
  const divididoEn = row.dividido_en !== undefined && row.dividido_en !== null
    ? Number(row.dividido_en)
    : (row.divididoEn ?? 1)
  // C5: campos explícitos (antes `...row` reexportaba toda la fila, incluidas columnas que
  // nadie lee). `created_at` lo lee Reportes (CSV) y `cobrado_por*` identifica al cajero.
  return {
    id: row.id,
    created_at: row.created_at ?? undefined,
    cobrado_por: row.cobrado_por ?? null,
    cobrado_por_nombre: row.cobrado_por_nombre ?? null,
    comandaId: row.orden_id ?? row.comandaId ?? row.ordenId ?? '',
    orden_id: row.orden_id ?? row.ordenId,
    mesa_id: row.mesa_id ?? row.mesaId ?? null,
    mesa_nombre: row.mesa_nombre ?? row.mesaNombre ?? null,
    metodo: row.metodo,
    monto,
    propina,
    vuelto: row.vuelto !== undefined && row.vuelto !== null ? Number(row.vuelto) : undefined,
    referencia: row.referencia ?? undefined,
    aprobado: row.aprobado ?? true,
    descuento,
    divididoEn,
    fecha: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  } as Pago
}

const MODOS_STOCK_VALIDOS = ['producto', 'receta', 'producto_y_receta'] as const

function mapProducto(row: any): Producto {
  const stock = row.stock !== undefined && row.stock !== null ? Number(row.stock) : 0
  const stockMinimo = row.stockMinimo !== undefined && row.stockMinimo !== null
    ? Number(row.stockMinimo)
    : (row.stock_minimo !== undefined && row.stock_minimo !== null ? Number(row.stock_minimo) : 5)
  const modoRaw = row.modo_stock ?? row.modoStock ?? 'producto'
  const modoStock = MODOS_STOCK_VALIDOS.includes(modoRaw) ? modoRaw : 'producto'
  return {
    ...row,
    precio: row.precio !== undefined && row.precio !== null ? Number(row.precio) : 0,
    stock,
    stockMinimo,
    esIngredienteEspecial: row.es_ingrediente_especial === true,
    costoAdicional: row.costo_adicional !== undefined && row.costo_adicional !== null
      ? Number(row.costo_adicional)
      : 0,
    modoStock,
  } as Producto
}

let _itemEstadoReady = false

/**
 * Reemplaza el CHECK constraint legado de `items_orden.estado_item` para que
 * admita el nuevo estado `'entregado'` (entregado por el mesero al cliente).
 * Idempotente: se ejecuta una sola vez por proceso.
 */
/**
 * Asegura que el CHECK constraint de `items_orden.estado_item` admita
 * todos los estados que usa la aplicación (incluyendo 'entregado').
 *
 * Mantener idempotente y a prueba de carreras: en dev, el hot-reload de
 * Next reinicia los flags de módulo, y dos peticiones casi simultáneas
 * pueden pasar el guard `_itemEstadoReady` y disparar DROP + ADD en
 * paralelo. El primero gana, el segundo recibe "constraint already
 * exists". Para evitarlo:
 *   1. corremos DROP + ADD dentro de un DO block (una sola query),
 *   2. y si igual falla por colisión (42P07/42710), lo silenciamos.
 */
async function ensureItemEstadoSchema(): Promise<void> {
  if (_itemEstadoReady) return
  const sql = getSql()
  try {
    await sql`
      DO $$
      BEGIN
        ALTER TABLE soda_master.items_orden
          DROP CONSTRAINT IF EXISTS items_orden_estado_item_check;
        ALTER TABLE soda_master.items_orden
          ADD CONSTRAINT items_orden_estado_item_check
          CHECK (estado_item IN ('pendiente','en_preparacion','listo','entregado','problema'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN duplicate_table THEN NULL;
      END $$;
    `
  } catch (err: any) {
    const code = err?.code || err?.cause?.code
    const msg = (err?.message || '').toLowerCase()
    if (
      code === '42P07' ||
      code === '42710' ||
      msg.includes('already exists')
    ) {
      // Otra request ganó la carrera y dejó el constraint en el estado
      // correcto. Lo damos por bueno.
    } else {
      throw err
    }
  }
  _itemEstadoReady = true
}

let _permisosEspecialesReady = false

/**
 * Permisos "delegados" temporalmente por el admin a otro usuario. Hoy se
 * usa para que el admin pueda autorizar a un CAJERO a abrir comandas en
 * mesas (algo que normalmente sólo hacen meseros/admin) cuando no hay
 * mesero disponible.
 *
 * - `tipo` queda como string libre para que después podamos sumar otros
 *   permisos delegables (ej: cancelar comanda, aplicar descuento extra).
 * - `valido_hasta` controla la vigencia. Pasada esa fecha el permiso
 *   expira automáticamente, sin intervención del admin.
 * - `revocado` permite cortar el permiso antes de tiempo sin perder el
 *   histórico (útil para auditoría).
 */
async function ensurePermisosEspecialesTable(): Promise<void> {
  if (_permisosEspecialesReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.permisos_especiales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id UUID NOT NULL REFERENCES soda_master.usuarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      motivo TEXT NULL,
      otorgado_por UUID NULL,
      otorgado_por_nombre TEXT NULL,
      valido_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
      valido_hasta TIMESTAMPTZ NOT NULL,
      revocado BOOLEAN NOT NULL DEFAULT FALSE,
      revocado_at TIMESTAMPTZ NULL,
      revocado_por UUID NULL,
      revocado_por_nombre TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS permisos_especiales_usuario_idx
      ON soda_master.permisos_especiales (usuario_id, tipo, valido_hasta)
  `
  _permisosEspecialesReady = true
}

let _itemPagoReady = false

/**
 * Agrega las columnas `pagado` y `pago_id` a `items_orden` si no existen.
 * Sirven para registrar pagos PARCIALES: un cliente que se va antes y paga
 * sólo lo que consumió marca sólo sus items como `pagado=true`, mientras
 * que el resto de la mesa sigue con `pagado=false`. La orden completa pasa
 * a estado `'pagado'` recién cuando todos sus items lo están.
 * Idempotente: se ejecuta una sola vez por proceso.
 */
async function ensureItemPagoSchema(): Promise<void> {
  if (_itemPagoReady) return
  const sql = getSql()
  await sql`
    ALTER TABLE soda_master.items_orden
      ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT FALSE
  `
  await sql`
    ALTER TABLE soda_master.items_orden
      ADD COLUMN IF NOT EXISTS pago_id UUID NULL
  `
  // C6: los cobros y el KDS buscan los ítems de una orden por (orden_id, pagado)
  await sql`
    CREATE INDEX IF NOT EXISTS items_orden_orden_pagado_idx
      ON soda_master.items_orden (orden_id, pagado)
  `
  _itemPagoReady = true
}

let _ordenEstadoReady = false

/**
 * Mismo concepto para `ordenes.estado`: agrega `'entregado'` como estado
 * válido (cuando todos los items de la orden fueron entregados al cliente,
 * pero todavía no se cobró).
 */
async function ensureOrdenEstadoSchema(): Promise<void> {
  if (_ordenEstadoReady) return
  const sql = getSql()
  try {
    await sql`
      DO $$
      BEGIN
        ALTER TABLE soda_master.ordenes
          DROP CONSTRAINT IF EXISTS ordenes_estado_check;
        ALTER TABLE soda_master.ordenes
          ADD CONSTRAINT ordenes_estado_check
          CHECK (estado IN ('pendiente','en_cocina','en_preparacion','listo','entregado','problema','pagado','cancelado','perdida'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN duplicate_table THEN NULL;
      END $$;
    `
  } catch (err: any) {
    const code = err?.code || err?.cause?.code
    const msg = (err?.message || '').toLowerCase()
    if (
      code === '42P07' ||
      code === '42710' ||
      msg.includes('already exists')
    ) {
      // Igual que arriba: si otra request paralela ya dejó el constraint
      // bien, no es un error real.
    } else {
      throw err
    }
  }
  _ordenEstadoReady = true
}

let _pagoSchemaReady = false

/**
 * Cobro seguro (sesión 5). Idempotente:
 *  - `pagos.cobrado_por` / `cobrado_por_nombre`: quién cobró (sale de la sesión).
 *  - función `soda_master.assert_cobro(cond, codigo)`: aborta la transacción
 *    con SQLSTATE `SM409` y el código como mensaje. El driver HTTP de Neon no
 *    permite lógica entre los statements de `sql.transaction([...])`, así que
 *    las verificaciones del cobro (orden ya pagada, ítems ya reclamados,
 *    caja cerrada…) viven dentro del propio SQL.
 */
async function ensurePagoSchema(): Promise<void> {
  if (_pagoSchemaReady) return
  const sql = getSql()
  await sql`ALTER TABLE soda_master.pagos ADD COLUMN IF NOT EXISTS cobrado_por UUID NULL`
  await sql`ALTER TABLE soda_master.pagos ADD COLUMN IF NOT EXISTS cobrado_por_nombre TEXT NULL`
  try {
    await sql`
      CREATE OR REPLACE FUNCTION soda_master.assert_cobro(cond boolean, codigo text)
      RETURNS boolean LANGUAGE plpgsql AS $fn$
      BEGIN
        IF cond IS NOT TRUE THEN
          RAISE EXCEPTION '%', codigo USING ERRCODE = 'SM409';
        END IF;
        RETURN TRUE;
      END
      $fn$
    `
  } catch (err) {
    // Dos instancias creándola a la vez: si ya existe, está bien.
    const rows = (await sql`
      SELECT 1 AS ok FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'soda_master' AND p.proname = 'assert_cobro'
    `) as any[]
    if (rows.length === 0) throw err
  }
  _pagoSchemaReady = true
}

/** Error de negocio de ítems de orden (candado de cobro): la ruta usa `status`. */
export class ErrorItemOrden extends Error {
  codigo: string
  status: number
  constructor(codigo: string, status: number, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorItemOrden'
    this.codigo = codigo
    this.status = status
  }
}

/**
 * Error de negocio de órdenes (sesión 6): lleva el estado HTTP y un código
 * estable para que la interfaz pueda mostrar un mensaje accionable.
 */
export class ErrorOrden extends Error {
  codigo: string
  status: number
  constructor(codigo: string, status: number, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorOrden'
    this.codigo = codigo
    this.status = status
  }
}

/** Códigos que `assert_cobro` puede abortar dentro de las transacciones de órdenes e ítems. */
const ERRORES_TX_ORDEN: Record<string, { status: number; mensaje: string }> = {
  ORDEN_NO_ENCONTRADA: { status: 404, mensaje: 'La orden no existe.' },
  ITEM_NO_ENCONTRADO: { status: 404, mensaje: 'El ítem no existe.' },
  ORDEN_NO_ACTIVA: {
    status: 409,
    mensaje: 'La orden ya no está activa (pagada, cancelada o perdida) y no se puede modificar.',
  },
  ORDEN_CON_ITEMS_PAGADOS: {
    status: 409,
    mensaje: 'La orden tiene ítems pagados: no se puede cancelar ni borrar.',
  },
  ORDEN_AJENA: {
    status: 403,
    mensaje: 'Solo el administrador puede borrar una orden abierta por otra persona.',
  },
  ORDEN_CON_ITEMS_AVANZADOS: {
    status: 409,
    mensaje: 'La cocina ya empezó a preparar esta orden: solo el administrador puede borrarla.',
  },
  ITEM_PAGADO: { status: 409, mensaje: 'Este ítem ya fue pagado y no se puede modificar.' },
  // Sesión 7: asignaciones por persona, pérdidas y cobro retroactivo.
  ITEM_AJENO: { status: 400, mensaje: 'Alguno de los ítems no pertenece a esta orden.' },
  PERSONA_AJENA: { status: 400, mensaje: 'Alguna de las personas no pertenece a esta orden.' },
  PERSONA_ELIMINADA: {
    status: 409,
    mensaje: 'Una de las personas ya no existe en esta orden. Se recargó la pantalla: revisa y vuelve a asignar.',
  },
  PERSONA_NO_ENCONTRADA: { status: 404, mensaje: 'La persona no existe.' },
  ITEMS_CAMBIARON: {
    status: 409,
    mensaje: 'Las cuentas de la mesa cambiaron mientras guardabas (otro guardado, un cobro o un cambio en los ítems). Se recargó la pantalla: revisa y vuelve a asignar.',
  },
  ORDEN_YA_PAGADA: { status: 409, mensaje: 'La orden ya está pagada: no aplica como perro muerto.' },
  ORDEN_CANCELADA: { status: 409, mensaje: 'La orden está cancelada: no se puede marcar como pérdida.' },
  PERDIDA_YA_REGISTRADA: { status: 409, mensaje: 'La orden ya está marcada como pérdida.' },
  SIN_ITEMS_POR_COBRAR: {
    status: 409,
    mensaje: 'No quedan ítems por cobrar en esta orden: no aplica como perro muerto.',
  },
  ORDEN_CAMBIO: {
    status: 409,
    mensaje: 'La orden cambió mientras registrabas la pérdida (ítems o descuento). Se recargó la pantalla: revisa e intenta de nuevo.',
  },
  PERDIDA_NO_ENCONTRADA: { status: 404, mensaje: 'La pérdida no existe.' },
  PERDIDA_YA_RESUELTA: { status: 409, mensaje: 'Esta pérdida ya fue cobrada retroactivamente.' },
  // Sesión 8: orden + ítems en una transacción, stock todo-o-nada.
  MESA_NO_ENCONTRADA: { status: 404, mensaje: 'La mesa no existe.' },
  COMANDA_ACTIVA: { status: 409, mensaje: 'Ya existe una comanda activa para esta mesa' },
  STOCK_INSUFICIENTE: { status: 409, mensaje: 'Stock insuficiente para enviar la comanda.' },
  ORDEN_MODIFICADA: {
    status: 409,
    mensaje: 'La orden cambió mientras guardabas (otro mesero, un cobro o un descuento). Se recargó la pantalla: revisa e intenta de nuevo.',
  },
  // Sesión 9: integridad de cobros y pérdidas.
  PERSONA_CON_ITEMS_PAGADOS: {
    status: 409,
    mensaje: 'Esta persona ya pagó ítems y no se puede eliminar, porque se perdería quién pagó qué. Puedes renombrarla o dejarla sin consumo pendiente.',
  },
  MONTO_EXCEDE_PERDIDA: {
    status: 400,
    mensaje: 'El monto no puede superar lo registrado de la pérdida.',
  },
  MOTIVO_REQUERIDO: {
    status: 400,
    mensaje: 'Si cobras menos de lo registrado, indica el motivo (mínimo 3 caracteres).',
  },
  CAJA_CERRADA: ERRORES_COBRO.CAJA_CERRADA,
  // Sesión 12: descuentos y prorrateo (B4, F17).
  ORDEN_CON_COBROS: {
    status: 409,
    mensaje: 'La orden ya tiene cobros; usa un descuento de monto fijo',
  },
  // Sesión 13: estado de los ítems y de la orden (B5, F11).
  TRANSICION_ITEM_INVALIDA: {
    status: 409,
    mensaje: 'El ítem cambió de estado mientras tanto y ya no se puede pasar a ese estado. Se recargó la pantalla.',
  },
  ITEM_YA_PREPARADO: {
    status: 409,
    mensaje: 'Cocina ya empezó a preparar este ítem: no se puede cambiar su cantidad, extras ni notas. Bórralo y agrégalo de nuevo si hace falta.',
  },
  // Sesión 11: inventario con unidad de compra y de consumo.
  INSUMO_NO_ENCONTRADO: { status: 404, mensaje: 'El insumo no existe o está dado de baja.' },
  CANTIDAD_INVALIDA: {
    status: 400,
    mensaje: 'La cantidad convertida a unidad de consumo debe ser mayor que 0 y menor que 1.000.000.000.',
  },
  PROVEEDOR_NO_ENCONTRADO: { status: 400, mensaje: 'El proveedor no existe.' },
  UNIDAD_EN_USO: {
    status: 409,
    mensaje:
      'No se puede cambiar la unidad de consumo de un insumo con stock, recetas o movimientos: no hay conversión automática. Crea un insumo nuevo con la otra unidad.',
  },
}

/** Estados de una orden que todavía se puede modificar (ni pagada, ni cancelada, ni perdida). */
const ESTADOS_ORDEN_ACTIVA = ['pendiente', 'en_cocina', 'en_preparacion', 'listo', 'entregado', 'problema']

/** F41: las órdenes ya pagadas solo siguen en el KDS si se cobraron hace menos de estas horas... */
export const VENTANA_PAGADAS_KDS_HORAS = 2
/** ...y como máximo esta cantidad (las más recientes). */
export const TOPE_PAGADAS_KDS = 30

let _estadoOrdenFnReady = false

/**
 * Sesión 13 (B5): `soda_master.recalcular_estado_orden(orden)` deja el estado de la orden según el
 * peor estado de sus ítems (ver `lib/items-reglas.ts`) y devuelve `(estado_anterior, estado_nuevo)`.
 * Es una función SQL para poder usarla DENTRO de `sql.transaction([...])` (el driver HTTP no deja
 * decidir en JS entre statements): cualquier operación que cambie un ítem o el conjunto de ítems la
 * agrega a su lote, con la orden ya bloqueada, y así todas calculan igual. Idempotente.
 */
async function ensureEstadoOrdenFuncion(): Promise<void> {
  if (_estadoOrdenFnReady) return
  await ensurePagoSchema()
  const sql = getSql()
  try {
    await sql`
      CREATE OR REPLACE FUNCTION soda_master.recalcular_estado_orden(p_orden uuid)
      RETURNS TABLE(estado_anterior text, estado_nuevo text) LANGUAGE plpgsql AS $fn$
      DECLARE
        v_actual text;
        v_nuevo text;
      BEGIN
        SELECT o.estado INTO v_actual FROM soda_master.ordenes o WHERE o.id = p_orden;
        IF v_actual IS NULL THEN
          RETURN;
        END IF;
        v_nuevo := v_actual;
        IF v_actual IN ('en_cocina', 'en_preparacion', 'listo', 'entregado', 'problema') THEN
          SELECT CASE
                   WHEN COUNT(*) = 0 THEN NULL
                   WHEN BOOL_OR(i.estado_item = 'problema') THEN 'problema'
                   WHEN BOOL_OR(i.estado_item = 'en_preparacion') THEN 'en_preparacion'
                   WHEN BOOL_OR(COALESCE(i.estado_item, 'pendiente') = 'pendiente') THEN 'en_cocina'
                   WHEN BOOL_AND(i.estado_item = 'entregado') THEN 'entregado'
                   ELSE 'listo'
                 END
            INTO v_nuevo
            FROM soda_master.items_orden i WHERE i.orden_id = p_orden;
          IF v_nuevo IS NULL THEN
            v_nuevo := v_actual;
          END IF;
          IF v_nuevo <> v_actual THEN
            UPDATE soda_master.ordenes SET estado = v_nuevo, updated_at = CURRENT_TIMESTAMP
             WHERE id = p_orden;
          END IF;
        END IF;
        estado_anterior := v_actual;
        estado_nuevo := v_nuevo;
        RETURN NEXT;
      END
      $fn$
    `
  } catch (err) {
    // Dos instancias creándola a la vez: si ya existe, está bien.
    const rows = (await sql`
      SELECT 1 AS ok FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'soda_master' AND p.proname = 'recalcular_estado_orden'
    `) as any[]
    if (rows.length === 0) throw err
  }
  _estadoOrdenFnReady = true
}

/** Statement que recalcula el estado de la orden (va DESPUÉS de bloquearla y de cambiar ítems). */
function sentenciaRecalcularEstado(sql: Sql, ordenId: string) {
  return sql`SELECT estado_anterior, estado_nuevo FROM soda_master.recalcular_estado_orden(${ordenId}::uuid)`
}

/** Traduce un aborto `SM409` de `assert_cobro` a `ErrorOrden`; otros errores se relanzan. */
function traducirErrorTx(err: any, mensajes?: Record<string, string>): never {
  const texto = `${err?.message ?? ''} ${err?.code ?? ''}`
  if (err?.code === 'SM409' || texto.includes('SM409')) {
    const codigo = Object.keys(ERRORES_TX_ORDEN).find((c) => texto.includes(c))
    if (codigo) {
      const def = ERRORES_TX_ORDEN[codigo]
      throw new ErrorOrden(codigo, def.status, mensajes?.[codigo] ?? def.mensaje)
    }
  }
  throw err
}

let _itemPrecioReady = false

/** `items_orden.precio_manual`: el admin fijó el precio a mano (no se recalcula al editar extras). */
async function ensureItemPrecioSchema(): Promise<void> {
  if (_itemPrecioReady) return
  const sql = getSql()
  await sql`
    ALTER TABLE soda_master.items_orden
    ADD COLUMN IF NOT EXISTS precio_manual BOOLEAN NOT NULL DEFAULT FALSE
  `
  _itemPrecioReady = true
}

/** Error de negocio del cobro: la ruta lo traduce a su estado HTTP. */
export class ErrorCobro extends Error {
  codigo: string
  detalle?: Record<string, unknown>
  constructor(codigo: string, mensaje?: string, detalle?: Record<string, unknown>) {
    super(mensaje || codigo)
    this.name = 'ErrorCobro'
    this.codigo = codigo
    this.detalle = detalle
  }
}

// ════════════════════════════════════════════════════════════════════
// Sesión 8: orden + ítems en una transacción, stock todo-o-nada y devolución
// (R7, #11, B1, F10). Mismo patrón de las sesiones 5 a 7: lectura previa y
// cálculo en JS, y una `sql.transaction([...])` cuyo primer statement bloquea
// la orden (o la mesa, si la orden aún no existe). Las verificaciones van en
// `assert_cobro`. Orden de bloqueo único en todas las operaciones: orden/mesa
// → ingredientes por id ascendente → inventario por producto ascendente.
// ════════════════════════════════════════════════════════════════════

type Sql = ReturnType<typeof getSql>

const redondear3 = (n: number) => Math.round(n * 1000) / 1000

let _ordenesAtomicasReady = false

/**
 * Idempotente. Deja listo `movimientos_inventario` (con el tipo `devolucion`,
 * vía `ensureRecetasTables`), un índice por ítem para leer el neto de stock y
 * el índice único parcial "una sola orden activa por mesa" (red de seguridad
 * de B1; si ya hubiera mesas con dos órdenes activas no se crea, se avisa en
 * el log y el lock de la mesa sigue protegiendo).
 */
async function ensureOrdenesAtomicasSchema(): Promise<void> {
  if (_ordenesAtomicasReady) return
  await ensureRecetasTables()
  await ensureItemPagoSchema()
  await ensureItemPrecioSchema()
  await ensurePagoSchema()
  const sql = getSql()
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS movimientos_inventario_item_idx
        ON soda_master.movimientos_inventario (item_orden_id)
        WHERE item_orden_id IS NOT NULL
    `
  } catch (err) {
    console.error('[ordenes] índice movimientos_inventario_item_idx:', err)
  }
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS ordenes_mesa_activa_uk
        ON soda_master.ordenes (mesa_id)
        WHERE mesa_id IS NOT NULL AND estado NOT IN ('pagado', 'cancelado', 'perdida')
    `
  } catch (err) {
    console.error(
      '[ordenes] no se pudo crear ordenes_mesa_activa_uk (¿hay mesas con dos órdenes activas?):',
      (err as any)?.message ?? err,
    )
  }
  _ordenesAtomicasReady = true
}

type LineaReceta = {
  ingredienteId: string
  cantidad: number
  /** Rendimiento del insumo en % (sesión 11): 75 → para 150 de receta se descuentan 200. */
  rendimiento: number
  opcional: boolean
  extra: boolean
  nombre: string
}
type DefProducto = { id: string; nombre: string; modo: string; lineas: LineaReceta[] }
/** Cuánto stock pide algo: ingredientes (por id) y productos vendibles (por id de producto). */
type Demanda = { ingredientes: Map<string, number>; productos: Map<string, number> }
type ExtraItem = { ingrediente_id: string; cantidad: number }

/** Producto + receta activa de cada producto (modo de stock y líneas). 404 si falta alguno. */
async function leerDefProductos(ids: string[]): Promise<Map<string, DefProducto>> {
  const sql = getSql()
  const unicos = Array.from(new Set(ids))
  const [prods, lineas] = (await Promise.all([
    sql`
      SELECT id::text AS id, nombre, COALESCE(modo_stock, 'producto') AS modo_stock
      FROM soda_master.productos WHERE id = ANY(${unicos}::uuid[])
    `,
    sql`
      SELECT r.producto_id::text AS producto_id, ri.ingrediente_id::text AS ingrediente_id,
             ri.cantidad, ri.opcional, ri.extra, ri.nombre_display, i.nombre AS ingrediente_nombre,
             i.rendimiento_pct
      FROM soda_master.recetas r
      JOIN soda_master.receta_ingredientes ri ON ri.receta_id = r.id
      JOIN soda_master.ingredientes i ON i.id = ri.ingrediente_id
      WHERE r.producto_id = ANY(${unicos}::uuid[]) AND r.activo = true AND i.activo = true
    `,
  ])) as any[][]
  const mapa = new Map<string, DefProducto>()
  for (const p of prods) {
    mapa.set(p.id, { id: p.id, nombre: p.nombre, modo: String(p.modo_stock || 'producto'), lineas: [] })
  }
  for (const id of unicos) {
    if (!mapa.has(id.toLowerCase()) && !mapa.has(id)) {
      throw new ErrorOrden('PRODUCTO_NO_ENCONTRADO', 404, 'Producto no encontrado')
    }
  }
  for (const l of lineas) {
    mapa.get(l.producto_id)?.lineas.push({
      ingredienteId: l.ingrediente_id,
      cantidad: Number(l.cantidad),
      rendimiento: Number(l.rendimiento_pct) > 0 ? Number(l.rendimiento_pct) : 100,
      opcional: l.opcional === true,
      extra: l.extra === true,
      nombre: String(l.nombre_display || l.ingrediente_nombre || '').trim().toLowerCase(),
    })
  }
  return mapa
}

/**
 * Stock que consume un ítem (misma regla que tenía `crearItemOrden`): líneas
 * base siempre; opcionales si el nombre coincide con un modificador; extras si
 * están elegidos (cantidad del extra × cantidad de la línea × cantidad del ítem).
 */
function necesidadItem(
  def: DefProducto,
  cantidad: number,
  mods: string[],
  extras: ExtraItem[],
): Demanda {
  const ingredientes = new Map<string, number>()
  const productos = new Map<string, number>()
  const sumar = (id: string, q: number) => {
    if (!id || !(q > 0)) return
    ingredientes.set(id, redondear3((ingredientes.get(id) || 0) + q))
  }
  if (def.modo === 'receta' || def.modo === 'producto_y_receta') {
    const modsNorm = mods.map((m) => m.trim().toLowerCase())
    for (const l of def.lineas) {
      // Rendimiento (sesión 11): la receta pide cantidad ya procesada; del stock
      // sale lo crudo. Multiplicar por 100 antes de dividir evita errores de
      // coma flotante en los casos exactos (150 × 100 / 75 = 200).
      const lineQty = (l.cantidad * cantidad * 100) / l.rendimiento
      if (l.extra) {
        const sel = extras.find((e) => e.ingrediente_id.toLowerCase() === l.ingredienteId.toLowerCase())
        if (sel) sumar(l.ingredienteId, lineQty * sel.cantidad)
      } else if (l.opcional) {
        if (l.nombre && modsNorm.some((m) => m === l.nombre || m.includes(l.nombre) || l.nombre.includes(m))) {
          sumar(l.ingredienteId, lineQty)
        }
      } else {
        sumar(l.ingredienteId, lineQty)
      }
    }
  }
  if (def.modo === 'producto' || def.modo === 'producto_y_receta') {
    productos.set(def.id, cantidad)
  }
  return { ingredientes, productos }
}

function sumarDemandas(lista: Demanda[]): Demanda {
  const total: Demanda = { ingredientes: new Map(), productos: new Map() }
  for (const d of lista) {
    for (const [id, q] of d.ingredientes) total.ingredientes.set(id, redondear3((total.ingredientes.get(id) || 0) + q))
    for (const [id, q] of d.productos) total.productos.set(id, redondear3((total.productos.get(id) || 0) + q))
  }
  return total
}

/**
 * Statements que ajustan el stock. Cantidad positiva = descuenta con guarda
 * (`stock_actual >= cantidad`; si no alcanza, aborta TODA la transacción con
 * STOCK_INSUFICIENTE); negativa = devuelve. Siempre en orden ascendente de id.
 */
function sentenciasAjusteStock(sql: Sql, d: Demanda): any[] {
  const out: any[] = []
  for (const id of Array.from(d.ingredientes.keys()).sort()) {
    const q = d.ingredientes.get(id)!
    if (q > 0) {
      out.push(sql`
        WITH u AS (
          UPDATE soda_master.ingredientes
          SET stock_actual = stock_actual - ${q}::numeric, updated_at = now()
          WHERE id = ${id}::uuid AND stock_actual >= ${q}::numeric
          RETURNING id
        )
        SELECT soda_master.assert_cobro((SELECT COUNT(*) FROM u) = 1, 'STOCK_INSUFICIENTE')`)
    } else if (q < 0) {
      out.push(sql`
        UPDATE soda_master.ingredientes
        SET stock_actual = stock_actual + ${-q}::numeric, updated_at = now()
        WHERE id = ${id}::uuid`)
    }
  }
  for (const id of Array.from(d.productos.keys()).sort()) {
    const q = d.productos.get(id)!
    if (q > 0) {
      out.push(sql`
        WITH u AS (
          UPDATE soda_master.inventario
          SET stock_actual = stock_actual - ${q}::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE producto_id = ${id}::uuid AND stock_actual >= ${q}::numeric
          RETURNING id
        )
        SELECT soda_master.assert_cobro((SELECT COUNT(*) FROM u) = 1, 'STOCK_INSUFICIENTE')`)
    } else if (q < 0) {
      out.push(sql`
        UPDATE soda_master.inventario
        SET stock_actual = stock_actual + ${-q}::numeric, updated_at = CURRENT_TIMESTAMP
        WHERE producto_id = ${id}::uuid`)
    }
  }
  return out
}

type FilaMovimiento = {
  ingrediente_id: string | null
  producto_id: string | null
  item_orden_id: string
  cantidad: number
}

/** Una sola inserción de varios movimientos de inventario (la cantidad siempre positiva). */
function sentenciaMovimientos(
  sql: Sql,
  tipo: 'venta' | 'devolucion',
  ordenId: string,
  filas: FilaMovimiento[],
  nota: string,
) {
  return sql`
    INSERT INTO soda_master.movimientos_inventario
      (ingrediente_id, producto_id, tipo, cantidad, orden_id, item_orden_id, notas)
    SELECT x.ingrediente_id, x.producto_id, ${tipo}::text, x.cantidad, ${ordenId}::uuid, x.item_orden_id, ${nota}::text
    FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb)
      AS x(ingrediente_id uuid, producto_id uuid, item_orden_id uuid, cantidad numeric)`
}

/**
 * Devolución de stock al borrar o cancelar (F10). Lee del registro de
 * movimientos el neto de cada ítem (ventas menos devoluciones) y lo devuelve
 * a ingredientes e inventario en el mismo statement que lo registra:
 *  - ítems `pendiente` (la cocina aún no los tocó): se devuelve y queda un
 *    movimiento `devolucion`;
 *  - ítems en preparación, listos o entregados: la comida ya se hizo, no se
 *    devuelve y queda un movimiento `merma` (informativo; el stock ya estaba
 *    descontado).
 * Un ítem sin registro (anterior a la sesión 8 o derivado de una división de
 * cuenta) no devuelve nada. Antes se bloquean las filas de stock en orden.
 */
function sentenciasRetornoStock(sql: Sql, ordenId: string, itemId: string | null, nota: string): any[] {
  const O = ordenId
  const I = itemId
  return [
    sql`
      SELECT i.id FROM soda_master.ingredientes i
      WHERE i.id IN (
        SELECT m.ingrediente_id FROM soda_master.movimientos_inventario m
        JOIN soda_master.items_orden it ON it.id = m.item_orden_id
        WHERE it.orden_id = ${O}::uuid AND (${I}::uuid IS NULL OR it.id = ${I}::uuid)
          AND COALESCE(it.estado_item, 'pendiente') = 'pendiente'
          AND m.ingrediente_id IS NOT NULL AND m.tipo IN ('venta', 'devolucion'))
      ORDER BY i.id FOR UPDATE`,
    sql`
      SELECT v.id FROM soda_master.inventario v
      WHERE v.producto_id IN (
        SELECT m.producto_id FROM soda_master.movimientos_inventario m
        JOIN soda_master.items_orden it ON it.id = m.item_orden_id
        WHERE it.orden_id = ${O}::uuid AND (${I}::uuid IS NULL OR it.id = ${I}::uuid)
          AND COALESCE(it.estado_item, 'pendiente') = 'pendiente'
          AND m.ingrediente_id IS NULL AND m.tipo IN ('venta', 'devolucion'))
      ORDER BY v.producto_id FOR UPDATE`,
    sql`
      WITH netos AS (
        SELECT m.item_orden_id, m.ingrediente_id, m.producto_id,
               SUM(CASE WHEN m.tipo = 'venta' THEN m.cantidad ELSE -m.cantidad END) AS neto
        FROM soda_master.movimientos_inventario m
        JOIN soda_master.items_orden it ON it.id = m.item_orden_id
        WHERE it.orden_id = ${O}::uuid AND (${I}::uuid IS NULL OR it.id = ${I}::uuid)
          AND COALESCE(it.estado_item, 'pendiente') = 'pendiente'
          AND m.tipo IN ('venta', 'devolucion')
        GROUP BY m.item_orden_id, m.ingrediente_id, m.producto_id
        HAVING SUM(CASE WHEN m.tipo = 'venta' THEN m.cantidad ELSE -m.cantidad END) > 0
      ),
      por_ing AS (
        SELECT ingrediente_id, SUM(neto) AS qty FROM netos
        WHERE ingrediente_id IS NOT NULL GROUP BY ingrediente_id
      ),
      por_prod AS (
        SELECT producto_id, SUM(neto) AS qty FROM netos
        WHERE ingrediente_id IS NULL GROUP BY producto_id
      ),
      u_ing AS (
        UPDATE soda_master.ingredientes i
        SET stock_actual = i.stock_actual + por_ing.qty, updated_at = now()
        FROM por_ing WHERE i.id = por_ing.ingrediente_id
        RETURNING i.id
      ),
      u_prod AS (
        UPDATE soda_master.inventario v
        SET stock_actual = v.stock_actual + por_prod.qty, updated_at = CURRENT_TIMESTAMP
        FROM por_prod WHERE v.producto_id = por_prod.producto_id
        RETURNING v.id
      )
      INSERT INTO soda_master.movimientos_inventario
        (ingrediente_id, producto_id, tipo, cantidad, orden_id, item_orden_id, notas)
      SELECT ingrediente_id, producto_id, 'devolucion', neto, ${O}::uuid, item_orden_id, ${nota}::text
      FROM netos`,
    sql`
      INSERT INTO soda_master.movimientos_inventario
        (ingrediente_id, producto_id, tipo, cantidad, orden_id, item_orden_id, notas)
      SELECT m.ingrediente_id, m.producto_id, 'merma',
             SUM(CASE WHEN m.tipo = 'venta' THEN m.cantidad ELSE -m.cantidad END),
             ${O}::uuid, m.item_orden_id, ${nota + ' (ya preparado: no se devuelve)'}::text
      FROM soda_master.movimientos_inventario m
      JOIN soda_master.items_orden it ON it.id = m.item_orden_id
      WHERE it.orden_id = ${O}::uuid AND (${I}::uuid IS NULL OR it.id = ${I}::uuid)
        AND COALESCE(it.estado_item, 'pendiente') <> 'pendiente'
        AND m.tipo IN ('venta', 'devolucion')
      GROUP BY m.item_orden_id, m.ingrediente_id, m.producto_id
      HAVING SUM(CASE WHEN m.tipo = 'venta' THEN m.cantidad ELSE -m.cantidad END) > 0`,
  ]
}

/** Mensaje accionable de STOCK_INSUFICIENTE: lista TODO lo que falta, leído después del aborto. */
async function mensajeStockInsuficiente(d: Demanda): Promise<string> {
  const sql = getSql()
  const ids = Array.from(d.ingredientes.keys())
  const pids = Array.from(d.productos.keys())
  const [ing, prod] = (await Promise.all([
    ids.length
      ? sql`SELECT id::text AS id, nombre, unidad_medida, stock_actual FROM soda_master.ingredientes WHERE id = ANY(${ids}::uuid[])`
      : Promise.resolve([]),
    pids.length
      ? sql`
          SELECT p.id::text AS id, p.nombre, COALESCE(v.stock_actual, 0) AS stock_actual
          FROM soda_master.productos p
          LEFT JOIN soda_master.inventario v ON v.producto_id = p.id
          WHERE p.id = ANY(${pids}::uuid[])`
      : Promise.resolve([]),
  ])) as any[][]
  const faltan: string[] = []
  for (const r of ing) {
    const pide = d.ingredientes.get(r.id) ?? 0
    const hay = Number(r.stock_actual)
    if (hay < pide) {
      faltan.push(`${r.nombre} (faltan ${Math.ceil((pide - hay) * 1000) / 1000} ${r.unidad_medida || 'unidad'})`)
    }
  }
  for (const r of prod) {
    const pide = d.productos.get(r.id) ?? 0
    const hay = Number(r.stock_actual)
    if (hay < pide) faltan.push(`${r.nombre} (faltan ${Math.ceil((pide - hay) * 1000) / 1000} unidad)`)
  }
  return faltan.length > 0
    ? `Stock insuficiente: ${faltan.join(', ')}`
    : 'Stock insuficiente: otro pedido usó el stock mientras enviabas. Intenta de nuevo.'
}

/**
 * Traduce el error de una transacción de órdenes: stock insuficiente con la
 * lista de lo que falta, índice único de mesa activa y los códigos de
 * `assert_cobro`. Cualquier otro error se relanza.
 */
async function errorDeTransaccionOrden(err: any, demanda: Demanda | null): Promise<never> {
  const texto = `${err?.message ?? ''} ${err?.code ?? ''}`
  if (err?.code === '23505' && texto.includes('ordenes_mesa_activa_uk')) {
    throw new ErrorOrden('COMANDA_ACTIVA', 409, ERRORES_TX_ORDEN.COMANDA_ACTIVA.mensaje)
  }
  if (demanda && (err?.code === 'SM409' || texto.includes('SM409')) && texto.includes('STOCK_INSUFICIENTE')) {
    throw new ErrorOrden('STOCK_INSUFICIENTE', 409, await mensajeStockInsuficiente(demanda))
  }
  return traducirErrorTx(err)
}

/** Reintenta si la orden cambió entre la lectura y el bloqueo, o ante un deadlock/serialización. */
async function conReintento<T>(fn: () => Promise<T>, max = 6): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await fn()
    } catch (err: any) {
      const reintentable =
        (err instanceof ErrorOrden && err.codigo === 'ORDEN_MODIFICADA') ||
        err?.code === '40P01' ||
        err?.code === '40001'
      if (!reintentable || intento >= max) throw err
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 90 * intento))
    }
  }
}

type ItemParaTotales = { id: string; cantidad: number; precio: number }
type ContextoTotales = {
  items: ItemParaTotales[]
  descuento: DescuentoCobro
  config: ConfigCobro
}

/** Ítems, descuento y configuración con los que se calculan los montos de una orden. */
async function leerContextoTotales(ordenId: string | null): Promise<ContextoTotales> {
  const sql = getSql()
  const [itemRows, descRows, cfgRows] = (await Promise.all([
    ordenId
      ? sql`SELECT id::text AS id, cantidad, precio_unitario FROM soda_master.items_orden WHERE orden_id = ${ordenId}::uuid`
      : Promise.resolve([]),
    ordenId
      ? sql`
          SELECT tipo, valor FROM soda_master.descuentos
          WHERE orden_id = ${ordenId}::uuid ORDER BY created_at DESC LIMIT 1`
      : Promise.resolve([]),
    sql`
      SELECT clave, valor, tipo FROM soda_master.configuracion
      WHERE clave IN ('tasa_impuesto','impuesto_habilitado','propinas_habilitadas','precios_incluyen_iva')`,
  ])) as any[][]
  const cfg: Record<string, any> = {}
  for (const r of cfgRows) cfg[r.clave] = parseConfigValor(r.valor, r.tipo)
  const desc = descRows[0]
  return {
    items: itemRows.map((r: any) => ({
      id: String(r.id),
      cantidad: Number(r.cantidad) || 0,
      precio: Number(r.precio_unitario) || 0,
    })),
    descuento: desc
      ? { tipo: desc.tipo as TipoDescuentoCobro, valor: Number(desc.valor) || 0 }
      : { tipo: null, valor: 0 },
    config: {
      impuestoHabilitado: cfg.impuesto_habilitado === true,
      tasaImpuesto: Number(cfg.tasa_impuesto) || 0,
      propinasHabilitadas: cfg.propinas_habilitadas !== false,
      preciosIncluyenIva: cfg.precios_incluyen_iva !== false,
    },
  }
}

/**
 * Montos de la orden completa con una lista de ítems dada (sesión 12, B4): el total es el
 * del descuento de la orden (`descuentoDeOrden`) sobre todos los ítems vigentes, igual a
 * la suma de los cobros cuando el descuento existía antes del primero.
 */
function totalesDe(ctx: ContextoTotales, items: Array<{ cantidad: number; precio: number }>) {
  return calcularCobro({
    items: items.map((i) => ({ precio: i.precio, cantidad: i.cantidad })),
    subtotalOrden: items.reduce((s, i) => s + i.precio * i.cantidad, 0),
    descuento: ctx.descuento,
    config: ctx.config,
  })
}

/**
 * Guarda de huella: dentro de la transacción (con la orden ya bloqueada)
 * verifica que ítems, suma y descuento sean los que se leyeron para calcular
 * los montos. Si otro cambio los movió → ORDEN_MODIFICADA y se reintenta.
 */
function sentenciaHuellaOrden(sql: Sql, ordenId: string, ctx: ContextoTotales) {
  const O = ordenId
  const suma = ctx.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  return sql`
    SELECT soda_master.assert_cobro(
      (SELECT COUNT(*) FROM soda_master.items_orden WHERE orden_id = ${O}::uuid) = ${ctx.items.length}::int
      AND ABS(COALESCE((SELECT SUM(precio_unitario * cantidad) FROM soda_master.items_orden
                         WHERE orden_id = ${O}::uuid), 0) - ${suma}::numeric) < 0.01
      AND (SELECT tipo FROM soda_master.descuentos WHERE orden_id = ${O}::uuid
            ORDER BY created_at DESC LIMIT 1) IS NOT DISTINCT FROM ${ctx.descuento.tipo}::text
      AND COALESCE((SELECT valor FROM soda_master.descuentos WHERE orden_id = ${O}::uuid
                     ORDER BY created_at DESC LIMIT 1), 0) = ${ctx.descuento.valor}::numeric,
      'ORDEN_MODIFICADA')`
}

/**
 * Red de seguridad al cerrar una orden (sesión 12, B4). Con el prorrateo nuevo, Σ pagos
 * debe ser igual al total calculado de la orden; si difiere (el descuento que se pierde por
 * el tope de un pago, o el cierre por F20, donde los cobros anteriores no se reescriben),
 * `ordenes.total` queda como lo realmente cobrado y se deja un evento de auditoría y un
 * `console.error` con la orden, el total calculado y Σ pagos. No lanza: el cobro ya está hecho.
 */
async function verificarCierreOrden(
  ordenId: string,
  totalCalculado: number,
  origen: 'cobro' | 'item_eliminado',
  usuario?: { id: string; nombre: string },
  sumaPagosConocida?: number,
): Promise<void> {
  try {
    const sql = getSql()
    let suma = sumaPagosConocida
    if (suma === undefined) {
      const r = (await sql`
        SELECT COALESCE(SUM(monto), 0)::numeric AS suma FROM soda_master.pagos
        WHERE orden_id = ${ordenId}::uuid
      `) as any[]
      suma = Number(r[0]?.suma) || 0
    }
    if (Math.abs(suma - totalCalculado) < 0.5) return
    if (origen === 'cobro') {
      await sql`UPDATE soda_master.ordenes SET total = ${suma} WHERE id = ${ordenId}::uuid`
    }
    console.error(
      `[cierre-orden] orden ${ordenId} (${origen}): total calculado ${totalCalculado}, Σ pagos ${suma}; ` +
        `ordenes.total queda en lo cobrado`,
    )
    await db.registrarAuditoriaAdmin({
      usuario_id: usuario?.id ?? null,
      usuario_nombre: usuario?.nombre ?? null,
      accion: 'cierre_orden_descuadre',
      entidad: 'orden',
      entidad_id: ordenId,
      detalles: { origen, total_calculado: totalCalculado, suma_pagos: suma },
    })
  } catch (err) {
    console.error('[cierre-orden] no se pudo verificar el cierre de', ordenId, err)
  }
}

/** Statements que abren una orden bajo lock de la mesa (B1). El último devuelve la orden. */
function sentenciasAperturaOrden(
  sql: Sql,
  o: {
    ordenId: string
    mesaId: string
    usuarioId: string
    estado: 'pendiente' | 'en_cocina'
    notas: string
  },
): any[] {
  const M = o.mesaId
  const enviado = o.estado === 'en_cocina'
  return [
    // Un lock real (dentro de la transacción) serializa las aperturas de una misma mesa.
    sql`SELECT pg_advisory_xact_lock(hashtext(${M}::text)::bigint)`,
    // Limpieza de comandas vacías abandonadas: solo las de más de 2 minutos. Una orden recién
    // creada por otra request (sin ítems todavía) NUNCA se borra aquí.
    sql`
      WITH huerfanas AS (
        SELECT o.id FROM soda_master.ordenes o
        WHERE o.mesa_id = ${M}::uuid
          AND o.estado NOT IN ('pagado', 'cancelado', 'perdida')
          AND o.created_at < now() - interval '2 minutes'
          AND NOT EXISTS (SELECT 1 FROM soda_master.items_orden i WHERE i.orden_id = o.id)
      ),
      d AS (DELETE FROM soda_master.descuentos WHERE orden_id IN (SELECT id FROM huerfanas))
      DELETE FROM soda_master.ordenes WHERE id IN (SELECT id FROM huerfanas)`,
    sql`SELECT soda_master.assert_cobro(
          NOT EXISTS (SELECT 1 FROM soda_master.ordenes
                       WHERE mesa_id = ${M}::uuid AND estado NOT IN ('pagado', 'cancelado', 'perdida')),
          'COMANDA_ACTIVA')`,
    sql`
      INSERT INTO soda_master.ordenes
        (id, mesa_id, usuario_id, estado, subtotal, impuesto, total, notas, enviado_a_cocina, hora_envio)
      VALUES
        (${o.ordenId}::uuid, ${M}::uuid, ${o.usuarioId}::uuid, ${o.estado}, 0, 0, 0, ${o.notas},
         ${enviado}, ${enviado ? new Date().toISOString() : null})
      RETURNING *`,
  ]
}

let _cuentasPersonaReady = false

/**
 * Personas que comparten una mesa/comanda.
 *
 * A cada `orden` (mesa abierta) se le pueden agregar 1..N personas. Cada
 * `items_orden.cuenta_persona_id` apunta a la persona dueña de esa línea
 * (NULL = compartido). Cuando un cliente paga sólo lo suyo, los items
 * con su `cuenta_persona_id` se marcan pagados; el resto sigue abierto
 * con sus propias asignaciones — por eso debe estar en BD y no en
 * memoria del navegador: si el cajero refresca, otro reemplaza, o un
 * mesero agrega un café más tarde, todo persiste.
 *
 * `idx` es un número humano (Persona 1, Persona 2...) único por orden.
 * Lo recalculamos al crear así no salta cuando se borra alguna.
 */
async function ensureCuentasPersonaSchema(): Promise<void> {
  if (_cuentasPersonaReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.cuentas_persona (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      orden_id UUID NOT NULL REFERENCES soda_master.ordenes(id) ON DELETE CASCADE,
      idx INT NOT NULL,
      nombre TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (orden_id, idx)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS cuentas_persona_orden_idx
      ON soda_master.cuentas_persona (orden_id, idx)
  `
  // cuenta_persona_id en items_orden (FK lógica; no ponemos FK para
  // mantener compatibilidad con installs antiguos que aún tienen items
  // viejos).
  await sql`
    ALTER TABLE soda_master.items_orden
      ADD COLUMN IF NOT EXISTS cuenta_persona_id UUID NULL
  `
  await sql`
    CREATE INDEX IF NOT EXISTS items_orden_cuenta_persona_idx
      ON soda_master.items_orden (cuenta_persona_id)
  `
  _cuentasPersonaReady = true
}

let _perdidasTableReady = false

/**
 * Crea la tabla `perdidas_comanda` que registra los "perros muertos":
 * cuando un cliente consumió pero se fue sin pagar. La fila guarda quién
 * autorizó el cierre como pérdida, el motivo y el monto perdido (lo que
 * faltaba por cobrar). El propósito es que el admin pueda revisar después
 * cuánto se pierde por este motivo y eventualmente cruzar con el mesero
 * responsable.
 *
 * Es importante distinguir esto de `cancelado`: una orden cancelada se
 * "borra" como si la venta no hubiera ocurrido (típicamente cuando el
 * cliente cambia de opinión antes de que se preparen los items). En
 * cambio una "perdida" reconoce que los insumos sí se gastaron.
 */
async function ensurePerdidasTable(): Promise<void> {
  if (_perdidasTableReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.perdidas_comanda (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      orden_id UUID NOT NULL REFERENCES soda_master.ordenes(id) ON DELETE CASCADE,
      mesa_id UUID NULL,
      monto_perdido NUMERIC(12,2) NOT NULL DEFAULT 0,
      cantidad_items INTEGER NOT NULL DEFAULT 0,
      motivo TEXT NULL,
      autorizado_por UUID NULL,
      autorizado_por_nombre TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Columnas agregadas posteriormente (idempotentes) para:
  //  - dejar constancia del MESERO/CAJERO responsable de haber abierto la
  //    mesa (es quién carga con la pérdida hasta que se resuelva);
  //  - permitir que un cliente vuelva más tarde y pague — la pérdida queda
  //    "resuelta" referenciando al pago retroactivo, así no falsea reportes.
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS responsable_id UUID NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS responsable_nombre TEXT NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS responsable_rol TEXT NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS resuelto BOOLEAN NOT NULL DEFAULT FALSE
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS resuelto_at TIMESTAMPTZ NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS resuelto_por_id UUID NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS resuelto_por_nombre TEXT NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS pago_id UUID NULL
  `
  // Sesión 9 (B3): lo realmente cobrado en el cobro retroactivo y la diferencia que se
  // condona (con su motivo). Las pérdidas resueltas antes quedan en NULL: el pago real
  // está en `pagos` (`pago_id`).
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS monto_cobrado NUMERIC(12,2) NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS monto_condonado NUMERIC(12,2) NULL
  `
  await sql`
    ALTER TABLE soda_master.perdidas_comanda
      ADD COLUMN IF NOT EXISTS motivo_condonacion TEXT NULL
  `
  await sql`
    CREATE INDEX IF NOT EXISTS perdidas_comanda_created_at_idx
      ON soda_master.perdidas_comanda (created_at DESC)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS perdidas_comanda_responsable_idx
      ON soda_master.perdidas_comanda (responsable_id)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS perdidas_comanda_resuelto_idx
      ON soda_master.perdidas_comanda (resuelto)
  `
  // Sesión 7 (B2): una orden se marca como pérdida una sola vez. El bloqueo de
  // la orden en `registrarPerdida` ya lo garantiza; el índice único es la red
  // de seguridad. Si hubiera duplicados viejos no se puede crear: se avisa y se
  // sigue (el bloqueo igual protege los registros nuevos).
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS perdidas_comanda_orden_uk
        ON soda_master.perdidas_comanda (orden_id)
    `
  } catch (err) {
    console.error('[perdidas] no se pudo crear el índice único perdidas_comanda(orden_id):', err)
  }
  _perdidasTableReady = true
}

// ──── mermas.ingrediente_id y auditoría admin ────────────────────────
// La tabla `mermas` original sólo soporta producto_id, pero ahora también
// queremos registrar mermas sobre insumos (ingredientes). Y la tabla
// `auditoria_admin` da trazabilidad a las correcciones del administrador
// (eliminar producto/insumo sin que sea merma).
let _mermasIngSchemaReady = false
async function ensureMermasIngredienteSchema(): Promise<void> {
  if (_mermasIngSchemaReady) return
  const sql = getSql()
  await sql`
    ALTER TABLE soda_master.mermas
      ADD COLUMN IF NOT EXISTS ingrediente_id UUID REFERENCES soda_master.ingredientes(id)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS mermas_ingrediente_idx
      ON soda_master.mermas (ingrediente_id)
  `
  _mermasIngSchemaReady = true
}

let _auditoriaAdminReady = false
async function ensureAuditoriaAdminTable(): Promise<void> {
  if (_auditoriaAdminReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.auditoria_admin (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id UUID NULL,
      usuario_nombre TEXT NULL,
      usuario_rol TEXT NULL,
      accion TEXT NOT NULL,
      entidad TEXT NOT NULL,
      entidad_id UUID NULL,
      entidad_nombre TEXT NULL,
      detalles JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS auditoria_admin_created_at_idx
      ON soda_master.auditoria_admin (created_at DESC)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS auditoria_admin_entidad_idx
      ON soda_master.auditoria_admin (entidad, entidad_id)
  `
  _auditoriaAdminReady = true
}

// ──── Migración timestamp → timestamptz ──────────────────────────────
// Bug histórico: varias tablas (pagos, ordenes, items_orden, mermas,
// etc.) tenían `created_at TIMESTAMP` (sin zona). Postgres no sabe
// que ese valor está en UTC, así que `AT TIME ZONE 'America/Santiago'`
// hace lo opuesto a lo esperado (lo interpreta COMO Santiago y lo
// convierte a UTC, en vez de leerlo COMO UTC y mostrarlo en Santiago).
// Eso provocaba que el dashboard mostrara ventas del día equivocado.
//
// La migración convierte estas columnas a `timestamptz` asumiendo que
// los valores almacenados están en UTC (lo cual es cierto: el servidor
// Postgres de Neon corre en UTC y `now()`/`CURRENT_TIMESTAMP` devuelven
// UTC). Es idempotente: el bloque `DO $$ ... $$` chequea el tipo
// actual antes de emitir el ALTER.
let _tsTzMigrationReady = false
async function ensureTimestampTzMigration(): Promise<void> {
  if (_tsTzMigrationReady) return
  const sql = getSql()
  // Lista de columnas que sabemos que históricamente quedaron sin tz.
  // Si alguna ya es timestamptz, el IF dentro del bloque la deja pasar.
  await sql`
    DO $$
    DECLARE
      r record;
      objetivos text[] := ARRAY[
        'pagos.created_at',
        'ordenes.created_at',
        'ordenes.updated_at',
        'items_orden.created_at',
        'mermas.created_at',
        'comandas_no_pagadas.created_at',
        'descuentos.created_at',
        'movimientos_inventario.created_at',
        'inventario.created_at',
        'inventario.updated_at',
        'productos.created_at',
        'productos.updated_at',
        'usuarios.created_at',
        'usuarios.updated_at',
        'mesas.created_at',
        'mesas.updated_at',
        'modificadores.created_at',
        'categorias.created_at',
        'configuracion.updated_at'
      ];
      pieza text;
      tabla text;
      columna text;
      tipo_actual text;
    BEGIN
      FOREACH pieza IN ARRAY objetivos LOOP
        tabla := split_part(pieza, '.', 1);
        columna := split_part(pieza, '.', 2);
        SELECT data_type INTO tipo_actual
          FROM information_schema.columns
          WHERE table_schema = 'soda_master'
            AND table_name = tabla
            AND column_name = columna;
        IF tipo_actual = 'timestamp without time zone' THEN
          EXECUTE format(
            'ALTER TABLE soda_master.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING (%I AT TIME ZONE ''UTC'')',
            tabla, columna, columna
          );
        END IF;
      END LOOP;
    END $$;
  `
  _tsTzMigrationReady = true
}

// ──── usuarios.roles_adicionales ─────────────────────────────────────
// Roles permanentes adicionales (multi-rol). Cada usuario sigue
// teniendo un rol principal en `usuarios.rol`, pero puede acumular
// otros roles aquí (ej: cocinero que también atiende como mesero).
// Es una extensión a futuro del modelo de permisos: no necesita
// otorgar un permiso especial con vencimiento; lo queremos para
// configurar de una vez al usuario.
let _rolesAdicionalesReady = false
async function ensureRolesAdicionalesSchema(): Promise<void> {
  if (_rolesAdicionalesReady) return
  const sql = getSql()
  await sql`
    ALTER TABLE soda_master.usuarios
      ADD COLUMN IF NOT EXISTS roles_adicionales TEXT[] NOT NULL DEFAULT '{}'::text[]
  `
  _rolesAdicionalesReady = true
}

// ──── Sesiones en servidor e intentos de login (sesión 3) ───────────
// `sesiones`: una fila por login. Solo se guarda el hash SHA-256 del
// token (el token vive en la cookie httpOnly). No se guarda IP ni
// navegador para no sumar datos personales.
// `intentos_login`: contador de PIN fallidos por clave (`u:<email>` o
// `ip:<ip>`), con bloqueo temporal. Ver lib/intentos-login.ts.
let _sesionesReady = false
async function ensureSesionesSchema(): Promise<void> {
  if (_sesionesReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.sesiones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash TEXT NOT NULL UNIQUE,
      usuario_id UUID NOT NULL REFERENCES soda_master.usuarios(id) ON DELETE CASCADE,
      creada TIMESTAMPTZ NOT NULL DEFAULT now(),
      expira TIMESTAMPTZ NOT NULL,
      revocada_at TIMESTAMPTZ NULL
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS sesiones_usuario_idx
      ON soda_master.sesiones (usuario_id)
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.intentos_login (
      clave TEXT PRIMARY KEY,
      fallidos INTEGER NOT NULL DEFAULT 0,
      bloqueos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta TIMESTAMPTZ NULL,
      actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Contador de peticiones por sesión y minuto (sesión 4, lib/limite-api.ts).
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.limite_peticiones (
      clave TEXT NOT NULL,
      ventana BIGINT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (clave, ventana)
    )
  `
  _sesionesReady = true
}

export interface ReglaIntentos {
  /** Fallos dentro de la ventana que disparan el bloqueo. */
  umbral: number
  /** Ventana (segundos): fallos más antiguos que esto no cuentan. */
  ventanaSeg: number
  /** Duración del primer bloqueo (segundos). */
  bloqueoBaseSeg: number
  /** Tope del bloqueo (segundos). Si es igual a la base, no escala. */
  bloqueoMaxSeg: number
}

// ──── Caja chica (apertura, movimientos, cierre/arqueo) ─────────────
// El cajero abre la caja al iniciar el turno con un fondo inicial.
// Cada pago en efectivo registra una entrada por el monto cobrado y,
// si hubo vuelto, una salida por el vuelto entregado. Retiros y
// depósitos manuales también dejan movimiento. Al cerrar, se compara
// el efectivo contado vs el esperado (fondo + entradas - salidas) y
// queda la diferencia (puede ser cuadre, sobrante o faltante).
let _cajaReady = false
async function ensureCajaSchema(): Promise<void> {
  if (_cajaReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.cajas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_apertura_id UUID NOT NULL,
      usuario_apertura_nombre TEXT NOT NULL,
      fondo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
      abierta_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      cerrada_en TIMESTAMPTZ NULL,
      usuario_cierre_id UUID NULL,
      usuario_cierre_nombre TEXT NULL,
      efectivo_contado NUMERIC(12,2) NULL,
      diferencia NUMERIC(12,2) NULL,
      notas TEXT NULL,
      estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada'))
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.movimientos_caja (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      caja_id UUID NOT NULL REFERENCES soda_master.cajas(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('apertura','venta_efectivo','vuelto','retiro','deposito','ajuste','cierre')),
      monto NUMERIC(12,2) NOT NULL,
      pago_id UUID NULL,
      usuario_id UUID NULL,
      usuario_nombre TEXT NULL,
      descripcion TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS movimientos_caja_caja_id_idx
      ON soda_master.movimientos_caja (caja_id, created_at)
  `
  // Sólo puede haber UNA caja abierta a la vez (es una caja física).
  // Si quisiéramos varias cajas físicas habría que cambiar este índice.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cajas_solo_una_abierta
      ON soda_master.cajas ((estado))
      WHERE estado = 'abierta'
  `
  _cajaReady = true
}

let _recetasTableReady = false

async function ensureRecetasTables(): Promise<void> {
  if (_recetasTableReady) return
  const sql = getSql()
  await sql`ALTER TABLE soda_master.productos ADD COLUMN IF NOT EXISTS modo_stock TEXT NOT NULL DEFAULT 'producto'`
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.productos
        ADD CONSTRAINT productos_modo_stock_check
        CHECK (modo_stock IN ('producto','receta','producto_y_receta'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.ingredientes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'insumos',
      unidad_medida TEXT NOT NULL DEFAULT 'unidad',
      stock_actual NUMERIC(12,3) NOT NULL DEFAULT 0,
      stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
      costo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.recetas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      producto_id UUID NOT NULL UNIQUE REFERENCES soda_master.productos(id) ON DELETE CASCADE,
      nombre TEXT,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.receta_ingredientes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receta_id UUID NOT NULL REFERENCES soda_master.recetas(id) ON DELETE CASCADE,
      ingrediente_id UUID NOT NULL REFERENCES soda_master.ingredientes(id),
      cantidad NUMERIC(12,3) NOT NULL DEFAULT 1,
      opcional BOOLEAN NOT NULL DEFAULT FALSE,
      extra BOOLEAN NOT NULL DEFAULT FALSE,
      costo_adicional NUMERIC(12,2) NOT NULL DEFAULT 0,
      nombre_display TEXT,
      UNIQUE (receta_id, ingrediente_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.movimientos_inventario (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ingrediente_id UUID REFERENCES soda_master.ingredientes(id),
      producto_id UUID REFERENCES soda_master.productos(id),
      tipo TEXT NOT NULL CHECK (tipo IN ('venta','merma','ajuste','entrada','compra','devolucion')),
      cantidad NUMERIC(12,3) NOT NULL,
      orden_id UUID,
      item_orden_id UUID,
      merma_id UUID,
      compra_id UUID,
      notas TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  // Idempotente: si la tabla ya existía desde el seed original (sólo con
  // producto_id), faltarán columnas nuevas (ingrediente_id, compra_id,
  // merma_id, item_orden_id). El CREATE TABLE IF NOT EXISTS no las
  // agrega — hay que forzarlas con ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS producto_id UUID REFERENCES soda_master.productos(id)`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS ingrediente_id UUID REFERENCES soda_master.ingredientes(id)`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS compra_id UUID`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS merma_id UUID`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS item_orden_id UUID`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS orden_id UUID`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS notas TEXT`
  await sql`ALTER TABLE soda_master.movimientos_inventario ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.movimientos_inventario DROP CONSTRAINT movimientos_inventario_tipo_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$
  `
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.movimientos_inventario
        ADD CONSTRAINT movimientos_inventario_tipo_check
        CHECK (tipo IN ('venta','merma','ajuste','entrada','compra','devolucion'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  // Sesión 11: los movimientos de un insumo sin producto (compra, entrada, ajuste) no tienen
  // `producto_id`. La tabla del seed original lo declaraba NOT NULL, y por eso el `crearCompra`
  // anterior fallaba en su último paso (la compra y el stock ya estaban escritos): 1 compra de la
  // base de pruebas quedó sin movimiento. Idempotente.
  await sql`ALTER TABLE soda_master.movimientos_inventario ALTER COLUMN producto_id DROP NOT NULL`
  // La tabla del seed original guardaba `cantidad` como INTEGER: una cantidad con decimales
  // (media unidad, 142,857 g por un rendimiento de 70 %) se redondeaba y la devolución, que
  // usa este registro, devolvía de menos. Se ensancha a NUMERIC(12,3) (los enteros no cambian).
  await sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'soda_master' AND table_name = 'movimientos_inventario'
          AND column_name = 'cantidad' AND data_type <> 'numeric'
      ) THEN
        ALTER TABLE soda_master.movimientos_inventario ALTER COLUMN cantidad TYPE NUMERIC(12,3);
      END IF;
    END $$
  `
  // Sesión 11: unidad de compra y de consumo, factor por defecto y rendimiento.
  // `unidad_medida` es la unidad de CONSUMO (stock, receta y costo). Los insumos
  // existentes quedan con factor 1, rendimiento 100% y unidad de compra NULL
  // (= la misma de consumo), así que se comportan exactamente como antes.
  await sql`ALTER TABLE soda_master.ingredientes ADD COLUMN IF NOT EXISTS unidad_compra TEXT NULL`
  await sql`ALTER TABLE soda_master.ingredientes ADD COLUMN IF NOT EXISTS factor_compra NUMERIC(12,4) NOT NULL DEFAULT 1`
  await sql`ALTER TABLE soda_master.ingredientes ADD COLUMN IF NOT EXISTS rendimiento_pct NUMERIC(6,2) NOT NULL DEFAULT 100`
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.ingredientes
        ADD CONSTRAINT ingredientes_factor_compra_check CHECK (factor_compra > 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.ingredientes
        ADD CONSTRAINT ingredientes_rendimiento_check CHECK (rendimiento_pct >= 1 AND rendimiento_pct <= 300);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  // El costo por gramo o mililitro necesita más de 2 decimales. Solo ensancha
  // (los valores existentes no cambian) y solo si todavía no se hizo.
  await sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'soda_master' AND table_name = 'ingredientes'
          AND column_name = 'costo_unitario'
          AND (numeric_scale IS DISTINCT FROM 4 OR numeric_precision < 14)
      ) THEN
        ALTER TABLE soda_master.ingredientes ALTER COLUMN costo_unitario TYPE NUMERIC(14,4);
      END IF;
    END $$
  `
  _recetasTableReady = true
}

let _comprasTableReady = false

async function ensureComprasTables(): Promise<void> {
  if (_comprasTableReady) return
  await ensureRecetasTables()
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.proveedores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      rut TEXT,
      contacto TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      notas TEXT,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.compras (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proveedor_id UUID REFERENCES soda_master.proveedores(id),
      tipo_documento TEXT NOT NULL DEFAULT 'boleta' CHECK (tipo_documento IN ('boleta','factura','nota','otro')),
      numero_documento TEXT,
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      impuesto NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      notas TEXT,
      usuario_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.compra_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      compra_id UUID NOT NULL REFERENCES soda_master.compras(id) ON DELETE CASCADE,
      ingrediente_id UUID NOT NULL REFERENCES soda_master.ingredientes(id),
      cantidad NUMERIC(12,3) NOT NULL,
      precio_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      notas TEXT
    )
  `
  // Sesión 11: lo que realmente trajo cada compra. `factor` = unidades de consumo
  // por unidad de compra; `cantidad_consumo` = lo que entró al stock. Las
  // compras anteriores quedan con factor 1 y `cantidad_consumo` NULL (= cantidad).
  await sql`ALTER TABLE soda_master.compra_items ADD COLUMN IF NOT EXISTS factor NUMERIC(12,4) NOT NULL DEFAULT 1`
  await sql`ALTER TABLE soda_master.compra_items ADD COLUMN IF NOT EXISTS cantidad_consumo NUMERIC(12,3) NULL`
  await sql`ALTER TABLE soda_master.compra_items ADD COLUMN IF NOT EXISTS unidad_compra TEXT NULL`
  await sql`ALTER TABLE soda_master.compra_items ADD COLUMN IF NOT EXISTS unidad_consumo TEXT NULL`
  // Tipo de insumo para separar comida vs insumos del negocio
  await sql`ALTER TABLE soda_master.ingredientes ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'comida'`
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.ingredientes
        ADD CONSTRAINT ingredientes_tipo_check
        CHECK (tipo IN ('comida','negocio','otro'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  _comprasTableReady = true
}

let _finanzasTableReady = false

async function ensureFinanzasTables(): Promise<void> {
  if (_finanzasTableReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.activos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'maquinaria',
      descripcion TEXT,
      fecha_compra DATE NOT NULL DEFAULT CURRENT_DATE,
      costo_compra NUMERIC(14,2) NOT NULL DEFAULT 0,
      vida_util_meses INTEGER NOT NULL DEFAULT 60,
      valor_residual NUMERIC(14,2) NOT NULL DEFAULT 0,
      metodo_depreciacion TEXT NOT NULL DEFAULT 'lineal',
      proveedor_id UUID,
      ubicacion TEXT,
      numero_serie TEXT,
      estado TEXT NOT NULL DEFAULT 'activo',
      notas TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.activos
        ADD CONSTRAINT activos_estado_check
        CHECK (estado IN ('activo','baja','vendido','reparacion'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.empleados (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      cargo TEXT,
      documento TEXT,
      telefono TEXT,
      email TEXT,
      sueldo_base NUMERIC(14,2) NOT NULL DEFAULT 0,
      periodicidad TEXT NOT NULL DEFAULT 'mensual',
      fecha_ingreso DATE,
      fecha_egreso DATE,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      usuario_id UUID,
      notas TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.empleados
        ADD CONSTRAINT empleados_periodicidad_check
        CHECK (periodicidad IN ('mensual','quincenal','semanal','diario','por_hora'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.gastos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      categoria TEXT NOT NULL DEFAULT 'otros',
      descripcion TEXT,
      monto NUMERIC(14,2) NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'operativo',
      recurrente BOOLEAN NOT NULL DEFAULT FALSE,
      periodicidad TEXT,
      proveedor_id UUID,
      empleado_id UUID,
      activo_id UUID,
      usuario_id UUID,
      notas TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    DO $$ BEGIN
      ALTER TABLE soda_master.gastos
        ADD CONSTRAINT gastos_tipo_check
        CHECK (tipo IN ('operativo','sueldo','servicio','impuesto','financiero','otros'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `
  _finanzasTableReady = true
}

/**
 * Calcula depreciación lineal de un activo a la fecha actual.
 * `mensual = (costo - residual) / vida_util_meses`. Acumulada no excede vida útil.
 */
function computarDepreciacion(row: any) {
  if (!row) return row
  const costo = Number(row.costo_compra) || 0
  const residual = Number(row.valor_residual) || 0
  const vida = Math.max(1, Number(row.vida_util_meses) || 1)
  const fechaCompra = row.fecha_compra ? new Date(row.fecha_compra) : new Date()
  const hoy = new Date()
  const mesesTranscurridos = Math.max(
    0,
    (hoy.getFullYear() - fechaCompra.getFullYear()) * 12 +
      (hoy.getMonth() - fechaCompra.getMonth()),
  )
  const baseDepreciar = Math.max(0, costo - residual)
  const mensual = baseDepreciar / vida
  const mesesAplicables = Math.min(mesesTranscurridos, vida)
  const acumulada = mensual * mesesAplicables
  const valorActual = Math.max(residual, costo - acumulada)
  return {
    ...row,
    costo_compra: costo,
    valor_residual: residual,
    vida_util_meses: vida,
    depreciacion_mensual: Number(mensual.toFixed(2)),
    depreciacion_acumulada: Number(acumulada.toFixed(2)),
    meses_transcurridos: mesesTranscurridos,
    valor_actual: Number(valorActual.toFixed(2)),
    completamente_depreciado: mesesAplicables >= vida,
  }
}

function mapIngredienteInsumo(row: any) {
  return {
    id: row.id,
    nombre: row.nombre,
    categoria: row.categoria || 'insumos',
    unidad_medida: row.unidad_medida || 'unidad',
    // Sesión 11: unidad de compra efectiva (NULL = la misma de consumo).
    unidad_compra: row.unidad_compra || row.unidad_medida || 'unidad',
    factor_compra: Number(row.factor_compra) > 0 ? Number(row.factor_compra) : 1,
    rendimiento_pct: Number(row.rendimiento_pct) > 0 ? Number(row.rendimiento_pct) : 100,
    stock_actual: Number(row.stock_actual) || 0,
    stock_minimo: Number(row.stock_minimo) || 0,
    costo_unitario: Number(row.costo_unitario) || 0,
    tipo: row.tipo || 'comida',
    activo: row.activo !== false,
  }
}

/**
 * Reescribe `ingredientesEspeciales` del JSON de `notas_especiales` con los
 * nombres y costos de la base (sesión 6): lo que muestran POS, cocina y
 * boleta no puede traer un costo inventado por el navegador. Si las notas no
 * son un objeto JSON se devuelven tal cual.
 */
function normalizarMetadataExtras(
  notas: string | null | undefined,
  extras: Array<{ id: string; nombre: string; costoAdicional: number }>,
): string | null | undefined {
  if (typeof notas !== 'string' || !notas.trim().startsWith('{')) return notas
  try {
    const meta = JSON.parse(notas)
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return notas
    meta.ingredientesEspeciales = extras
    return JSON.stringify(meta)
  } catch {
    return notas
  }
}

/** Parsea extras y modificadores desde el body o notas_especiales JSON */
function parseSeleccionItem(item: {
  modificadores?: unknown
  notas_especiales?: string | null
  seleccion_modificadores?: string[]
  extras_ingredientes?: { ingrediente_id: string; cantidad?: number }[]
}) {
  const mods = Array.isArray(item.seleccion_modificadores)
    ? item.seleccion_modificadores.map(String)
    : Array.isArray(item.modificadores)
      ? (item.modificadores as unknown[]).map(String)
      : []

  let extras: { ingrediente_id: string; cantidad: number }[] = []
  if (Array.isArray(item.extras_ingredientes)) {
    extras = item.extras_ingredientes.map((e) => ({
      ingrediente_id: String(e.ingrediente_id),
      cantidad: Number(e.cantidad) > 0 ? Number(e.cantidad) : 1,
    }))
  } else if (item.notas_especiales && String(item.notas_especiales).trim().startsWith('{')) {
    try {
      const meta = JSON.parse(String(item.notas_especiales))
      const rawExtras = meta.ingredientesEspeciales || meta.extras_ingredientes || []
      if (Array.isArray(rawExtras)) {
        extras = rawExtras
          .filter((e: any) => e?.id)
          .map((e: any) => ({
            ingrediente_id: String(e.id),
            cantidad: Number(e.cantidad) > 0 ? Number(e.cantidad) : 1,
          }))
      }
    } catch {
      /* ignore */
    }
  }
  return { mods, extras }
}

export const db = {
  // Usuarios
  async getUsuarios(): Promise<Usuario[]> {
    await ensureRolesAdicionalesSchema()
    await ensureSesionesSchema()
    const sql = getSql()
    // LEFT JOIN con intentos_login: bloqueo vigente y fallos del PIN (sesión 4).
    const result = await sql`
      SELECT u.id, u.email, u.nombre, u.rol,
             COALESCE(u.roles_adicionales, '{}'::text[]) AS roles_adicionales,
             u.activo, u.created_at, u.updated_at,
             CASE WHEN il.bloqueado_hasta > now() THEN il.bloqueado_hasta END AS bloqueado_hasta,
             COALESCE(il.fallidos, 0) AS fallidos
      FROM soda_master.usuarios u
      LEFT JOIN soda_master.intentos_login il
        ON il.clave = 'u:' || lower(btrim(u.email))
      ORDER BY u.nombre
    `
    return result.map(mapUsuario)
  },

  async getUsuarioById(id: string): Promise<Usuario | null> {
    await ensureRolesAdicionalesSchema()
    const sql = getSql()
    const result = await sql`
      SELECT id, email, nombre, rol,
             COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales,
             activo, created_at, updated_at
      FROM soda_master.usuarios
      WHERE id = ${id}
    `
    return result[0] ? mapUsuario(result[0]) : null
  },

  async verificarPIN(email: string, pin: string): Promise<Usuario | null> {
    await ensureRolesAdicionalesSchema()
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.usuarios WHERE email = ${email} AND activo = true`
    if (!result[0]) {
      // Comparación de relleno: que un email inexistente tarde lo mismo
      // que un PIN errado y la respuesta no revele qué cuentas existen.
      await bcryptjs.compare(pin, HASH_RELLENO)
      return null
    }

    const usuario = result[0] as any
    const esValido = await bcryptjs.compare(pin, usuario.pin_hash)

    return esValido ? mapUsuario(usuario) : null
  },

  async crearUsuario(usuario: Omit<Usuario, 'id' | 'created_at' | 'updated_at'> & { pin?: string }) {
    const sql = getSql()
    const providedHash = usuario.pin_hash ?? usuario.pinHash
    const plainPin = (usuario as any).pin
    let pinHash: string
    if (providedHash && providedHash.startsWith('$2')) {
      pinHash = providedHash
    } else if (plainPin) {
      pinHash = await bcryptjs.hash(plainPin, 10)
    } else if (providedHash) {
      pinHash = await bcryptjs.hash(providedHash, 10)
    } else {
      throw new Error('PIN requerido')
    }
    await ensureRolesAdicionalesSchema()
    const rol = normalizarRol(usuario.rol)
    const rolesAdic = normalizarRolesAdicionales(rol, (usuario as any).roles_adicionales)
    const result = await sql`
      INSERT INTO soda_master.usuarios (email, nombre, pin_hash, rol, roles_adicionales, activo)
      VALUES (
        ${usuario.email},
        ${usuario.nombre},
        ${pinHash},
        ${rol},
        ${rolesAdic}::text[],
        ${usuario.activo ?? true}
      )
      RETURNING id, email, nombre, rol,
                COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales,
                activo, created_at, updated_at
    `
    return mapUsuario(result[0])
  },

  async actualizarUsuario(
    id: string,
    updates: Partial<Usuario> & {
      pin?: string
      pinHash?: string
      pin_hash?: string
      roles_adicionales?: unknown
    }
  ) {
    await ensureRolesAdicionalesSchema()
    const sql = getSql()
    const rol = normalizarRol(updates.rol)
    let nuevoPinHash: string | null = null
    const providedHash = updates.pinHash ?? updates.pin_hash
    if (providedHash && providedHash.startsWith('$2')) {
      nuevoPinHash = providedHash
    } else if (updates.pin) {
      nuevoPinHash = await bcryptjs.hash(updates.pin, 10)
    } else if (providedHash) {
      nuevoPinHash = await bcryptjs.hash(providedHash, 10)
    }
    // Para roles_adicionales necesitamos saber qué rol principal va a
    // quedar después del update; si no cambia, lo leemos de la fila
    // actual. Sólo procesamos roles_adicionales si vino en updates.
    let rolesAdicNormalizados: string[] | null = null
    if (updates.roles_adicionales !== undefined) {
      let principal = rol
      if (!principal) {
        const filaActual = (await sql`
          SELECT rol FROM soda_master.usuarios WHERE id = ${id}
        `) as Array<{ rol: string | null }>
        principal = filaActual[0]?.rol ?? null
      }
      rolesAdicNormalizados = normalizarRolesAdicionales(principal, updates.roles_adicionales)
    }
    const result = await sql`
      UPDATE soda_master.usuarios
      SET nombre = COALESCE(${updates.nombre ?? null}, nombre),
          email = COALESCE(${updates.email ?? null}, email),
          rol = COALESCE(${rol}, rol),
          roles_adicionales = COALESCE(${rolesAdicNormalizados}::text[], roles_adicionales),
          activo = COALESCE(${updates.activo ?? null}, activo),
          pin_hash = COALESCE(${nuevoPinHash}, pin_hash),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, email, nombre, rol,
                COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales,
                activo, created_at, updated_at
    `
    if (!result[0]) return null
    return mapUsuario(result[0])
  },

  async eliminarUsuario(id: string) {
    const sql = getSql()
    const result = await sql`
      DELETE FROM soda_master.usuarios
      WHERE id = ${id}
      RETURNING id
    `
    return result.length > 0
  },

  // Sesiones en servidor (sesión 3). Ver lib/sesion.ts.
  async crearSesion(usuarioId: string, tokenHash: string, expira: Date): Promise<void> {
    await ensureSesionesSchema()
    const sql = getSql()
    // Una sola sesión por usuario: el login revoca las anteriores y crea la
    // nueva en un solo statement (si le roban una tablet, el admin entra
    // desde otro equipo y la anterior queda cerrada).
    await sql`
      WITH revocadas AS (
        UPDATE soda_master.sesiones
        SET revocada_at = now()
        WHERE usuario_id = ${usuarioId}::uuid AND revocada_at IS NULL
      )
      INSERT INTO soda_master.sesiones (token_hash, usuario_id, expira)
      VALUES (${tokenHash}, ${usuarioId}::uuid, ${expira.toISOString()}::timestamptz)
    `
  },

  /** Sesión no revocada ni expirada de un usuario activo, con datos frescos del usuario. */
  async getSesionActiva(tokenHash: string): Promise<(Usuario & { sesion_id: string }) | null> {
    await ensureSesionesSchema()
    await ensureRolesAdicionalesSchema()
    const sql = getSql()
    const rows = await sql`
      SELECT s.id AS sesion_id,
             u.id, u.email, u.nombre, u.rol,
             COALESCE(u.roles_adicionales, '{}'::text[]) AS roles_adicionales,
             u.activo, u.created_at, u.updated_at
      FROM soda_master.sesiones s
      JOIN soda_master.usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ${tokenHash}
        AND s.revocada_at IS NULL
        AND s.expira > now()
        AND u.activo = true
      LIMIT 1
    `
    if (!rows[0]) return null
    const row = rows[0] as any
    return { ...mapUsuario(row), sesion_id: String(row.sesion_id) }
  },

  async revocarSesion(tokenHash: string): Promise<void> {
    await ensureSesionesSchema()
    const sql = getSql()
    await sql`
      UPDATE soda_master.sesiones SET revocada_at = now()
      WHERE token_hash = ${tokenHash} AND revocada_at IS NULL
    `
  },

  async revocarSesionesUsuario(usuarioId: string): Promise<number> {
    await ensureSesionesSchema()
    const sql = getSql()
    const rows = await sql`
      UPDATE soda_master.sesiones SET revocada_at = now()
      WHERE usuario_id = ${usuarioId}::uuid AND revocada_at IS NULL
      RETURNING id
    `
    return rows.length
  },

  // Intentos de login (sesión 3). Ver lib/intentos-login.ts.
  /** Bloqueo vigente más largo entre las claves dadas, o null. */
  async getBloqueoVigente(claves: string[]): Promise<Date | null> {
    await ensureSesionesSchema()
    const sql = getSql()
    const rows = await sql`
      SELECT MAX(bloqueado_hasta) AS hasta
      FROM soda_master.intentos_login
      WHERE clave = ANY(${claves}::text[]) AND bloqueado_hasta > now()
    `
    const hasta = (rows[0] as any)?.hasta
    return hasta ? new Date(hasta) : null
  },

  /**
   * Suma un fallo en un solo statement (atómico por fila). Si llega al
   * umbral, bloquea por base * 2^bloqueos (hasta el tope) y reinicia el
   * contador. Los bloqueos previos se olvidan tras 24 h sin fallos.
   * Devuelve el fin del bloqueo si esta llamada lo activó.
   */
  async registrarIntentoFallido(clave: string, regla: ReglaIntentos): Promise<Date | null> {
    await ensureSesionesSchema()
    const sql = getSql()
    const rows = await sql`
      INSERT INTO soda_master.intentos_login AS il (clave, fallidos, bloqueos, bloqueado_hasta, actualizado)
      VALUES (
        ${clave},
        CASE WHEN 1 >= ${regla.umbral}::int THEN 0 ELSE 1 END,
        CASE WHEN 1 >= ${regla.umbral}::int THEN 1 ELSE 0 END,
        CASE WHEN 1 >= ${regla.umbral}::int
             THEN now() + make_interval(secs => ${regla.bloqueoBaseSeg}::int) ELSE NULL END,
        now()
      )
      ON CONFLICT (clave) DO UPDATE SET
        bloqueado_hasta = CASE
          WHEN (CASE WHEN il.actualizado < now() - make_interval(secs => ${regla.ventanaSeg}::int)
                     THEN 0 ELSE il.fallidos END) + 1 >= ${regla.umbral}::int
          THEN now() + make_interval(secs => LEAST(
                 ${regla.bloqueoBaseSeg}::float8 * power(2, CASE WHEN il.actualizado < now() - interval '24 hours'
                                                              THEN 0 ELSE il.bloqueos END),
                 ${regla.bloqueoMaxSeg}::float8))
          ELSE il.bloqueado_hasta END,
        bloqueos = CASE
          WHEN (CASE WHEN il.actualizado < now() - make_interval(secs => ${regla.ventanaSeg}::int)
                     THEN 0 ELSE il.fallidos END) + 1 >= ${regla.umbral}::int
          THEN (CASE WHEN il.actualizado < now() - interval '24 hours' THEN 0 ELSE il.bloqueos END) + 1
          ELSE (CASE WHEN il.actualizado < now() - interval '24 hours' THEN 0 ELSE il.bloqueos END) END,
        fallidos = CASE
          WHEN (CASE WHEN il.actualizado < now() - make_interval(secs => ${regla.ventanaSeg}::int)
                     THEN 0 ELSE il.fallidos END) + 1 >= ${regla.umbral}::int
          THEN 0
          ELSE (CASE WHEN il.actualizado < now() - make_interval(secs => ${regla.ventanaSeg}::int)
                     THEN 0 ELSE il.fallidos END) + 1 END,
        actualizado = now()
      RETURNING bloqueado_hasta, (bloqueado_hasta > now() AND fallidos = 0) AS recien_bloqueado
    `
    const row = rows[0] as any
    return row?.recien_bloqueado && row.bloqueado_hasta ? new Date(row.bloqueado_hasta) : null
  },

  /**
   * Cuenta una petición de la clave en la ventana de 60 s actual (un solo
   * statement atómico). Devuelve cuántas van y cuántos segundos faltan
   * para que cierre la ventana. Sesión 4, ver lib/limite-api.ts.
   */
  async contarPeticion(clave: string): Promise<{ n: number; restanteSeg: number }> {
    await ensureSesionesSchema()
    const sql = getSql()
    const rows = await sql`
      INSERT INTO soda_master.limite_peticiones AS lp (clave, ventana, n)
      VALUES (${clave}, floor(extract(epoch from now()) / 60)::bigint, 1)
      ON CONFLICT (clave, ventana) DO UPDATE SET n = lp.n + 1
      RETURNING n, (60 - (extract(epoch from now())::bigint % 60))::int AS restante
    `
    const row = rows[0] as any
    return { n: Number(row.n), restanteSeg: Number(row.restante) }
  },

  /** Borra contadores de más de 1 h (se llama de forma oportunista). */
  async limpiarContadoresViejos(): Promise<void> {
    await ensureSesionesSchema()
    const sql = getSql()
    await sql`
      DELETE FROM soda_master.limite_peticiones
      WHERE ventana < floor(extract(epoch from now()) / 60)::bigint - 60
    `
  },

  /** Reinicia el contador y quita el bloqueo de una clave (login correcto o desbloqueo de admin). */
  async limpiarIntentos(clave: string): Promise<boolean> {
    await ensureSesionesSchema()
    const sql = getSql()
    const rows = await sql`
      UPDATE soda_master.intentos_login
      SET fallidos = 0, bloqueos = 0, bloqueado_hasta = NULL, actualizado = now()
      WHERE clave = ${clave}
      RETURNING clave
    `
    return rows.length > 0
  },

  // Mesas
  async getMesas(): Promise<Mesa[]> {
    const sql = getSql()
    const result = await sql`
      SELECT *, 
             'Mesa ' || numero AS nombre 
      FROM soda_master.mesas 
      ORDER BY numero
    `
    return result.map(mapMesa)
  },

  async getMesaById(id: string): Promise<Mesa | null> {
    const sql = getSql()
    const result = await sql`
      SELECT *, 
             'Mesa ' || numero AS nombre 
      FROM soda_master.mesas 
      WHERE id = ${id}
    `
    return result[0] ? mapMesa(result[0]) : null
  },

  async actualizarEstadoMesa(id: string, estado: string) {
    const sql = getSql()
    const dbEstado = toDatabaseMesaEstado(estado)
    const result = await sql`
      UPDATE soda_master.mesas 
      SET estado = ${dbEstado}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *, 'Mesa ' || numero AS nombre
    `
    return mapMesa(result[0])
  },

  async actualizarMesa(id: string, updates: Partial<Mesa>) {
    const sql = getSql()
    const dbEstado = toDatabaseMesaEstado(updates.estado)
    const result = await sql`
      UPDATE soda_master.mesas 
      SET estado = COALESCE(${dbEstado}, estado),
          capacidad = COALESCE(${updates.capacidad ?? null}, capacidad),
          area = COALESCE(${updates.area ?? null}, area),
          numero = COALESCE(${updates.numero ?? null}, numero),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *, 'Mesa ' || numero AS nombre
    `
    return mapMesa(result[0])
  },

  async crearMesa(mesa: {
    nombre?: string
    numero?: number
    area?: string | null
    capacidad?: number
    estado?: string
  }) {
    const sql = getSql()
    let numero = mesa.numero
    let area = mesa.area ?? null
    if (mesa.nombre && (numero === undefined || numero === null)) {
      const trimmed = mesa.nombre.trim()
      const match = trimmed.match(/^(.*?)\s*(\d+)$/)
      if (match) {
        const labelPart = (match[1] || '').trim()
        if (!area && labelPart) area = labelPart
        const candidate = parseInt(match[2], 10)
        const existing = await sql`
          SELECT id FROM soda_master.mesas WHERE numero = ${candidate} LIMIT 1
        `
        if (!existing[0]) {
          numero = candidate
        }
      } else if (!area) {
        area = trimmed || null
      }
    }
    if (numero === undefined || numero === null) {
      const next = await sql`
        SELECT COALESCE(MAX(numero), 0) + 1 AS next FROM soda_master.mesas
      `
      numero = Number((next[0] as any).next)
    }
    const capacidad = mesa.capacidad ?? 4
    const dbEstado = toDatabaseMesaEstado(mesa.estado ?? 'libre') ?? 'disponible'
    const result = await sql`
      INSERT INTO soda_master.mesas (numero, area, capacidad, estado)
      VALUES (${numero}, ${area}, ${capacidad}, ${dbEstado})
      RETURNING *, 'Mesa ' || numero AS nombre
    `
    return mapMesa(result[0])
  },

  async eliminarMesa(id: string) {
    const sql = getSql()
    const result = await sql`
      DELETE FROM soda_master.mesas
      WHERE id = ${id}
      RETURNING id
    `
    return result.length > 0
  },

  // Productos — always JOIN categorias so frontend gets `categoria` as string name
  async getProductos(): Promise<Producto[]> {
    const sql = getSql()
    const result = await sql`
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url,
        p.activo,
        p.categoria_id,
        p.es_ingrediente_especial,
        p.costo_adicional,
        COALESCE(p.modo_stock, 'producto') AS modo_stock,
        c.nombre AS categoria,
        COALESCE(inv.stock_actual, 0)  AS stock,
        COALESCE(inv.stock_minimo, 5)  AS "stockMinimo",
        COALESCE(inv.unidad_medida, 'unidad') AS formato
      FROM soda_master.productos p
      LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
      LEFT JOIN soda_master.inventario inv ON inv.producto_id = p.id
      WHERE p.activo = true
      ORDER BY c.nombre, p.nombre
    `
    return result.map(mapProducto) as Producto[]
  },

  // Resumen de receta por producto: cuenta cuántos ingredientes base,
  // opcionales y extras pagados tiene cada producto activo. Lo usa la
  // tabla de inventario para mostrar el indicador "Burger BBQ — 5 base
  // · 3 opcionales · 2 extras" en una sola lectura sin hacer N queries.
  async getResumenRecetasPorProducto(): Promise<
    Record<string, { base: number; opcionales: number; extras: number; total: number }>
  > {
    await ensureRecetasTables()
    const sql = getSql()
    const rows = (await sql`
      SELECT r.producto_id,
             COUNT(*) FILTER (WHERE NOT ri.opcional AND NOT ri.extra)::int AS base,
             COUNT(*) FILTER (WHERE ri.opcional AND NOT ri.extra)::int AS opcionales,
             COUNT(*) FILTER (WHERE ri.extra)::int AS extras,
             COUNT(*)::int AS total
      FROM soda_master.recetas r
      JOIN soda_master.receta_ingredientes ri ON ri.receta_id = r.id
      WHERE r.activo = true
      GROUP BY r.producto_id
    `) as any[]
    const out: Record<string, { base: number; opcionales: number; extras: number; total: number }> = {}
    for (const r of rows) {
      out[String(r.producto_id)] = {
        base: Number(r.base) || 0,
        opcionales: Number(r.opcionales) || 0,
        extras: Number(r.extras) || 0,
        total: Number(r.total) || 0,
      }
    }
    return out
  },

  // Duplica un producto creando una "variante" (ej: "Burger Doble" a
  // partir de "Burger Simple"). Copia categoría, descripción, modo de
  // stock y todas las líneas de receta (base, opcionales y extras
  // pagados). El precio nuevo se pasa por parámetro; si no se pasa,
  // hereda el del original.
  async clonarProductoConReceta(input: {
    producto_id: string
    nombre: string
    precio?: number
  }): Promise<{ producto: any; receta_copiada: boolean }> {
    await ensureRecetasTables()
    const sql = getSql()
    const nombreNuevo = (input.nombre || '').trim()
    if (!nombreNuevo) throw new Error('nombre requerido')
    const originalRows = (await sql`
      SELECT id, nombre, descripcion, precio, categoria_id, imagen_url,
             es_ingrediente_especial, costo_adicional, modo_stock
      FROM soda_master.productos
      WHERE id = ${input.producto_id}::uuid AND activo = true
      LIMIT 1
    `) as any[]
    const original = originalRows[0]
    if (!original) throw new Error('Producto original no encontrado')
    const precio = input.precio !== undefined && input.precio !== null
      ? Number(input.precio)
      : Number(original.precio)
    if (!Number.isFinite(precio) || precio < 0) {
      throw new Error('precio inválido')
    }
    const insertProd = (await sql`
      INSERT INTO soda_master.productos
        (nombre, categoria_id, precio, descripcion, imagen_url,
         es_ingrediente_especial, costo_adicional, modo_stock, activo)
      VALUES
        (${nombreNuevo}, ${original.categoria_id}, ${precio}, ${original.descripcion},
         ${original.imagen_url}, ${original.es_ingrediente_especial || false},
         ${original.costo_adicional || 0}, ${original.modo_stock || 'producto'}, true)
      RETURNING *
    `) as any[]
    const nuevoProducto = insertProd[0]
    // Tabla `inventario` no tiene UNIQUE(producto_id) en este schema,
    // así que evitamos ON CONFLICT y verificamos manualmente.
    const yaExiste = (await sql`
      SELECT 1 FROM soda_master.inventario WHERE producto_id = ${nuevoProducto.id}::uuid LIMIT 1
    `) as any[]
    if (yaExiste.length === 0) {
      await sql`
        INSERT INTO soda_master.inventario (producto_id, stock_actual, stock_minimo, unidad_medida)
        VALUES (${nuevoProducto.id}, 100, 10, 'unidad')
      `
    }
    // Copia la receta si la original tenía una. `modo_stock` vive en
    // la tabla `productos`, no en `recetas` — el clone de producto ya
    // copia ese campo, así que sólo replicamos las filas de receta.
    const recetaRows = (await sql`
      SELECT id FROM soda_master.recetas
      WHERE producto_id = ${input.producto_id}::uuid AND activo = true
      LIMIT 1
    `) as any[]
    let recetaCopiada = false
    if (recetaRows[0]) {
      const nuevaRecetaRows = (await sql`
        INSERT INTO soda_master.recetas (producto_id, nombre, activo)
        VALUES (${nuevoProducto.id}::uuid, ${nombreNuevo}, true)
        RETURNING id
      `) as any[]
      const nuevaRecetaId = nuevaRecetaRows[0]?.id
      if (nuevaRecetaId) {
        await sql`
          INSERT INTO soda_master.receta_ingredientes
            (receta_id, ingrediente_id, cantidad, opcional, extra, costo_adicional, nombre_display)
          SELECT ${nuevaRecetaId}::uuid, ingrediente_id, cantidad, opcional, extra,
                 costo_adicional, nombre_display
          FROM soda_master.receta_ingredientes
          WHERE receta_id = ${recetaRows[0].id}::uuid
        `
        recetaCopiada = true
      }
    }
    return { producto: nuevoProducto, receta_copiada: recetaCopiada }
  },

  async getProductosEspeciales(): Promise<Producto[]> {
    const sql = getSql()
    const result = await sql`
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url,
        p.activo,
        p.categoria_id,
        p.es_ingrediente_especial,
        p.costo_adicional,
        COALESCE(p.modo_stock, 'producto') AS modo_stock,
        c.nombre AS categoria,
        COALESCE(inv.stock_actual, 0)  AS stock,
        COALESCE(inv.stock_minimo, 5)  AS "stockMinimo",
        COALESCE(inv.unidad_medida, 'unidad') AS formato
      FROM soda_master.productos p
      LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
      LEFT JOIN soda_master.inventario inv ON inv.producto_id = p.id
      WHERE p.activo = true
        AND p.es_ingrediente_especial = true
        AND COALESCE(inv.stock_actual, 0) > 0
      ORDER BY p.nombre
    `
    return result.map(mapProducto) as Producto[]
  },

  async actualizarProducto(
    id: string,
    updates: Partial<{
      nombre: string
      descripcion: string
      precio: number
      categoria: string
      activo: boolean
      esIngredienteEspecial: boolean
      costoAdicional: number
      imagen_url: string
      modoStock: string
    }>
  ) {
    const sql = getSql()
    let categoriaId: string | null = null
    if (updates.categoria !== undefined) {
      const catRows = await sql`
        SELECT id FROM soda_master.categorias WHERE nombre = ${updates.categoria} LIMIT 1
      `
      categoriaId = catRows[0] ? (catRows[0] as any).id : null
    }
    const result = await sql`
      UPDATE soda_master.productos
      SET nombre = COALESCE(${updates.nombre ?? null}, nombre),
          descripcion = COALESCE(${updates.descripcion ?? null}, descripcion),
          precio = COALESCE(${updates.precio ?? null}, precio),
          categoria_id = COALESCE(${categoriaId}, categoria_id),
          activo = COALESCE(${updates.activo ?? null}, activo),
          es_ingrediente_especial = COALESCE(${updates.esIngredienteEspecial ?? null}, es_ingrediente_especial),
          costo_adicional = COALESCE(${updates.costoAdicional ?? null}, costo_adicional),
          imagen_url = COALESCE(${updates.imagen_url ?? null}, imagen_url),
          modo_stock = COALESCE(${updates.modoStock ?? null}, modo_stock),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `
    if (!result[0]) return null
    const fresco = await sql`
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url,
        p.activo,
        p.categoria_id,
        p.es_ingrediente_especial,
        p.costo_adicional,
        COALESCE(p.modo_stock, 'producto') AS modo_stock,
        c.nombre AS categoria,
        COALESCE(inv.stock_actual, 0)  AS stock,
        COALESCE(inv.stock_minimo, 5)  AS "stockMinimo",
        COALESCE(inv.unidad_medida, 'unidad') AS formato
      FROM soda_master.productos p
      LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
      LEFT JOIN soda_master.inventario inv ON inv.producto_id = p.id
      WHERE p.id = ${id}
    `
    return fresco[0] ? mapProducto(fresco[0]) : null
  },

  async getInventarioCompleto() {
    const sql = getSql()
    const result = await sql`
      SELECT
        inv.id,
        inv.producto_id,
        p.nombre                        AS producto_nombre,
        c.nombre                        AS categoria,
        inv.stock_actual,
        inv.stock_minimo,
        inv.unidad_medida,
        inv.updated_at,
        p.precio,
        p.es_ingrediente_especial,
        p.costo_adicional,
        COALESCE(p.modo_stock, 'producto') AS modo_stock
      FROM soda_master.inventario inv
      JOIN soda_master.productos p ON inv.producto_id = p.id
      JOIN soda_master.categorias c ON p.categoria_id = c.id
      WHERE p.activo = true
      ORDER BY c.nombre, p.nombre
    `
    return result.map((row: any) => ({
      ...row,
      precio: row.precio !== undefined && row.precio !== null ? Number(row.precio) : 0,
      es_ingrediente_especial: row.es_ingrediente_especial === true,
      costo_adicional: row.costo_adicional !== undefined && row.costo_adicional !== null
        ? Number(row.costo_adicional)
        : 0,
    }))
  },

  async crearProducto(producto: Omit<Producto, 'id' | 'created_at' | 'updated_at'>) {
    const sql = getSql()
    // Resolve categoria name → id
    const catRows = await sql`
      SELECT id FROM soda_master.categorias WHERE nombre = ${producto.categoria} LIMIT 1
    `
    const categoriaId = catRows[0] ? (catRows[0] as any).id : null
    const result = await sql`
      INSERT INTO soda_master.productos (nombre, categoria_id, precio, descripcion, imagen_url, activo)
      VALUES (${producto.nombre}, ${categoriaId}, ${producto.precio}, ${(producto as any).descripcion ?? ''}, ${(producto as any).imagen_url ?? ''}, true)
      RETURNING *
    `
    // Create inventory row
    await sql`
      INSERT INTO soda_master.inventario (producto_id, stock_actual, stock_minimo, unidad_medida)
      VALUES (${(result[0] as any).id}, 100, 10, 'unidad')
    `
    return result[0] as Producto
  },

  // Órdenes
  async crearOrden(orden: {
    mesa_id: string
    /** Siempre el usuario de la sesión (la ruta lo pone; nunca viene del body). */
    usuario_id: string
    estado?: 'pendiente' | 'en_cocina'
    notas?: string | null
  }) {
    await ensureOrdenesAtomicasSchema()
    const sql = getSql()
    const estadoInicial = orden.estado === 'pendiente' ? 'pendiente' : 'en_cocina'
    await this.validarAperturaMesa(orden.mesa_id, orden.usuario_id)

    // Sesión 8 (B1): todo bajo el lock de la mesa en una transacción. Limpia solo las comandas
    // vacías de más de 2 minutos (nunca la recién creada por otra request), verifica que no haya
    // otra activa e inserta; el índice único `ordenes_mesa_activa_uk` es la red de seguridad.
    // `enviado_a_cocina` y `hora_envio` los decide el servidor según el estado.
    let resultados: any[][]
    try {
      resultados = (await sql.transaction(
        sentenciasAperturaOrden(sql, {
          ordenId: crypto.randomUUID(),
          mesaId: orden.mesa_id,
          usuarioId: orden.usuario_id,
          estado: estadoInicial,
          notas: orden.notas ?? '',
        }),
      )) as any[][]
    } catch (err) {
      return errorDeTransaccionOrden(err, null)
    }
    return resultados[resultados.length - 1][0] as Orden
  },

  /**
   * Antes de abrir una mesa: la mesa existe y, si quien abre es un cajero, tiene un permiso
   * vigente `apertura_mesa` o un rol adicional de mesero (se valida en el servidor).
   */
  async validarAperturaMesa(mesa_id: string, usuario_id: string) {
    const sql = getSql()
    const mesaRows = (await sql`
      SELECT 1 FROM soda_master.mesas WHERE id = ${mesa_id}::uuid
    `) as any[]
    if (mesaRows.length === 0) {
      throw new ErrorOrden('MESA_NO_ENCONTRADA', 404, 'La mesa no existe.')
    }

    // Control de acceso por rol: meseros/administradores/admins pueden
    // abrir mesa sin restricción. Para que un CAJERO pueda hacerlo
    // necesita o bien tener `mesero` como rol adicional permanente, o
    // bien que el admin le haya otorgado el permiso especial temporal
    // `apertura_mesa`. Esto se valida server-side para que ninguna
    // vista pueda saltearse la regla.
    if (usuario_id) {
      await ensureRolesAdicionalesSchema()
      const usuarios = (await sql`
        SELECT rol, COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales
        FROM soda_master.usuarios WHERE id = ${usuario_id}
      `) as Array<{ rol: string | null; roles_adicionales: string[] }>
      const rol = (usuarios[0]?.rol || '').toLowerCase()
      const adicionales = (usuarios[0]?.roles_adicionales || []).map((r) =>
        String(r).toLowerCase(),
      )
      const tieneRolApertura =
        ['mesero', 'admin', 'administrador'].includes(rol) ||
        adicionales.some((r) =>
          ['mesero', 'admin', 'administrador'].includes(r),
        )
      if (rol === 'cajero' && !tieneRolApertura) {
        const permitido = await this.tienePermisoEspecial(usuario_id, 'apertura_mesa')
        if (!permitido) {
          throw new ErrorOrden(
            'PERMISO_APERTURA_MESA',
            403,
            'El cajero no tiene un permiso vigente para abrir mesas. Pídele al administrador que le otorgue un permiso temporal (o un rol adicional de mesero permanente).',
          )
        }
      }
    }

  },

  async getOrdenById(id: string): Promise<Orden | null> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.ordenes WHERE id = ${id}`
    return result[0] as Orden | null
  },

  async getOrdenesPendientes(): Promise<Orden[]> {
    const sql = getSql()
    const result = await sql`
      SELECT * FROM soda_master.ordenes 
      WHERE estado IN ('pendiente', 'en_cocina', 'listo')
      ORDER BY created_at DESC
    `
    return result as Orden[]
  },

  /**
   * Órdenes que carga la app (KDS, POS, Pagos y Mesas) y que devuelve el sondeo. Sesión 13 (F37, F41):
   * además de las activas, trae las órdenes `pagado` con algún ítem sin `listo` ni `entregado` (se
   * pagaron por adelantado pero cocina todavía las prepara), con DOS límites para que el sondeo no
   * crezca: solo las cobradas en las últimas `VENTANA_PAGADAS_KDS_HORAS` horas (la fecha del cobro es
   * la del último pago de la orden, `pagos.created_at`: ninguna otra operación la mueve, a diferencia de
   * `ordenes.updated_at`) y como máximo las `TOPE_PAGADAS_KDS` más recientes.
   * Esas órdenes NO las ve ninguna otra pantalla: `lib/app-context.tsx` las separa en
   * `state.comandasCocinaPagadas` y solo las muestra el KDS; `comandas` queda igual que antes.
   */
  async getOrdenesParaKDS(): Promise<Orden[]> {
    await ensureItemPagoSchema()
    await ensureCuentasPersonaSchema()
    await ensureTimestampTzMigration()
    const sql = getSql()
    const ventanaHoras = VENTANA_PAGADAS_KDS_HORAS
    const tope = TOPE_PAGADAS_KDS
    const result = await sql`
      SELECT o.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', i.id,
                   'producto_id', i.producto_id,
                   'producto_nombre', p.nombre,
                   'categoria', c.nombre,
                   'cantidad', i.cantidad,
                   'precio_unitario', i.precio_unitario,
                   'modificadores', i.modificadores,
                   'notas_especiales', i.notas_especiales,
                   'estado_item', i.estado_item,
                   'pagado', i.pagado,
                   'pago_id', i.pago_id,
                   'cuenta_persona_id', i.cuenta_persona_id
                 ) ORDER BY i.created_at
               ) FILTER (WHERE i.id IS NOT NULL),
               '[]'::json
             ) AS items,
             COALESCE(
               (
                 SELECT json_agg(
                   json_build_object('id', cp.id, 'idx', cp.idx, 'nombre', cp.nombre)
                   ORDER BY cp.idx
                 )
                 FROM soda_master.cuentas_persona cp
                 WHERE cp.orden_id = o.id
               ),
               '[]'::json
             ) AS cuentas_persona,
             (SELECT d.tipo FROM soda_master.descuentos d
               WHERE d.orden_id = o.id ORDER BY d.created_at DESC LIMIT 1) AS descuento_tipo,
             (SELECT d.valor FROM soda_master.descuentos d
               WHERE d.orden_id = o.id ORDER BY d.created_at DESC LIMIT 1) AS descuento_valor,
             (SELECT d.motivo FROM soda_master.descuentos d
               WHERE d.orden_id = o.id ORDER BY d.created_at DESC LIMIT 1) AS descuento_motivo,
             -- B4: lo que los cobros anteriores de la orden ya descontaron (prorrateo en Pagos)
             (SELECT COALESCE(SUM(pg.descuento), 0) FROM soda_master.pagos pg
               WHERE pg.orden_id = o.id) AS descuento_dado
      FROM soda_master.ordenes o
      LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
      LEFT JOIN soda_master.productos p ON i.producto_id = p.id
      LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
      WHERE o.estado NOT IN ('pagado', 'cancelado', 'perdida')
         OR o.id IN (
              SELECT pg.orden_id
                FROM soda_master.pagos pg
                JOIN soda_master.ordenes op ON op.id = pg.orden_id AND op.estado = 'pagado'
               WHERE EXISTS (SELECT 1 FROM soda_master.items_orden x
                              WHERE x.orden_id = op.id AND COALESCE(x.estado_item, 'pendiente') NOT IN ('listo', 'entregado'))
               GROUP BY pg.orden_id
              HAVING MAX(pg.created_at) >= now() - make_interval(hours => ${ventanaHoras}::int)
               ORDER BY MAX(pg.created_at) DESC
               LIMIT ${tope}::int)
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `
    return result as Orden[]
  },

  // Historial de pedidos para KDS (cocina/bar). Devuelve órdenes con
  // sus items incluyendo nombre de producto, categoría y mesa, para una
  // fecha concreta (en zona America/Santiago) o todas si no se pasa
  // fecha. A diferencia de `getOrdenesParaKDS`, incluye también
  // órdenes ya pagadas/canceladas/perdidas — es para revisar lo que
  // pasó, no para preparar.
  async getHistorialKDS(opts: { fecha?: string; limite?: number } = {}): Promise<any[]> {
    await ensureItemPagoSchema()
    await ensureTimestampTzMigration()
    const sql = getSql()
    const limite = opts.limite && opts.limite > 0 ? Math.min(opts.limite, 500) : 200
    const fechaIso =
      opts.fecha === 'hoy'
        ? null // marcador para usar now() en zona local
        : (opts.fecha || null)
    if (opts.fecha === 'hoy') {
      return (await sql`
        SELECT o.id, o.mesa_id, o.estado, o.created_at, o.updated_at,
               m.numero AS mesa_numero,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', i.id,
                     'producto_id', i.producto_id,
                     'producto_nombre', p.nombre,
                     'categoria', c.nombre,
                     'cantidad', i.cantidad,
                     'precio_unitario', i.precio_unitario,
                     'modificadores', i.modificadores,
                     'notas_especiales', i.notas_especiales,
                     'estado_item', i.estado_item,
                     'pagado', i.pagado,
                     'item_created_at', i.created_at
                   ) ORDER BY i.created_at
                 ) FILTER (WHERE i.id IS NOT NULL),
                 '[]'::json
               ) AS items
        FROM soda_master.ordenes o
        LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
        LEFT JOIN soda_master.productos p ON i.producto_id = p.id
        LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
        LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
        WHERE (o.created_at AT TIME ZONE 'America/Santiago')::date
              = (now() AT TIME ZONE 'America/Santiago')::date
        GROUP BY o.id, m.numero
        ORDER BY o.created_at DESC
        LIMIT ${limite}
      `) as unknown as any[]
    }
    if (fechaIso) {
      return (await sql`
        SELECT o.id, o.mesa_id, o.estado, o.created_at, o.updated_at,
               m.numero AS mesa_numero,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', i.id,
                     'producto_id', i.producto_id,
                     'producto_nombre', p.nombre,
                     'categoria', c.nombre,
                     'cantidad', i.cantidad,
                     'precio_unitario', i.precio_unitario,
                     'modificadores', i.modificadores,
                     'notas_especiales', i.notas_especiales,
                     'estado_item', i.estado_item,
                     'pagado', i.pagado,
                     'item_created_at', i.created_at
                   ) ORDER BY i.created_at
                 ) FILTER (WHERE i.id IS NOT NULL),
                 '[]'::json
               ) AS items
        FROM soda_master.ordenes o
        LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
        LEFT JOIN soda_master.productos p ON i.producto_id = p.id
        LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
        LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
        WHERE (o.created_at AT TIME ZONE 'America/Santiago')::date = ${fechaIso}::date
        GROUP BY o.id, m.numero
        ORDER BY o.created_at DESC
        LIMIT ${limite}
      `) as unknown as any[]
    }
    return (await sql`
      SELECT o.id, o.mesa_id, o.estado, o.created_at, o.updated_at,
             m.numero AS mesa_numero,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', i.id,
                   'producto_id', i.producto_id,
                   'producto_nombre', p.nombre,
                   'categoria', c.nombre,
                   'cantidad', i.cantidad,
                   'precio_unitario', i.precio_unitario,
                   'modificadores', i.modificadores,
                   'notas_especiales', i.notas_especiales,
                   'estado_item', i.estado_item,
                   'pagado', i.pagado,
                   'item_created_at', i.created_at
                 ) ORDER BY i.created_at
               ) FILTER (WHERE i.id IS NOT NULL),
               '[]'::json
             ) AS items
      FROM soda_master.ordenes o
      LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
      LEFT JOIN soda_master.productos p ON i.producto_id = p.id
      LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
      LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
      GROUP BY o.id, m.numero
      ORDER BY o.created_at DESC
      LIMIT ${limite}
    `) as unknown as any[]
  },

  async getOrdenes(opts: { fecha?: string; limite?: number; orden?: 'asc' | 'desc' } = {}): Promise<Orden[]> {
    const sql = getSql()
    const limite = opts.limite && opts.limite > 0 ? Math.min(opts.limite, 500) : 200
    const fechaIso = opts.fecha === 'hoy'
      ? new Date().toISOString().slice(0, 10)
      : (opts.fecha || null)
    if (fechaIso && opts.orden === 'asc') {
      return await sql`
        SELECT * FROM soda_master.ordenes
        WHERE (created_at AT TIME ZONE 'America/Santiago')::date = ${fechaIso}::date
        ORDER BY created_at ASC
        LIMIT ${limite}
      ` as unknown as Orden[]
    }
    if (fechaIso) {
      return await sql`
        SELECT * FROM soda_master.ordenes
        WHERE (created_at AT TIME ZONE 'America/Santiago')::date = ${fechaIso}::date
        ORDER BY created_at DESC
        LIMIT ${limite}
      ` as unknown as Orden[]
    }
    if (opts.orden === 'asc') {
      return await sql`
        SELECT * FROM soda_master.ordenes
        ORDER BY created_at ASC
        LIMIT ${limite}
      ` as unknown as Orden[]
    }
    return await sql`
      SELECT * FROM soda_master.ordenes
      ORDER BY created_at DESC
      LIMIT ${limite}
    ` as unknown as Orden[]
  },

  async getOrdenesPorMesa(mesaId: string): Promise<Orden[]> {
    const sql = getSql()
    const result = await sql`
      SELECT * FROM soda_master.ordenes 
      WHERE mesa_id = ${mesaId} AND estado NOT IN ('pagado', 'cancelado', 'perdida')
      ORDER BY created_at DESC
    `
    return result as Orden[]
  },

  /**
   * Cambios de una orden desde el navegador (sesión 6: R3/A7). La ruta ya
   * validó el body (zod) y que el rol pueda pedir ese destino; aquí se hace
   * cumplir que la transición sea válida DESDE el estado actual, dentro del
   * propio UPDATE (atómico). `enviado_a_cocina` y `hora_envio` los decide el
   * servidor. Los montos no se tocan aquí: los calculan crear, editar y borrar ítems dentro de su transacción.
   */
  async actualizarOrden(
    id: string,
    cambios: { estado?: DestinoPatch; notas?: string },
    usuario: { id: string; nombre: string; rol: string },
  ) {
    await ensureOrdenEstadoSchema()
    if (cambios.estado === 'cancelado') {
      return this.cancelarOrden(id, cambios.notas ?? '', usuario)
    }
    const sql = getSql()
    const hacia = cambios.estado ?? null
    const notas = cambios.notas ?? null
    const origenes = hacia
      ? [...ORIGENES_VALIDOS[hacia]]
      : ['pendiente', 'en_cocina', 'en_preparacion', 'listo', 'entregado', 'problema']
    const result = (await sql`
      UPDATE soda_master.ordenes
      SET estado = COALESCE(${hacia}::text, estado),
          notas = COALESCE(${notas}::text, notas),
          enviado_a_cocina = CASE WHEN ${hacia}::text = 'en_cocina' THEN TRUE ELSE enviado_a_cocina END,
          hora_envio = CASE WHEN ${hacia}::text = 'en_cocina'
                            THEN COALESCE(hora_envio, CURRENT_TIMESTAMP) ELSE hora_envio END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}::uuid AND estado = ANY(${origenes}::text[])
      RETURNING *
    `) as any[]
    if (result[0]) return result[0] as Orden

    const actual = (await sql`
      SELECT estado FROM soda_master.ordenes WHERE id = ${id}::uuid
    `) as any[]
    if (!actual[0]) throw new ErrorOrden('ORDEN_NO_ENCONTRADA', 404, 'La orden no existe.')
    if (!hacia || esEstadoTerminal(actual[0].estado)) {
      throw new ErrorOrden(
        'ORDEN_NO_ACTIVA',
        409,
        `La orden está ${actual[0].estado} y no se puede modificar.`,
      )
    }
    throw new ErrorOrden(
      'TRANSICION_INVALIDA',
      409,
      `No se puede pasar una orden de "${actual[0].estado}" a "${hacia}".`,
    )
  },

  /**
   * Cancelar una orden (solo admin, la ruta lo exige). Va en una transacción
   * con el mismo patrón del cobro: se bloquea la fila de la orden (FOR UPDATE)
   * y recién entonces se verifican estado e ítems pagados. Un cobro parcial
   * concurrente hace commit antes o después, nunca "en medio": nunca queda
   * una orden cancelada con ítems pagados.
   */
  async cancelarOrden(
    id: string,
    motivo: string,
    usuario: { id: string; nombre: string; rol: string },
  ) {
    await ensureItemPagoSchema()
    await ensureOrdenEstadoSchema()
    await ensurePagoSchema()
    await ensureOrdenesAtomicasSchema()
    const sql = getSql()
    const O = id
    const origenes = [...ORIGENES_VALIDOS.cancelado]
    let resultados: any[][] = []
    try {
      resultados = (await sql.transaction([
        sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
              'ORDEN_NO_ENCONTRADA')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${origenes}::text[]),
              'ORDEN_NO_ACTIVA')`,
        sql`SELECT soda_master.assert_cobro(
              NOT EXISTS (SELECT 1 FROM soda_master.items_orden WHERE orden_id = ${O}::uuid AND pagado = TRUE),
              'ORDEN_CON_ITEMS_PAGADOS')`,
        // F10: el stock de los ítems que cocina aún no tocó vuelve en la misma transacción.
        // Los montos de la orden no se recalculan: una orden cancelada conserva sus montos.
        ...sentenciasRetornoStock(sql, O, null, 'Orden cancelada'),
        sql`UPDATE soda_master.ordenes
            SET estado = 'cancelado', notas = ${motivo}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${O}::uuid
            RETURNING *`,
      ])) as any[][]
    } catch (err) {
      traducirErrorTx(err, {
        ORDEN_CON_ITEMS_PAGADOS: 'La orden tiene ítems pagados: no se puede cancelar.',
      })
    }
    const orden = resultados[resultados.length - 1][0] as Orden
    await this.registrarAuditoriaAdmin({
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      usuario_rol: usuario.rol,
      accion: 'cancelar_orden',
      entidad: 'orden',
      entidad_id: id,
      detalles: { motivo },
    }).catch((e) => console.error('[auditoria] cancelar_orden:', e))
    return orden
  },

  /**
   * Borrar una orden con sus ítems. Transacción con bloqueo de la orden:
   * nunca se borra una orden con ítems pagados ni una orden histórica
   * (pagada, cancelada o perdida), tampoco el admin. Un mesero o cajero solo
   * borra una orden que abrió él mismo y cuyos ítems siguen en 'pendiente'
   * (el rollback del POS cuando falla el envío a cocina).
   */
  async eliminarOrden(
    id: string,
    usuario: { id: string; nombre: string; rol: string; esAdmin: boolean },
  ) {
    await ensureItemPagoSchema()
    await ensurePagoSchema()
    await ensureOrdenesAtomicasSchema()
    const sql = getSql()
    const O = id
    const origenes = [...ORIGENES_VALIDOS.cancelado]
    const consultas: any[] = [
      sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
            'ORDEN_NO_ENCONTRADA')`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${origenes}::text[]),
            'ORDEN_NO_ACTIVA')`,
      sql`SELECT soda_master.assert_cobro(
            NOT EXISTS (SELECT 1 FROM soda_master.items_orden WHERE orden_id = ${O}::uuid AND pagado = TRUE),
            'ORDEN_CON_ITEMS_PAGADOS')`,
    ]
    if (!usuario.esAdmin) {
      consultas.push(
        sql`SELECT soda_master.assert_cobro(
              (SELECT usuario_id FROM soda_master.ordenes WHERE id = ${O}::uuid) = ${usuario.id}::uuid,
              'ORDEN_AJENA')`,
        sql`SELECT soda_master.assert_cobro(
              NOT EXISTS (SELECT 1 FROM soda_master.items_orden
                           WHERE orden_id = ${O}::uuid AND estado_item <> 'pendiente'),
              'ORDEN_CON_ITEMS_AVANZADOS')`,
      )
    }
    consultas.push(
      // F10: devuelve el stock de los ítems sin preparar (y anota la merma de los ya preparados)
      // antes de borrarlos. La orden desaparece, así que no hay montos que recalcular.
      ...sentenciasRetornoStock(sql, O, null, usuario.esAdmin ? 'Orden borrada por el administrador' : 'Orden borrada'),
      sql`DELETE FROM soda_master.items_orden WHERE orden_id = ${O}::uuid`,
      // `descuentos.orden_id` no tiene ON DELETE CASCADE: sin esto, una orden con descuento no se podía borrar.
      sql`DELETE FROM soda_master.descuentos WHERE orden_id = ${O}::uuid`,
      sql`DELETE FROM soda_master.ordenes WHERE id = ${O}::uuid`,
    )
    try {
      await sql.transaction(consultas)
    } catch (err) {
      traducirErrorTx(err)
    }
    if (usuario.esAdmin) {
      await this.registrarAuditoriaAdmin({
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre,
        usuario_rol: usuario.rol,
        accion: 'eliminar_orden',
        entidad: 'orden',
        entidad_id: id,
      }).catch((e) => console.error('[auditoria] eliminar_orden:', e))
    }
    return { success: true }
  },

  /**
   * Precio de un ítem calculado por el servidor (sesión 6, F8):
   * `productos.precio` + Σ costo_adicional × cantidad de cada extra. Un extra
   * es una línea `extra` de la receta activa del producto o un producto
   * marcado como ingrediente especial; con su costo de la base, nunca el que
   * mande el navegador. Un extra desconocido se rechaza (400). Variantes: el
   * modelo de datos no las tiene (una "variante" real es un producto clonado
   * con su propio precio), así que el precio base es el del producto.
   */
  async calcularPrecioItem(
    productoId: string,
    extras: { ingrediente_id: string; cantidad: number }[],
  ): Promise<{
    precio: number
    extras: Array<{ id: string; nombre: string; costoAdicional: number }>
  }> {
    const sql = getSql()
    const prod = (await sql`
      SELECT precio FROM soda_master.productos WHERE id = ${productoId}::uuid
    `) as any[]
    if (!prod[0]) throw new ErrorOrden('PRODUCTO_NO_ENCONTRADO', 404, 'Producto no encontrado')
    let precio = Number(prod[0].precio) || 0
    const resueltos: Array<{ id: string; nombre: string; costoAdicional: number }> = []
    if (extras.length > 0) {
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const ids = Array.from(new Set(extras.map((e) => e.ingrediente_id)))
      if (ids.some((id) => !UUID.test(id))) {
        throw new ErrorOrden('EXTRA_INVALIDO', 400, 'Extra no válido para este producto.')
      }
      const [lineas, especiales] = (await Promise.all([
        sql`
          SELECT ri.ingrediente_id::text AS id, ri.costo_adicional,
                 COALESCE(NULLIF(TRIM(ri.nombre_display), ''), i.nombre) AS nombre
          FROM soda_master.receta_ingredientes ri
          JOIN soda_master.recetas r ON r.id = ri.receta_id
          JOIN soda_master.ingredientes i ON i.id = ri.ingrediente_id
          WHERE r.producto_id = ${productoId}::uuid AND r.activo = true
            AND ri.extra = true AND i.activo = true
            AND ri.ingrediente_id = ANY(${ids}::uuid[])
        `,
        sql`
          SELECT id::text AS id, nombre, costo_adicional
          FROM soda_master.productos
          WHERE id = ANY(${ids}::uuid[]) AND es_ingrediente_especial = true AND activo = true
        `,
      ])) as any[][]
      const porId = new Map<string, { nombre: string; costo: number }>()
      for (const e of especiales) {
        porId.set(e.id, { nombre: e.nombre, costo: Number(e.costo_adicional) || 0 })
      }
      // Las líneas de receta mandan sobre un producto especial con el mismo id (no deberían coincidir).
      for (const l of lineas) {
        porId.set(l.id, { nombre: l.nombre, costo: Number(l.costo_adicional) || 0 })
      }
      for (const e of extras) {
        const def = porId.get(e.ingrediente_id)
        if (!def) throw new ErrorOrden('EXTRA_INVALIDO', 400, 'Extra no válido para este producto.')
        precio += def.costo * (e.cantidad > 0 ? e.cantidad : 1)
        if (!resueltos.some((r) => r.id === e.ingrediente_id)) {
          resueltos.push({ id: e.ingrediente_id, nombre: def.nombre, costoAdicional: def.costo })
        }
      }
    }
    return { precio: Math.round(precio * 100) / 100, extras: resueltos }
  },

  // Items de orden

  /**
   * Envío atómico de una comanda (sesión 8: #11, B1, R7, F10). Con `mesa_id` abre la orden;
   * con `orden_id` agrega a una existente. TODO va en una `sql.transaction`: bloqueo de la mesa
   * o de la orden, limpieza de comandas vacías abandonadas, descuento de stock con guarda
   * (todo-o-nada para el conjunto de ítems), ítems con el precio del servidor, movimientos de
   * inventario, estado de la orden y montos (con guarda de huella: si la orden cambió desde la
   * lectura, se reintenta). Si algo falla, no queda orden, ítems ni stock a medias.
   * `enviar: false` (el `POST /api/items-orden` antiguo) no cambia el estado de la orden.
   */
  async enviarComanda(input: {
    mesa_id?: string
    orden_id?: string
    usuario_id?: string
    notas?: string | null
    enviar?: boolean
    items: Array<{
      producto_id: string
      cantidad: number
      modificadores?: string[]
      seleccion_modificadores?: string[]
      extras_ingredientes?: { ingrediente_id: string; cantidad?: number }[]
      notas_especiales?: string | null
    }>
  }): Promise<{ orden: Orden; items: ItemOrden[] }> {
    await ensureRecetasTables()
    await ensureOrdenesAtomicasSchema()
    await ensureEstadoOrdenFuncion()
    const sql = getSql()
    if (Boolean(input.mesa_id) === Boolean(input.orden_id)) {
      throw new ErrorOrden('DATOS_INVALIDOS', 400, 'Indica la mesa (orden nueva) o la orden (agregar ítems), solo una.')
    }
    if (input.items.length === 0) {
      throw new ErrorOrden('SIN_ITEMS', 400, 'Agrega al menos un ítem a la comanda.')
    }
    for (const it of input.items) {
      const c = Number(it.cantidad)
      if (!Number.isInteger(c) || c <= 0) throw new ErrorOrden('CANTIDAD_INVALIDA', 400, 'Cantidad inválida')
    }
    const enviar = input.enviar !== false

    // ── Lectura previa (la transacción la revalida) ──
    if (input.orden_id) {
      const ordenRows = (await sql`
        SELECT estado FROM soda_master.ordenes WHERE id = ${input.orden_id}::uuid
      `) as any[]
      if (!ordenRows[0]) throw new ErrorOrden('ORDEN_NO_ENCONTRADA', 404, 'La orden no existe.')
      if (esEstadoTerminal(ordenRows[0].estado)) {
        throw new ErrorOrden(
          'ORDEN_NO_ACTIVA',
          409,
          `La orden está ${ordenRows[0].estado}: no se pueden agregar ítems.`,
        )
      }
    } else {
      if (!input.usuario_id) throw new ErrorOrden('SESION_REQUERIDA', 401, 'Sesión requerida')
      await this.validarAperturaMesa(input.mesa_id!, input.usuario_id)
    }

    const defs = await leerDefProductos(input.items.map((i) => i.producto_id))
    const preparados = await Promise.all(
      input.items.map(async (it, orden) => {
        const { mods, extras } = parseSeleccionItem(it)
        // Precio del servidor: lo que se cobra sale de la base, no del navegador.
        const calculo = await this.calcularPrecioItem(it.producto_id, extras)
        const def = defs.get(it.producto_id.toLowerCase())!
        const cantidad = Number(it.cantidad)
        return {
          id: crypto.randomUUID(),
          orden,
          producto_id: def.id,
          cantidad,
          precio: calculo.precio,
          modificadores: it.modificadores ?? mods,
          notas: normalizarMetadataExtras(it.notas_especiales, calculo.extras) ?? null,
          demanda: necesidadItem(def, cantidad, mods, extras),
        }
      }),
    )
    const demanda = sumarDemandas(preparados.map((p) => p.demanda))
    const ordenId = input.orden_id ?? crypto.randomUUID()

    const filasItems = preparados.map((p) => ({
      id: p.id,
      producto_id: p.producto_id,
      cantidad: p.cantidad,
      precio_unitario: p.precio,
      modificadores: p.modificadores,
      notas_especiales: p.notas,
      ord: p.orden,
    }))
    const filasMov: FilaMovimiento[] = []
    for (const p of preparados) {
      for (const [ing, q] of p.demanda.ingredientes) {
        filasMov.push({ ingrediente_id: ing, producto_id: p.producto_id, item_orden_id: p.id, cantidad: q })
      }
      for (const [prod, q] of p.demanda.productos) {
        filasMov.push({ ingrediente_id: null, producto_id: prod, item_orden_id: p.id, cantidad: q })
      }
    }

    return conReintento(async () => {
      const ctx = await leerContextoTotales(input.orden_id ?? null)
      const calc = totalesDe(ctx, [
        ...ctx.items,
        ...preparados.map((p) => ({ cantidad: p.cantidad, precio: p.precio })),
      ])
      const consultas: any[] = []
      if (input.orden_id) {
        const O = input.orden_id
        consultas.push(
          sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
          sql`SELECT soda_master.assert_cobro(
                (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
                'ORDEN_NO_ENCONTRADA')`,
          sql`SELECT soda_master.assert_cobro(
                (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${[...ESTADOS_ORDEN_ACTIVA]}::text[]),
                'ORDEN_NO_ACTIVA')`,
          sentenciaHuellaOrden(sql, O, ctx),
        )
      } else {
        consultas.push(
          ...sentenciasAperturaOrden(sql, {
            ordenId,
            mesaId: input.mesa_id!,
            usuarioId: input.usuario_id!,
            estado: 'pendiente',
            notas: input.notas ?? '',
          }),
        )
      }
      consultas.push(...sentenciasAjusteStock(sql, demanda))
      const idxItems = consultas.length
      consultas.push(sql`
        INSERT INTO soda_master.items_orden
          (id, orden_id, producto_id, cantidad, precio_unitario, modificadores, notas_especiales, estado_item, created_at)
        SELECT x.id, ${ordenId}::uuid, x.producto_id, x.cantidad, x.precio_unitario, x.modificadores,
               x.notas_especiales, 'pendiente', now() + x.ord * interval '1 millisecond'
        FROM jsonb_to_recordset(${JSON.stringify(filasItems)}::jsonb)
          AS x(id uuid, producto_id uuid, cantidad int, precio_unitario numeric,
               modificadores jsonb, notas_especiales text, ord int)
        RETURNING *`)
      if (filasMov.length > 0) {
        consultas.push(sentenciaMovimientos(sql, 'venta', ordenId, filasMov, 'Venta item'))
      }
      consultas.push(sql`
        UPDATE soda_master.ordenes
        SET subtotal = ${calc.subtotal}, impuesto = ${calc.impuesto}, total = ${calc.total},
            estado = CASE WHEN ${enviar}::boolean THEN 'en_cocina' ELSE estado END,
            enviado_a_cocina = CASE WHEN ${enviar}::boolean THEN TRUE ELSE enviado_a_cocina END,
            hora_envio = CASE WHEN ${enviar}::boolean THEN COALESCE(hora_envio, CURRENT_TIMESTAMP) ELSE hora_envio END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${ordenId}::uuid`)
      // Sesión 13 (B5): con ítems nuevos pendientes, la orden vuelve a `en_cocina` (o conserva
      // `problema` / `en_preparacion` si hay ítems en ese estado) y reaparece en el KDS.
      consultas.push(sentenciaRecalcularEstado(sql, ordenId))
      const idxOrden = consultas.length
      consultas.push(sql`SELECT * FROM soda_master.ordenes WHERE id = ${ordenId}::uuid`)
      let res: any[][]
      try {
        res = (await sql.transaction(consultas)) as any[][]
      } catch (err) {
        return errorDeTransaccionOrden(err, demanda)
      }
      const porId = new Map<string, ItemOrden>((res[idxItems] as any[]).map((r) => [String(r.id), r as ItemOrden]))
      return {
        orden: res[idxOrden][0] as Orden,
        items: preparados.map((p) => porId.get(p.id)!).filter(Boolean),
      }
    })
  },

  /**
   * Un ítem sobre una orden existente: envoltorio de `enviarComanda` (mismo código y mismas
   * garantías: stock todo-o-nada, movimientos y montos dentro de la transacción). Lo usa el
   * `POST /api/items-orden` para las pestañas del POS anteriores a la sesión 8.
   */
  async crearItemOrden(item: {
    orden_id: string
    producto_id: string
    cantidad: number
    modificadores?: string[]
    seleccion_modificadores?: string[]
    extras_ingredientes?: { ingrediente_id: string; cantidad?: number }[]
    notas_especiales?: string | null
  }) {
    const { orden_id, ...resto } = item
    const r = await this.enviarComanda({ orden_id, enviar: false, items: [resto] })
    return r.items[0]
  },

  async getItemsOrden(ordenId: string): Promise<ItemOrden[]> {
    const sql = getSql()
    const result = await sql`
      SELECT * FROM soda_master.items_orden 
      WHERE orden_id = ${ordenId}
      ORDER BY created_at
    `
    return result as ItemOrden[]
  },

  /**
   * Edición de un ítem (sesión 5: candado de cobro; sesión 6: precio del servidor).
   *
   *  - Solo `estado_item` (KDS, entrega): un UPDATE simple; puede avanzar aunque
   *    el ítem ya esté pagado (se puede pagar por adelantado).
   *  - Cantidad, extras (`notas_especiales`) o modificadores: van en una
   *    transacción con la orden bloqueada (FOR UPDATE) y recién entonces se
   *    verifica que el ítem no esté pagado: un cobro concurrente gana o pierde
   *    por completo, nunca en medio.
   *  - El precio NUNCA viene del navegador: se recalcula desde el producto y
   *    los extras. Un `precio_unitario` sin `precio_manual` se ignora. Solo el
   *    admin fija un precio a mano (`precio_manual: true` + motivo), con
   *    registro en `auditoria_admin`; mientras el ítem tenga precio manual, las
   *    ediciones de extras no lo recalculan (`precio_manual: false` lo devuelve
   *    al cálculo automático).
   */
  async actualizarItemOrden(
    id: string,
    updates: {
      cantidad?: number
      estado_item?: string
      notas_especiales?: string | null
      modificadores?: string[]
      precio_unitario?: number
      precio_manual?: boolean
      motivo?: string
    },
    opts: {
      esAdmin?: boolean
      usuario?: { id: string; nombre: string; rol: string }
      /** Estados desde los que el rol puede pasar el ítem al `estado_item` pedido (matriz F11). */
      origenesEstado?: readonly string[]
    } = {},
  ) {
    await ensureItemEstadoSchema()
    await ensureItemPagoSchema()
    await ensureItemPrecioSchema()
    await ensureEstadoOrdenFuncion()
    const sql = getSql()

    if (updates.precio_manual !== undefined && !opts.esAdmin) {
      throw new ErrorItemOrden(
        'PRECIO_SOLO_ADMIN',
        403,
        'Solo el administrador puede fijar o quitar el precio manual de un ítem.',
      )
    }

    const tocaMonto =
      updates.cantidad !== undefined ||
      updates.modificadores !== undefined ||
      updates.notas_especiales !== undefined ||
      updates.precio_manual !== undefined

    let itemActualizado: ItemOrden | undefined
    if (!tocaMonto) {
      if (updates.estado_item !== undefined) {
        // Sesión 13: el cambio de estado (KDS, entrega) y el recálculo del estado de la orden van en
        // una sola transacción con la orden bloqueada; es la misma función del POST bulk.
        const r = await this.cambiarEstadoItems({
          item_ids: [id],
          estado_item: updates.estado_item as EstadoItem,
          origenes: opts.origenesEstado ?? ESTADOS_ITEM,
        })
        return r.items[0]
      }
      const result = (await sql`SELECT * FROM soda_master.items_orden WHERE id = ${id}::uuid`) as any[]
      itemActualizado = result[0] as ItemOrden | undefined
      if (!itemActualizado) throw new ErrorItemOrden('ITEM_NO_ENCONTRADO', 404, 'El ítem no existe.')
    } else {
      await ensurePagoSchema()
      const actualRows = (await sql`
        SELECT orden_id, producto_id, pagado, precio_unitario, notas_especiales, precio_manual,
               cantidad, estado_item, modificadores
        FROM soda_master.items_orden WHERE id = ${id}::uuid
      `) as any[]
      const actual = actualRows[0]
      if (!actual) throw new ErrorItemOrden('ITEM_NO_ENCONTRADO', 404, 'El ítem no existe.')
      if (actual.pagado === true) {
        throw new ErrorItemOrden('ITEM_PAGADO', 409, 'Este ítem ya fue pagado y no se puede modificar.')
      }

      // ── Precio del ítem ──
      let precioNuevo = Number(actual.precio_unitario)
      let manual = actual.precio_manual === true
      let notasFinal: string | null | undefined = updates.notas_especiales
      if (updates.precio_manual === true) {
        precioNuevo = Number(updates.precio_unitario)
        manual = true
      } else if (updates.precio_manual === false || (!manual && updates.notas_especiales !== undefined)) {
        const fuente = updates.notas_especiales !== undefined ? updates.notas_especiales : actual.notas_especiales
        const { extras } = parseSeleccionItem({ notas_especiales: fuente })
        const calculo = await this.calcularPrecioItem(String(actual.producto_id), extras)
        precioNuevo = calculo.precio
        manual = false
        if (updates.notas_especiales !== undefined) {
          notasFinal = normalizarMetadataExtras(updates.notas_especiales, calculo.extras)
        }
      } else if (updates.notas_especiales !== undefined) {
        // Precio manual vigente: el precio se conserva; el JSON de extras se deja con costos de la base.
        const { extras } = parseSeleccionItem({ notas_especiales: updates.notas_especiales })
        const calculo = await this.calcularPrecioItem(String(actual.producto_id), extras)
        notasFinal = normalizarMetadataExtras(updates.notas_especiales, calculo.extras)
      }

      const O = String(actual.orden_id)
      const tieneNotas = updates.notas_especiales !== undefined
      const tieneMods = updates.modificadores !== undefined
      await ensureOrdenesAtomicasSchema()

      // ── Stock (F10): lo que el ítem necesita ahora contra lo que el registro dice que ya consumió ──
      const cantidadNueva = updates.cantidad ?? Number(actual.cantidad)
      const notasEfectivas = tieneNotas ? notasFinal : actual.notas_especiales
      let modsActuales: unknown = actual.modificadores
      if (typeof modsActuales === 'string') {
        try { modsActuales = JSON.parse(modsActuales) } catch { modsActuales = [] }
      }
      const modsNuevos: string[] = tieneMods
        ? (updates.modificadores ?? []).map(String)
        : Array.isArray(modsActuales) ? (modsActuales as unknown[]).map(String) : []
      const { extras: extrasNuevos } = parseSeleccionItem({ notas_especiales: notasEfectivas })
      const productoId = String(actual.producto_id).toLowerCase()
      const defProducto = (await leerDefProductos([productoId])).get(productoId)!
      const necesidad = necesidadItem(defProducto, cantidadNueva, modsNuevos, extrasNuevos)
      const estadoItem = String(actual.estado_item || 'pendiente')

      let res: any[][] = []
      let idxUpdate = 0
      let delta: Demanda = { ingredientes: new Map(), productos: new Map() }
      try {
        const hecho = await conReintento(async () => {
          const [ctx, registro] = (await Promise.all([
            leerContextoTotales(O),
            sql`
              SELECT ingrediente_id::text AS ingrediente_id, producto_id::text AS producto_id,
                     SUM(CASE WHEN tipo = 'venta' THEN cantidad ELSE -cantidad END) AS neto,
                     COUNT(*)::int AS n
              FROM soda_master.movimientos_inventario
              WHERE item_orden_id = ${id}::uuid AND tipo IN ('venta', 'devolucion')
              GROUP BY ingrediente_id, producto_id`,
          ])) as [ContextoTotales, any[]]
          const netoIng = new Map<string, number>()
          const netoProd = new Map<string, number>()
          let nRegistro = 0
          let sumaRegistro = 0
          for (const r of registro) {
            nRegistro += Number(r.n)
            const q = Number(r.neto)
            sumaRegistro += q
            if (r.ingrediente_id) netoIng.set(r.ingrediente_id, q)
            else if (r.producto_id) netoProd.set(r.producto_id, q)
          }
          // Delta de stock: sube → descuenta (con guarda); baja → devuelve solo si la cocina no tocó el ítem.
          const d: Demanda = { ingredientes: new Map(), productos: new Map() }
          let hayDevolucion = false
          if (nRegistro > 0) {
            const ajustar = (necesita: Map<string, number>, hay: Map<string, number>, destino: Map<string, number>) => {
              for (const k of new Set([...necesita.keys(), ...hay.keys()])) {
                const dq = redondear3((necesita.get(k) || 0) - (hay.get(k) || 0))
                if (dq > 0) destino.set(k, dq)
                else if (dq < 0 && estadoItem === 'pendiente') {
                  destino.set(k, dq)
                  hayDevolucion = true
                }
              }
            }
            ajustar(necesidad.ingredientes, netoIng, d.ingredientes)
            ajustar(necesidad.productos, netoProd, d.productos)
          }
          delta = d
          const filasVenta: FilaMovimiento[] = []
          const filasDev: FilaMovimiento[] = []
          for (const [k, q] of d.ingredientes) {
            ;(q > 0 ? filasVenta : filasDev).push({
              ingrediente_id: k, producto_id: productoId, item_orden_id: id, cantidad: Math.abs(q),
            })
          }
          for (const [k, q] of d.productos) {
            ;(q > 0 ? filasVenta : filasDev).push({
              ingrediente_id: null, producto_id: k, item_orden_id: id, cantidad: Math.abs(q),
            })
          }
          const nuevos = ctx.items.map((i) =>
            i.id === id.toLowerCase() ? { ...i, cantidad: cantidadNueva, precio: precioNuevo } : i,
          )
          const calc = totalesDe(ctx, nuevos)

          const consultas: any[] = [
            sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
            sql`SELECT soda_master.assert_cobro(
                  (SELECT COUNT(*) FROM soda_master.items_orden WHERE id = ${id}::uuid AND orden_id = ${O}::uuid) = 1,
                  'ITEM_NO_ENCONTRADO')`,
            sql`SELECT soda_master.assert_cobro(
                  (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${[...ESTADOS_ORDEN_ACTIVA]}::text[]),
                  'ORDEN_NO_ACTIVA')`,
            sql`SELECT soda_master.assert_cobro(
                  (SELECT pagado FROM soda_master.items_orden WHERE id = ${id}::uuid) = FALSE,
                  'ITEM_PAGADO')`,
            sentenciaHuellaOrden(sql, O, ctx),
            // El registro de stock del ítem no cambió desde la lectura.
            sql`SELECT soda_master.assert_cobro(
                  (SELECT COUNT(*) FROM soda_master.movimientos_inventario
                    WHERE item_orden_id = ${id}::uuid AND tipo IN ('venta', 'devolucion')) = ${nRegistro}::int
                  AND ROUND(COALESCE((SELECT SUM(CASE WHEN tipo = 'venta' THEN cantidad ELSE -cantidad END)
                                        FROM soda_master.movimientos_inventario
                                       WHERE item_orden_id = ${id}::uuid AND tipo IN ('venta', 'devolucion')), 0), 3)
                      = ${redondear3(sumaRegistro)}::numeric,
                  'ORDEN_MODIFICADA')`,
          ]
          // Sesión 13 (F11): cantidad, extras, notas y modificadores solo mientras cocina no empezó.
          if (updates.cantidad !== undefined || tieneMods || tieneNotas) {
            consultas.push(sql`SELECT soda_master.assert_cobro(
                  COALESCE((SELECT estado_item FROM soda_master.items_orden WHERE id = ${id}::uuid), 'pendiente')
                    = ANY(${[...ESTADOS_ITEM_EDITABLES]}::text[]),
                  'ITEM_YA_PREPARADO')`)
          }
          if (updates.estado_item !== undefined) {
            consultas.push(sql`SELECT soda_master.assert_cobro(
                  COALESCE((SELECT estado_item FROM soda_master.items_orden WHERE id = ${id}::uuid), 'pendiente')
                    = ANY(${[...(opts.origenesEstado ?? ESTADOS_ITEM)]}::text[]),
                  'TRANSICION_ITEM_INVALIDA')`)
          }
          if (hayDevolucion) {
            // La devolución solo vale si la cocina sigue sin tocar el ítem.
            consultas.push(sql`SELECT soda_master.assert_cobro(
                  COALESCE((SELECT estado_item FROM soda_master.items_orden WHERE id = ${id}::uuid), 'pendiente') = 'pendiente',
                  'ORDEN_MODIFICADA')`)
          }
          consultas.push(...sentenciasAjusteStock(sql, d))
          if (filasVenta.length > 0) {
            consultas.push(sentenciaMovimientos(sql, 'venta', O, filasVenta, 'Ítem editado: se descuenta la diferencia'))
          }
          if (filasDev.length > 0) {
            consultas.push(sentenciaMovimientos(sql, 'devolucion', O, filasDev, 'Ítem editado: se devuelve la diferencia'))
          }
          const idx = consultas.length
          consultas.push(sql`UPDATE soda_master.items_orden
              SET cantidad = COALESCE(${updates.cantidad ?? null}::int, cantidad),
                  estado_item = COALESCE(${updates.estado_item ?? null}::text, estado_item),
                  notas_especiales = CASE WHEN ${tieneNotas}::boolean
                                          THEN ${notasFinal ?? null}::text ELSE notas_especiales END,
                  modificadores = CASE WHEN ${tieneMods}::boolean
                                       THEN ${JSON.stringify(updates.modificadores ?? [])}::jsonb
                                       ELSE modificadores END,
                  precio_unitario = ${precioNuevo}::numeric,
                  precio_manual = ${manual}::boolean
              WHERE id = ${id}::uuid
              RETURNING *`)
          consultas.push(sql`UPDATE soda_master.ordenes
              SET subtotal = ${calc.subtotal}, impuesto = ${calc.impuesto}, total = ${calc.total}
              WHERE id = ${O}::uuid`)
          if (updates.estado_item !== undefined) consultas.push(sentenciaRecalcularEstado(sql, O))
          try {
            return { res: (await sql.transaction(consultas)) as any[][], idx }
          } catch (err) {
            return errorDeTransaccionOrden(err, d)
          }
        })
        res = hecho.res
        idxUpdate = hecho.idx
      } catch (err) {
        throw err
      }
      itemActualizado = res[idxUpdate][0] as ItemOrden
      if (updates.precio_manual === true && opts.usuario) {
        await this.registrarAuditoriaAdmin({
          usuario_id: opts.usuario.id,
          usuario_nombre: opts.usuario.nombre,
          usuario_rol: opts.usuario.rol,
          accion: 'precio_manual_item',
          entidad: 'item_orden',
          entidad_id: id,
          detalles: {
            orden_id: O,
            precio_anterior: Number(actual.precio_unitario),
            precio_nuevo: precioNuevo,
            motivo: updates.motivo ?? null,
          },
        }).catch((e) => console.error('[auditoria] precio_manual_item:', e))
      }
    }

    // Sesión 13 (B5): el estado de la orden ya se recalculó DENTRO de la transacción
    // (`sentenciaRecalcularEstado`), con la orden bloqueada; ya no hay una segunda lectura aparte.
    return itemActualizado as ItemOrden
  },

  /**
   * Cambia el `estado_item` de uno o varios ítems de UNA orden y recalcula el estado de la orden
   * (sesión 13: B5, F11). Todo o nada, en una sola `sql.transaction`: bloqueo de la orden
   * (`FOR UPDATE`), `assert_cobro` de orden activa (cocina y salón pueden mover ítems de una orden
   * ya pagada mientras no esté cancelada ni perdida), de que los ítems existan y sean de esa orden
   * y de que cada uno esté en un estado de origen válido para el rol (matriz de
   * `lib/items-reglas.ts`; el mismo estado destino es idempotente), el `UPDATE` y
   * `recalcular_estado_orden`. Dos estaciones sobre la misma orden se serializan en el bloqueo, así
   * que el estado final siempre sale de TODOS los ítems. Lo usan `PATCH /api/items-orden` (un ítem)
   * y `POST /api/items-orden/estado` (varios).
   * Devuelve los ítems y `{ estado, estado_anterior }` de la orden.
   */
  async cambiarEstadoItems(input: {
    orden_id?: string
    item_ids: string[]
    estado_item: EstadoItem
    origenes: readonly string[]
  }): Promise<{
    items: ItemOrden[]
    orden: {
      id: string
      estado: string
      estado_anterior: string
      /** Todos los ítems de la orden quedaron `listo` o `entregado` (también en una orden `pagado`). */
      cocina_lista: boolean
      /** Lo mismo, justo antes de este cambio: `cocina_lista && !cocina_lista_antes` = esta acción la terminó. */
      cocina_lista_antes: boolean
    }
  }> {
    await ensureItemEstadoSchema()
    await ensureItemPagoSchema()
    await ensureEstadoOrdenFuncion()
    const sql = getSql()
    const ids = Array.from(new Set(input.item_ids.map((i) => i.toLowerCase())))
    let O = input.orden_id
    if (!O) {
      const f = (await sql`
        SELECT orden_id FROM soda_master.items_orden WHERE id = ${ids[0]}::uuid
      `) as any[]
      if (!f[0]) throw new ErrorItemOrden('ITEM_NO_ENCONTRADO', 404, 'El ítem no existe.')
      O = String(f[0].orden_id)
    }
    const orden = O
    const n = ids.length
    const destino = input.estado_item
    // Una orden `pagado` (cobrada por adelantado) sigue admitiendo cambios de estado de cocina y
    // entrega mientras no esté cancelada ni perdida.
    const ordenAdmite = [...ESTADOS_ORDEN_ACTIVA, 'pagado']
    let res: any[][]
    try {
      res = (await sql.transaction([
        sql`SELECT id FROM soda_master.ordenes WHERE id = ${orden}::uuid FOR UPDATE`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${orden}::uuid) = 1,
              'ORDEN_NO_ENCONTRADA')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT estado FROM soda_master.ordenes WHERE id = ${orden}::uuid) = ANY(${ordenAdmite}::text[]),
              'ORDEN_NO_ACTIVA')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.items_orden WHERE id = ANY(${ids}::uuid[])) = ${n}::int,
              'ITEM_NO_ENCONTRADO')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.items_orden
                WHERE id = ANY(${ids}::uuid[]) AND orden_id = ${orden}::uuid) = ${n}::int,
              'ITEM_AJENO')`,
        sql`SELECT soda_master.assert_cobro(
              NOT EXISTS (SELECT 1 FROM soda_master.items_orden
                           WHERE id = ANY(${ids}::uuid[])
                             AND NOT (COALESCE(estado_item, 'pendiente') = ANY(${[...input.origenes]}::text[]))),
              'TRANSICION_ITEM_INVALIDA')`,
        // F37: "cocina terminó" antes y después, con la orden bloqueada. No depende del estado de la
        // orden (una orden `pagado` conserva su estado), así que sirve para avisar al mesero una sola vez.
        sql`SELECT COALESCE(BOOL_AND(COALESCE(estado_item, 'pendiente') IN ('listo', 'entregado')), FALSE) AS lista
            FROM soda_master.items_orden WHERE orden_id = ${orden}::uuid`,
        sql`UPDATE soda_master.items_orden SET estado_item = ${destino}::text
            WHERE id = ANY(${ids}::uuid[]) RETURNING *`,
        sql`SELECT COALESCE(BOOL_AND(COALESCE(estado_item, 'pendiente') IN ('listo', 'entregado')), FALSE) AS lista
            FROM soda_master.items_orden WHERE orden_id = ${orden}::uuid`,
        sentenciaRecalcularEstado(sql, orden),
      ])) as any[][]
    } catch (err) {
      traducirErrorTx(err)
    }
    const listaAntes = res[6][0]?.lista === true
    const filas = res[7] as ItemOrden[]
    const listaDespues = res[8][0]?.lista === true
    const porId = new Map(filas.map((f) => [String(f.id).toLowerCase(), f]))
    const rec = res[9][0] as { estado_anterior: string; estado_nuevo: string }
    return {
      items: ids.map((i) => porId.get(i)!).filter(Boolean),
      orden: {
        id: orden,
        estado: rec.estado_nuevo,
        estado_anterior: rec.estado_anterior,
        cocina_lista: listaDespues,
        cocina_lista_antes: listaAntes,
      },
    }
  },

  /**
   * Borra un ítem sin pagar. Sesión 9 (F20): si la orden tenía cobros parciales y ese era
   * el último ítem sin pagar, la orden queda toda cobrada y se cierra como `pagado` en
   * la misma transacción (el mismo cierre del paso h de `crearPago`), con una nota de quién
   * borró. La mesa NO se toca: igual que tras un cobro total, queda ocupada hasta que se
   * libera desde Mesas. Sesión 12 (B4/F25): al cerrarse así `ordenes.total` queda como Σ pagos
   * (lo realmente cobrado; los cobros anteriores prorratearon el descuento sobre ítems que ya
   * no existen y no se reescriben) y, si difiere del total calculado, se deja un evento de
   * auditoría `cierre_orden_descuadre` y un `console.error`. No se crea ni se devuelve ningún
   * pago (el ítem borrado no estaba pagado). Una orden sin ningún ítem pagado no se cierra (la
   * limpian las vacías de la sesión 8).
   */
  async eliminarItemOrden(
    id: string,
    opts: { usuario?: { id: string; nombre: string } } = {},
  ): Promise<{ orden_cerrada: boolean }> {
    await ensureItemPagoSchema()
    await ensurePagoSchema()
    await ensureOrdenesAtomicasSchema()
    await ensureEstadoOrdenFuncion()
    const sql = getSql()
    const filas = (await sql`
      SELECT orden_id FROM soda_master.items_orden WHERE id = ${id}::uuid
    `) as any[]
    if (!filas[0]) throw new ErrorItemOrden('ITEM_NO_ENCONTRADO', 404, 'El ítem no existe.')
    const O = String(filas[0].orden_id)
    // Un ítem pagado es parte del registro de un cobro: no se borra. La verificación va con la
    // orden bloqueada, igual que el cobro. Sesión 8: el stock vuelve (si la cocina no lo tocó) y
    // los montos de la orden se recalculan dentro de la misma transacción, con guarda de huella.
    const nota =
      '[ORDEN CERRADA] Se eliminó el último ítem sin pagar; lo que quedaba ya estaba cobrado' +
      (opts.usuario ? ` — por ${opts.usuario.nombre}` : '')
    return await conReintento(async () => {
      const ctx = await leerContextoTotales(O)
      if (!ctx.items.some((i) => i.id === id.toLowerCase())) {
        throw new ErrorItemOrden('ITEM_NO_ENCONTRADO', 404, 'El ítem no existe.')
      }
      const calc = totalesDe(ctx, ctx.items.filter((i) => i.id !== id.toLowerCase()))
      try {
        const res = (await sql.transaction([
          sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
          sql`SELECT soda_master.assert_cobro(
                (SELECT COUNT(*) FROM soda_master.items_orden WHERE id = ${id}::uuid) = 1,
                'ITEM_NO_ENCONTRADO')`,
          sql`SELECT soda_master.assert_cobro(
                (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${[...ESTADOS_ORDEN_ACTIVA]}::text[]),
                'ORDEN_NO_ACTIVA')`,
          sql`SELECT soda_master.assert_cobro(
                (SELECT pagado FROM soda_master.items_orden WHERE id = ${id}::uuid) = FALSE,
                'ITEM_PAGADO')`,
          sentenciaHuellaOrden(sql, O, ctx),
          ...sentenciasRetornoStock(sql, O, id, 'Ítem eliminado'),
          sql`DELETE FROM soda_master.items_orden WHERE id = ${id}::uuid`,
          sql`UPDATE soda_master.ordenes
              SET subtotal = ${calc.subtotal}, impuesto = ${calc.impuesto}, total = ${calc.total}
              WHERE id = ${O}::uuid`,
          // Sesión 13 (B5): sin el ítem borrado, la orden toma el estado de los que quedan
          // (por ejemplo [listo, pendiente] sin el pendiente → `listo`). Sin ítems no cambia.
          sentenciaRecalcularEstado(sql, O),
          // F20: si no queda nada por pagar y hubo cobros, la orden se cierra (mismo criterio
          // que el paso h de `crearPago`; la orden sigue bloqueada, así que ve lo confirmado)
          // B4/F25: al cerrarse así, `ordenes.total` queda como lo realmente cobrado (Σ pagos):
          // los cobros anteriores prorratearon el descuento sobre ítems que ya no existen y no
          // se reescriben.
          sql`UPDATE soda_master.ordenes
              SET estado = 'pagado',
                  total = (SELECT COALESCE(SUM(monto), 0) FROM soda_master.pagos WHERE orden_id = ${O}::uuid),
                  notas = CASE WHEN COALESCE(notas, '') = '' THEN ${nota} ELSE notas || E'\n' || ${nota} END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ${O}::uuid
                AND estado = ANY(${[...ESTADOS_ORDEN_ACTIVA]}::text[])
                AND NOT EXISTS (SELECT 1 FROM soda_master.items_orden WHERE orden_id = ${O}::uuid AND pagado = FALSE)
                AND EXISTS (SELECT 1 FROM soda_master.items_orden WHERE orden_id = ${O}::uuid AND pagado = TRUE)
              RETURNING id, total`,
        ])) as any[][]
        const cierre = (res[res.length - 1] ?? [])[0]
        if (cierre) {
          await verificarCierreOrden(O, calc.total, 'item_eliminado', opts.usuario, Number(cierre.total) || 0)
        }
        return { orden_cerrada: !!cierre }
      } catch (err) {
        traducirErrorTx(err, { ITEM_PAGADO: 'Este ítem ya fue pagado y no se puede eliminar.' })
      }
    })
  },

  // Pagos (sesión 5: cobro seguro, R2/A1/A5)
  //
  // El servidor calcula TODO a partir de la base: ítems, descuento de la
  // orden y configuración (IVA, propinas). Del navegador solo toma qué se
  // cobra (ítems / cantidades), la propina elegida (validada), el método,
  // el efectivo recibido y `monto_esperado` (lo que muestra la pantalla; si
  // no coincide con el cálculo del servidor se rechaza con 409).
  //
  // Todo el cobro va en UNA transacción (`sql.transaction`): bloqueo de la
  // orden, verificación de que no cambió desde la lectura, reclamo de los
  // ítems (UPDATE … WHERE pagado = FALSE), pago, cierre de la orden y caja.
  // Las verificaciones usan `soda_master.assert_cobro`, que aborta todo.
  async crearPago(input: {
    orden_id: string
    metodo: 'efectivo' | 'tarjeta'
    monto_esperado: number
    item_orden_ids?: string[]
    item_partials?: Array<{ id: string; cantidad: number }>
    propina?: PropinaCobro | null
    dividido_en?: number
    efectivo_recibido?: number | null
    referencia?: string | null
    usuario: { id: string; nombre: string }
  }) {
    await ensureItemPagoSchema()
    await ensureOrdenEstadoSchema()
    await ensureCajaSchema()
    await ensurePagoSchema()
    const sql = getSql()
    const ordenId = input.orden_id
    const metodo = input.metodo
    const divididoEn = Math.max(Math.floor(Number(input.dividido_en) || 1), 1)

    // ── 1) Lectura (fuera de la transacción; la transacción la revalida) ──
    const [ordenRows, itemRows, descRows, cfgRows, pagosPrevRows] = (await Promise.all([
      sql`SELECT id, estado FROM soda_master.ordenes WHERE id = ${ordenId}::uuid`,
      sql`
        SELECT id, cantidad, precio_unitario, pagado
        FROM soda_master.items_orden WHERE orden_id = ${ordenId}::uuid
      `,
      sql`
        SELECT tipo, valor FROM soda_master.descuentos
        WHERE orden_id = ${ordenId}::uuid ORDER BY created_at DESC LIMIT 1
      `,
      sql`
        SELECT clave, valor, tipo FROM soda_master.configuracion
        WHERE clave IN ('tasa_impuesto','impuesto_habilitado','propinas_habilitadas','precios_incluyen_iva')
      `,
      // B4: lo que los cobros anteriores ya descontaron (el descuento "dado")
      sql`
        SELECT COUNT(*)::int AS n, COALESCE(SUM(descuento), 0)::numeric AS dado
        FROM soda_master.pagos WHERE orden_id = ${ordenId}::uuid
      `,
    ])) as any[][]
    const nPagosPrevios = Number(pagosPrevRows[0]?.n) || 0
    const descuentoDado = Number(pagosPrevRows[0]?.dado) || 0

    const orden = ordenRows[0]
    if (!orden) throw new ErrorCobro('ORDEN_NO_ENCONTRADA')
    if (orden.estado === 'pagado') throw new ErrorCobro('ORDEN_YA_PAGADA')
    if (orden.estado === 'cancelado' || orden.estado === 'perdida') {
      throw new ErrorCobro('ORDEN_NO_COBRABLE')
    }

    const items = (itemRows as any[]).map((r) => ({
      id: String(r.id),
      cantidad: Number(r.cantidad) || 0,
      precio: Number(r.precio_unitario) || 0,
      pagado: r.pagado === true,
    }))
    if (items.length === 0) throw new ErrorCobro('SIN_ITEMS')
    const pendientes = items.filter((i) => !i.pagado)
    if (pendientes.length === 0) throw new ErrorCobro('ORDEN_YA_PAGADA')
    const porId = new Map(items.map((i) => [i.id, i]))

    const cfg: Record<string, any> = {}
    for (const r of cfgRows as any[]) cfg[r.clave] = parseConfigValor(r.valor, r.tipo)
    const config: ConfigCobro = {
      impuestoHabilitado: cfg.impuesto_habilitado === true,
      tasaImpuesto: Number(cfg.tasa_impuesto) || 0,
      propinasHabilitadas: cfg.propinas_habilitadas !== false,
      preciosIncluyenIva: cfg.precios_incluyen_iva !== false,
    }
    const desc = (descRows as any[])[0]
    const descuentoOrden: DescuentoCobro = desc
      ? { tipo: desc.tipo as TipoDescuentoCobro, valor: Number(desc.valor) || 0 }
      : { tipo: null, valor: 0 }

    // ── 2) Qué se cobra ──
    const idsSel = Array.from(new Set(input.item_orden_ids ?? []))
    const parcialesSel = new Map<string, number>()
    for (const p of input.item_partials ?? []) {
      if (parcialesSel.has(p.id)) throw new ErrorCobro('ITEM_INVALIDO', 'Ítem repetido en item_partials')
      parcialesSel.set(p.id, p.cantidad)
    }
    const esParcial = idsSel.length > 0 || parcialesSel.size > 0
    const lineasEnteras: string[] = []
    const cortes: Array<{ id: string; cobrar: number; original: number }> = []
    const cobrados: Array<{ precio: number; cantidad: number }> = []

    if (!esParcial) {
      for (const i of pendientes) {
        lineasEnteras.push(i.id)
        cobrados.push({ precio: i.precio, cantidad: i.cantidad })
      }
    } else {
      for (const id of idsSel) {
        const it = porId.get(id)
        if (!it) throw new ErrorCobro('ITEM_INVALIDO')
        if (it.pagado) throw new ErrorCobro('ITEMS_YA_PAGADOS')
        if (parcialesSel.has(id)) throw new ErrorCobro('ITEM_INVALIDO', 'Un ítem no puede ir en ambas listas')
        lineasEnteras.push(id)
        cobrados.push({ precio: it.precio, cantidad: it.cantidad })
      }
      for (const [id, cantidad] of parcialesSel) {
        const it = porId.get(id)
        if (!it) throw new ErrorCobro('ITEM_INVALIDO')
        if (it.pagado) throw new ErrorCobro('ITEMS_YA_PAGADOS')
        if (cantidad > it.cantidad) {
          throw new ErrorCobro('ITEM_INVALIDO', 'La cantidad a cobrar supera la de la línea')
        }
        if (cantidad === it.cantidad) {
          lineasEnteras.push(id)
        } else {
          cortes.push({ id, cobrar: cantidad, original: it.cantidad })
        }
        cobrados.push({ precio: it.precio, cantidad })
      }
    }

    // ── 3) Cálculo del servidor ──
    const subtotalOrden = items.reduce((s, i) => s + i.precio * i.cantidad, 0)
    // B4: el descuento se prorratea sobre lo pendiente, descontando lo ya dado.
    const subtotalPendiente = pendientes.reduce((s, i) => s + i.precio * i.cantidad, 0)
    const sinPropina = calcularCobro({
      items: cobrados,
      subtotalOrden,
      subtotalPendiente,
      descuentoDado,
      descuento: descuentoOrden,
      config,
    })
    if (!propinaPermitida(sinPropina.base, input.propina, config.propinasHabilitadas)) {
      throw new ErrorCobro('PROPINA_INVALIDA')
    }
    const calc = calcularCobro({
      items: cobrados,
      subtotalOrden,
      subtotalPendiente,
      descuentoDado,
      descuento: descuentoOrden,
      config,
      propina: input.propina,
    })
    // Total de la orden completa con ese descuento (para la red de seguridad del cierre)
    const totalOrdenCalculado = calcularCobro({
      items: items.map((i) => ({ precio: i.precio, cantidad: i.cantidad })),
      subtotalOrden,
      descuento: descuentoOrden,
      config,
    }).total
    if (Number(input.monto_esperado) !== calc.total) {
      throw new ErrorCobro('MONTO_DISTINTO', undefined, {
        monto_servidor: calc.total,
        monto_recibido: Number(input.monto_esperado),
        descuento: calc.descuento,
        impuesto: calc.impuesto,
        propina: calc.propina,
        total_a_pagar: calc.totalAPagar,
      })
    }

    // ── 4) Efectivo, vuelto y caja ──
    let vuelto: number | null = null
    let efectivoRecibido = 0
    if (metodo === 'efectivo') {
      const recibido = input.efectivo_recibido
      if (recibido === undefined || recibido === null) {
        efectivoRecibido = calc.totalAPagar
        vuelto = 0
      } else {
        if (recibido < calc.totalAPagar) throw new ErrorCobro('EFECTIVO_INSUFICIENTE')
        efectivoRecibido = recibido
        vuelto = recibido - calc.totalAPagar
      }
    }
    const mueveCaja = metodo === 'efectivo' && calc.totalAPagar > 0

    // ── 5) Transacción ──
    const pagoId = crypto.randomUUID()
    const O = ordenId
    const consultas: any[] = []
    // a) bloqueo de la orden: los cobros concurrentes se serializan aquí
    consultas.push(sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`)
    // b) el estado de la orden sigue siendo cobrable
    consultas.push(sql`
      SELECT soda_master.assert_cobro(
        (SELECT COUNT(*) FROM soda_master.ordenes o
          WHERE o.id = ${O}::uuid AND o.estado NOT IN ('pagado','cancelado','perdida')) = 1,
        CASE WHEN (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = 'pagado'
             THEN 'ORDEN_YA_PAGADA' ELSE 'ORDEN_CAMBIO' END
      )
    `)
    // c) nada cambió desde la lectura (ítems, precios, descuento)
    consultas.push(sql`
      SELECT soda_master.assert_cobro(
        ABS(COALESCE((SELECT SUM(precio_unitario * cantidad) FROM soda_master.items_orden
                       WHERE orden_id = ${O}::uuid), 0) - ${subtotalOrden}::numeric) < 0.01
        AND (SELECT COUNT(*) FROM soda_master.items_orden WHERE orden_id = ${O}::uuid) = ${items.length}::int
        AND (SELECT COUNT(*) FROM soda_master.items_orden
              WHERE orden_id = ${O}::uuid AND pagado = FALSE) = ${pendientes.length}::int
        AND (SELECT COUNT(*) FROM soda_master.pagos WHERE orden_id = ${O}::uuid) = ${nPagosPrevios}::int
        AND COALESCE((SELECT SUM(descuento) FROM soda_master.pagos WHERE orden_id = ${O}::uuid), 0)
              = ${descuentoDado}::numeric
        AND (SELECT tipo FROM soda_master.descuentos WHERE orden_id = ${O}::uuid
              ORDER BY created_at DESC LIMIT 1) IS NOT DISTINCT FROM ${descuentoOrden.tipo}::text
        AND COALESCE((SELECT valor FROM soda_master.descuentos WHERE orden_id = ${O}::uuid
                       ORDER BY created_at DESC LIMIT 1), 0) = ${descuentoOrden.valor}::numeric,
        'ORDEN_CAMBIO'
      )
    `)
    // d) efectivo: tiene que haber caja abierta (la bloquea mientras dura el cobro)
    if (mueveCaja) {
      consultas.push(sql`
        SELECT soda_master.assert_cobro(
          (SELECT COUNT(*) FROM (
            SELECT id FROM soda_master.cajas WHERE estado = 'abierta' FOR SHARE
          ) c) = 1,
          'CAJA_CERRADA'
        )
      `)
    }
    // e) el pago
    consultas.push(sql`
      INSERT INTO soda_master.pagos
        (id, orden_id, metodo, monto, propina, descuento, dividido_en, vuelto,
         referencia, aprobado, cobrado_por, cobrado_por_nombre)
      VALUES
        (${pagoId}::uuid, ${O}::uuid, ${metodo}, ${calc.total}, ${calc.propina},
         ${calc.descuento}, ${divididoEn}, ${vuelto}::numeric,
         ${input.referencia ?? null}, TRUE, ${input.usuario.id}::uuid, ${input.usuario.nombre})
    `)
    // f) reclamo de las líneas completas: si otro cobro ya las tomó, aborta todo
    if (lineasEnteras.length > 0) {
      consultas.push(sql`
        WITH reclamados AS (
          UPDATE soda_master.items_orden
          SET pagado = TRUE, pago_id = ${pagoId}::uuid
          WHERE orden_id = ${O}::uuid AND id = ANY(${lineasEnteras}::uuid[]) AND pagado = FALSE
          RETURNING id
        )
        SELECT soda_master.assert_cobro(
          (SELECT COUNT(*) FROM reclamados) = ${lineasEnteras.length}::int, 'ITEMS_YA_PAGADOS'
        )
      `)
    }
    // g) cobro de parte de una línea (1 de 2): se corta la línea en BD
    for (const c of cortes) {
      consultas.push(sql`
        WITH orig AS (
          SELECT * FROM soda_master.items_orden
          WHERE id = ${c.id}::uuid AND orden_id = ${O}::uuid
            AND pagado = FALSE AND cantidad = ${c.original}::int
          FOR UPDATE
        ),
        resto AS (
          INSERT INTO soda_master.items_orden
            (orden_id, producto_id, cantidad, precio_unitario, modificadores,
             notas_especiales, estado_item, pagado, cuenta_persona_id)
          SELECT orden_id, producto_id, cantidad - ${c.cobrar}::int, precio_unitario,
                 modificadores, notas_especiales, estado_item, FALSE, cuenta_persona_id
          FROM orig
          RETURNING id
        ),
        cobrada AS (
          UPDATE soda_master.items_orden
          SET cantidad = ${c.cobrar}::int, pagado = TRUE, pago_id = ${pagoId}::uuid
          WHERE id IN (SELECT id FROM orig)
          RETURNING id
        )
        SELECT soda_master.assert_cobro(
          (SELECT COUNT(*) FROM resto) = 1 AND (SELECT COUNT(*) FROM cobrada) = 1,
          'ITEMS_YA_PAGADOS'
        )
      `)
    }
    // h) si no queda nada por pagar, la orden se cierra
    consultas.push(sql`
      UPDATE soda_master.ordenes
      SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${O}::uuid
        AND estado NOT IN ('pagado','cancelado','perdida')
        AND NOT EXISTS (
          SELECT 1 FROM soda_master.items_orden WHERE orden_id = ${O}::uuid AND pagado = FALSE
        )
    `)
    // i) caja: entra TODO lo recibido (monto + propina + vuelto) y el vuelto sale
    if (mueveCaja) {
      consultas.push(sql`
        INSERT INTO soda_master.movimientos_caja
          (caja_id, tipo, monto, pago_id, usuario_id, usuario_nombre, descripcion)
        SELECT c.id, 'venta_efectivo', ${efectivoRecibido}, ${pagoId}::uuid,
               ${input.usuario.id}::uuid, ${input.usuario.nombre},
               ${'Cobro orden ' + String(O).slice(0, 8)}
        FROM soda_master.cajas c WHERE c.estado = 'abierta'
      `)
      if (vuelto && vuelto > 0) {
        consultas.push(sql`
          INSERT INTO soda_master.movimientos_caja
            (caja_id, tipo, monto, pago_id, usuario_id, usuario_nombre, descripcion)
          SELECT c.id, 'vuelto', ${vuelto}, ${pagoId}::uuid,
                 ${input.usuario.id}::uuid, ${input.usuario.nombre}, 'Vuelto entregado'
          FROM soda_master.cajas c WHERE c.estado = 'abierta'
        `)
      }
    }
    // j) el pago creado, con mesa
    consultas.push(sql`
      SELECT p.*, o.mesa_id, ('Mesa ' || m.numero) AS mesa_nombre, o.estado AS orden_estado
      FROM soda_master.pagos p
      JOIN soda_master.ordenes o ON o.id = p.orden_id
      LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
      WHERE p.id = ${pagoId}::uuid
    `)

    let resultados: any[][]
    try {
      resultados = (await sql.transaction(consultas)) as any[][]
    } catch (err: any) {
      const texto = `${err?.message ?? ''} ${err?.code ?? ''}`
      const codigo = Object.keys(ERRORES_COBRO).find((c) => texto.includes(c))
      if (codigo && (err?.code === 'SM409' || texto.includes('SM409'))) {
        throw new ErrorCobro(codigo)
      }
      throw err
    }

    const fila = resultados[resultados.length - 1][0]
    const pago = mapPago(fila)
    // B4: al cerrarse la orden, Σ pagos debe ser el total calculado; si no, queda registrado
    if (fila.orden_estado === 'pagado') {
      await verificarCierreOrden(ordenId, totalOrdenCalculado, 'cobro', input.usuario)
    }
    return {
      ...pago,
      orden_cerrada: fila.orden_estado === 'pagado',
      items_pagados: lineasEnteras.length + cortes.length,
      total_a_pagar: calc.totalAPagar,
      impuesto: calc.impuesto,
      cuotas: repartirCuotas(calc.totalAPagar, divididoEn),
    }
  },

  async getPagos(filtro?: { fecha?: string }): Promise<Pago[]> {
    await ensureTimestampTzMigration()
    const sql = getSql()
    let rows: any[]
    if (filtro?.fecha === 'hoy') {
      rows = await sql`
        SELECT p.*, o.mesa_id, ('Mesa ' || m.numero) AS mesa_nombre
        FROM soda_master.pagos p
        LEFT JOIN soda_master.ordenes o ON o.id = p.orden_id
        LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
        WHERE (p.created_at AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date
        ORDER BY p.created_at DESC
      `
    } else if (filtro?.fecha) {
      rows = await sql`
        SELECT p.*, o.mesa_id, ('Mesa ' || m.numero) AS mesa_nombre
        FROM soda_master.pagos p
        LEFT JOIN soda_master.ordenes o ON o.id = p.orden_id
        LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
        WHERE (p.created_at AT TIME ZONE 'America/Santiago')::date = ${filtro.fecha}::date
        ORDER BY p.created_at DESC
      `
    } else {
      rows = await sql`
        SELECT p.*, o.mesa_id, ('Mesa ' || m.numero) AS mesa_nombre
        FROM soda_master.pagos p
        LEFT JOIN soda_master.ordenes o ON o.id = p.orden_id
        LEFT JOIN soda_master.mesas m ON m.id = o.mesa_id
        ORDER BY p.created_at DESC
        LIMIT 200
      `
    }
    return rows.map(mapPago)
  },

  // Permisos especiales (delegaciones temporales). El admin puede,
  // por ejemplo, darle a un cajero permiso temporal de "apertura_mesa"
  // cuando no hay meseros. La vigencia se controla por `valido_hasta`.
  async otorgarPermisoEspecial(input: {
    usuario_id: string
    tipo: string
    valido_hasta: string | Date | number
    motivo?: string | null
    otorgado_por: string
    otorgado_por_nombre: string
  }): Promise<any> {
    await ensurePermisosEspecialesTable()
    const sql = getSql()
    const validoHasta = new Date(input.valido_hasta)
    if (Number.isNaN(validoHasta.getTime())) {
      throw new Error('valido_hasta no es una fecha válida')
    }
    if (validoHasta.getTime() <= Date.now()) {
      throw new Error('valido_hasta debe ser una fecha futura')
    }
    const rows = (await sql`
      INSERT INTO soda_master.permisos_especiales
        (usuario_id, tipo, motivo, otorgado_por, otorgado_por_nombre, valido_hasta)
      VALUES (
        ${input.usuario_id}::uuid,
        ${input.tipo},
        ${input.motivo ?? null},
        ${input.otorgado_por}::uuid,
        ${input.otorgado_por_nombre},
        ${validoHasta.toISOString()}::timestamptz
      )
      RETURNING *
    `) as any[]
    return rows[0]
  },

  async revocarPermisoEspecial(input: {
    id: string
    revocado_por: string
    revocado_por_nombre: string
  }): Promise<any> {
    await ensurePermisosEspecialesTable()
    const sql = getSql()
    const rows = (await sql`
      UPDATE soda_master.permisos_especiales
      SET revocado = TRUE,
          revocado_at = now(),
          revocado_por = ${input.revocado_por}::uuid,
          revocado_por_nombre = ${input.revocado_por_nombre}
      WHERE id = ${input.id}::uuid AND revocado = FALSE
      RETURNING *
    `) as any[]
    if (rows.length === 0) {
      throw new Error('Permiso no encontrado o ya revocado')
    }
    return rows[0]
  },

  async getPermisosEspeciales(filtro?: {
    usuario_id?: string
    tipo?: string
    solo_vigentes?: boolean
  }): Promise<any[]> {
    await ensurePermisosEspecialesTable()
    const sql = getSql()
    if (filtro?.usuario_id && filtro?.tipo && filtro?.solo_vigentes) {
      return (await sql`
        SELECT * FROM soda_master.permisos_especiales
        WHERE usuario_id = ${filtro.usuario_id}::uuid
          AND tipo = ${filtro.tipo}
          AND revocado = FALSE
          AND valido_hasta > now()
        ORDER BY valido_hasta DESC
      `) as any[]
    }
    if (filtro?.usuario_id && filtro?.tipo) {
      return (await sql`
        SELECT * FROM soda_master.permisos_especiales
        WHERE usuario_id = ${filtro.usuario_id}::uuid
          AND tipo = ${filtro.tipo}
        ORDER BY created_at DESC
      `) as any[]
    }
    if (filtro?.usuario_id) {
      return (await sql`
        SELECT * FROM soda_master.permisos_especiales
        WHERE usuario_id = ${filtro.usuario_id}::uuid
        ORDER BY created_at DESC
      `) as any[]
    }
    if (filtro?.solo_vigentes) {
      return (await sql`
        SELECT * FROM soda_master.permisos_especiales
        WHERE revocado = FALSE AND valido_hasta > now()
        ORDER BY valido_hasta ASC
      `) as any[]
    }
    return (await sql`
      SELECT * FROM soda_master.permisos_especiales
      ORDER BY created_at DESC
      LIMIT 500
    `) as any[]
  },

  /**
   * Devuelve true si `usuario_id` puede realizar la acción indicada por
   * `tipo` AHORA (permiso no revocado y dentro de vigencia). Es lo que
   * llama `crearOrden` para decidir si el cajero puede abrir mesa.
   */
  async tienePermisoEspecial(usuario_id: string, tipo: string): Promise<boolean> {
    await ensurePermisosEspecialesTable()
    const sql = getSql()
    const rows = (await sql`
      SELECT 1 FROM soda_master.permisos_especiales
      WHERE usuario_id = ${usuario_id}::uuid
        AND tipo = ${tipo}
        AND revocado = FALSE
        AND valido_hasta > now()
      LIMIT 1
    `) as any[]
    return rows.length > 0
  },

  // Pérdidas (perros muertos): cuando un cliente consumió pero se fue sin
  // pagar. La orden pasa a estado `'perdida'`, lo que la quita del listado de
  // comandas activas y la diferencia claramente de `'pagado'`.
  //
  // Sesión 7 (B2): mismo patrón del cobro. Lectura previa fuera de la
  // transacción (orden, ítems, descuento, configuración), monto calculado en
  // JS con `calcularCobro` (lo que cobraría Pagos por lo que falta: ítems sin
  // pagar, descuento de la orden prorrateado y configuración de IVA del
  // servidor; sin propina) y una sola `sql.transaction` con la orden bloqueada
  // (`FOR UPDATE`), que verifica con `assert_cobro` que el estado sigue activo
  // y que ni los ítems ni el descuento cambiaron desde la lectura
  // (`ORDEN_CAMBIO`). Un segundo registro en paralelo espera el bloqueo y
  // aborta (`PERDIDA_YA_REGISTRADA`); un cobro total en paralelo gana o pierde
  // por completo. El índice único `perdidas_comanda(orden_id)` es la última red.
  async registrarPerdida(input: {
    orden_id: string
    motivo: string
    /** Quien autoriza: el usuario de la sesión (nunca viene del body). */
    usuario: { id: string; nombre: string }
  }): Promise<{
    id: string
    monto_perdido: number
    cantidad_items: number
    responsable_id: string | null
    responsable_nombre: string | null
    responsable_rol: string | null
  }> {
    await ensurePerdidasTable()
    await ensureItemPagoSchema()
    await ensureOrdenEstadoSchema()
    await ensurePagoSchema()
    const sql = getSql()
    const O = input.orden_id

    // ── 1) Lectura (la transacción la revalida) ──
    const [ordenRows, itemRows, descRows, cfgRows, pagosPrevRows] = (await Promise.all([
      sql`
        SELECT o.id, o.mesa_id, o.estado, o.usuario_id,
               u.nombre AS usuario_nombre, u.rol AS usuario_rol
        FROM soda_master.ordenes o
        LEFT JOIN soda_master.usuarios u ON u.id = o.usuario_id
        WHERE o.id = ${O}::uuid
      `,
      sql`
        SELECT cantidad, precio_unitario, pagado
        FROM soda_master.items_orden WHERE orden_id = ${O}::uuid
      `,
      sql`
        SELECT tipo, valor FROM soda_master.descuentos
        WHERE orden_id = ${O}::uuid ORDER BY created_at DESC LIMIT 1
      `,
      sql`
        SELECT clave, valor, tipo FROM soda_master.configuracion
        WHERE clave IN ('tasa_impuesto','impuesto_habilitado','propinas_habilitadas','precios_incluyen_iva')
      `,
      sql`
        SELECT COUNT(*)::int AS n, COALESCE(SUM(descuento), 0)::numeric AS dado
        FROM soda_master.pagos WHERE orden_id = ${O}::uuid
      `,
    ])) as any[][]
    const nPagosPrevios = Number(pagosPrevRows[0]?.n) || 0
    const descuentoDado = Number(pagosPrevRows[0]?.dado) || 0

    const orden = ordenRows[0]
    if (!orden) throw new ErrorOrden('ORDEN_NO_ENCONTRADA', 404, 'La orden no existe.')
    if (orden.estado === 'pagado') throw new ErrorOrden('ORDEN_YA_PAGADA', 409, ERRORES_TX_ORDEN.ORDEN_YA_PAGADA.mensaje)
    if (orden.estado === 'perdida') {
      throw new ErrorOrden('PERDIDA_YA_REGISTRADA', 409, ERRORES_TX_ORDEN.PERDIDA_YA_REGISTRADA.mensaje)
    }
    if (orden.estado === 'cancelado') {
      throw new ErrorOrden('ORDEN_CANCELADA', 409, ERRORES_TX_ORDEN.ORDEN_CANCELADA.mensaje)
    }

    const items = (itemRows as any[]).map((r) => ({
      cantidad: Number(r.cantidad) || 0,
      precio: Number(r.precio_unitario) || 0,
      pagado: r.pagado === true,
    }))
    const pendientes = items.filter((i) => !i.pagado)
    if (pendientes.length === 0) {
      throw new ErrorOrden('SIN_ITEMS_POR_COBRAR', 409, ERRORES_TX_ORDEN.SIN_ITEMS_POR_COBRAR.mensaje)
    }

    // ── 2) Monto: el que cobraría Pagos por lo que falta (sin propina) ──
    const cfg: Record<string, any> = {}
    for (const r of cfgRows as any[]) cfg[r.clave] = parseConfigValor(r.valor, r.tipo)
    const config: ConfigCobro = {
      impuestoHabilitado: cfg.impuesto_habilitado === true,
      tasaImpuesto: Number(cfg.tasa_impuesto) || 0,
      propinasHabilitadas: cfg.propinas_habilitadas !== false,
      preciosIncluyenIva: cfg.precios_incluyen_iva !== false,
    }
    const desc = (descRows as any[])[0]
    const descuentoOrden: DescuentoCobro = desc
      ? { tipo: desc.tipo as TipoDescuentoCobro, valor: Number(desc.valor) || 0 }
      : { tipo: null, valor: 0 }
    const subtotalOrden = items.reduce((s, i) => s + i.precio * i.cantidad, 0)
    // B4: el descuento que falta por entregar (el de la orden menos lo ya dado) cae sobre lo
    // pendiente completo, igual que en el último cobro de la orden.
    const calc = calcularCobro({
      items: pendientes.map((i) => ({ precio: i.precio, cantidad: i.cantidad })),
      subtotalOrden,
      subtotalPendiente: pendientes.reduce((s, i) => s + i.precio * i.cantidad, 0),
      descuentoDado,
      descuento: descuentoOrden,
      config,
    })
    const monto = calc.total
    const cantidad = pendientes.length

    const motivo = (input.motivo || '').toString().trim() || 'Perro muerto'
    const responsableId = orden.usuario_id ? String(orden.usuario_id) : null
    const responsableNombre = orden.usuario_nombre || null
    const responsableRol = orden.usuario_rol || null
    const responsableLabel = responsableNombre
      ? ` — responsable ${responsableNombre}${responsableRol ? ` (${responsableRol})` : ''}`
      : ''
    // Anotamos en `ordenes.notas` para que cualquiera que abra esa orden vea
    // por qué se cerró sin pago, quién lo autorizó y quién era el responsable.
    const notaPerdida = `[PERRO MUERTO] ${motivo} — autorizó ${input.usuario.nombre}${responsableLabel}`

    // ── 3) Transacción ──
    const consultas: any[] = [
      // a) bloqueo de la orden: registros y cobros concurrentes se serializan aquí
      sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
            'ORDEN_NO_ENCONTRADA')`,
      // b) la orden sigue activa (con la orden bloqueada: ya vimos lo que confirmó el otro)
      sql`SELECT soda_master.assert_cobro(
            (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) <> 'pagado', 'ORDEN_YA_PAGADA')`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) <> 'perdida', 'PERDIDA_YA_REGISTRADA')`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) <> 'cancelado', 'ORDEN_CANCELADA')`,
      // c) nada cambió desde la lectura (ítems, precios, pagados, descuento)
      sql`SELECT soda_master.assert_cobro(
            ABS(COALESCE((SELECT SUM(precio_unitario * cantidad) FROM soda_master.items_orden
                           WHERE orden_id = ${O}::uuid), 0) - ${subtotalOrden}::numeric) < 0.01
            AND (SELECT COUNT(*) FROM soda_master.items_orden WHERE orden_id = ${O}::uuid) = ${items.length}::int
            AND (SELECT COUNT(*) FROM soda_master.items_orden
                  WHERE orden_id = ${O}::uuid AND pagado = FALSE) = ${pendientes.length}::int
            AND ABS(COALESCE((SELECT SUM(precio_unitario * cantidad) FROM soda_master.items_orden
                               WHERE orden_id = ${O}::uuid AND pagado = FALSE), 0)
                    - ${pendientes.reduce((s, i) => s + i.precio * i.cantidad, 0)}::numeric) < 0.01
            AND (SELECT COUNT(*) FROM soda_master.pagos WHERE orden_id = ${O}::uuid) = ${nPagosPrevios}::int
            AND COALESCE((SELECT SUM(descuento) FROM soda_master.pagos WHERE orden_id = ${O}::uuid), 0)
                  = ${descuentoDado}::numeric
            AND (SELECT tipo FROM soda_master.descuentos WHERE orden_id = ${O}::uuid
                  ORDER BY created_at DESC LIMIT 1) IS NOT DISTINCT FROM ${descuentoOrden.tipo}::text
            AND COALESCE((SELECT valor FROM soda_master.descuentos WHERE orden_id = ${O}::uuid
                           ORDER BY created_at DESC LIMIT 1), 0) = ${descuentoOrden.valor}::numeric,
            'ORDEN_CAMBIO')`,
    ]
    const posInsert = consultas.length
    consultas.push(sql`
      INSERT INTO soda_master.perdidas_comanda
        (orden_id, mesa_id, monto_perdido, cantidad_items, motivo,
         autorizado_por, autorizado_por_nombre,
         responsable_id, responsable_nombre, responsable_rol)
      VALUES (
        ${O}::uuid,
        ${orden.mesa_id ?? null}::uuid,
        ${monto},
        ${cantidad},
        ${motivo},
        ${input.usuario.id}::uuid,
        ${input.usuario.nombre},
        ${responsableId}::uuid,
        ${responsableNombre},
        ${responsableRol}
      )
      RETURNING id
    `)
    consultas.push(sql`
      UPDATE soda_master.ordenes
      SET estado = 'perdida',
          notas = CASE
            WHEN COALESCE(notas, '') = '' THEN ${notaPerdida}
            ELSE notas || E'\n' || ${notaPerdida}
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${O}::uuid
    `)

    let resultados: any[][] = []
    try {
      resultados = (await sql.transaction(consultas)) as any[][]
    } catch (err: any) {
      // Índice único (orden_id): la red de seguridad si algo se saltara el bloqueo.
      if (err?.code === '23505') {
        throw new ErrorOrden('PERDIDA_YA_REGISTRADA', 409, ERRORES_TX_ORDEN.PERDIDA_YA_REGISTRADA.mensaje)
      }
      traducirErrorTx(err)
    }

    return {
      id: resultados[posInsert][0].id,
      monto_perdido: monto,
      cantidad_items: cantidad,
      responsable_id: responsableId,
      responsable_nombre: responsableNombre,
      responsable_rol: responsableRol,
    }
  },

  /**
   * Marca una pérdida como resuelta porque el cliente volvió a pagar lo
   * consumido. Crea un pago "retroactivo" con `metodo` indicado (por
   * defecto efectivo) y queda enlazado vía `pago_id`. La orden NO se
   * vuelve a marcar como pagada — el `estado='perdida'` queda como
   * histórico de que hubo un incidente, pero financieramente la pérdida
   * desaparece de los reportes (filtrando `resuelto = true`).
   *
   * Sesión 7: va en una transacción con la fila de la pérdida bloqueada
   * (`FOR UPDATE`) y `assert_cobro` de que no esté resuelta; dos cobros
   * retroactivos en paralelo ya no crean dos pagos.
   *
   * Sesión 9 (B3, F24):
   *  - El monto se contrasta con `perdidas_comanda.monto_perdido` (lo que calculó
   *    `registrarPerdida` con `calcularCobro`), leído DENTRO de la transacción con la
   *    fila bloqueada. Más que lo registrado → 400 `MONTO_EXCEDE_PERDIDA`. Menos → el
   *    motivo es obligatorio (400 `MOTIVO_REQUERIDO`); la pérdida se da por resuelta,
   *    la diferencia queda en `monto_condonado` / `motivo_condonacion` y en
   *    `auditoria_admin`, todo en la misma transacción. Sin `monto` se cobra el total.
   *  - Efectivo: el pago entra a `movimientos_caja` (`venta_efectivo`) en la misma
   *    transacción, con el criterio del cobro (sesión 5): sin caja abierta → 409
   *    `CAJA_CERRADA`. Tarjeta no mueve caja.
   */
  async resolverPerdida(input: {
    perdida_id: string
    monto?: number
    metodo?: string
    referencia?: string | null
    /** Obligatorio si el monto es menor que lo registrado. */
    motivo?: string | null
    resuelto_por_id: string
    resuelto_por_nombre: string
    resuelto_por_rol?: string | null
  }): Promise<{
    id: string
    pago_id: string
    monto: number
    monto_registrado: number
    monto_condonado: number
  }> {
    await ensurePerdidasTable()
    await ensurePagoSchema()
    await ensureCajaSchema()
    await ensureAuditoriaAdminTable()
    const sql = getSql()
    const P = input.perdida_id

    const perdidas = (await sql`
      SELECT id, orden_id, monto_perdido, resuelto
      FROM soda_master.perdidas_comanda
      WHERE id = ${P}::uuid
    `) as Array<{
      id: string
      orden_id: string
      monto_perdido: string | number
      resuelto: boolean
    }>
    if (perdidas.length === 0) {
      throw new ErrorOrden('PERDIDA_NO_ENCONTRADA', 404, ERRORES_TX_ORDEN.PERDIDA_NO_ENCONTRADA.mensaje)
    }
    if (perdidas[0].resuelto) {
      throw new ErrorOrden('PERDIDA_YA_RESUELTA', 409, ERRORES_TX_ORDEN.PERDIDA_YA_RESUELTA.mensaje)
    }
    const ordenId = String(perdidas[0].orden_id)
    const montoOriginal = Number(perdidas[0].monto_perdido) || 0
    const monto =
      input.monto !== undefined && Number.isFinite(Number(input.monto))
        ? Number(input.monto)
        : montoOriginal
    if (monto <= 0) {
      throw new ErrorOrden('MONTO_INVALIDO', 400, 'El monto del cobro retroactivo debe ser mayor que 0')
    }
    const motivo = (input.motivo ?? '').toString().trim()
    const tieneMotivo = motivo.length >= 3
    // Lecturas previas: dan el mensaje con las cifras. La transacción repite las
    // dos verificaciones contra la fila bloqueada, que es la que manda.
    if (monto > montoOriginal) {
      throw new ErrorOrden(
        'MONTO_EXCEDE_PERDIDA',
        400,
        `El monto no puede superar lo registrado de la pérdida (${formatCurrency(montoOriginal)}).`,
      )
    }
    if (monto < montoOriginal && !tieneMotivo) {
      throw new ErrorOrden(
        'MOTIVO_REQUERIDO',
        400,
        `Cobras ${formatCurrency(montoOriginal - monto)} menos de lo registrado (${formatCurrency(montoOriginal)}): indica el motivo (mínimo 3 caracteres).`,
      )
    }
    const metodo = normalizarMetodoPago(input.metodo ?? 'efectivo')
    const mueveCaja = metodo === 'efectivo'
    const referencia = input.referencia ?? `retroactivo:${P}`
    const pagoId = crypto.randomUUID()
    // Dejamos constancia en `ordenes.notas` para no perder el rastro.
    const nota =
      `[PERRO MUERTO RESUELTO] cobrado retroactivamente $${monto.toFixed(0)} por ${input.resuelto_por_nombre}` +
      (monto < montoOriginal
        ? ` (registrado $${montoOriginal.toFixed(0)}, diferencia condonada $${(montoOriginal - monto).toFixed(0)}: ${motivo})`
        : '')

    const consultas: any[] = [
      sql`SELECT id FROM soda_master.perdidas_comanda WHERE id = ${P}::uuid FOR UPDATE`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT COUNT(*) FROM soda_master.perdidas_comanda WHERE id = ${P}::uuid) = 1,
            'PERDIDA_NO_ENCONTRADA')`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT resuelto FROM soda_master.perdidas_comanda WHERE id = ${P}::uuid) = FALSE,
            'PERDIDA_YA_RESUELTA')`,
      // B3: nunca más de lo registrado; menos solo con motivo
      sql`SELECT soda_master.assert_cobro(
            ${monto}::numeric <= (SELECT monto_perdido FROM soda_master.perdidas_comanda WHERE id = ${P}::uuid),
            'MONTO_EXCEDE_PERDIDA')`,
      sql`SELECT soda_master.assert_cobro(
            ${tieneMotivo}::boolean
            OR ${monto}::numeric >= (SELECT monto_perdido FROM soda_master.perdidas_comanda WHERE id = ${P}::uuid),
            'MOTIVO_REQUERIDO')`,
    ]
    // F24: efectivo → tiene que haber caja abierta (se comparte mientras dura el cobro)
    if (mueveCaja) {
      consultas.push(sql`
        SELECT soda_master.assert_cobro(
          (SELECT COUNT(*) FROM (
            SELECT id FROM soda_master.cajas WHERE estado = 'abierta' FOR SHARE
          ) c) = 1,
          'CAJA_CERRADA')`)
    }
    consultas.push(
      sql`INSERT INTO soda_master.pagos
            (id, orden_id, metodo, monto, propina, descuento, dividido_en, vuelto, referencia,
             aprobado, cobrado_por, cobrado_por_nombre)
          VALUES (${pagoId}::uuid, ${ordenId}::uuid, ${metodo}, ${monto}, 0, 0, 1, NULL, ${referencia},
                  TRUE, ${input.resuelto_por_id}::uuid, ${input.resuelto_por_nombre})`,
    )
    if (mueveCaja) {
      consultas.push(sql`
        INSERT INTO soda_master.movimientos_caja
          (caja_id, tipo, monto, pago_id, usuario_id, usuario_nombre, descripcion)
        SELECT c.id, 'venta_efectivo', ${monto}, ${pagoId}::uuid,
               ${input.resuelto_por_id}::uuid, ${input.resuelto_por_nombre},
               ${'Cobro retroactivo pérdida ' + String(P).slice(0, 8)}
        FROM soda_master.cajas c WHERE c.estado = 'abierta'`)
    }
    // Cobro parcial: queda en la auditoría (con el motivo) en la misma transacción
    consultas.push(sql`
      INSERT INTO soda_master.auditoria_admin
        (usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, detalles)
      SELECT ${input.resuelto_por_id}::uuid, ${input.resuelto_por_nombre}, ${input.resuelto_por_rol ?? null},
             'perdida_cobro_parcial', 'perdida_comanda', p.id,
             jsonb_build_object(
               'orden_id', p.orden_id,
               'monto_registrado', p.monto_perdido,
               'monto_cobrado', ${monto}::numeric,
               'monto_condonado', p.monto_perdido - ${monto}::numeric,
               'motivo', ${motivo}::text,
               'metodo', ${metodo}::text,
               'pago_id', ${pagoId}::uuid)
      FROM soda_master.perdidas_comanda p
      WHERE p.id = ${P}::uuid AND p.monto_perdido > ${monto}::numeric`)
    consultas.push(
      sql`UPDATE soda_master.perdidas_comanda
          SET resuelto = TRUE,
              resuelto_at = now(),
              resuelto_por_id = ${input.resuelto_por_id}::uuid,
              resuelto_por_nombre = ${input.resuelto_por_nombre},
              pago_id = ${pagoId}::uuid,
              monto_cobrado = ${monto}::numeric,
              monto_condonado = monto_perdido - ${monto}::numeric,
              motivo_condonacion = CASE WHEN monto_perdido > ${monto}::numeric THEN ${motivo}::text ELSE NULL END
          WHERE id = ${P}::uuid`,
      sql`UPDATE soda_master.ordenes
          SET notas = CASE
                WHEN COALESCE(notas, '') = '' THEN ${nota}
                ELSE notas || E'\n' || ${nota}
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${ordenId}::uuid`,
    )

    try {
      await sql.transaction(consultas)
    } catch (err) {
      traducirErrorTx(err)
    }

    return {
      id: P,
      pago_id: pagoId,
      monto,
      monto_registrado: montoOriginal,
      monto_condonado: Math.max(montoOriginal - monto, 0),
    }
  },

  async getPerdidas(filtro?: { fecha?: string }): Promise<any[]> {
    await ensurePerdidasTable()
    const sql = getSql()
    if (filtro?.fecha === 'hoy') {
      return (await sql`
        SELECT * FROM soda_master.perdidas_comanda
        WHERE (created_at AT TIME ZONE 'America/Santiago')::date
            = (now() AT TIME ZONE 'America/Santiago')::date
        ORDER BY created_at DESC
      `) as any[]
    }
    if (filtro?.fecha) {
      return (await sql`
        SELECT * FROM soda_master.perdidas_comanda
        WHERE (created_at AT TIME ZONE 'America/Santiago')::date = ${filtro.fecha}::date
        ORDER BY created_at DESC
      `) as any[]
    }
    return (await sql`
      SELECT * FROM soda_master.perdidas_comanda
      ORDER BY created_at DESC
      LIMIT 200
    `) as any[]
  },

  // Cuentas por persona (Persona 1, 2, 3...). Persisten en BD para
  // que al refrescar, cambiar de cajero, o agregar items más tarde no se
  // pierda quién paga qué.
  async getCuentasPersona(ordenId: string): Promise<any[]> {
    await ensureCuentasPersonaSchema()
    const sql = getSql()
    return (await sql`
      SELECT id, orden_id, idx, nombre, created_at
      FROM soda_master.cuentas_persona
      WHERE orden_id = ${ordenId}::uuid
      ORDER BY idx ASC
    `) as any[]
  },

  /**
   * Crea "Persona N" en una orden activa (sesión 7). Va en una transacción con
   * la orden bloqueada (`FOR UPDATE`): el siguiente `idx` se calcula con el
   * bloqueo tomado, así dos cajeros que crean a la vez obtienen Persona 3 y
   * Persona 4 en vez de un error de índice único. (El `pg_advisory_xact_lock`
   * que había dentro del CTE no lo referenciaba nada, así que ni se ejecutaba.)
   */
  async crearCuentaPersona(input: {
    orden_id: string
    nombre?: string | null
  }): Promise<any> {
    await ensureCuentasPersonaSchema()
    await ensurePagoSchema()
    const sql = getSql()
    const O = input.orden_id
    let resultados: any[][] = []
    try {
      resultados = (await sql.transaction([
        sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
              'ORDEN_NO_ENCONTRADA')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${ESTADOS_ORDEN_ACTIVA}::text[]),
              'ORDEN_NO_ACTIVA')`,
        sql`INSERT INTO soda_master.cuentas_persona (orden_id, idx, nombre)
            SELECT ${O}::uuid, COALESCE(MAX(idx), 0) + 1, ${input.nombre ?? null}::text
            FROM soda_master.cuentas_persona
            WHERE orden_id = ${O}::uuid
            RETURNING id, orden_id, idx, nombre, created_at`,
      ])) as any[][]
    } catch (err) {
      traducirErrorTx(err)
    }
    return resultados[resultados.length - 1][0]
  },

  async renombrarCuentaPersona(id: string, nombre: string | null): Promise<any> {
    await ensureCuentasPersonaSchema()
    const sql = getSql()
    const rows = (await sql`
      UPDATE soda_master.cuentas_persona
      SET nombre = ${nombre}
      WHERE id = ${id}::uuid
      RETURNING id, orden_id, idx, nombre, created_at
    `) as any[]
    if (!rows[0]) {
      throw new ErrorOrden('PERSONA_NO_ENCONTRADA', 404, ERRORES_TX_ORDEN.PERSONA_NO_ENCONTRADA.mensaje)
    }
    return rows[0]
  },

  /**
   * Elimina una persona y deja sus ítems pendientes compartidos (sesión 7: en una
   * transacción con la orden bloqueada, para no cruzarse con una asignación
   * en paralelo y dejar ítems apuntando a una persona que ya no existe).
   * Sesión 9 (A3): solo con la orden activa y solo si la persona NO tiene ítems
   * pagados (409 `PERSONA_CON_ITEMS_PAGADOS`): borrarla dejaba esos ítems sin
   * persona y se perdía quién pagó qué.
   */
  async eliminarCuentaPersona(id: string): Promise<void> {
    await ensureCuentasPersonaSchema()
    await ensurePagoSchema()
    const sql = getSql()
    const filas = (await sql`
      SELECT orden_id FROM soda_master.cuentas_persona WHERE id = ${id}::uuid
    `) as any[]
    if (!filas[0]) return // ya no existe (doble clic): nada que hacer
    const O = String(filas[0].orden_id)
    // Sesión 9 (A3): quién pagó qué vive en `items_orden.cuenta_persona_id`. Una persona con
    // ítems pagados es parte de ese registro y no se elimina. La lectura da el mensaje con la
    // cuenta; el `assert_cobro` de la transacción es la verificación que manda (con la orden
    // bloqueada: si un cobro de esa persona confirmó antes, aquí lo vemos).
    const [{ n }] = (await sql`
      SELECT COUNT(*)::int AS n FROM soda_master.items_orden
      WHERE cuenta_persona_id = ${id}::uuid AND pagado = TRUE
    `) as any[]
    if (n > 0) {
      throw new ErrorOrden(
        'PERSONA_CON_ITEMS_PAGADOS',
        409,
        `Esta persona ya pagó ${n} ítem${n === 1 ? '' : 's'} y no se puede eliminar, porque se perdería quién pagó qué. Puedes renombrarla o dejarla sin consumo pendiente.`,
      )
    }
    try {
      await sql.transaction([
        sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${ESTADOS_ORDEN_ACTIVA}::text[]),
              'ORDEN_NO_ACTIVA')`,
        sql`SELECT soda_master.assert_cobro(
              NOT EXISTS (SELECT 1 FROM soda_master.items_orden
                          WHERE cuenta_persona_id = ${id}::uuid AND pagado = TRUE),
              'PERSONA_CON_ITEMS_PAGADOS')`,
        // Los ítems pendientes de esa persona quedan compartidos (sin FK real, no se pierden).
        sql`UPDATE soda_master.items_orden
            SET cuenta_persona_id = NULL
            WHERE cuenta_persona_id = ${id}::uuid AND pagado = FALSE`,
        sql`DELETE FROM soda_master.cuentas_persona WHERE id = ${id}::uuid`,
      ])
    } catch (err) {
      traducirErrorTx(err)
    }
  },

  /**
   * Aplica un conjunto de asignaciones (item -> persona, con cantidad).
   *
   * El cliente puede mandar VARIAS asignaciones para el mismo item (por
   * ejemplo, una "2x Cerveza" que se reparte 1 a P1 y 1 a P2). Para que
   * no se pisen, agrupamos primero por `item_orden_id` y procesamos cada
   * grupo en una sola pasada:
   *   - 1 destino que cubre toda la cantidad → UPDATE cuenta_persona_id.
   *   - varios destinos → el original se queda con el primer destino y
   *     se clonan filas para los demás (y un sobrante compartido si las
   *     cantidades no suman exactamente).
   *
   * Sesión 7 (A2, R7): patrón del cobro. Lectura previa (orden, ítems y
   * personas de ESA orden), plan en JS y una sola `sql.transaction`: bloqueo
   * de la orden (`FOR UPDATE`) y `assert_cobro` de que la orden sigue activa,
   * de que las personas destino pertenecen a la orden y de que cada ítem
   * sigue sin pagar y con la cantidad leída; recién entonces los UPDATE e
   * INSERT (los clones se copian desde la fila original: incluyen
   * `precio_manual` y el estado vigente). Si algo cambió (otro guardado, un
   * cobro, una persona borrada) responde 409 y no toca nada: todo o nada.
   * Ítems ya pagados no se reasignan (consistencia con los reportes).
   */
  async aplicarAsignacionesCuentas(input: {
    orden_id: string
    asignaciones: Array<{
      item_orden_id: string
      cantidad: number
      cuenta_persona_id: string | null
    }>
  }): Promise<{ ok: true }> {
    await ensureCuentasPersonaSchema()
    await ensureItemPrecioSchema()
    await ensurePagoSchema()
    const sql = getSql()
    const O = input.orden_id

    // Agrupar por item; consolidar destinos repetidos.
    const grupos = new Map<string, Map<string, number>>() // itemId -> (destinoKey -> cantidad)
    for (const a of input.asignaciones) {
      const destino = a.cuenta_persona_id || 'NULL'
      if (!grupos.has(a.item_orden_id)) grupos.set(a.item_orden_id, new Map())
      const m = grupos.get(a.item_orden_id)!
      m.set(destino, (m.get(destino) || 0) + a.cantidad)
    }

    // ── 1) Lectura y validación (la transacción la revalida) ──
    const [ordenRows, itemRows, personaRows] = (await Promise.all([
      sql`SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid`,
      sql`SELECT id, cantidad, pagado FROM soda_master.items_orden WHERE orden_id = ${O}::uuid`,
      sql`SELECT id FROM soda_master.cuentas_persona WHERE orden_id = ${O}::uuid`,
    ])) as any[][]
    if (!ordenRows[0]) throw new ErrorOrden('ORDEN_NO_ENCONTRADA', 404, ERRORES_TX_ORDEN.ORDEN_NO_ENCONTRADA.mensaje)
    if (!ESTADOS_ORDEN_ACTIVA.includes(ordenRows[0].estado)) {
      throw new ErrorOrden('ORDEN_NO_ACTIVA', 409, ERRORES_TX_ORDEN.ORDEN_NO_ACTIVA.mensaje)
    }
    const personasDeLaOrden = new Set((personaRows as any[]).map((p) => String(p.id)))
    const itemsDeLaOrden = new Map((itemRows as any[]).map((i) => [String(i.id), i]))
    const personasDestino = new Set<string>()
    for (const [itemId, destinos] of grupos.entries()) {
      const it = itemsDeLaOrden.get(itemId)
      if (!it) throw new ErrorOrden('ITEM_AJENO', 400, ERRORES_TX_ORDEN.ITEM_AJENO.mensaje)
      if (it.pagado === true) throw new ErrorOrden('ITEM_PAGADO', 409, ERRORES_TX_ORDEN.ITEM_PAGADO.mensaje)
      let pedido = 0
      for (const [destinoKey, cant] of destinos.entries()) {
        if (destinoKey !== 'NULL') {
          if (!personasDeLaOrden.has(destinoKey)) {
            throw new ErrorOrden('PERSONA_AJENA', 400, ERRORES_TX_ORDEN.PERSONA_AJENA.mensaje)
          }
          personasDestino.add(destinoKey)
        }
        pedido += cant
      }
      // Más unidades que las de la línea: la pantalla está desactualizada.
      if (pedido > Number(it.cantidad)) {
        throw new ErrorOrden('ITEMS_CAMBIARON', 409, ERRORES_TX_ORDEN.ITEMS_CAMBIARON.mensaje)
      }
    }

    // ── 2) Transacción ──
    const consultas: any[] = [
      sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
            'ORDEN_NO_ENCONTRADA')`,
      sql`SELECT soda_master.assert_cobro(
            (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${ESTADOS_ORDEN_ACTIVA}::text[]),
            'ORDEN_NO_ACTIVA')`,
    ]
    const destinosArr = Array.from(personasDestino)
    if (destinosArr.length > 0) {
      consultas.push(sql`SELECT soda_master.assert_cobro(
            (SELECT COUNT(*) FROM soda_master.cuentas_persona
              WHERE orden_id = ${O}::uuid AND id = ANY(${destinosArr}::uuid[])) = ${destinosArr.length}::int,
            'PERSONA_ELIMINADA')`)
    }

    for (const [itemId, destinos] of grupos.entries()) {
      const cantidadOriginal = Number(itemsDeLaOrden.get(itemId)!.cantidad) || 0
      // Lista ordenada de (destino, cantidad); el resto sin asignar queda compartido.
      let restante = cantidadOriginal
      const planificado: Array<{ destino: string | null; cantidad: number }> = []
      for (const [destinoKey, cant] of destinos.entries()) {
        planificado.push({ destino: destinoKey === 'NULL' ? null : destinoKey, cantidad: cant })
        restante -= cant
      }

      // El ítem sigue sin pagar y con la cantidad leída (nadie lo cortó, cobró ni editó).
      consultas.push(
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.items_orden
                WHERE id = ${itemId}::uuid AND orden_id = ${O}::uuid AND pagado = TRUE) = 0,
              'ITEM_PAGADO')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.items_orden
                WHERE id = ${itemId}::uuid AND orden_id = ${O}::uuid
                  AND pagado = FALSE AND cantidad = ${cantidadOriginal}::int) = 1,
              'ITEMS_CAMBIARON')`,
      )

      // Caso simple: un sólo destino que cubre la totalidad.
      if (planificado.length === 1 && planificado[0].cantidad >= cantidadOriginal) {
        consultas.push(sql`
          UPDATE soda_master.items_orden
          SET cuenta_persona_id = ${planificado[0].destino}::uuid
          WHERE id = ${itemId}::uuid
        `)
        continue
      }

      // Caso complejo: split. La línea original toma el primer destino con su
      // cantidad; los demás se clonan a filas nuevas (copiadas de la original,
      // con su precio, estado, notas, modificadores y precio manual); si sobra,
      // se crea una línea final compartida (null).
      const [primero, ...resto] = planificado
      consultas.push(sql`
        UPDATE soda_master.items_orden
        SET cantidad = ${primero.cantidad}::int,
            cuenta_persona_id = ${primero.destino}::uuid
        WHERE id = ${itemId}::uuid
      `)
      const clones = [...resto]
      if (restante > 0) clones.push({ destino: null, cantidad: restante })
      for (const seg of clones) {
        consultas.push(sql`
          INSERT INTO soda_master.items_orden
            (orden_id, producto_id, cantidad, precio_unitario, modificadores,
             notas_especiales, estado_item, pagado, cuenta_persona_id, precio_manual)
          SELECT orden_id, producto_id, ${seg.cantidad}::int, precio_unitario, modificadores,
                 notas_especiales, estado_item, FALSE, ${seg.destino}::uuid, precio_manual
          FROM soda_master.items_orden
          WHERE id = ${itemId}::uuid
        `)
      }
    }

    try {
      await sql.transaction(consultas)
    } catch (err) {
      traducirErrorTx(err)
    }
    return { ok: true }
  },

  // Inventario
  async getInventario(): Promise<Inventario[]> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.inventario ORDER BY created_at DESC`
    return result as Inventario[]
  },

  async actualizarInventario(
    productoId: string,
    updates: number | { stock_actual?: number; stock_minimo?: number; unidad_medida?: string | null }
  ) {
    const sql = getSql()
    const patch = typeof updates === 'number' ? { stock_actual: updates } : updates
    const unidad = typeof patch.unidad_medida === 'string' ? patch.unidad_medida.trim() : null
    const result = await sql`
      UPDATE soda_master.inventario 
      SET stock_actual = COALESCE(${patch.stock_actual ?? null}, stock_actual),
          stock_minimo = COALESCE(${patch.stock_minimo ?? null}, stock_minimo),
          unidad_medida = COALESCE(${unidad}, unidad_medida),
          updated_at = CURRENT_TIMESTAMP
      WHERE producto_id = ${productoId}
      RETURNING *
    `
    return result[0] as Inventario
  },

  // Permisos de descuento
  async getPermisosDescuento() {
    const sql = getSql()
    const rows = await sql`
      SELECT rol, puede_aplicar, limite_maximo, requiere_motivo
      FROM soda_master.permisos_descuento
      ORDER BY rol
    `
    return (rows as any[]).map((r) => ({
      rol: r.rol,
      puede_aplicar: r.puede_aplicar === true,
      limite_maximo: Number(r.limite_maximo) || 0,
      requiere_motivo: r.requiere_motivo === true,
    }))
  },

  async actualizarPermisosDescuento(
    items: Array<{ rol: string; puede_aplicar: boolean; limite_maximo: number; requiere_motivo: boolean }>
  ) {
    const sql = getSql()
    for (const item of items) {
      await sql`
        INSERT INTO soda_master.permisos_descuento (rol, puede_aplicar, limite_maximo, requiere_motivo)
        VALUES (${item.rol}, ${item.puede_aplicar}, ${item.limite_maximo}, ${item.requiere_motivo})
        ON CONFLICT (rol) DO UPDATE
        SET puede_aplicar = EXCLUDED.puede_aplicar,
            limite_maximo = EXCLUDED.limite_maximo,
            requiere_motivo = EXCLUDED.requiere_motivo
      `
    }
    return this.getPermisosDescuento()
  },

  // Descuentos
  //
  // Sesión 12 (F17, B4): una sola `sql.transaction` con la orden bloqueada (`FOR UPDATE`), el
  // mismo patrón del cobro y de `eliminarItemOrden`. Verifica que la orden esté activa (no
  // `pagado`, `cancelado` ni `perdida`: 409 `ORDEN_NO_ACTIVA`), que los ítems y el descuento
  // anterior sean los leídos (guarda de huella, con reintento), reemplaza el descuento y
  // recalcula subtotal, impuesto y total de la orden dentro de la misma transacción. Un
  // porcentaje sobre una orden con cobros se rechaza (409 `ORDEN_CON_COBROS`): el monto fijo y
  // la cortesía sí se aceptan y lo no entregado cae sobre lo pendiente (ver `lib/cobro.ts`).
  async crearDescuento(input: {
    orden_id: string
    tipo: string
    valor: number
    aplicado_por: string
    autorizado_por?: string | null
    motivo: string
  }) {
    await ensureItemPagoSchema()
    await ensurePagoSchema()
    await ensureOrdenesAtomicasSchema()
    const sql = getSql()
    const O = input.orden_id
    return await conReintento(async () => {
      const ordenRows = (await sql`
        SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid
      `) as any[]
      if (!ordenRows[0]) throw new ErrorOrden('ORDEN_NO_ENCONTRADA', 404, 'La orden no existe.')
      const ctx = await leerContextoTotales(O)
      const nuevo: DescuentoCobro = { tipo: input.tipo as TipoDescuentoCobro, valor: input.valor }
      const calc = totalesDe({ ...ctx, descuento: nuevo }, ctx.items)
      const consultas: any[] = [
        sql`SELECT id FROM soda_master.ordenes WHERE id = ${O}::uuid FOR UPDATE`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT COUNT(*) FROM soda_master.ordenes WHERE id = ${O}::uuid) = 1,
              'ORDEN_NO_ENCONTRADA')`,
        sql`SELECT soda_master.assert_cobro(
              (SELECT estado FROM soda_master.ordenes WHERE id = ${O}::uuid) = ANY(${[...ESTADOS_ORDEN_ACTIVA]}::text[]),
              'ORDEN_NO_ACTIVA')`,
      ]
      if (input.tipo === 'porcentaje') {
        consultas.push(sql`SELECT soda_master.assert_cobro(
              NOT EXISTS (SELECT 1 FROM soda_master.items_orden WHERE orden_id = ${O}::uuid AND pagado = TRUE)
              AND NOT EXISTS (SELECT 1 FROM soda_master.pagos WHERE orden_id = ${O}::uuid),
              'ORDEN_CON_COBROS')`)
      }
      consultas.push(sentenciaHuellaOrden(sql, O, ctx))
      const posInsert = consultas.length + 1
      consultas.push(
        sql`DELETE FROM soda_master.descuentos WHERE orden_id = ${O}::uuid`,
        sql`INSERT INTO soda_master.descuentos
              (orden_id, tipo, valor, aplicado_por, autorizado_por, motivo)
            VALUES (${O}::uuid, ${input.tipo}, ${input.valor}, ${input.aplicado_por}::uuid,
                    ${input.autorizado_por || null}::uuid, ${input.motivo})
            RETURNING *`,
        sql`UPDATE soda_master.ordenes
            SET subtotal = ${calc.subtotal}, impuesto = ${calc.impuesto}, total = ${calc.total}
            WHERE id = ${O}::uuid`,
      )
      try {
        const res = (await sql.transaction(consultas)) as any[][]
        return res[posInsert][0]
      } catch (err) {
        traducirErrorTx(err)
      }
    })
  },

  async getDescuentos(filtros?: { desde?: string; hasta?: string; orden_id?: string }) {
    const sql = getSql()
    const desde = filtros?.desde || null
    const hasta = filtros?.hasta || null
    const ordenId = filtros?.orden_id || null
    const rows = await sql`
      SELECT
        d.id,
        d.orden_id,
        d.tipo,
        d.valor,
        d.motivo,
        d.created_at,
        d.aplicado_por,
        ua.nombre AS aplicado_por_nombre,
        ua.rol    AS aplicado_por_rol,
        d.autorizado_por,
        ub.nombre AS autorizado_por_nombre,
        o.subtotal AS orden_total,
        ms.numero AS mesa_numero
      FROM soda_master.descuentos d
      LEFT JOIN soda_master.usuarios ua ON ua.id = d.aplicado_por
      LEFT JOIN soda_master.usuarios ub ON ub.id = d.autorizado_por
      LEFT JOIN soda_master.ordenes o ON o.id = d.orden_id
      LEFT JOIN soda_master.mesas ms ON ms.id = o.mesa_id
      WHERE (${desde}::date IS NULL OR (d.created_at AT TIME ZONE 'America/Santiago')::date >= ${desde}::date)
        AND (${hasta}::date IS NULL OR (d.created_at AT TIME ZONE 'America/Santiago')::date <= ${hasta}::date)
        AND (${ordenId}::uuid IS NULL OR d.orden_id = ${ordenId}::uuid)
      ORDER BY d.created_at DESC
    `
    return (rows as any[]).map((r) => ({
      id: r.id,
      orden_id: r.orden_id,
      tipo: r.tipo,
      valor: Number(r.valor) || 0,
      motivo: r.motivo,
      created_at: r.created_at,
      aplicado_por: r.aplicado_por,
      aplicado_por_nombre: r.aplicado_por_nombre,
      aplicado_por_rol: r.aplicado_por_rol,
      autorizado_por: r.autorizado_por,
      autorizado_por_nombre: r.autorizado_por_nombre,
      orden_total: r.orden_total !== null && r.orden_total !== undefined ? Number(r.orden_total) : null,
      mesa_numero: r.mesa_numero,
    }))
  },

  // Mermas
  async getMermas(filtros?: {
    tipo?: string
    desde?: string
    hasta?: string
    responsable_id?: string
  }) {
    const sql = getSql()
    const tipo = filtros?.tipo || null
    const desde = filtros?.desde || null
    const hasta = filtros?.hasta || null
    const responsableId = filtros?.responsable_id || null
    const rows = await sql`
      SELECT
        m.id,
        m.tipo,
        m.producto_id,
        p.nombre AS producto_nombre,
        m.cantidad,
        m.descripcion,
        m.registrado_por,
        ur.nombre AS registrado_por_nombre,
        m.responsable_id,
        ures.nombre AS responsable_nombre,
        m.consecuencia,
        m.monto_descuento,
        m.created_at
      FROM soda_master.mermas m
      LEFT JOIN soda_master.productos p ON p.id = m.producto_id
      LEFT JOIN soda_master.usuarios ur ON ur.id = m.registrado_por
      LEFT JOIN soda_master.usuarios ures ON ures.id = m.responsable_id
      WHERE (${tipo}::text IS NULL OR m.tipo = ${tipo})
        AND (${desde}::date IS NULL OR (m.created_at AT TIME ZONE 'America/Santiago')::date >= ${desde}::date)
        AND (${hasta}::date IS NULL OR (m.created_at AT TIME ZONE 'America/Santiago')::date <= ${hasta}::date)
        AND (${responsableId}::uuid IS NULL OR m.responsable_id = ${responsableId}::uuid)
      ORDER BY m.created_at DESC
    `
    return (rows as any[]).map((r) => ({
      id: r.id,
      tipo: r.tipo,
      producto_id: r.producto_id,
      producto_nombre: r.producto_nombre,
      cantidad: Number(r.cantidad) || 0,
      descripcion: r.descripcion,
      registrado_por: r.registrado_por,
      registrado_por_nombre: r.registrado_por_nombre,
      responsable_id: r.responsable_id,
      responsable_nombre: r.responsable_nombre,
      consecuencia: r.consecuencia,
      monto_descuento: Number(r.monto_descuento) || 0,
      created_at: r.created_at,
    }))
  },

  async crearMerma(input: {
    tipo: string
    producto_id?: string | null
    ingrediente_id?: string | null
    cantidad: number
    descripcion?: string | null
    registrado_por: string
    comanda_no_pagada?: {
      orden_id: string
      motivo: string
      autorizado_por?: string | null
    } | null
  }) {
    await ensureMermasIngredienteSchema()
    const sql = getSql()
    if (
      input.tipo !== 'comanda_no_pagada' &&
      !input.producto_id &&
      !input.ingrediente_id
    ) {
      throw new Error('Producto o insumo requerido para registrar merma')
    }

    // Merma sobre un PRODUCTO: descuenta de la tabla `inventario` (que
    // representa el stock del producto vendible) en la misma sentencia
    // para que sea atómico contra el INSERT.
    if (input.producto_id && input.tipo !== 'comanda_no_pagada') {
      const mermaRows = await sql`
        WITH stock_actualizado AS (
          UPDATE soda_master.inventario
          SET stock_actual = stock_actual - ${input.cantidad},
              updated_at = CURRENT_TIMESTAMP
          WHERE producto_id = ${input.producto_id}
            AND stock_actual >= ${input.cantidad}
          RETURNING producto_id
        )
        INSERT INTO soda_master.mermas (tipo, producto_id, cantidad, descripcion, registrado_por)
        SELECT
          ${input.tipo},
          ${input.producto_id},
          ${input.cantidad},
          ${input.descripcion || null},
          ${input.registrado_por}
        FROM stock_actualizado
        RETURNING *
      `
      if (!mermaRows[0]) {
        const stockRows = await sql`
          SELECT stock_actual
          FROM soda_master.inventario
          WHERE producto_id = ${input.producto_id}
          LIMIT 1
        `
        const stockActual = stockRows[0]?.stock_actual
        if (stockActual === undefined) {
          throw new Error('Producto sin registro de inventario')
        }
        throw new Error(`Stock insuficiente para registrar merma. Stock actual: ${Number(stockActual)}`)
      }
      return mermaRows[0] as any
    }

    // Merma sobre un INSUMO (ingrediente): descuenta de
    // `ingredientes.stock_actual`. Misma idea: descuento + INSERT atómico
    // condicionado a que haya stock suficiente.
    if (input.ingrediente_id && input.tipo !== 'comanda_no_pagada') {
      const mermaRows = await sql`
        WITH stock_actualizado AS (
          UPDATE soda_master.ingredientes
          SET stock_actual = stock_actual - ${input.cantidad},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${input.ingrediente_id}::uuid
            AND stock_actual >= ${input.cantidad}
          RETURNING id
        )
        INSERT INTO soda_master.mermas (tipo, ingrediente_id, cantidad, descripcion, registrado_por)
        SELECT
          ${input.tipo},
          ${input.ingrediente_id}::uuid,
          ${input.cantidad},
          ${input.descripcion || null},
          ${input.registrado_por}
        FROM stock_actualizado
        RETURNING *
      `
      if (!mermaRows[0]) {
        const stockRows = await sql`
          SELECT stock_actual
          FROM soda_master.ingredientes
          WHERE id = ${input.ingrediente_id}::uuid
          LIMIT 1
        `
        const stockActual = stockRows[0]?.stock_actual
        if (stockActual === undefined) {
          throw new Error('Insumo no encontrado')
        }
        throw new Error(`Stock insuficiente para registrar merma. Stock actual: ${Number(stockActual)}`)
      }
      return mermaRows[0] as any
    }

    const mermaRows = await sql`
      INSERT INTO soda_master.mermas (tipo, producto_id, cantidad, descripcion, registrado_por)
      VALUES (
        ${input.tipo},
        ${input.producto_id || null},
        ${input.cantidad},
        ${input.descripcion || null},
        ${input.registrado_por}
      )
      RETURNING *
    `
    const merma = mermaRows[0] as any

    if (input.tipo === 'comanda_no_pagada' && input.comanda_no_pagada) {
      const { orden_id, motivo, autorizado_por } = input.comanda_no_pagada
      await sql`
        INSERT INTO soda_master.comandas_no_pagadas (orden_id, motivo, autorizado_por, merma_id)
        VALUES (${orden_id}, ${motivo}, ${autorizado_por || null}, ${merma.id})
      `
    }

    return merma
  },

  // ──── Auditoría administrativa ────────────────────────────────────
  // Cualquier acción "sensible" del admin que NO genera otro registro
  // (ej.: eliminar un producto/insumo por corrección, NO por merma)
  // queda acá para tener trazabilidad sin contaminar `mermas` con
  // eventos que no corresponden a pérdidas reales.
  async registrarAuditoriaAdmin(input: {
    usuario_id?: string | null
    usuario_nombre?: string | null
    usuario_rol?: string | null
    accion: string
    entidad: string
    entidad_id?: string | null
    entidad_nombre?: string | null
    detalles?: any
  }): Promise<{ id: string }> {
    await ensureAuditoriaAdminTable()
    const sql = getSql()
    const detallesJson =
      input.detalles !== undefined && input.detalles !== null
        ? JSON.stringify(input.detalles)
        : null
    const rows = (await sql`
      INSERT INTO soda_master.auditoria_admin
        (usuario_id, usuario_nombre, usuario_rol, accion,
         entidad, entidad_id, entidad_nombre, detalles)
      VALUES (
        ${input.usuario_id || null},
        ${input.usuario_nombre || null},
        ${input.usuario_rol || null},
        ${input.accion},
        ${input.entidad},
        ${input.entidad_id || null},
        ${input.entidad_nombre || null},
        ${detallesJson}::jsonb
      )
      RETURNING id
    `) as Array<{ id: string }>
    return rows[0]
  },

  async getAuditoriaAdmin(filtro?: {
    entidad?: string
    entidad_id?: string
    limite?: number
  }): Promise<any[]> {
    await ensureAuditoriaAdminTable()
    const sql = getSql()
    const limite = filtro?.limite && filtro.limite > 0 ? Math.min(filtro.limite, 500) : 200
    if (filtro?.entidad && filtro?.entidad_id) {
      return (await sql`
        SELECT * FROM soda_master.auditoria_admin
        WHERE entidad = ${filtro.entidad} AND entidad_id = ${filtro.entidad_id}::uuid
        ORDER BY created_at DESC
        LIMIT ${limite}
      `) as any[]
    }
    if (filtro?.entidad) {
      return (await sql`
        SELECT * FROM soda_master.auditoria_admin
        WHERE entidad = ${filtro.entidad}
        ORDER BY created_at DESC
        LIMIT ${limite}
      `) as any[]
    }
    return (await sql`
      SELECT * FROM soda_master.auditoria_admin
      ORDER BY created_at DESC
      LIMIT ${limite}
    `) as any[]
  },

  // ──── Eliminación con motivo (productos / insumos) ────────────────
  // Soft delete: marca `activo=false` para preservar referencias
  // históricas (recetas, items_orden, etc.). Si el motivo es 'merma',
  // primero registra la merma con la cantidad indicada (típicamente el
  // stock actual) y descuenta. Si es 'correccion_admin', sólo desactiva
  // + auditoría — sin pedir explicación pero deja log.
  async eliminarProductoConMotivo(input: {
    producto_id: string
    motivo: 'merma' | 'correccion_admin'
    motivo_merma?: string | null     // tipo dentro de la tabla `mermas` (accidente, vencido, etc.)
    descripcion?: string | null
    cantidad?: number | null         // si no se entrega, usa stock_actual
    registrado_por: string
    registrado_por_nombre?: string | null
    registrado_por_rol?: string | null
  }): Promise<{
    producto: any
    merma_id: string | null
    auditoria_id: string | null
  }> {
    const sql = getSql()

    // Asegurar que el producto existe y está activo.
    const prodRows = (await sql`
      SELECT id, nombre, activo FROM soda_master.productos
      WHERE id = ${input.producto_id}::uuid
      LIMIT 1
    `) as Array<{ id: string; nombre: string; activo: boolean }>
    if (!prodRows[0]) throw new Error('Producto no encontrado')
    if (prodRows[0].activo === false) {
      throw new Error('El producto ya está dado de baja')
    }
    const productoNombre = prodRows[0].nombre

    let mermaId: string | null = null
    let auditoriaId: string | null = null

    if (input.motivo === 'merma') {
      const tipoMerma = (input.motivo_merma || '').trim()
      if (!tipoMerma) {
        throw new Error('Motivo de merma requerido')
      }
      const descripcion = (input.descripcion || '').trim()
      if (descripcion.length < 3) {
        throw new Error('Describe brevemente la merma (mínimo 3 caracteres)')
      }
      // Cantidad: si no la entregan, descontamos TODO el stock actual.
      const stockRows = (await sql`
        SELECT stock_actual FROM soda_master.inventario
        WHERE producto_id = ${input.producto_id}::uuid LIMIT 1
      `) as Array<{ stock_actual: number | string }>
      const stockActual = Number(stockRows[0]?.stock_actual ?? 0)
      const cantidad =
        input.cantidad !== undefined && input.cantidad !== null
          ? Number(input.cantidad)
          : stockActual
      if (cantidad > 0 && stockActual > 0) {
        const merma = await this.crearMerma({
          tipo: tipoMerma,
          producto_id: input.producto_id,
          cantidad: Math.min(cantidad, stockActual),
          descripcion,
          registrado_por: input.registrado_por,
        })
        mermaId = merma?.id ?? null
      } else {
        // Si no había stock, igualmente dejamos constancia de la merma
        // (cantidad 0) para no perder el contexto del por qué se dio de baja.
        const merma = await this.crearMerma({
          tipo: tipoMerma,
          producto_id: input.producto_id,
          cantidad: 0,
          descripcion,
          registrado_por: input.registrado_por,
        })
        mermaId = merma?.id ?? null
      }
    } else {
      // Corrección admin: registramos auditoría.
      const aud = await this.registrarAuditoriaAdmin({
        usuario_id: input.registrado_por,
        usuario_nombre: input.registrado_por_nombre ?? null,
        usuario_rol: input.registrado_por_rol ?? null,
        accion: 'eliminar_producto',
        entidad: 'producto',
        entidad_id: input.producto_id,
        entidad_nombre: productoNombre,
        detalles: {
          motivo: 'correccion_admin',
          descripcion: input.descripcion ?? null,
        },
      })
      auditoriaId = aud.id
    }

    const updated = (await sql`
      UPDATE soda_master.productos
      SET activo = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.producto_id}::uuid
      RETURNING id, nombre, activo
    `) as any[]

    return {
      producto: updated[0] ?? null,
      merma_id: mermaId,
      auditoria_id: auditoriaId,
    }
  },

  async eliminarIngredienteConMotivo(input: {
    ingrediente_id: string
    motivo: 'merma' | 'correccion_admin'
    motivo_merma?: string | null
    descripcion?: string | null
    cantidad?: number | null
    registrado_por: string
    registrado_por_nombre?: string | null
    registrado_por_rol?: string | null
  }): Promise<{
    ingrediente: any
    merma_id: string | null
    auditoria_id: string | null
  }> {
    const sql = getSql()

    const rows = (await sql`
      SELECT id, nombre, activo, stock_actual
      FROM soda_master.ingredientes
      WHERE id = ${input.ingrediente_id}::uuid
      LIMIT 1
    `) as Array<{ id: string; nombre: string; activo: boolean; stock_actual: number | string }>
    if (!rows[0]) throw new Error('Insumo no encontrado')
    if (rows[0].activo === false) throw new Error('El insumo ya está dado de baja')
    const ingredienteNombre = rows[0].nombre
    const stockActual = Number(rows[0].stock_actual ?? 0)

    let mermaId: string | null = null
    let auditoriaId: string | null = null

    if (input.motivo === 'merma') {
      const tipoMerma = (input.motivo_merma || '').trim()
      if (!tipoMerma) throw new Error('Motivo de merma requerido')
      const descripcion = (input.descripcion || '').trim()
      if (descripcion.length < 3) {
        throw new Error('Describe brevemente la merma (mínimo 3 caracteres)')
      }
      const cantidad =
        input.cantidad !== undefined && input.cantidad !== null
          ? Number(input.cantidad)
          : stockActual
      if (cantidad > 0 && stockActual > 0) {
        const merma = await this.crearMerma({
          tipo: tipoMerma,
          ingrediente_id: input.ingrediente_id,
          cantidad: Math.min(cantidad, stockActual),
          descripcion,
          registrado_por: input.registrado_por,
        })
        mermaId = merma?.id ?? null
      } else {
        const merma = await this.crearMerma({
          tipo: tipoMerma,
          ingrediente_id: input.ingrediente_id,
          cantidad: 0,
          descripcion,
          registrado_por: input.registrado_por,
        })
        mermaId = merma?.id ?? null
      }
    } else {
      const aud = await this.registrarAuditoriaAdmin({
        usuario_id: input.registrado_por,
        usuario_nombre: input.registrado_por_nombre ?? null,
        usuario_rol: input.registrado_por_rol ?? null,
        accion: 'eliminar_insumo',
        entidad: 'insumo',
        entidad_id: input.ingrediente_id,
        entidad_nombre: ingredienteNombre,
        detalles: {
          motivo: 'correccion_admin',
          descripcion: input.descripcion ?? null,
        },
      })
      auditoriaId = aud.id
    }

    const updated = (await sql`
      UPDATE soda_master.ingredientes
      SET activo = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.ingrediente_id}::uuid
      RETURNING id, nombre, activo
    `) as any[]

    return {
      ingrediente: updated[0] ?? null,
      merma_id: mermaId,
      auditoria_id: auditoriaId,
    }
  },

  async actualizarMerma(
    id: string,
    updates: { responsable_id?: string | null; consecuencia?: string | null; monto_descuento?: number }
  ) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.mermas
      SET responsable_id = COALESCE(${updates.responsable_id ?? null}, responsable_id),
          consecuencia = COALESCE(${updates.consecuencia ?? null}, consecuencia),
          monto_descuento = COALESCE(${updates.monto_descuento ?? null}, monto_descuento)
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] || null
  },

  async getResumenMermas(desde: string, hasta: string) {
    await ensureTimestampTzMigration()
    const sql = getSql()
    const [totales] = await sql`
      SELECT
        COALESCE(SUM(m.monto_descuento), 0)::numeric AS total_descuento,
        COALESCE(SUM(m.cantidad * COALESCE(p.precio, 0)), 0)::numeric AS total_perdida_estimada,
        COUNT(*)::int AS total_registros
      FROM soda_master.mermas m
      LEFT JOIN soda_master.productos p ON p.id = m.producto_id
      WHERE (m.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
    ` as any[]

    const porTipo = await sql`
      SELECT
        m.tipo,
        COUNT(*)::int AS cantidad_registros,
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
        COALESCE(SUM(m.monto_descuento), 0)::numeric AS monto_descuento,
        COALESCE(SUM(m.cantidad * COALESCE(p.precio, 0)), 0)::numeric AS perdida_estimada
      FROM soda_master.mermas m
      LEFT JOIN soda_master.productos p ON p.id = m.producto_id
      WHERE (m.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY m.tipo
      ORDER BY perdida_estimada DESC
    `

    const topProductos = await sql`
      SELECT
        m.producto_id,
        p.nombre AS producto_nombre,
        SUM(m.cantidad)::numeric AS unidades,
        COALESCE(SUM(m.cantidad * COALESCE(p.precio, 0)), 0)::numeric AS perdida_estimada
      FROM soda_master.mermas m
      LEFT JOIN soda_master.productos p ON p.id = m.producto_id
      WHERE (m.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
        AND m.producto_id IS NOT NULL
      GROUP BY m.producto_id, p.nombre
      ORDER BY perdida_estimada DESC
      LIMIT 5
    `

    const comandasNoPagadas = await sql`
      SELECT
        cnp.id,
        cnp.motivo,
        cnp.created_at,
        o.id AS orden_id,
        o.total AS monto,
        ms.numero AS mesa_numero,
        u.nombre AS registrado_por_nombre
      FROM soda_master.comandas_no_pagadas cnp
      JOIN soda_master.mermas m ON m.id = cnp.merma_id
      LEFT JOIN soda_master.ordenes o ON o.id = cnp.orden_id
      LEFT JOIN soda_master.mesas ms ON ms.id = o.mesa_id
      LEFT JOIN soda_master.usuarios u ON u.id = m.registrado_por
      WHERE (cnp.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
      ORDER BY cnp.created_at DESC
    `

    return {
      total: {
        descuento: Number((totales as any).total_descuento) || 0,
        perdida_estimada: Number((totales as any).total_perdida_estimada) || 0,
        registros: Number((totales as any).total_registros) || 0,
      },
      por_tipo: (porTipo as any[]).map((r) => ({
        tipo: r.tipo,
        cantidad_registros: Number(r.cantidad_registros) || 0,
        unidades: Number(r.unidades) || 0,
        monto_descuento: Number(r.monto_descuento) || 0,
        perdida_estimada: Number(r.perdida_estimada) || 0,
      })),
      top_productos: (topProductos as any[]).map((r) => ({
        producto_id: r.producto_id,
        producto_nombre: r.producto_nombre,
        unidades: Number(r.unidades) || 0,
        perdida_estimada: Number(r.perdida_estimada) || 0,
      })),
      comandas_no_pagadas: (comandasNoPagadas as any[]).map((r) => ({
        id: r.id,
        orden_id: r.orden_id,
        motivo: r.motivo,
        monto: Number(r.monto) || 0,
        mesa_numero: r.mesa_numero,
        registrado_por_nombre: r.registrado_por_nombre,
        created_at: r.created_at,
      })),
    }
  },

  // Reportes
  async getReporteVentas(desde: string, hasta: string) {
    await ensureTimestampTzMigration()
    const sql = getSql()
    const rows = await sql`
      SELECT
        COALESCE(SUM(monto), 0)::numeric AS total,
        COUNT(*)::int AS ordenes
      FROM soda_master.pagos
      WHERE (created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
    `
    const total = Number((rows[0] as any).total) || 0
    const ordenes = Number((rows[0] as any).ordenes) || 0
    return {
      total,
      ordenes,
      ticket_promedio: ordenes > 0 ? total / ordenes : 0,
    }
  },

  async getReporteTopProductos(desde: string, hasta: string, limite: number) {
    await ensureTimestampTzMigration()
    const sql = getSql()
    const rows = await sql`
      SELECT
        i.producto_id,
        p.nombre,
        COALESCE(c.nombre, 'otros') AS categoria,
        SUM(i.cantidad)::int AS cantidad_vendida,
        COALESCE(SUM(i.cantidad * i.precio_unitario), 0)::numeric AS total_generado
      FROM soda_master.items_orden i
      JOIN soda_master.ordenes o ON o.id = i.orden_id
      JOIN soda_master.productos p ON p.id = i.producto_id
      LEFT JOIN soda_master.categorias c ON c.id = p.categoria_id
      WHERE (o.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
        AND o.estado = 'pagado'
      GROUP BY i.producto_id, p.nombre, c.nombre
      ORDER BY cantidad_vendida DESC, total_generado DESC
      LIMIT ${limite}
    `
    return (rows as any[]).map((r) => ({
      producto_id: r.producto_id,
      nombre: r.nombre,
      categoria: r.categoria,
      cantidad_vendida: Number(r.cantidad_vendida) || 0,
      total_generado: Number(r.total_generado) || 0,
    }))
  },

  async getReporteVentasCategoria(desde: string, hasta: string) {
    await ensureTimestampTzMigration()
    const sql = getSql()
    const rows = await sql`
      SELECT
        COALESCE(c.nombre, 'otros') AS categoria,
        SUM(i.cantidad)::int AS cantidad,
        COALESCE(SUM(i.cantidad * i.precio_unitario), 0)::numeric AS total
      FROM soda_master.items_orden i
      JOIN soda_master.ordenes o ON o.id = i.orden_id
      JOIN soda_master.productos p ON p.id = i.producto_id
      LEFT JOIN soda_master.categorias c ON c.id = p.categoria_id
      WHERE (o.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
        AND o.estado = 'pagado'
      GROUP BY c.nombre
      ORDER BY total DESC
    `
    return (rows as any[]).map((r) => ({
      categoria: r.categoria,
      cantidad: Number(r.cantidad) || 0,
      total: Number(r.total) || 0,
    }))
  },

  async getReporteMetodosPago(desde: string, hasta: string) {
    await ensureTimestampTzMigration()
    const sql = getSql()
    const rows = await sql`
      SELECT
        metodo,
        COUNT(*)::int AS cantidad_transacciones,
        COALESCE(SUM(monto), 0)::numeric AS total
      FROM soda_master.pagos
      WHERE (created_at AT TIME ZONE 'America/Santiago')::date BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY metodo
      ORDER BY total DESC
    `
    return (rows as any[]).map((r) => ({
      metodo: r.metodo,
      cantidad_transacciones: Number(r.cantidad_transacciones) || 0,
      total: Number(r.total) || 0,
    }))
  },

  async getReporteVentasSemana() {
    await ensureTimestampTzMigration()
    const sql = getSql()
    const rows = await sql`
      WITH dias AS (
        SELECT ((now() AT TIME ZONE 'America/Santiago')::date - i)::date AS fecha
        FROM generate_series(6, 0, -1) AS i
      )
      SELECT
        to_char(d.fecha, 'YYYY-MM-DD') AS fecha,
        COALESCE(SUM(p.monto), 0)::numeric AS total,
        COUNT(p.id)::int AS ordenes
      FROM dias d
      LEFT JOIN soda_master.pagos p ON (p.created_at AT TIME ZONE 'America/Santiago')::date = d.fecha
      GROUP BY d.fecha
      ORDER BY d.fecha ASC
    `
    return (rows as any[]).map((r) => ({
      fecha: r.fecha,
      total: Number(r.total) || 0,
      ordenes: Number(r.ordenes) || 0,
    }))
  },

  // Configuración (key-value)
  async getConfiguracion(): Promise<Record<string, any>> {
    const sql = getSql()
    const rows = await sql`
      SELECT clave, valor, tipo FROM soda_master.configuracion ORDER BY clave
    `
    const out: Record<string, any> = {}
    for (const row of rows as any[]) {
      out[row.clave] = parseConfigValor(row.valor, row.tipo)
    }
    return out
  },

  async actualizarConfiguracion(data: Record<string, any>): Promise<Record<string, any>> {
    const sql = getSql()
    for (const [clave, raw] of Object.entries(data)) {
      const { valor, tipo } = serializarConfigValor(raw)
      await sql`
        INSERT INTO soda_master.configuracion (clave, valor, tipo, updated_at)
        VALUES (${clave}, ${valor}, ${tipo}, CURRENT_TIMESTAMP)
        ON CONFLICT (clave)
        DO UPDATE SET valor = EXCLUDED.valor, tipo = EXCLUDED.tipo, updated_at = CURRENT_TIMESTAMP
      `
    }
    const rows = await sql`
      SELECT clave, valor, tipo FROM soda_master.configuracion ORDER BY clave
    `
    const out: Record<string, any> = {}
    for (const row of rows as any[]) {
      out[row.clave] = parseConfigValor(row.valor, row.tipo)
    }
    return out
  },

  // ── Ingredientes y recetas ─────────────────────────────────────────────────
  async getIngredientes(soloActivos = true) {
    await ensureRecetasTables()
    const sql = getSql()
    const rows = soloActivos
      ? await sql`
          SELECT * FROM soda_master.ingredientes WHERE activo = true ORDER BY categoria, nombre
        `
      : await sql`
          SELECT * FROM soda_master.ingredientes ORDER BY categoria, nombre
        `
    return (rows as any[]).map(mapIngredienteInsumo)
  },

  async crearIngrediente(input: {
    nombre: string
    categoria?: string
    unidad_medida?: string
    unidad_compra?: string | null
    factor_compra?: number
    rendimiento_pct?: number
    stock_actual?: number
    stock_minimo?: number
    costo_unitario?: number
    tipo?: 'comida' | 'negocio' | 'otro'
  }) {
    await ensureComprasTables()
    const sql = getSql()
    const tipo = input.tipo && ['comida', 'negocio', 'otro'].includes(input.tipo)
      ? input.tipo
      : 'comida'
    const unidadCompra = input.unidad_compra?.trim() || null
    // Un stock inicial deja su movimiento `entrada` en la misma sentencia (sesión 11):
    // el stock solo cambia con un registro en `movimientos_inventario`.
    const rows = await sql`
      WITH ins AS (
        INSERT INTO soda_master.ingredientes
          (nombre, categoria, unidad_medida, unidad_compra, factor_compra, rendimiento_pct,
           stock_actual, stock_minimo, costo_unitario, tipo)
        VALUES (
          ${input.nombre},
          ${input.categoria || 'insumos'},
          ${input.unidad_medida || 'unidad'},
          ${unidadCompra},
          ${Number(input.factor_compra) > 0 ? Number(input.factor_compra) : 1}::numeric,
          ${Number(input.rendimiento_pct) > 0 ? Number(input.rendimiento_pct) : 100}::numeric,
          ${Number(input.stock_actual) || 0}::numeric,
          ${Number(input.stock_minimo) || 0}::numeric,
          ${Number(input.costo_unitario) || 0}::numeric,
          ${tipo}
        )
        RETURNING *
      ), mov AS (
        INSERT INTO soda_master.movimientos_inventario (ingrediente_id, tipo, cantidad, notas)
        SELECT id, 'entrada', stock_actual, 'Stock inicial al crear el insumo'
        FROM ins WHERE stock_actual > 0
      )
      SELECT * FROM ins
    `
    return mapIngredienteInsumo(rows[0])
  },

  /**
   * Actualiza los datos de un insumo. El stock NO se cambia aquí (sesión 11): solo
   * compras, ventas, mermas y `ajustarStockIngrediente` lo mueven, y todas dejan
   * movimiento. Cambiar la unidad de consumo se rechaza (409 `UNIDAD_EN_USO`) si
   * el insumo tiene stock, recetas, compras o movimientos: no hay conversión.
   */
  async actualizarIngrediente(
    id: string,
    updates: Partial<{
      nombre: string
      categoria: string
      unidad_medida: string
      unidad_compra: string | null
      factor_compra: number
      rendimiento_pct: number
      stock_minimo: number
      costo_unitario: number
      tipo: 'comida' | 'negocio' | 'otro'
      activo: boolean
    }>,
  ) {
    await ensureComprasTables()
    const sql = getSql()
    const tipo = updates.tipo && ['comida', 'negocio', 'otro'].includes(updates.tipo)
      ? updates.tipo
      : null
    const nuevaUnidad = updates.unidad_medida?.trim() || null
    const tocaUnidadCompra = 'unidad_compra' in updates
    const rows = await sql`
      UPDATE soda_master.ingredientes
      SET
        nombre = COALESCE(${updates.nombre ?? null}, nombre),
        categoria = COALESCE(${updates.categoria ?? null}, categoria),
        unidad_medida = COALESCE(${nuevaUnidad}::text, unidad_medida),
        unidad_compra = CASE WHEN ${tocaUnidadCompra}::boolean
                             THEN ${updates.unidad_compra?.trim() || null}::text ELSE unidad_compra END,
        factor_compra = COALESCE(${updates.factor_compra ?? null}::numeric, factor_compra),
        rendimiento_pct = COALESCE(${updates.rendimiento_pct ?? null}::numeric, rendimiento_pct),
        stock_minimo = COALESCE(${updates.stock_minimo ?? null}::numeric, stock_minimo),
        costo_unitario = COALESCE(${updates.costo_unitario ?? null}::numeric, costo_unitario),
        tipo = COALESCE(${tipo}, tipo),
        activo = COALESCE(${updates.activo ?? null}, activo),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND (
          ${nuevaUnidad}::text IS NULL
          OR unidad_medida = ${nuevaUnidad}::text
          OR (
            stock_actual = 0
            AND NOT EXISTS (SELECT 1 FROM soda_master.receta_ingredientes ri WHERE ri.ingrediente_id = ingredientes.id)
            AND NOT EXISTS (SELECT 1 FROM soda_master.compra_items ci WHERE ci.ingrediente_id = ingredientes.id)
            AND NOT EXISTS (SELECT 1 FROM soda_master.movimientos_inventario mi WHERE mi.ingrediente_id = ingredientes.id)
          )
        )
      RETURNING *
    `
    if (rows[0]) return mapIngredienteInsumo(rows[0])
    const existe = await sql`SELECT 1 FROM soda_master.ingredientes WHERE id = ${id}::uuid`
    if (existe[0]) {
      throw new ErrorOrden('UNIDAD_EN_USO', 409, ERRORES_TX_ORDEN.UNIDAD_EN_USO.mensaje)
    }
    return null
  },

  /**
   * Fija el stock de un insumo a un valor (conteo físico) y deja un movimiento
   * `ajuste` con la diferencia (con signo), el motivo y quién lo hizo. Una sola
   * sentencia: la fila se bloquea, se lee el stock anterior y se escribe todo.
   */
  async ajustarStockIngrediente(input: {
    ingrediente_id: string
    stock_nuevo: number
    motivo: string
    usuario_nombre: string
  }) {
    await ensureComprasTables()
    const sql = getSql()
    const nota = `Ajuste manual por ${input.usuario_nombre}: ${input.motivo}`
    const rows = (await sql`
      WITH old AS (
        SELECT id, stock_actual FROM soda_master.ingredientes
        WHERE id = ${input.ingrediente_id}::uuid AND activo = TRUE
        FOR UPDATE
      ), u AS (
        UPDATE soda_master.ingredientes i
        SET stock_actual = ${input.stock_nuevo}::numeric, updated_at = now()
        FROM old WHERE i.id = old.id
        RETURNING i.id, i.stock_actual
      ), mov AS (
        INSERT INTO soda_master.movimientos_inventario (ingrediente_id, tipo, cantidad, notas)
        SELECT old.id, 'ajuste', u.stock_actual - old.stock_actual, ${nota}::text
        FROM old JOIN u ON u.id = old.id
        WHERE u.stock_actual <> old.stock_actual
      )
      SELECT old.stock_actual::float AS anterior, u.stock_actual::float AS nuevo
      FROM old JOIN u ON u.id = old.id
    `) as any[]
    if (!rows[0]) {
      throw new ErrorOrden('INSUMO_NO_ENCONTRADO', 404, ERRORES_TX_ORDEN.INSUMO_NO_ENCONTRADO.mensaje)
    }
    return { anterior: Number(rows[0].anterior), nuevo: Number(rows[0].nuevo) }
  },

  async getRecetaProducto(productoId: string) {
    await ensureRecetasTables()
    const sql = getSql()
    const recetaRows = await sql`
      SELECT r.*, p.nombre AS producto_nombre, COALESCE(p.modo_stock, 'producto') AS modo_stock
      FROM soda_master.productos p
      LEFT JOIN soda_master.recetas r ON r.producto_id = p.id AND r.activo = true
      WHERE p.id = ${productoId}::uuid
      LIMIT 1
    `
    if (!recetaRows[0]) return null
    const r = recetaRows[0] as any
    let ingredientes: any[] = []
    if (r.id) {
      const lineas = await sql`
        SELECT ri.*, i.nombre AS ingrediente_nombre, i.unidad_medida, i.rendimiento_pct
        FROM soda_master.receta_ingredientes ri
        JOIN soda_master.ingredientes i ON i.id = ri.ingrediente_id
        WHERE ri.receta_id = ${r.id}
        ORDER BY ri.extra ASC, ri.opcional ASC, i.nombre
      `
      ingredientes = (lineas as any[]).map((ln) => ({
        id: ln.id,
        ingrediente_id: ln.ingrediente_id,
        ingrediente_nombre: ln.ingrediente_nombre,
        cantidad: Number(ln.cantidad),
        opcional: !!ln.opcional,
        extra: !!ln.extra,
        costo_adicional: Number(ln.costo_adicional) || 0,
        nombre_display: ln.nombre_display,
        unidad_medida: ln.unidad_medida,
        rendimiento_pct: Number(ln.rendimiento_pct) > 0 ? Number(ln.rendimiento_pct) : 100,
      }))
    }
    return {
      id: r.id || null,
      producto_id: productoId,
      nombre: r.nombre || r.producto_nombre,
      activo: r.activo !== false,
      modo_stock: r.modo_stock || 'producto',
      ingredientes,
    }
  },

  async guardarRecetaProducto(
    productoId: string,
    payload: {
      nombre?: string
      modo_stock?: string
      ingredientes: Array<{
        ingrediente_id: string
        cantidad: number
        opcional?: boolean
        extra?: boolean
        costo_adicional?: number
        nombre_display?: string | null
      }>
    },
  ) {
    await ensureRecetasTables()
    const sql = getSql()
    const modo = payload.modo_stock && MODOS_STOCK_VALIDOS.includes(payload.modo_stock as any)
      ? payload.modo_stock
      : null
    if (modo) {
      await sql`
        UPDATE soda_master.productos SET modo_stock = ${modo}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${productoId}::uuid
      `
    }

    const existing = await sql`
      SELECT id FROM soda_master.recetas WHERE producto_id = ${productoId}::uuid LIMIT 1
    `
    let recetaId: string
    if (existing[0]) {
      recetaId = (existing[0] as any).id
      await sql`
        UPDATE soda_master.recetas
        SET nombre = COALESCE(${payload.nombre ?? null}, nombre), updated_at = now()
        WHERE id = ${recetaId}::uuid
      `
      await sql`DELETE FROM soda_master.receta_ingredientes WHERE receta_id = ${recetaId}::uuid`
    } else {
      const ins = await sql`
        INSERT INTO soda_master.recetas (producto_id, nombre, activo)
        VALUES (${productoId}::uuid, ${payload.nombre ?? null}, true)
        RETURNING id
      `
      recetaId = (ins[0] as any).id
    }

    for (const line of payload.ingredientes) {
      await sql`
        INSERT INTO soda_master.receta_ingredientes
          (receta_id, ingrediente_id, cantidad, opcional, extra, costo_adicional, nombre_display)
        VALUES (
          ${recetaId}::uuid,
          ${line.ingrediente_id}::uuid,
          ${Number(line.cantidad) || 1},
          ${!!line.opcional},
          ${!!line.extra},
          ${Number(line.costo_adicional) || 0},
          ${line.nombre_display ?? null}
        )
      `
    }
    return this.getRecetaProducto(productoId)
  },

  /** Ingredientes opcionales/extras de la receta para personalización en POS */
  async getOpcionesRecetaProducto(productoId: string) {
    const receta = await this.getRecetaProducto(productoId)
    if (!receta?.ingredientes?.length) return { base: [], opcionales: [], extras: [] }
    const base = receta.ingredientes.filter((i: any) => !i.opcional && !i.extra)
    const opcionales = receta.ingredientes.filter((i: any) => i.opcional && !i.extra)
    const extras = receta.ingredientes.filter((i: any) => i.extra)
    return { base, opcionales, extras, modo_stock: receta.modo_stock }
  },

  // ── Proveedores y compras ──────────────────────────────────────────────────
  // Registrar compras reales actualiza stock e impacta el `costo_unitario` de
  // cada insumo usando promedio ponderado, para que el margen del menú sea
  // calculable a partir de precios reales y no estimados.

  async getProveedores(soloActivos = true) {
    await ensureComprasTables()
    const sql = getSql()
    const rows = soloActivos
      ? await sql`
          SELECT * FROM soda_master.proveedores
          WHERE activo = true
          ORDER BY nombre
        `
      : await sql`
          SELECT * FROM soda_master.proveedores
          ORDER BY nombre
        `
    return rows
  },

  async crearProveedor(payload: {
    nombre: string
    rut?: string
    contacto?: string
    telefono?: string
    email?: string
    direccion?: string
    notas?: string
  }) {
    await ensureComprasTables()
    const sql = getSql()
    const rows = await sql`
      INSERT INTO soda_master.proveedores
        (nombre, rut, contacto, telefono, email, direccion, notas)
      VALUES (
        ${payload.nombre},
        ${payload.rut ?? null},
        ${payload.contacto ?? null},
        ${payload.telefono ?? null},
        ${payload.email ?? null},
        ${payload.direccion ?? null},
        ${payload.notas ?? null}
      )
      RETURNING *
    `
    return rows[0]
  },

  async actualizarProveedor(id: string, payload: {
    nombre?: string
    rut?: string
    contacto?: string
    telefono?: string
    email?: string
    direccion?: string
    notas?: string
    activo?: boolean
  }) {
    await ensureComprasTables()
    const sql = getSql()
    const rows = await sql`
      UPDATE soda_master.proveedores SET
        nombre    = COALESCE(${payload.nombre ?? null}, nombre),
        rut       = COALESCE(${payload.rut ?? null}, rut),
        contacto  = COALESCE(${payload.contacto ?? null}, contacto),
        telefono  = COALESCE(${payload.telefono ?? null}, telefono),
        email     = COALESCE(${payload.email ?? null}, email),
        direccion = COALESCE(${payload.direccion ?? null}, direccion),
        notas     = COALESCE(${payload.notas ?? null}, notas),
        activo    = COALESCE(${payload.activo ?? null}, activo),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `
    return rows[0] || null
  },

  async getCompras(filter: { limite?: number; proveedorId?: string } = {}) {
    await ensureComprasTables()
    const sql = getSql()
    const limite = Math.min(Math.max(Number(filter.limite) || 100, 1), 500)
    const rows = filter.proveedorId
      ? await sql`
          SELECT c.*, p.nombre AS proveedor_nombre
          FROM soda_master.compras c
          LEFT JOIN soda_master.proveedores p ON p.id = c.proveedor_id
          WHERE c.proveedor_id = ${filter.proveedorId}::uuid
          ORDER BY c.fecha DESC, c.created_at DESC
          LIMIT ${limite}
        `
      : await sql`
          SELECT c.*, p.nombre AS proveedor_nombre
          FROM soda_master.compras c
          LEFT JOIN soda_master.proveedores p ON p.id = c.proveedor_id
          ORDER BY c.fecha DESC, c.created_at DESC
          LIMIT ${limite}
        `
    return rows
  },

  async getCompraDetalle(compraId: string) {
    await ensureComprasTables()
    const sql = getSql()
    const cab = await sql`
      SELECT c.*, p.nombre AS proveedor_nombre
      FROM soda_master.compras c
      LEFT JOIN soda_master.proveedores p ON p.id = c.proveedor_id
      WHERE c.id = ${compraId}::uuid
      LIMIT 1
    `
    if (!cab[0]) return null
    const items = await sql`
      SELECT ci.*, i.nombre AS ingrediente_nombre, i.unidad_medida
      FROM soda_master.compra_items ci
      JOIN soda_master.ingredientes i ON i.id = ci.ingrediente_id
      WHERE ci.compra_id = ${compraId}::uuid
    `
    return { ...(cab[0] as any), items }
  },

  /**
   * Registra una compra (sesión 11, R7): cabecera + ítems + stock + costo promedio
   * ponderado + movimientos en UNA `sql.transaction`; si algo falla no queda nada.
   *
   * Unidades: `cantidad` y `precio_unitario` van en la unidad de COMPRA (2 paquetes a
   * $9.000). `factor` es cuántas unidades de consumo trajo cada una (por defecto el
   * del insumo, `factor_compra`; se puede corregir por compra). Entran al stock
   * `ROUND(cantidad × factor, 3)` unidades de consumo y el costo queda
   *   costo = ROUND((stock × costo + cantidad × precio) / (stock + entra), 4)
   * Toda la aritmética se hace en SQL con NUMERIC y sobre la fila ya bloqueada
   * (`FOR UPDATE`, ingredientes por id ascendente, como la sesión 8): dos compras
   * del mismo insumo, o una compra y una venta, se serializan sin perder nada.
   */
  async crearCompra(payload: {
    proveedor_id?: string | null
    tipo_documento?: 'boleta' | 'factura' | 'nota' | 'otro'
    numero_documento?: string | null
    fecha?: string | null
    impuesto?: number
    notas?: string | null
    usuario_id?: string | null
    items: Array<{
      ingrediente_id: string
      cantidad: number
      precio_unitario: number
      /** Unidades de consumo por unidad de compra; si falta, el `factor_compra` del insumo. */
      factor?: number | null
      notas?: string | null
    }>
  }) {
    await ensureComprasTables()
    await ensurePagoSchema()
    const sql = getSql()
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new ErrorOrden('DATOS_INVALIDOS', 400, 'La compra debe tener al menos un ítem')
    }
    for (const it of payload.items) {
      if (!it.ingrediente_id) throw new ErrorOrden('DATOS_INVALIDOS', 400, 'Ítem sin insumo')
      if (!(Number(it.cantidad) > 0)) throw new ErrorOrden('DATOS_INVALIDOS', 400, 'Cantidad inválida en ítem')
      if (!(Number(it.precio_unitario) >= 0)) throw new ErrorOrden('DATOS_INVALIDOS', 400, 'Precio inválido en ítem')
      if (it.factor != null && !(Number(it.factor) > 0)) {
        throw new ErrorOrden('DATOS_INVALIDOS', 400, 'El factor debe ser mayor que 0')
      }
    }
    const compraId = crypto.randomUUID()
    const tipoDoc = payload.tipo_documento || 'boleta'
    const impuesto = Number(payload.impuesto) || 0
    const lineas = JSON.stringify(
      payload.items.map((it, i) => ({
        ord: i,
        ingrediente_id: it.ingrediente_id,
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        factor: it.factor == null ? null : Number(it.factor),
        notas: it.notas || null,
      })),
    )
    const ids = Array.from(new Set(payload.items.map((it) => it.ingrediente_id.toLowerCase())))
    const nota = `Compra ${tipoDoc} ${payload.numero_documento || ''}`.trim()

    return conReintento(async () => {
      let res: any[][]
      try {
        res = (await sql.transaction([
          // 1) bloqueo de los insumos, en orden de id (mismo orden que el descuento de stock)
          sql`SELECT id FROM soda_master.ingredientes WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`,
          // 2) validaciones sobre las filas ya bloqueadas
          sql`
            WITH l AS (
              SELECT * FROM jsonb_to_recordset(${lineas}::jsonb)
                AS x(ord int, ingrediente_id uuid, cantidad numeric, precio_unitario numeric, factor numeric, notas text)
            ), c AS (
              SELECT i.activo, ROUND(l.cantidad * COALESCE(l.factor, i.factor_compra), 3) AS q
              FROM l LEFT JOIN soda_master.ingredientes i ON i.id = l.ingrediente_id
            )
            SELECT
              soda_master.assert_cobro(NOT EXISTS (SELECT 1 FROM c WHERE c.activo IS NOT TRUE), 'INSUMO_NO_ENCONTRADO'),
              soda_master.assert_cobro(NOT EXISTS (SELECT 1 FROM c WHERE c.q <= 0 OR c.q >= 1000000000), 'CANTIDAD_INVALIDA')`,
          // 3) cabecera e ítems (la conversión se calcula aquí, en SQL)
          sql`
            WITH l AS (
              SELECT * FROM jsonb_to_recordset(${lineas}::jsonb)
                AS x(ord int, ingrediente_id uuid, cantidad numeric, precio_unitario numeric, factor numeric, notas text)
            ), calc AS (
              SELECT l.ord, l.ingrediente_id, l.cantidad, l.precio_unitario, l.notas,
                     COALESCE(l.factor, i.factor_compra) AS factor,
                     ROUND(l.cantidad * COALESCE(l.factor, i.factor_compra), 3) AS q,
                     ROUND(l.cantidad * l.precio_unitario, 2) AS sub,
                     COALESCE(i.unidad_compra, i.unidad_medida) AS uc,
                     i.unidad_medida AS um
              FROM l JOIN soda_master.ingredientes i ON i.id = l.ingrediente_id
            ), cab AS (
              INSERT INTO soda_master.compras
                (id, proveedor_id, tipo_documento, numero_documento, fecha, subtotal, impuesto, total, notas, usuario_id)
              SELECT ${compraId}::uuid, ${payload.proveedor_id || null}::uuid, ${tipoDoc}::text,
                     ${payload.numero_documento || null}::text,
                     COALESCE(${payload.fecha || null}::date, (now() AT TIME ZONE 'America/Santiago')::date),
                     SUM(sub), ${impuesto}::numeric, SUM(sub) + ${impuesto}::numeric,
                     ${payload.notas || null}::text, ${payload.usuario_id || null}::uuid
              FROM calc
              RETURNING *
            ), ins AS (
              INSERT INTO soda_master.compra_items
                (compra_id, ingrediente_id, cantidad, precio_unitario, subtotal, notas,
                 factor, cantidad_consumo, unidad_compra, unidad_consumo)
              SELECT ${compraId}::uuid, ingrediente_id, cantidad, precio_unitario, sub, notas, factor, q, uc, um
              FROM calc ORDER BY ord
            )
            SELECT * FROM cab`,
          // 4) stock y costo promedio ponderado, sobre la fila bloqueada (varias líneas del
          //    mismo insumo se suman: el promedio ponderado es asociativo)
          sql`
            WITH agg AS (
              SELECT ingrediente_id, SUM(cantidad_consumo) AS q, SUM(cantidad * precio_unitario) AS pagado
              FROM soda_master.compra_items WHERE compra_id = ${compraId}::uuid
              GROUP BY ingrediente_id
            )
            UPDATE soda_master.ingredientes i
            SET costo_unitario = ROUND((i.stock_actual * i.costo_unitario + agg.pagado) / (i.stock_actual + agg.q), 4),
                stock_actual = i.stock_actual + agg.q,
                updated_at = now()
            FROM agg WHERE i.id = agg.ingrediente_id`,
          // 5) un movimiento `compra` por línea, en unidad de consumo
          sql`
            INSERT INTO soda_master.movimientos_inventario (ingrediente_id, tipo, cantidad, compra_id, notas)
            SELECT ci.ingrediente_id, 'compra', ci.cantidad_consumo, ci.compra_id, ${nota}::text
            FROM soda_master.compra_items ci WHERE ci.compra_id = ${compraId}::uuid`,
        ])) as any[][]
      } catch (err: any) {
        if (err?.code === '23503' && `${err?.message}`.includes('proveedor')) {
          throw new ErrorOrden('PROVEEDOR_NO_ENCONTRADO', 400, ERRORES_TX_ORDEN.PROVEEDOR_NO_ENCONTRADO.mensaje)
        }
        if (err?.code === '22003') {
          throw new ErrorOrden('CANTIDAD_INVALIDA', 400, ERRORES_TX_ORDEN.CANTIDAD_INVALIDA.mensaje)
        }
        return traducirErrorTx(err)
      }
      return res[2][0] as any
    })
  },

  /**
   * Devuelve un análisis de margen por producto: para cada producto con receta,
   * suma costo_unitario*cantidad de los insumos base y compara con precio.
   */
  async getMargenesProductos() {
    await ensureComprasTables()
    const sql = getSql()
    const rows = await sql`
      SELECT
        p.id AS producto_id,
        p.nombre AS producto_nombre,
        c.nombre AS categoria,
        p.precio,
        COALESCE(p.modo_stock, 'producto') AS modo_stock,
        COALESCE(SUM(
          CASE WHEN ri.opcional = false AND ri.extra = false
               THEN ri.cantidad * 100 / i.rendimiento_pct * i.costo_unitario ELSE 0 END
        ), 0)::NUMERIC(12,2) AS costo_receta
      FROM soda_master.productos p
      LEFT JOIN soda_master.categorias c ON c.id = p.categoria_id
      LEFT JOIN soda_master.recetas r ON r.producto_id = p.id AND r.activo = true
      LEFT JOIN soda_master.receta_ingredientes ri ON ri.receta_id = r.id
      LEFT JOIN soda_master.ingredientes i ON i.id = ri.ingrediente_id
      WHERE p.activo = true
      GROUP BY p.id, p.nombre, c.nombre, p.precio, p.modo_stock
      ORDER BY p.nombre
    `
    return (rows as any[]).map((r) => {
      const precio = Number(r.precio) || 0
      const costo = Number(r.costo_receta) || 0
      const margen = precio - costo
      const pct = precio > 0 ? (margen / precio) * 100 : 0
      return {
        producto_id: r.producto_id,
        producto_nombre: r.producto_nombre,
        categoria: r.categoria || 'sin_categoria',
        modo_stock: r.modo_stock,
        precio,
        costo_receta: costo,
        margen,
        margen_pct: Number(pct.toFixed(2)),
      }
    })
  },

  // ── Activos / depreciación ────────────────────────────────────────────────
  // Depreciación lineal:
  //   depreciacion_mensual = (costo_compra - valor_residual) / vida_util_meses
  //   acumulada = min(meses_transcurridos, vida_util_meses) * depreciacion_mensual
  //   valor_actual = costo_compra - acumulada (mínimo = valor_residual)

  async getActivos(soloActivos = true) {
    await ensureFinanzasTables()
    const sql = getSql()
    const rows = soloActivos
      ? await sql`
          SELECT a.*, p.nombre AS proveedor_nombre
          FROM soda_master.activos a
          LEFT JOIN soda_master.proveedores p ON p.id = a.proveedor_id
          WHERE a.estado = 'activo'
          ORDER BY a.nombre
        `
      : await sql`
          SELECT a.*, p.nombre AS proveedor_nombre
          FROM soda_master.activos a
          LEFT JOIN soda_master.proveedores p ON p.id = a.proveedor_id
          ORDER BY a.nombre
        `
    return (rows as any[]).map((a) => computarDepreciacion(a))
  },

  async crearActivo(payload: {
    nombre: string
    categoria?: string
    descripcion?: string
    fecha_compra?: string
    costo_compra: number
    vida_util_meses: number
    valor_residual?: number
    metodo_depreciacion?: string
    proveedor_id?: string | null
    ubicacion?: string
    numero_serie?: string
    notas?: string
  }) {
    await ensureFinanzasTables()
    const sql = getSql()
    const fecha = payload.fecha_compra || new Date().toISOString().slice(0, 10)
    const rows = await sql`
      INSERT INTO soda_master.activos (
        nombre, categoria, descripcion, fecha_compra, costo_compra,
        vida_util_meses, valor_residual, metodo_depreciacion,
        proveedor_id, ubicacion, numero_serie, notas
      ) VALUES (
        ${payload.nombre},
        ${payload.categoria || 'maquinaria'},
        ${payload.descripcion || null},
        ${fecha},
        ${payload.costo_compra},
        ${payload.vida_util_meses},
        ${payload.valor_residual ?? 0},
        ${payload.metodo_depreciacion || 'lineal'},
        ${payload.proveedor_id || null},
        ${payload.ubicacion || null},
        ${payload.numero_serie || null},
        ${payload.notas || null}
      )
      RETURNING *
    `
    return computarDepreciacion(rows[0])
  },

  async actualizarActivo(id: string, payload: {
    nombre?: string
    categoria?: string
    descripcion?: string
    fecha_compra?: string
    costo_compra?: number
    vida_util_meses?: number
    valor_residual?: number
    metodo_depreciacion?: string
    proveedor_id?: string | null
    ubicacion?: string
    numero_serie?: string
    estado?: string
    notas?: string
  }) {
    await ensureFinanzasTables()
    const sql = getSql()
    const rows = await sql`
      UPDATE soda_master.activos SET
        nombre              = COALESCE(${payload.nombre ?? null}, nombre),
        categoria           = COALESCE(${payload.categoria ?? null}, categoria),
        descripcion         = COALESCE(${payload.descripcion ?? null}, descripcion),
        fecha_compra        = COALESCE(${payload.fecha_compra ?? null}::date, fecha_compra),
        costo_compra        = COALESCE(${payload.costo_compra ?? null}, costo_compra),
        vida_util_meses     = COALESCE(${payload.vida_util_meses ?? null}, vida_util_meses),
        valor_residual      = COALESCE(${payload.valor_residual ?? null}, valor_residual),
        metodo_depreciacion = COALESCE(${payload.metodo_depreciacion ?? null}, metodo_depreciacion),
        proveedor_id        = COALESCE(${payload.proveedor_id ?? null}, proveedor_id),
        ubicacion           = COALESCE(${payload.ubicacion ?? null}, ubicacion),
        numero_serie        = COALESCE(${payload.numero_serie ?? null}, numero_serie),
        estado              = COALESCE(${payload.estado ?? null}, estado),
        notas               = COALESCE(${payload.notas ?? null}, notas),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `
    return rows[0] ? computarDepreciacion(rows[0]) : null
  },

  async eliminarActivo(id: string) {
    await ensureFinanzasTables()
    const sql = getSql()
    await sql`DELETE FROM soda_master.activos WHERE id = ${id}::uuid`
    return { ok: true }
  },

  /**
   * Resumen de depreciación de todo el portfolio para un periodo (mes/año).
   */
  async getResumenDepreciacion(periodo?: { year: number; month: number }) {
    const activos = await this.getActivos(true)
    const total = activos.reduce(
      (acc, a: any) => {
        acc.costo += Number(a.costo_compra) || 0
        acc.depMensual += Number(a.depreciacion_mensual) || 0
        acc.depAcumulada += Number(a.depreciacion_acumulada) || 0
        acc.valorActual += Number(a.valor_actual) || 0
        return acc
      },
      { costo: 0, depMensual: 0, depAcumulada: 0, valorActual: 0 },
    )
    return { activos, total, periodo: periodo || null }
  },

  // ── Empleados ──────────────────────────────────────────────────────────────
  async getEmpleados(soloActivos = true) {
    await ensureFinanzasTables()
    const sql = getSql()
    const rows = soloActivos
      ? await sql`SELECT * FROM soda_master.empleados WHERE activo = true ORDER BY nombre`
      : await sql`SELECT * FROM soda_master.empleados ORDER BY nombre`
    return rows
  },

  async crearEmpleado(payload: {
    nombre: string
    cargo?: string
    documento?: string
    telefono?: string
    email?: string
    sueldo_base: number
    periodicidad?: string
    fecha_ingreso?: string
    usuario_id?: string | null
    notas?: string
  }) {
    await ensureFinanzasTables()
    const sql = getSql()
    const rows = await sql`
      INSERT INTO soda_master.empleados (
        nombre, cargo, documento, telefono, email,
        sueldo_base, periodicidad, fecha_ingreso, usuario_id, notas
      ) VALUES (
        ${payload.nombre},
        ${payload.cargo || null},
        ${payload.documento || null},
        ${payload.telefono || null},
        ${payload.email || null},
        ${payload.sueldo_base},
        ${payload.periodicidad || 'mensual'},
        ${payload.fecha_ingreso || null},
        ${payload.usuario_id || null},
        ${payload.notas || null}
      )
      RETURNING *
    `
    return rows[0]
  },

  async actualizarEmpleado(id: string, payload: {
    nombre?: string
    cargo?: string
    documento?: string
    telefono?: string
    email?: string
    sueldo_base?: number
    periodicidad?: string
    fecha_ingreso?: string
    fecha_egreso?: string
    activo?: boolean
    usuario_id?: string | null
    notas?: string
  }) {
    await ensureFinanzasTables()
    const sql = getSql()
    const rows = await sql`
      UPDATE soda_master.empleados SET
        nombre        = COALESCE(${payload.nombre ?? null}, nombre),
        cargo         = COALESCE(${payload.cargo ?? null}, cargo),
        documento     = COALESCE(${payload.documento ?? null}, documento),
        telefono      = COALESCE(${payload.telefono ?? null}, telefono),
        email         = COALESCE(${payload.email ?? null}, email),
        sueldo_base   = COALESCE(${payload.sueldo_base ?? null}, sueldo_base),
        periodicidad  = COALESCE(${payload.periodicidad ?? null}, periodicidad),
        fecha_ingreso = COALESCE(${payload.fecha_ingreso ?? null}::date, fecha_ingreso),
        fecha_egreso  = COALESCE(${payload.fecha_egreso ?? null}::date, fecha_egreso),
        activo        = COALESCE(${payload.activo ?? null}, activo),
        usuario_id    = COALESCE(${payload.usuario_id ?? null}, usuario_id),
        notas         = COALESCE(${payload.notas ?? null}, notas),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `
    return rows[0] || null
  },

  // ── Gastos del negocio ─────────────────────────────────────────────────────
  async getGastos(filter: { desde?: string; hasta?: string; tipo?: string; limite?: number } = {}) {
    await ensureFinanzasTables()
    const sql = getSql()
    const limite = Math.min(Math.max(Number(filter.limite) || 200, 1), 1000)
    const desde = filter.desde || '1900-01-01'
    const hasta = filter.hasta || '2999-12-31'
    const tipo = filter.tipo && filter.tipo !== 'all' ? filter.tipo : null
    const rows = tipo
      ? await sql`
          SELECT g.*, p.nombre AS proveedor_nombre, e.nombre AS empleado_nombre, a.nombre AS activo_nombre
          FROM soda_master.gastos g
          LEFT JOIN soda_master.proveedores p ON p.id = g.proveedor_id
          LEFT JOIN soda_master.empleados e ON e.id = g.empleado_id
          LEFT JOIN soda_master.activos a ON a.id = g.activo_id
          WHERE g.fecha BETWEEN ${desde}::date AND ${hasta}::date
            AND g.tipo = ${tipo}
          ORDER BY g.fecha DESC, g.created_at DESC
          LIMIT ${limite}
        `
      : await sql`
          SELECT g.*, p.nombre AS proveedor_nombre, e.nombre AS empleado_nombre, a.nombre AS activo_nombre
          FROM soda_master.gastos g
          LEFT JOIN soda_master.proveedores p ON p.id = g.proveedor_id
          LEFT JOIN soda_master.empleados e ON e.id = g.empleado_id
          LEFT JOIN soda_master.activos a ON a.id = g.activo_id
          WHERE g.fecha BETWEEN ${desde}::date AND ${hasta}::date
          ORDER BY g.fecha DESC, g.created_at DESC
          LIMIT ${limite}
        `
    return rows
  },

  async crearGasto(payload: {
    fecha?: string
    categoria?: string
    descripcion?: string
    monto: number
    tipo?: string
    recurrente?: boolean
    periodicidad?: string
    proveedor_id?: string | null
    empleado_id?: string | null
    activo_id?: string | null
    usuario_id?: string | null
    notas?: string
  }) {
    await ensureFinanzasTables()
    const sql = getSql()
    const fecha = payload.fecha || new Date().toISOString().slice(0, 10)
    const tipo = payload.tipo || 'operativo'
    const rows = await sql`
      INSERT INTO soda_master.gastos (
        fecha, categoria, descripcion, monto, tipo, recurrente, periodicidad,
        proveedor_id, empleado_id, activo_id, usuario_id, notas
      ) VALUES (
        ${fecha}::date,
        ${payload.categoria || 'otros'},
        ${payload.descripcion || null},
        ${payload.monto},
        ${tipo},
        ${payload.recurrente ?? false},
        ${payload.periodicidad || null},
        ${payload.proveedor_id || null},
        ${payload.empleado_id || null},
        ${payload.activo_id || null},
        ${payload.usuario_id || null},
        ${payload.notas || null}
      )
      RETURNING *
    `
    return rows[0]
  },

  async eliminarGasto(id: string) {
    await ensureFinanzasTables()
    const sql = getSql()
    await sql`DELETE FROM soda_master.gastos WHERE id = ${id}::uuid`
    return { ok: true }
  },

  async getResumenGastos(filter: { desde?: string; hasta?: string } = {}) {
    await ensureFinanzasTables()
    const sql = getSql()
    const desde = filter.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().slice(0, 10)
    const hasta = filter.hasta || new Date().toISOString().slice(0, 10)
    const porTipo = await sql`
      SELECT tipo, COALESCE(SUM(monto),0)::NUMERIC(14,2) AS total, COUNT(*)::INT AS cantidad
      FROM soda_master.gastos
      WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY tipo
      ORDER BY total DESC
    `
    const totalRow = await sql`
      SELECT COALESCE(SUM(monto),0)::NUMERIC(14,2) AS total
      FROM soda_master.gastos
      WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date
    `
    const sueldosActivosRow = await sql`
      SELECT COALESCE(SUM(
        CASE periodicidad
          WHEN 'mensual' THEN sueldo_base
          WHEN 'quincenal' THEN sueldo_base * 2
          WHEN 'semanal' THEN sueldo_base * 4
          WHEN 'diario' THEN sueldo_base * 30
          WHEN 'por_hora' THEN sueldo_base * 160
          ELSE sueldo_base
        END
      ),0)::NUMERIC(14,2) AS sueldos_mensuales
      FROM soda_master.empleados
      WHERE activo = true
    `
    return {
      desde,
      hasta,
      total: Number((totalRow[0] as any).total) || 0,
      por_tipo: porTipo,
      sueldos_proyectados_mes: Number((sueldosActivosRow[0] as any).sueldos_mensuales) || 0,
    }
  },

  // ── Notificaciones cross-device ────────────────────────────────────────────
  // Persistidas en BD para que cuando cocina marca "problema" el mesero (que
  // está en otro dispositivo) la reciba vía polling. Polling y no WebSocket
  // porque la app corre en Vercel serverless.

  async crearNotificacion(payload: {
    tipo: 'problema' | 'listo' | 'nueva_orden'
    orden_id?: string | null
    mesa_nombre?: string | null
    mensaje: string
    destinatario_usuario_id?: string | null
    destinatario_rol?: string | null
  }): Promise<any> {
    await ensureNotificacionesTable()
    if (!payload.destinatario_usuario_id && !payload.destinatario_rol) {
      throw new Error('Se requiere destinatario_usuario_id o destinatario_rol')
    }
    const sql = getSql()
    const rows = await sql`
      INSERT INTO soda_master.notificaciones
        (tipo, orden_id, mesa_nombre, mensaje, destinatario_usuario_id, destinatario_rol)
      VALUES (
        ${payload.tipo},
        ${payload.orden_id || null},
        ${payload.mesa_nombre || null},
        ${payload.mensaje},
        ${payload.destinatario_usuario_id || null},
        ${payload.destinatario_rol || null}
      )
      RETURNING id, tipo, orden_id, mesa_nombre, mensaje, destinatario_usuario_id,
                destinatario_rol, vista,
                EXTRACT(EPOCH FROM creado_at) * 1000 AS creado_ts
    `
    return rows[0]
  },

  /**
   * Devuelve las notificaciones (por defecto sólo `vista=false`) para un
   * usuario y/o rol. Se ordena por las más recientes primero y se limita
   * para que el polling no devuelva respuestas pesadas.
   */
  async listarNotificacionesPara(filter: {
    usuario_id?: string | null
    rol?: string | null
    solo_pendientes?: boolean
    limite?: number
  }): Promise<any[]> {
    await ensureNotificacionesTable()
    const sql = getSql()
    const usuarioId = filter.usuario_id || null
    const rol = filter.rol || null
    const soloPendientes = filter.solo_pendientes !== false
    const limite = Math.min(Math.max(Number(filter.limite) || 100, 1), 500)

    const rows = await sql`
      SELECT
        id,
        tipo,
        orden_id,
        mesa_nombre,
        mensaje,
        destinatario_usuario_id,
        destinatario_rol,
        vista,
        EXTRACT(EPOCH FROM creado_at) * 1000 AS creado_ts
      FROM soda_master.notificaciones
      WHERE
        (
          (${usuarioId}::uuid IS NOT NULL AND destinatario_usuario_id = ${usuarioId}::uuid)
          OR (${rol}::text IS NOT NULL AND destinatario_rol = ${rol}::text)
        )
        AND (${soloPendientes}::boolean = FALSE OR vista = FALSE)
      ORDER BY creado_at DESC
      LIMIT ${limite}
    `
    return rows as any[]
  },

  async marcarNotificacionVista(id: string): Promise<boolean> {
    await ensureNotificacionesTable()
    const sql = getSql()
    const rows = await sql`
      UPDATE soda_master.notificaciones
      SET vista = TRUE, vista_at = now()
      WHERE id = ${id}::uuid AND vista = FALSE
      RETURNING id
    `
    return (rows as any[]).length > 0
  },

  // ──── Caja chica ───────────────────────────────────────────────────
  async getCajaAbierta(): Promise<any | null> {
    await ensureCajaSchema()
    const sql = getSql()
    const rows = (await sql`
      SELECT * FROM soda_master.cajas
      WHERE estado = 'abierta'
      ORDER BY abierta_en DESC
      LIMIT 1
    `) as any[]
    return rows[0] || null
  },

  async getCajaConResumen(cajaId: string): Promise<any | null> {
    await ensureCajaSchema()
    const sql = getSql()
    const cajaRows = (await sql`
      SELECT * FROM soda_master.cajas WHERE id = ${cajaId}::uuid
    `) as any[]
    const caja = cajaRows[0]
    if (!caja) return null
    const movs = (await sql`
      SELECT * FROM soda_master.movimientos_caja
      WHERE caja_id = ${cajaId}::uuid
      ORDER BY created_at ASC
    `) as any[]
    const totales = movs.reduce(
      (acc, m) => {
        const monto = Number(m.monto) || 0
        if (m.tipo === 'venta_efectivo' || m.tipo === 'deposito') acc.entradas += monto
        else if (m.tipo === 'vuelto' || m.tipo === 'retiro') acc.salidas += monto
        if (m.tipo === 'venta_efectivo') acc.ventasEfectivo += monto
        if (m.tipo === 'vuelto') acc.vueltoEntregado += monto
        if (m.tipo === 'retiro') acc.retiros += monto
        if (m.tipo === 'deposito') acc.depositos += monto
        return acc
      },
      { entradas: 0, salidas: 0, ventasEfectivo: 0, vueltoEntregado: 0, retiros: 0, depositos: 0 },
    )
    const fondoInicial = Number(caja.fondo_inicial) || 0
    const esperado = fondoInicial + totales.entradas - totales.salidas
    return {
      caja,
      movimientos: movs,
      resumen: {
        fondo_inicial: fondoInicial,
        ventas_efectivo: totales.ventasEfectivo,
        vuelto_entregado: totales.vueltoEntregado,
        retiros: totales.retiros,
        depositos: totales.depositos,
        efectivo_esperado: esperado,
      },
    }
  },

  async abrirCaja(input: {
    usuario_id: string
    usuario_nombre: string
    fondo_inicial: number
    notas?: string | null
  }): Promise<any> {
    await ensureCajaSchema()
    const sql = getSql()
    // No permitimos abrir una caja si ya hay una abierta — el índice
    // único `cajas_solo_una_abierta` lo enforza, pero damos un error
    // con mensaje claro antes de que choque.
    const abierta = await this.getCajaAbierta()
    if (abierta) {
      const err: any = new Error('Ya hay una caja abierta. Ciérrala antes de abrir otra.')
      err.code = 'CAJA_YA_ABIERTA'
      throw err
    }
    const fondo = Number(input.fondo_inicial)
    if (!Number.isFinite(fondo) || fondo < 0) {
      throw new Error('fondo_inicial inválido')
    }
    const inserted = (await sql`
      INSERT INTO soda_master.cajas
        (usuario_apertura_id, usuario_apertura_nombre, fondo_inicial, notas, estado)
      VALUES
        (${input.usuario_id}::uuid, ${input.usuario_nombre}, ${fondo}, ${input.notas ?? null}, 'abierta')
      RETURNING *
    `) as any[]
    const caja = inserted[0]
    await sql`
      INSERT INTO soda_master.movimientos_caja
        (caja_id, tipo, monto, usuario_id, usuario_nombre, descripcion)
      VALUES
        (${caja.id}::uuid, 'apertura', ${fondo}, ${input.usuario_id}::uuid,
         ${input.usuario_nombre}, ${'Fondo inicial al abrir caja'})
    `
    return caja
  },

  async registrarMovimientoCaja(input: {
    caja_id?: string
    tipo: 'venta_efectivo' | 'vuelto' | 'retiro' | 'deposito' | 'ajuste'
    monto: number
    pago_id?: string | null
    usuario_id?: string | null
    usuario_nombre?: string | null
    descripcion?: string | null
  }): Promise<any> {
    await ensureCajaSchema()
    const sql = getSql()
    let cajaId = input.caja_id
    if (!cajaId) {
      const abierta = await this.getCajaAbierta()
      if (!abierta) {
        const err: any = new Error('No hay caja abierta')
        err.code = 'CAJA_NO_ABIERTA'
        throw err
      }
      cajaId = abierta.id
    }
    const monto = Number(input.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('monto inválido')
    }
    const rows = (await sql`
      INSERT INTO soda_master.movimientos_caja
        (caja_id, tipo, monto, pago_id, usuario_id, usuario_nombre, descripcion)
      VALUES
        (${cajaId}::uuid, ${input.tipo}, ${monto},
         ${input.pago_id ? `${input.pago_id}` : null}::uuid,
         ${input.usuario_id ? `${input.usuario_id}` : null}::uuid,
         ${input.usuario_nombre ?? null},
         ${input.descripcion ?? null})
      RETURNING *
    `) as any[]
    return rows[0]
  },

  async cerrarCaja(input: {
    caja_id: string
    usuario_id: string
    usuario_nombre: string
    efectivo_contado: number
    notas?: string | null
  }): Promise<any> {
    await ensureCajaSchema()
    const sql = getSql()
    const cajaRows = (await sql`
      SELECT * FROM soda_master.cajas WHERE id = ${input.caja_id}::uuid
    `) as any[]
    const caja = cajaRows[0]
    if (!caja) throw new Error('Caja no encontrada')
    if (caja.estado === 'cerrada') {
      const err: any = new Error('La caja ya está cerrada')
      err.code = 'CAJA_YA_CERRADA'
      throw err
    }
    const contado = Number(input.efectivo_contado)
    if (!Number.isFinite(contado) || contado < 0) {
      throw new Error('efectivo_contado inválido')
    }
    const detalle = await this.getCajaConResumen(input.caja_id)
    const esperado = detalle?.resumen?.efectivo_esperado ?? 0
    const diferencia = contado - esperado
    const rows = (await sql`
      UPDATE soda_master.cajas
      SET estado = 'cerrada',
          cerrada_en = now(),
          usuario_cierre_id = ${input.usuario_id}::uuid,
          usuario_cierre_nombre = ${input.usuario_nombre},
          efectivo_contado = ${contado},
          diferencia = ${diferencia},
          notas = COALESCE(${input.notas ?? null}, notas)
      WHERE id = ${input.caja_id}::uuid AND estado = 'abierta'
      RETURNING *
    `) as any[]
    if (!rows[0]) throw new Error('No se pudo cerrar la caja (posible cierre concurrente)')
    await sql`
      INSERT INTO soda_master.movimientos_caja
        (caja_id, tipo, monto, usuario_id, usuario_nombre, descripcion)
      VALUES
        (${input.caja_id}::uuid, 'cierre', ${contado}, ${input.usuario_id}::uuid,
         ${input.usuario_nombre},
         ${'Cierre — esperado ' + esperado + ', contado ' + contado + ', diferencia ' + diferencia})
    `
    return { caja: rows[0], esperado, diferencia }
  },

  async getHistorialCajas(limite = 30): Promise<any[]> {
    await ensureCajaSchema()
    const sql = getSql()
    const lim = Math.max(1, Math.min(200, limite))
    const rows = (await sql`
      SELECT c.*, (
        SELECT COUNT(*)::int FROM soda_master.movimientos_caja m
        WHERE m.caja_id = c.id AND m.tipo = 'venta_efectivo'
      ) AS pagos_efectivo
      FROM soda_master.cajas c
      ORDER BY c.abierta_en DESC
      LIMIT ${lim}
    `) as any[]
    return rows
  },
}

// ── Bootstrap idempotente para la tabla de notificaciones ────────────────────
// Se ejecuta una vez por instancia serverless, evita migraciones manuales.
let _notificacionesTableReady = false
async function ensureNotificacionesTable(): Promise<void> {
  if (_notificacionesTableReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS soda_master.notificaciones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo TEXT NOT NULL CHECK (tipo IN ('problema','listo','nueva_orden')),
      orden_id UUID,
      mesa_nombre TEXT,
      mensaje TEXT NOT NULL,
      destinatario_usuario_id UUID,
      destinatario_rol TEXT,
      vista BOOLEAN NOT NULL DEFAULT FALSE,
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      vista_at TIMESTAMPTZ,
      CHECK (destinatario_usuario_id IS NOT NULL OR destinatario_rol IS NOT NULL)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS notificaciones_destinatario_usuario_idx
      ON soda_master.notificaciones (destinatario_usuario_id, vista, creado_at DESC)
      WHERE destinatario_usuario_id IS NOT NULL
  `
  await sql`
    CREATE INDEX IF NOT EXISTS notificaciones_destinatario_rol_idx
      ON soda_master.notificaciones (destinatario_rol, vista, creado_at DESC)
      WHERE destinatario_rol IS NOT NULL
  `
  _notificacionesTableReady = true
}

function parseConfigValor(valor: string | null, tipo: string | null) {
  if (valor === null || valor === undefined) return null
  switch (tipo) {
    case 'number':
      return Number(valor)
    case 'boolean':
      return valor === 'true' || valor === '1'
    case 'json':
      try {
        return JSON.parse(valor)
      } catch {
        return valor
      }
    default:
      return valor
  }
}

function serializarConfigValor(valor: any): { valor: string; tipo: string } {
  if (typeof valor === 'number') return { valor: String(valor), tipo: 'number' }
  if (typeof valor === 'boolean') return { valor: valor ? 'true' : 'false', tipo: 'boolean' }
  if (valor === null || valor === undefined) return { valor: '', tipo: 'string' }
  if (typeof valor === 'object') return { valor: JSON.stringify(valor), tipo: 'json' }
  return { valor: String(valor), tipo: 'string' }
}
