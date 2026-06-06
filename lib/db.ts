import { neon, NeonQueryFunction } from '@neondatabase/serverless'
import bcryptjs from 'bcryptjs'
import type { Usuario, Mesa, Producto, Orden, ItemOrden, Pago, Inventario } from './types'

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

const ROLES_VALIDOS = new Set(['admin', 'administrador', 'mesero', 'cocina', 'bar', 'cajero'])

function mapUsuario(row: any): Usuario {
  const { pin_hash, pinHash, pin, password, roles_adicionales, ...safeUsuario } = row
  const rolesAdicionales: string[] = Array.isArray(roles_adicionales)
    ? roles_adicionales.filter((r) => typeof r === 'string' && ROLES_VALIDOS.has(r))
    : []
  return {
    ...safeUsuario,
    roles_adicionales: rolesAdicionales,
    intentosFallidos: 0,
    bloqueadoHasta: null,
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
  return {
    ...row,
    id: row.id,
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
      costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
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
      tipo TEXT NOT NULL CHECK (tipo IN ('venta','merma','ajuste','entrada','compra')),
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
        CHECK (tipo IN ('venta','merma','ajuste','entrada','compra'));
    EXCEPTION WHEN duplicate_object THEN NULL;
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
    stock_actual: Number(row.stock_actual) || 0,
    stock_minimo: Number(row.stock_minimo) || 0,
    costo_unitario: Number(row.costo_unitario) || 0,
    tipo: row.tipo || 'comida',
    activo: row.activo !== false,
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
    const sql = getSql()
    const result = await sql`
      SELECT id, email, nombre, rol,
             COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales,
             activo, created_at, updated_at
      FROM soda_master.usuarios
      ORDER BY nombre
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
    if (!result[0]) return null

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
  async crearOrden(orden: Omit<Orden, 'id' | 'created_at' | 'updated_at' | 'numero_orden'>) {
    const sql = getSql()
    const enviado = Boolean((orden as any).enviado_a_cocina)

    // Control de acceso por rol: meseros/administradores/admins pueden
    // abrir mesa sin restricción. Para que un CAJERO pueda hacerlo
    // necesita o bien tener `mesero` como rol adicional permanente, o
    // bien que el admin le haya otorgado el permiso especial temporal
    // `apertura_mesa`. Esto se valida server-side para que ninguna
    // vista pueda saltearse la regla.
    if (orden.usuario_id) {
      await ensureRolesAdicionalesSchema()
      const usuarios = (await sql`
        SELECT rol, COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales
        FROM soda_master.usuarios WHERE id = ${orden.usuario_id}
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
        const permitido = await this.tienePermisoEspecial(orden.usuario_id, 'apertura_mesa')
        if (!permitido) {
          throw new Error(
            'El cajero no tiene un permiso vigente para abrir mesas. Pedile al administrador que se lo otorgue (o configure rol adicional permanente).',
          )
        }
      }
    }

    // Limpia intentos fallidos previos: órdenes activas sin ítems no deben
    // bloquear una mesa ni aparecer como "comanda activa" invisible al KDS.
    // Importante: tratamos como "no activas" a pagado/cancelado/perdida.
    // Las pérdidas (perro muerto) son históricos: la mesa puede volverse
    // a usar libremente para una comanda nueva.
    await sql`
      DELETE FROM soda_master.ordenes o
      WHERE o.mesa_id = ${orden.mesa_id}
        AND o.estado NOT IN ('pagado', 'cancelado', 'perdida')
        AND NOT EXISTS (
          SELECT 1 FROM soda_master.items_orden i WHERE i.orden_id = o.id
        )
    `
    const result = await sql`
      WITH lock_mesa AS (
        SELECT pg_advisory_xact_lock(hashtext(${orden.mesa_id}::text)::bigint)
      ),
      orden_activa AS (
        SELECT o.id
        FROM lock_mesa, soda_master.ordenes o
        WHERE o.mesa_id = ${orden.mesa_id}
          AND o.estado NOT IN ('pagado', 'cancelado', 'perdida')
        LIMIT 1
      )
      INSERT INTO soda_master.ordenes (
        mesa_id,
        usuario_id,
        estado,
        subtotal,
        impuesto,
        total,
        notas,
        enviado_a_cocina,
        hora_envio
      )
      SELECT
        ${orden.mesa_id},
        ${orden.usuario_id},
        ${orden.estado},
        ${orden.subtotal},
        ${orden.impuesto},
        ${orden.total},
        ${orden.notas},
        ${enviado},
        ${enviado ? new Date().toISOString() : null}
      FROM lock_mesa
      WHERE NOT EXISTS (SELECT 1 FROM orden_activa)
      RETURNING *
    `
    if (!result[0]) {
      throw new Error('Ya existe una comanda activa para esta mesa')
    }
    return result[0] as Orden
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

  async getOrdenesParaKDS(): Promise<Orden[]> {
    await ensureItemPagoSchema()
    await ensureCuentasPersonaSchema()
    const sql = getSql()
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
             ) AS cuentas_persona
      FROM soda_master.ordenes o
      LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
      LEFT JOIN soda_master.productos p ON i.producto_id = p.id
      LEFT JOIN soda_master.categorias c ON p.categoria_id = c.id
      WHERE o.estado NOT IN ('pagado', 'cancelado', 'perdida')
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

  async actualizarOrden(id: string, updates: Partial<Orden>) {
    await ensureOrdenEstadoSchema()
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.ordenes 
      SET estado = COALESCE(${updates.estado}, estado),
          subtotal = COALESCE(${updates.subtotal}, subtotal),
          impuesto = COALESCE(${updates.impuesto}, impuesto),
          total = COALESCE(${updates.total}, total),
          notas = COALESCE(${updates.notas}, notas),
          enviado_a_cocina = COALESCE(${updates.enviado_a_cocina}, enviado_a_cocina),
          hora_envio = COALESCE(${updates.hora_envio}, hora_envio),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] as Orden
  },

  async enviarOrdenACocina(id: string) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.ordenes 
      SET estado = 'en_cocina',
          enviado_a_cocina = true,
          hora_envio = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] as Orden
  },

  async eliminarOrden(id: string) {
    const sql = getSql()
    await sql`DELETE FROM soda_master.items_orden WHERE orden_id = ${id}`
    await sql`DELETE FROM soda_master.ordenes WHERE id = ${id}`
    return { success: true }
  },

  // Items de orden
  async crearItemOrden(item: Omit<ItemOrden, 'id' | 'created_at'> & {
    seleccion_modificadores?: string[]
    extras_ingredientes?: { ingrediente_id: string; cantidad?: number }[]
  }) {
    await ensureRecetasTables()
    const sql = getSql()
    const cantidad = Number(item.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error('Cantidad inválida')
    }

    const prodRows = await sql`
      SELECT COALESCE(modo_stock, 'producto') AS modo_stock, nombre
      FROM soda_master.productos WHERE id = ${item.producto_id} LIMIT 1
    `
    if (!prodRows[0]) throw new Error('Producto no encontrado')
    const modoStock = String((prodRows[0] as any).modo_stock || 'producto')
    const { mods, extras } = parseSeleccionItem(item)

    const deductMap = new Map<string, number>()
    const addDeduct = (ingredienteId: string, qty: number) => {
      if (!ingredienteId || qty <= 0) return
      deductMap.set(ingredienteId, (deductMap.get(ingredienteId) || 0) + qty)
    }

    if (modoStock === 'receta' || modoStock === 'producto_y_receta') {
      const recetaRows = await sql`
        SELECT r.id FROM soda_master.recetas r
        WHERE r.producto_id = ${item.producto_id} AND r.activo = true LIMIT 1
      `
      if (recetaRows[0]) {
        const lineas = await sql`
          SELECT ri.*, i.nombre AS ingrediente_nombre
          FROM soda_master.receta_ingredientes ri
          JOIN soda_master.ingredientes i ON i.id = ri.ingrediente_id
          WHERE ri.receta_id = ${(recetaRows[0] as any).id} AND i.activo = true
        `
        const modsNorm = mods.map((m) => m.trim().toLowerCase())
        const extraIds = new Set(extras.map((e) => e.ingrediente_id))

        for (const line of lineas as any[]) {
          const lineQty = Number(line.cantidad) * cantidad
          const displayName = (line.nombre_display || line.ingrediente_nombre || '').trim().toLowerCase()
          if (line.extra) {
            const extraSel = extras.find((e) => e.ingrediente_id === line.ingrediente_id)
            if (extraSel) addDeduct(line.ingrediente_id, lineQty * extraSel.cantidad)
          } else if (line.opcional) {
            if (displayName && modsNorm.some((m) => m === displayName || m.includes(displayName) || displayName.includes(m))) {
              addDeduct(line.ingrediente_id, lineQty)
            }
          } else {
            addDeduct(line.ingrediente_id, lineQty)
          }
        }
      }
    }

    for (const [ingredienteId, qty] of deductMap) {
      const check = await sql`
        SELECT nombre, unidad_medida, stock_actual FROM soda_master.ingredientes
        WHERE id = ${ingredienteId}::uuid
      `
      if (!check[0]) continue
      const stockActual = Number((check[0] as any).stock_actual)
      if (stockActual < qty) {
        const nombre = (check[0] as any).nombre
        const unidad = (check[0] as any).unidad_medida || 'unidad'
        const faltan = Math.ceil((qty - stockActual) * 1000) / 1000
        throw new Error(`Stock insuficiente: ${nombre} (faltan ${faltan} ${unidad})`)
      }
    }

    for (const [ingredienteId, qty] of deductMap) {
      await sql`
        UPDATE soda_master.ingredientes
        SET stock_actual = stock_actual - ${qty}, updated_at = now()
        WHERE id = ${ingredienteId}::uuid
      `
    }

    if (modoStock === 'producto' || modoStock === 'producto_y_receta') {
      const stockRows = await sql`
        UPDATE soda_master.inventario
        SET stock_actual = stock_actual - ${cantidad},
            updated_at = CURRENT_TIMESTAMP
        WHERE producto_id = ${item.producto_id}
          AND stock_actual >= ${cantidad}
        RETURNING stock_actual
      `
      if (stockRows.length === 0) {
        throw new Error('Stock insuficiente para enviar el producto')
      }
    }

    const modificadoresJson = JSON.stringify(item.modificadores ?? mods)
    const result = await sql`
      INSERT INTO soda_master.items_orden (orden_id, producto_id, cantidad, precio_unitario, modificadores, notas_especiales, estado_item)
      VALUES (${item.orden_id}, ${item.producto_id}, ${cantidad}, ${item.precio_unitario}, ${modificadoresJson}, ${item.notas_especiales ?? null}, 'pendiente')
      RETURNING *
    `
    const inserted = result[0] as any

    for (const [ingredienteId, qty] of deductMap) {
      await sql`
        INSERT INTO soda_master.movimientos_inventario
          (ingrediente_id, producto_id, tipo, cantidad, orden_id, item_orden_id, notas)
        VALUES (
          ${ingredienteId}::uuid,
          ${item.producto_id}::uuid,
          'venta',
          ${qty},
          ${item.orden_id}::uuid,
          ${inserted.id}::uuid,
          ${'Venta item'}
        )
      `
    }

    return inserted as ItemOrden
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

  async actualizarItemOrden(
    id: string,
    updates: Partial<ItemOrden> & { modificadores?: unknown; precio_unitario?: number },
  ) {
    await ensureItemEstadoSchema()
    const sql = getSql()

    // `modificadores` es una columna jsonb. La actualizamos por separado
    // para evitar un desajuste de tipos text/jsonb dentro de COALESCE.
    // Esto permite corregir/editar los ingredientes de un ítem incluso
    // cuando ya fue enviado a cocina/bar (contratiempo o cambio del cliente).
    if (updates.modificadores !== undefined) {
      const modificadoresJson = JSON.stringify(updates.modificadores ?? [])
      await sql`
        UPDATE soda_master.items_orden
        SET modificadores = ${modificadoresJson}::jsonb
        WHERE id = ${id}
      `
    }

    const result = await sql`
      UPDATE soda_master.items_orden 
      SET cantidad = COALESCE(${updates.cantidad}, cantidad),
          estado_item = COALESCE(${updates.estado_item}, estado_item),
          notas_especiales = COALESCE(${updates.notas_especiales}, notas_especiales),
          precio_unitario = COALESCE(${updates.precio_unitario}, precio_unitario)
      WHERE id = ${id}
      RETURNING *
    `
    const itemActualizado = result[0] as ItemOrden | undefined

    // Sincronización del estado de la orden con el de sus items. Esto evita
    // carreras del lado del cliente cuando el mesero marca múltiples items
    // como entregados en rápida sucesión: el server es la única fuente de
    // verdad de la transición listo → entregado de la orden completa.
    if (itemActualizado?.orden_id && typeof updates.estado_item === 'string') {
      await ensureOrdenEstadoSchema()
      const items = (await sql`
        SELECT estado_item FROM soda_master.items_orden
        WHERE orden_id = ${itemActualizado.orden_id}
      `) as Array<{ estado_item: string }>
      if (items.length > 0) {
        const todosEntregados = items.every((r) => r.estado_item === 'entregado')
        const todosListos = items.every(
          (r) => r.estado_item === 'listo' || r.estado_item === 'entregado',
        )
        const algunoProblema = items.some((r) => r.estado_item === 'problema')
        const algunoEnPrep = items.some((r) => r.estado_item === 'en_preparacion')

        let nuevoEstadoOrden: string | null = null
        if (algunoProblema) nuevoEstadoOrden = 'problema'
        else if (todosEntregados) nuevoEstadoOrden = 'entregado'
        else if (todosListos) nuevoEstadoOrden = 'listo'
        else if (algunoEnPrep) nuevoEstadoOrden = 'en_preparacion'

        if (nuevoEstadoOrden) {
          await sql`
            UPDATE soda_master.ordenes
            SET estado = ${nuevoEstadoOrden}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${itemActualizado.orden_id}
              AND estado NOT IN ('pagado','cancelado','perdida')
              AND estado IS DISTINCT FROM ${nuevoEstadoOrden}
          `
        }
      }
    }

    return itemActualizado as ItemOrden
  },

  async eliminarItemOrden(id: string) {
    const sql = getSql()
    await sql`DELETE FROM soda_master.items_orden WHERE id = ${id}`
  },

  // Pagos
  //
  // crearPago acepta opcionalmente `item_orden_ids: string[]` para soportar
  // PAGOS PARCIALES por items (caso: un cliente se va antes y paga sólo lo
  // que él consumió, mientras el resto sigue en la mesa). Cuando se entrega
  // esa lista, sólo esos items se marcan como pagados; la orden completa
  // pasa a `estado='pagado'` cuando todos sus items lo están. Cuando NO se
  // entrega la lista, mantiene el comportamiento clásico de "pagar todo lo
  // que falte por pagar de la orden".
  async crearPago(pago: any) {
    await ensureItemPagoSchema()
    await ensureOrdenEstadoSchema()
    const sql = getSql()
    const ordenId = pago.orden_id ?? pago.ordenId ?? pago.comandaId
    if (!ordenId) {
      throw new Error('orden_id requerido')
    }
    const metodoNormalizado = normalizarMetodoPago(pago.metodo)
    const monto = Number(pago.monto ?? pago.total ?? 0)
    const propina = Number(pago.propina ?? 0)
    const descuento = Number(pago.descuento ?? 0)
    const divididoEn = Number(pago.dividido_en ?? pago.divididoEn ?? 1) || 1
    if (!Number.isFinite(monto) || monto <= 0) throw new Error('monto debe ser mayor que 0')
    if (!Number.isFinite(propina) || propina < 0) throw new Error('propina inválida')
    if (!Number.isFinite(descuento) || descuento < 0) throw new Error('descuento inválido')
    if (!Number.isFinite(divididoEn) || divididoEn < 1) throw new Error('dividido_en inválido')
    const vueltoVal = pago.vuelto !== undefined && pago.vuelto !== null ? Number(pago.vuelto) : null
    const referencia = pago.referencia ?? null
    const aprobado = pago.aprobado !== undefined ? !!pago.aprobado : true

    const itemIdsRaw = pago.item_orden_ids ?? pago.itemOrdenIds
    const itemIds: string[] = Array.isArray(itemIdsRaw)
      ? itemIdsRaw.filter((x: unknown) => typeof x === 'string' && x.length > 0)
      : []

    // `item_partials` permite cobrar PARTE de una línea con cantidad > 1
    // (ej.: hay un item_orden "2x Cerveza" y una persona paga sólo 1).
    // En ese caso splitteamos la línea: bajamos la cantidad del original
    // a la cantidad que se paga ahora y clonamos una línea nueva con la
    // cantidad restante (queda abierta para que la pague otro cliente).
    // Estructura: [{ id, cantidad }]
    const itemPartialsRaw = pago.item_partials ?? pago.itemPartials
    const itemPartials: Array<{ id: string; cantidad: number }> = Array.isArray(itemPartialsRaw)
      ? itemPartialsRaw
          .map((p: any) => ({
            id: typeof p?.id === 'string' ? p.id : '',
            cantidad: Number(p?.cantidad) || 0,
          }))
          .filter((p: { id: string; cantidad: number }) => p.id && p.cantidad > 0)
      : []

    const esParcial = itemIds.length > 0 || itemPartials.length > 0

    const inserted = await sql`
      INSERT INTO soda_master.pagos (orden_id, metodo, monto, propina, descuento, dividido_en, vuelto, referencia, aprobado)
      VALUES (${ordenId}, ${metodoNormalizado}, ${monto}, ${propina}, ${descuento}, ${divididoEn}, ${vueltoVal}, ${referencia}, ${aprobado})
      RETURNING *
    `
    const pagoCreado = mapPago(inserted[0])
    const pagoId = (inserted[0] as any).id

    if (esParcial) {
      // 1) Splits: por cada item con cobro parcial, dejamos la línea
      //    original con la cantidad que se está cobrando (y pagada=TRUE)
      //    y clonamos una nueva línea con el remanente sin pagar.
      for (const partial of itemPartials) {
        const originalRows = (await sql`
          SELECT id, orden_id, producto_id, cantidad, precio_unitario, modificadores,
                 notas_especiales, estado_item, pagado, cuenta_persona_id
          FROM soda_master.items_orden
          WHERE id = ${partial.id}::uuid AND orden_id = ${ordenId}
          FOR UPDATE
        `) as Array<any>
        const original = originalRows[0]
        if (!original) continue
        if (original.pagado === true) continue
        const cantidadOriginal = Number(original.cantidad) || 0
        const cantidadCobrar = Math.min(partial.cantidad, cantidadOriginal)
        if (cantidadCobrar <= 0) continue
        if (cantidadCobrar >= cantidadOriginal) {
          // Cobra la línea completa: igual que un item_orden_ids normal.
          await sql`
            UPDATE soda_master.items_orden
            SET pagado = TRUE, pago_id = ${pagoId}::uuid
            WHERE id = ${original.id}::uuid
              AND pagado = FALSE
          `
          continue
        }
        // Cobra menos de la línea: split en BD. La línea restante hereda
        // el `cuenta_persona_id` del original (el cliente que se fue ya
        // pagó lo suyo; el resto sigue siendo de la misma persona que
        // tenía asignada esa unidad… si quería repartirla a otro, debió
        // reasignar antes de cobrar).
        const cantidadRestante = cantidadOriginal - cantidadCobrar
        await sql`
          UPDATE soda_master.items_orden
          SET cantidad = ${cantidadCobrar},
              pagado = TRUE,
              pago_id = ${pagoId}::uuid
          WHERE id = ${original.id}::uuid
        `
        await sql`
          INSERT INTO soda_master.items_orden
            (orden_id, producto_id, cantidad, precio_unitario, modificadores,
             notas_especiales, estado_item, pagado, cuenta_persona_id)
          VALUES (
            ${original.orden_id},
            ${original.producto_id},
            ${cantidadRestante},
            ${original.precio_unitario},
            ${original.modificadores ?? null},
            ${original.notas_especiales ?? null},
            ${original.estado_item ?? 'pendiente'},
            FALSE,
            ${original.cuenta_persona_id ?? null}
          )
        `
      }

      // 2) Líneas completas: ids normales que sí se cobran enteros.
      if (itemIds.length > 0) {
        await sql`
          UPDATE soda_master.items_orden
          SET pagado = TRUE, pago_id = ${pagoId}::uuid
          WHERE orden_id = ${ordenId}
            AND id = ANY(${itemIds}::uuid[])
            AND pagado = FALSE
        `
      }
    } else {
      await sql`
        UPDATE soda_master.items_orden
        SET pagado = TRUE, pago_id = ${pagoId}::uuid
        WHERE orden_id = ${ordenId}
          AND pagado = FALSE
      `
    }

    // Si ya no quedan items por pagar, cerramos la orden. Esto lo decide
    // el servidor para evitar que clientes en paralelo dejen la orden
    // "abierta a medias".
    const pendientesRows = (await sql`
      SELECT COUNT(*)::int AS cnt
      FROM soda_master.items_orden
      WHERE orden_id = ${ordenId} AND pagado = FALSE
    `) as Array<{ cnt: number }>
    const restantes = pendientesRows[0]?.cnt ?? 0
    if (restantes === 0) {
      await sql`
        UPDATE soda_master.ordenes
        SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${ordenId}
          AND estado NOT IN ('pagado','cancelado','perdida')
      `
    }

    // Registro automático en caja chica. Si no hay caja abierta, NO se
    // bloquea el pago (el negocio puede operar sin caja chica activa),
    // pero sí dejamos rastro intentando registrarlo y silenciando el
    // error de "CAJA_NO_ABIERTA".
    if (metodoNormalizado === 'efectivo') {
      try {
        await ensureCajaSchema()
        const abiertaRows = (await sql`
          SELECT id FROM soda_master.cajas WHERE estado = 'abierta' LIMIT 1
        `) as any[]
        const cajaAbiertaId = abiertaRows[0]?.id
        if (cajaAbiertaId) {
          const totalEfectivo = Number(monto) + Number(propina)
          await sql`
            INSERT INTO soda_master.movimientos_caja
              (caja_id, tipo, monto, pago_id, descripcion)
            VALUES
              (${cajaAbiertaId}::uuid, 'venta_efectivo', ${totalEfectivo},
               ${pagoId}::uuid,
               ${'Cobro orden ' + String(ordenId).slice(0, 8)})
          `
          if (vueltoVal && vueltoVal > 0) {
            await sql`
              INSERT INTO soda_master.movimientos_caja
                (caja_id, tipo, monto, pago_id, descripcion)
              VALUES
                (${cajaAbiertaId}::uuid, 'vuelto', ${vueltoVal},
                 ${pagoId}::uuid,
                 ${'Vuelto entregado'})
            `
          }
        }
      } catch (e) {
        console.error('No se pudo registrar movimiento de caja:', e)
      }
    }

    return pagoCreado
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
  // pagar. La función toma la orden, calcula el monto que quedaba sin pagar
  // (suma del subtotal de items no pagados + IVA, sin propina) y deja un
  // registro. La orden pasa a estado `'perdida'`, lo que la quita del
  // listado de comandas activas y la diferencia claramente de `'pagado'`.
  async registrarPerdida(input: {
    orden_id: string
    motivo: string
    autorizado_por?: string | null
    autorizado_por_nombre?: string | null
    tasa_impuesto?: number
    impuesto_habilitado?: boolean
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
    const sql = getSql()

    // Traemos la orden + datos del usuario que la abrió. Ese usuario es
    // el "responsable" — quien deberá responder por la pérdida hasta que
    // el cliente, eventualmente, vuelva a pagar lo consumido.
    const orden = (await sql`
      SELECT o.id, o.mesa_id, o.estado, o.usuario_id,
             u.nombre AS usuario_nombre, u.rol AS usuario_rol
      FROM soda_master.ordenes o
      LEFT JOIN soda_master.usuarios u ON u.id = o.usuario_id
      WHERE o.id = ${input.orden_id}
    `) as Array<{
      id: string
      mesa_id: string | null
      estado: string
      usuario_id: string | null
      usuario_nombre: string | null
      usuario_rol: string | null
    }>
    if (orden.length === 0) {
      throw new Error('Orden no encontrada')
    }
    if (orden[0].estado === 'pagado') {
      throw new Error('La orden ya está pagada, no aplica como perro muerto')
    }
    if (orden[0].estado === 'perdida') {
      throw new Error('La orden ya está marcada como pérdida')
    }
    if (orden[0].estado === 'cancelado') {
      throw new Error('La orden está cancelada, no se puede marcar como pérdida')
    }

    // Suma de items NO pagados (en pagos parciales previos puede haber
    // items ya cobrados; esos NO se cuentan como pérdida).
    const sumRows = (await sql`
      SELECT
        COALESCE(SUM(cantidad * precio_unitario), 0)::numeric AS subtotal,
        COUNT(*)::int AS cant
      FROM soda_master.items_orden
      WHERE orden_id = ${input.orden_id} AND pagado = FALSE
    `) as Array<{ subtotal: string | number; cant: number }>
    const subtotal = Number(sumRows[0]?.subtotal ?? 0)
    const cantidad = Number(sumRows[0]?.cant ?? 0)
    const tasa = input.impuesto_habilitado === false ? 0 : Number(input.tasa_impuesto ?? 0)
    const monto = subtotal + subtotal * (tasa / 100)

    const motivo = (input.motivo || '').toString().trim() || 'Perro muerto'
    const autorizadoPor = input.autorizado_por || null
    const autorizadoPorNombre = input.autorizado_por_nombre || null
    const responsableId = orden[0].usuario_id || null
    const responsableNombre = orden[0].usuario_nombre || null
    const responsableRol = orden[0].usuario_rol || null

    const inserted = (await sql`
      INSERT INTO soda_master.perdidas_comanda
        (orden_id, mesa_id, monto_perdido, cantidad_items, motivo,
         autorizado_por, autorizado_por_nombre,
         responsable_id, responsable_nombre, responsable_rol)
      VALUES (
        ${input.orden_id}::uuid,
        ${orden[0].mesa_id},
        ${monto},
        ${cantidad},
        ${motivo},
        ${autorizadoPor},
        ${autorizadoPorNombre},
        ${responsableId},
        ${responsableNombre},
        ${responsableRol}
      )
      RETURNING id
    `) as Array<{ id: string }>

    // Anotamos en `ordenes.notas` para que cualquiera que abra esa orden
    // vea por qué se cerró sin pago, quién lo autorizó y quién era el
    // responsable de la mesa al momento del incidente.
    const responsableLabel = responsableNombre
      ? ` — responsable ${responsableNombre}${
          responsableRol ? ` (${responsableRol})` : ''
        }`
      : ''
    const notaPerdida = `[PERRO MUERTO] ${motivo}${
      autorizadoPorNombre ? ` — autorizó ${autorizadoPorNombre}` : ''
    }${responsableLabel}`
    await sql`
      UPDATE soda_master.ordenes
      SET estado = 'perdida',
          notas = CASE
            WHEN COALESCE(notas, '') = '' THEN ${notaPerdida}
            ELSE notas || E'\n' || ${notaPerdida}
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.orden_id}
    `

    return {
      id: inserted[0].id,
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
   */
  async resolverPerdida(input: {
    perdida_id: string
    monto?: number
    metodo?: string
    referencia?: string | null
    resuelto_por_id: string
    resuelto_por_nombre: string
  }): Promise<{
    id: string
    pago_id: string
    monto: number
  }> {
    await ensurePerdidasTable()
    const sql = getSql()

    const perdidas = (await sql`
      SELECT id, orden_id, monto_perdido, resuelto
      FROM soda_master.perdidas_comanda
      WHERE id = ${input.perdida_id}
    `) as Array<{
      id: string
      orden_id: string
      monto_perdido: string | number
      resuelto: boolean
    }>
    if (perdidas.length === 0) {
      throw new Error('Pérdida no encontrada')
    }
    if (perdidas[0].resuelto) {
      throw new Error('Esta pérdida ya fue cobrada retroactivamente')
    }
    const ordenId = perdidas[0].orden_id
    const montoOriginal = Number(perdidas[0].monto_perdido) || 0
    const monto =
      input.monto !== undefined && Number.isFinite(Number(input.monto))
        ? Number(input.monto)
        : montoOriginal
    if (monto <= 0) {
      throw new Error('El monto del cobro retroactivo debe ser mayor que 0')
    }
    const metodo = normalizarMetodoPago(input.metodo ?? 'efectivo')
    const referencia = input.referencia ?? `retroactivo:${input.perdida_id}`

    const inserted = (await sql`
      INSERT INTO soda_master.pagos
        (orden_id, metodo, monto, propina, descuento, dividido_en, vuelto, referencia, aprobado)
      VALUES (${ordenId}, ${metodo}, ${monto}, 0, 0, 1, NULL, ${referencia}, TRUE)
      RETURNING *
    `) as any[]
    const pagoId = (inserted[0] as any).id

    await sql`
      UPDATE soda_master.perdidas_comanda
      SET resuelto = TRUE,
          resuelto_at = now(),
          resuelto_por_id = ${input.resuelto_por_id}::uuid,
          resuelto_por_nombre = ${input.resuelto_por_nombre},
          pago_id = ${pagoId}::uuid
      WHERE id = ${input.perdida_id}
    `

    // Dejamos constancia en `ordenes.notas` para no perder el rastro.
    const nota = `[PERRO MUERTO RESUELTO] cobrado retroactivamente $${monto.toFixed(0)} por ${input.resuelto_por_nombre}`
    await sql`
      UPDATE soda_master.ordenes
      SET notas = CASE
        WHEN COALESCE(notas, '') = '' THEN ${nota}
        ELSE notas || E'\n' || ${nota}
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ${ordenId}
    `

    return { id: input.perdida_id, pago_id: pagoId, monto }
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

  async crearCuentaPersona(input: {
    orden_id: string
    nombre?: string | null
  }): Promise<any> {
    await ensureCuentasPersonaSchema()
    const sql = getSql()
    // Calculamos el siguiente idx libre. Lockeamos la orden para evitar
    // que dos cajeros creen Persona 3 al mismo tiempo.
    const rows = (await sql`
      WITH lock AS (
        SELECT pg_advisory_xact_lock(hashtext(${input.orden_id}::text)::bigint)
      ),
      next AS (
        SELECT COALESCE(MAX(idx), 0) + 1 AS next_idx
        FROM soda_master.cuentas_persona
        WHERE orden_id = ${input.orden_id}::uuid
      )
      INSERT INTO soda_master.cuentas_persona (orden_id, idx, nombre)
      SELECT ${input.orden_id}::uuid, next.next_idx, ${input.nombre ?? null}
      FROM next
      RETURNING id, orden_id, idx, nombre, created_at
    `) as any[]
    return rows[0]
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
    return rows[0]
  },

  async eliminarCuentaPersona(id: string): Promise<void> {
    await ensureCuentasPersonaSchema()
    const sql = getSql()
    // Desasignamos los items de esa persona antes de borrar para que
    // queden compartidos y no se pierda nada cuando hay FK suelta.
    await sql`
      UPDATE soda_master.items_orden
      SET cuenta_persona_id = NULL
      WHERE cuenta_persona_id = ${id}::uuid
    `
    await sql`
      DELETE FROM soda_master.cuentas_persona WHERE id = ${id}::uuid
    `
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
   * Items ya pagados no se reasignan (mantiene consistencia con los
   * reportes históricos de cuánto pagó cada uno).
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
    const sql = getSql()
    // Agrupar por item; consolidar destinos repetidos.
    const grupos = new Map<string, Map<string, number>>() // itemId -> (destinoKey -> cantidad)
    for (const a of input.asignaciones) {
      if (!a.item_orden_id || !Number.isFinite(a.cantidad) || a.cantidad <= 0) continue
      const destino = a.cuenta_persona_id || 'NULL'
      if (!grupos.has(a.item_orden_id)) grupos.set(a.item_orden_id, new Map())
      const m = grupos.get(a.item_orden_id)!
      m.set(destino, (m.get(destino) || 0) + a.cantidad)
    }

    for (const [itemId, destinos] of grupos.entries()) {
      const rows = (await sql`
        SELECT id, orden_id, producto_id, cantidad, precio_unitario, modificadores,
               notas_especiales, estado_item, pagado, cuenta_persona_id
        FROM soda_master.items_orden
        WHERE id = ${itemId}::uuid AND orden_id = ${input.orden_id}::uuid
        FOR UPDATE
      `) as any[]
      const original = rows[0]
      if (!original) continue
      if (original.pagado === true) continue
      const cantidadOriginal = Number(original.cantidad) || 0
      if (cantidadOriginal <= 0) continue

      // Lista ordenada de (destino, cantidad) con cantidades ya clampeadas.
      let restante = cantidadOriginal
      const planificado: Array<{ destino: string | null; cantidad: number }> = []
      for (const [destinoKey, cantRaw] of destinos.entries()) {
        if (restante <= 0) break
        const cant = Math.min(cantRaw, restante)
        if (cant <= 0) continue
        planificado.push({
          destino: destinoKey === 'NULL' ? null : destinoKey,
          cantidad: cant,
        })
        restante -= cant
      }

      // Caso trivial: sin asignaciones efectivas.
      if (planificado.length === 0) continue

      // Caso simple: un sólo destino que cubre la totalidad.
      if (planificado.length === 1 && planificado[0].cantidad >= cantidadOriginal) {
        await sql`
          UPDATE soda_master.items_orden
          SET cuenta_persona_id = ${planificado[0].destino}
          WHERE id = ${original.id}::uuid
        `
        continue
      }

      // Caso complejo: split. La línea original toma el primer destino
      // con su cantidad; los demás se clonan a filas nuevas; si sobra,
      // se crea una línea final compartida (null).
      const [primero, ...resto] = planificado
      await sql`
        UPDATE soda_master.items_orden
        SET cantidad = ${primero.cantidad},
            cuenta_persona_id = ${primero.destino}
        WHERE id = ${original.id}::uuid
      `
      for (const seg of resto) {
        await sql`
          INSERT INTO soda_master.items_orden
            (orden_id, producto_id, cantidad, precio_unitario, modificadores,
             notas_especiales, estado_item, pagado, cuenta_persona_id)
          VALUES (
            ${original.orden_id},
            ${original.producto_id},
            ${seg.cantidad},
            ${original.precio_unitario},
            ${original.modificadores ?? null},
            ${original.notas_especiales ?? null},
            ${original.estado_item ?? 'pendiente'},
            FALSE,
            ${seg.destino}
          )
        `
      }
      if (restante > 0) {
        await sql`
          INSERT INTO soda_master.items_orden
            (orden_id, producto_id, cantidad, precio_unitario, modificadores,
             notas_especiales, estado_item, pagado, cuenta_persona_id)
          VALUES (
            ${original.orden_id},
            ${original.producto_id},
            ${restante},
            ${original.precio_unitario},
            ${original.modificadores ?? null},
            ${original.notas_especiales ?? null},
            ${original.estado_item ?? 'pendiente'},
            FALSE,
            NULL
          )
        `
      }
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
  async crearDescuento(input: {
    orden_id: string
    tipo: string
    valor: number
    aplicado_por: string
    autorizado_por?: string | null
    motivo: string
  }) {
    const sql = getSql()
    const rows = await sql`
      WITH lock_orden AS (
        SELECT pg_advisory_xact_lock(hashtext(${input.orden_id}::text)::bigint)
      ),
      borrar_anterior AS (
        DELETE FROM soda_master.descuentos d
        USING lock_orden
        WHERE d.orden_id = ${input.orden_id}
      )
      INSERT INTO soda_master.descuentos (
        orden_id,
        tipo,
        valor,
        aplicado_por,
        autorizado_por,
        motivo
      )
      SELECT
        ${input.orden_id},
        ${input.tipo},
        ${input.valor},
        ${input.aplicado_por},
        ${input.autorizado_por || null},
        ${input.motivo}
      FROM lock_orden
      RETURNING *
    `
    return rows[0]
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
        o.total   AS orden_total,
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
    const rows = await sql`
      INSERT INTO soda_master.ingredientes
        (nombre, categoria, unidad_medida, stock_actual, stock_minimo, costo_unitario, tipo)
      VALUES (
        ${input.nombre},
        ${input.categoria || 'insumos'},
        ${input.unidad_medida || 'unidad'},
        ${Number(input.stock_actual) || 0},
        ${Number(input.stock_minimo) || 0},
        ${Number(input.costo_unitario) || 0},
        ${tipo}
      )
      RETURNING *
    `
    return mapIngredienteInsumo(rows[0])
  },

  async actualizarIngrediente(
    id: string,
    updates: Partial<{
      nombre: string
      categoria: string
      unidad_medida: string
      stock_actual: number
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
    const rows = await sql`
      UPDATE soda_master.ingredientes
      SET
        nombre = COALESCE(${updates.nombre ?? null}, nombre),
        categoria = COALESCE(${updates.categoria ?? null}, categoria),
        unidad_medida = COALESCE(${updates.unidad_medida ?? null}, unidad_medida),
        stock_actual = COALESCE(${updates.stock_actual ?? null}, stock_actual),
        stock_minimo = COALESCE(${updates.stock_minimo ?? null}, stock_minimo),
        costo_unitario = COALESCE(${updates.costo_unitario ?? null}, costo_unitario),
        tipo = COALESCE(${tipo}, tipo),
        activo = COALESCE(${updates.activo ?? null}, activo),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `
    return rows[0] ? mapIngredienteInsumo(rows[0]) : null
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
        SELECT ri.*, i.nombre AS ingrediente_nombre, i.unidad_medida
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
   * Registra una compra: crea cabecera + ítems, incrementa stock_actual del
   * insumo y actualiza costo_unitario por promedio ponderado.
   * `costo_nuevo = (stock_actual*costo_actual + cantidad*precio) / (stock_actual+cantidad)`
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
      notas?: string | null
    }>
  }) {
    await ensureComprasTables()
    const sql = getSql()
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('La compra debe tener al menos un ítem')
    }
    for (const it of payload.items) {
      if (!it.ingrediente_id) throw new Error('Ítem sin ingrediente_id')
      if (!(Number(it.cantidad) > 0)) throw new Error('Cantidad inválida en ítem')
      if (!(Number(it.precio_unitario) >= 0)) throw new Error('Precio inválido en ítem')
    }
    const subtotal = payload.items.reduce(
      (s, it) => s + Number(it.cantidad) * Number(it.precio_unitario),
      0,
    )
    const impuesto = Number(payload.impuesto) || 0
    const total = subtotal + impuesto

    const tipoDoc = payload.tipo_documento || 'boleta'
    const fecha = payload.fecha || new Date().toISOString().slice(0, 10)

    const cab = await sql`
      INSERT INTO soda_master.compras
        (proveedor_id, tipo_documento, numero_documento, fecha, subtotal, impuesto, total, notas, usuario_id)
      VALUES (
        ${payload.proveedor_id || null},
        ${tipoDoc},
        ${payload.numero_documento || null},
        ${fecha},
        ${subtotal},
        ${impuesto},
        ${total},
        ${payload.notas || null},
        ${payload.usuario_id || null}
      )
      RETURNING *
    `
    const compra = cab[0] as any

    for (const it of payload.items) {
      const subt = Number(it.cantidad) * Number(it.precio_unitario)
      await sql`
        INSERT INTO soda_master.compra_items
          (compra_id, ingrediente_id, cantidad, precio_unitario, subtotal, notas)
        VALUES (
          ${compra.id}::uuid,
          ${it.ingrediente_id}::uuid,
          ${it.cantidad},
          ${it.precio_unitario},
          ${subt},
          ${it.notas || null}
        )
      `

      // Promedio ponderado y stock al toque
      const ingRows = await sql`
        SELECT stock_actual, costo_unitario
        FROM soda_master.ingredientes WHERE id = ${it.ingrediente_id}::uuid
      `
      const stockActual = Number((ingRows[0] as any)?.stock_actual) || 0
      const costoActual = Number((ingRows[0] as any)?.costo_unitario) || 0
      const cantidad = Number(it.cantidad)
      const precio = Number(it.precio_unitario)
      const stockNuevo = stockActual + cantidad
      const costoNuevo =
        stockNuevo > 0
          ? (stockActual * costoActual + cantidad * precio) / stockNuevo
          : precio

      await sql`
        UPDATE soda_master.ingredientes
        SET stock_actual = stock_actual + ${cantidad},
            costo_unitario = ${costoNuevo},
            updated_at = now()
        WHERE id = ${it.ingrediente_id}::uuid
      `
      await sql`
        INSERT INTO soda_master.movimientos_inventario
          (ingrediente_id, tipo, cantidad, compra_id, notas)
        VALUES (
          ${it.ingrediente_id}::uuid,
          'compra',
          ${cantidad},
          ${compra.id}::uuid,
          ${`Compra ${tipoDoc} ${payload.numero_documento || ''}`.trim()}
        )
      `
    }

    return compra
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
               THEN ri.cantidad * i.costo_unitario ELSE 0 END
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
