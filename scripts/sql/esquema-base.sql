-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Sodamaster: esquema base de la base de datos (sesión 23, hallazgo F2).
--
-- Crea DESDE CERO, sobre un esquema vacío, todas las tablas, columnas, restricciones, índices y
-- funciones que existen hoy en `soda_master` (leído de Neon el 23-11-2026, Postgres 17). Después
-- de correrlo, las funciones `ensure*Schema()` de `lib/db.ts` corren sin errores y sin cambios.
--
-- Cómo se corre:
--   pnpm db:esquema-base --esquema=soda_master     (base nueva; la app usa el nombre soda_master fijo)
--   pnpm db:esquema-base --esquema=<otro>          (otro esquema; el comando reemplaza el nombre)
--   También se puede pegar tal cual en el editor SQL de Neon o correr con psql sobre una base nueva.
--
-- Reglas:
--   - Solo sobre un esquema vacío: el bloque de guarda de abajo aborta si el esquema ya tiene tablas
--     (y el comando, además, lo revisa antes de enviar nada). Nunca pisa una base con datos.
--   - Requiere Postgres 13 o superior (`gen_random_uuid()` sin extensiones). Solo usa plpgsql.
--   - No siembra datos: el primer admin y la configuración van aparte (ver P3 en ROADMAP.md).
--   - Una migración nueva en un `ensure*Schema()` de `lib/db.ts` también se agrega aquí, en la
--     tabla que corresponde. La prueba `pnpm prueba:completa --modulo=esquema` falla si no.
--   - Las columnas van en el mismo orden que en la base real, y los CHECK y defaults se escriben
--     de forma que Postgres los guarde con el mismo texto (la prueba los compara uno a uno).
--
-- Marcas: [base] = tabla o pieza que no crea ninguna ensure*Schema() (venía del seed original de
-- v0); [ensureX] = la crea o la agrega esa función de lib/db.ts; [migrate-pagos] = la agregó el
-- script manual scripts/migrate-pagos.cjs (hallazgo F63). Hallazgos F62 a F67: ver ROADMAP.md.
-- ════════════════════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS soda_master;

-- Guarda: el esquema debe estar vacío (sin tablas, índices, secuencias ni vistas).
DO $guarda$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'soda_master'
  ) THEN
    RAISE EXCEPTION 'El esquema soda_master ya tiene tablas: el esquema base solo se crea sobre un esquema vacío.';
  END IF;
END
$guarda$;

-- ─────────────────────────────── Usuarios y catálogo ───────────────────────────────

-- [base] + roles_adicionales y usuarios_email_norm_uk [ensureRolesAdicionalesSchema]
CREATE TABLE soda_master.usuarios (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(50) NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  roles_adicionales TEXT[] NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_email_key UNIQUE (email),
  CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'cajero', 'mesero', 'cocina', 'bar'))
);
CREATE UNIQUE INDEX usuarios_email_norm_uk ON soda_master.usuarios (lower(btrim(email)));

-- [base]
CREATE TABLE soda_master.categorias (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categorias_pkey PRIMARY KEY (id),
  CONSTRAINT categorias_nombre_key UNIQUE (nombre)
);

-- [base] + modo_stock y su CHECK [ensureRecetasTables]
CREATE TABLE soda_master.productos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  categoria_id UUID NOT NULL,
  precio NUMERIC(10,2) NOT NULL,
  descripcion TEXT,
  imagen_url VARCHAR(500),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  es_ingrediente_especial BOOLEAN DEFAULT false,
  costo_adicional NUMERIC(10,2) DEFAULT 0,
  modo_stock TEXT NOT NULL DEFAULT 'producto',
  CONSTRAINT productos_pkey PRIMARY KEY (id),
  CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES soda_master.categorias(id),
  CONSTRAINT productos_modo_stock_check CHECK (modo_stock IN ('producto', 'receta', 'producto_y_receta'))
);

-- [base]
CREATE TABLE soda_master.modificadores (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  precio_extra NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT modificadores_pkey PRIMARY KEY (id),
  CONSTRAINT modificadores_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES soda_master.productos(id)
);

-- [base] + nombre y mesas_nombre_efectivo_uk [ensureMesasSchema]. El estado 'limpiando' no lo usa el código (F65).
CREATE TABLE soda_master.mesas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  numero INTEGER NOT NULL,
  area VARCHAR(100),
  capacidad INTEGER DEFAULT 4,
  estado VARCHAR(50) DEFAULT 'disponible',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  nombre VARCHAR(60),
  CONSTRAINT mesas_pkey PRIMARY KEY (id),
  CONSTRAINT mesas_numero_key UNIQUE (numero),
  CONSTRAINT mesas_estado_check CHECK (estado IN ('disponible', 'ocupada', 'reservada', 'limpiando'))
);
CREATE UNIQUE INDEX mesas_nombre_efectivo_uk
  ON soda_master.mesas ((lower(btrim(COALESCE(nombre, 'Mesa ' || numero::text)))));

-- ─────────────────────────────── Órdenes, ítems y cobros ───────────────────────────────

-- [base] + CHECK de estado [ensureOrdenEstadoSchema] + ordenes_mesa_activa_uk [ensureOrdenesAtomicasSchema].
-- numero_orden no lo usa el código (F65); hora_envio sigue sin zona horaria (F64).
CREATE TABLE soda_master.ordenes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  mesa_id UUID,
  usuario_id UUID NOT NULL,
  numero_orden INTEGER,
  estado VARCHAR(50) DEFAULT 'pendiente',
  subtotal NUMERIC(10,2) DEFAULT 0,
  impuesto NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  notas TEXT,
  enviado_a_cocina BOOLEAN DEFAULT false,
  hora_envio TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ordenes_pkey PRIMARY KEY (id),
  CONSTRAINT ordenes_mesa_id_fkey FOREIGN KEY (mesa_id) REFERENCES soda_master.mesas(id),
  CONSTRAINT ordenes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES soda_master.usuarios(id),
  CONSTRAINT ordenes_estado_check CHECK (estado IN ('pendiente', 'en_cocina', 'en_preparacion', 'listo', 'entregado', 'problema', 'pagado', 'cancelado', 'perdida'))
);
CREATE INDEX idx_ordenes_estado ON soda_master.ordenes (estado);
CREATE INDEX idx_ordenes_mesa ON soda_master.ordenes (mesa_id);
CREATE INDEX idx_ordenes_usuario ON soda_master.ordenes (usuario_id);
CREATE UNIQUE INDEX ordenes_mesa_activa_uk
  ON soda_master.ordenes (mesa_id)
  WHERE mesa_id IS NOT NULL AND estado NOT IN ('pagado', 'cancelado', 'perdida');

-- [base] + CHECK de estado_item [ensureItemEstadoSchema] + pagado, pago_id e índice [ensureItemPagoSchema]
-- + cuenta_persona_id e índice [ensureCuentasPersonaSchema] + precio_manual [ensureItemPrecioSchema].
-- idx_items_orden queda cubierto por items_orden_orden_pagado_idx (F66).
CREATE TABLE soda_master.items_orden (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL,
  producto_id UUID NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_unitario NUMERIC(10,2) NOT NULL,
  modificadores JSONB,
  estado_item VARCHAR(50) DEFAULT 'pendiente',
  notas_especiales TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  pagado BOOLEAN NOT NULL DEFAULT false,
  pago_id UUID,
  cuenta_persona_id UUID,
  precio_manual BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT items_orden_pkey PRIMARY KEY (id),
  CONSTRAINT items_orden_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES soda_master.ordenes(id) ON DELETE CASCADE,
  CONSTRAINT items_orden_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES soda_master.productos(id),
  CONSTRAINT items_orden_estado_item_check CHECK (estado_item IN ('pendiente', 'en_preparacion', 'listo', 'entregado', 'problema'))
);
CREATE INDEX idx_items_orden ON soda_master.items_orden (orden_id);
CREATE INDEX items_orden_cuenta_persona_idx ON soda_master.items_orden (cuenta_persona_id);
CREATE INDEX items_orden_orden_pagado_idx ON soda_master.items_orden (orden_id, pagado);

-- [base] + descuento, dividido_en y pagos_metodo_check [migrate-pagos, F63] + cobrado_por y cobrado_por_nombre [ensurePagoSchema]
CREATE TABLE soda_master.pagos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL,
  metodo VARCHAR(50) NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  propina NUMERIC(10,2) DEFAULT 0,
  vuelto NUMERIC(10,2),
  referencia VARCHAR(255),
  aprobado BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  descuento NUMERIC(10,2) DEFAULT 0,
  dividido_en INTEGER DEFAULT 1,
  cobrado_por UUID,
  cobrado_por_nombre TEXT,
  CONSTRAINT pagos_pkey PRIMARY KEY (id),
  CONSTRAINT pagos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES soda_master.ordenes(id),
  CONSTRAINT pagos_metodo_check CHECK (metodo IN ('efectivo', 'tarjeta'))
);
CREATE INDEX idx_pagos_orden ON soda_master.pagos (orden_id);

-- [base]
CREATE TABLE soda_master.descuentos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  orden_id UUID,
  tipo VARCHAR(20) NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  aplicado_por UUID,
  autorizado_por UUID,
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT descuentos_pkey PRIMARY KEY (id),
  CONSTRAINT descuentos_aplicado_por_fkey FOREIGN KEY (aplicado_por) REFERENCES soda_master.usuarios(id),
  CONSTRAINT descuentos_autorizado_por_fkey FOREIGN KEY (autorizado_por) REFERENCES soda_master.usuarios(id),
  CONSTRAINT descuentos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES soda_master.ordenes(id),
  CONSTRAINT descuentos_tipo_check CHECK (tipo IN ('porcentaje', 'monto_fijo', 'cortesia_parcial', 'cortesia_total'))
);

-- [ensureCuentasPersonaSchema]. cuentas_persona_orden_idx repite el índice del UNIQUE (F66).
CREATE TABLE soda_master.cuentas_persona (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL,
  idx INTEGER NOT NULL,
  nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cuentas_persona_pkey PRIMARY KEY (id),
  CONSTRAINT cuentas_persona_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES soda_master.ordenes(id) ON DELETE CASCADE,
  CONSTRAINT cuentas_persona_orden_id_idx_key UNIQUE (orden_id, idx)
);
CREATE INDEX cuentas_persona_orden_idx ON soda_master.cuentas_persona (orden_id, idx);

-- [ensurePerdidasTable]
CREATE TABLE soda_master.perdidas_comanda (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL,
  mesa_id UUID,
  monto_perdido NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad_items INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  autorizado_por UUID,
  autorizado_por_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsable_id UUID,
  responsable_nombre TEXT,
  responsable_rol TEXT,
  resuelto BOOLEAN NOT NULL DEFAULT false,
  resuelto_at TIMESTAMPTZ,
  resuelto_por_id UUID,
  resuelto_por_nombre TEXT,
  pago_id UUID,
  monto_cobrado NUMERIC(12,2),
  monto_condonado NUMERIC(12,2),
  motivo_condonacion TEXT,
  CONSTRAINT perdidas_comanda_pkey PRIMARY KEY (id),
  CONSTRAINT perdidas_comanda_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES soda_master.ordenes(id) ON DELETE CASCADE
);
CREATE INDEX perdidas_comanda_created_at_idx ON soda_master.perdidas_comanda (created_at DESC);
CREATE INDEX perdidas_comanda_responsable_idx ON soda_master.perdidas_comanda (responsable_id);
CREATE INDEX perdidas_comanda_resuelto_idx ON soda_master.perdidas_comanda (resuelto);
CREATE UNIQUE INDEX perdidas_comanda_orden_uk ON soda_master.perdidas_comanda (orden_id);

-- ─────────────────────────────── Inventario, recetas y mermas ───────────────────────────────

-- [ensureRecetasTables] + unidad_compra, factor_compra, rendimiento_pct y sus CHECK [ensureRecetasTables]
-- + tipo y su CHECK [ensureComprasTables]
CREATE TABLE soda_master.ingredientes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'insumos',
  unidad_medida TEXT NOT NULL DEFAULT 'unidad',
  stock_actual NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  costo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'comida',
  unidad_compra TEXT,
  factor_compra NUMERIC(12,4) NOT NULL DEFAULT 1,
  rendimiento_pct NUMERIC(6,2) NOT NULL DEFAULT 100,
  CONSTRAINT ingredientes_pkey PRIMARY KEY (id),
  CONSTRAINT ingredientes_factor_compra_check CHECK (factor_compra > 0),
  CONSTRAINT ingredientes_rendimiento_check CHECK (rendimiento_pct >= 1 AND rendimiento_pct <= 300),
  CONSTRAINT ingredientes_tipo_check CHECK (tipo IN ('comida', 'negocio', 'otro'))
);

-- [ensureRecetasTables]
CREATE TABLE soda_master.recetas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL,
  nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recetas_pkey PRIMARY KEY (id),
  CONSTRAINT recetas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES soda_master.productos(id) ON DELETE CASCADE,
  CONSTRAINT recetas_producto_id_key UNIQUE (producto_id)
);

-- [ensureRecetasTables]
CREATE TABLE soda_master.receta_ingredientes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  receta_id UUID NOT NULL,
  ingrediente_id UUID NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 1,
  opcional BOOLEAN NOT NULL DEFAULT false,
  extra BOOLEAN NOT NULL DEFAULT false,
  costo_adicional NUMERIC(12,2) NOT NULL DEFAULT 0,
  nombre_display TEXT,
  CONSTRAINT receta_ingredientes_pkey PRIMARY KEY (id),
  CONSTRAINT receta_ingredientes_ingrediente_id_fkey FOREIGN KEY (ingrediente_id) REFERENCES soda_master.ingredientes(id),
  CONSTRAINT receta_ingredientes_receta_id_fkey FOREIGN KEY (receta_id) REFERENCES soda_master.recetas(id) ON DELETE CASCADE,
  CONSTRAINT receta_ingredientes_receta_id_ingrediente_id_key UNIQUE (receta_id, ingrediente_id)
);

-- [base] + ingrediente_id e índice [ensureMermasIngredienteSchema] + orden_id, item_orden_id, CHECK de tipo
-- e índice único [ensureMermasItemSchema]
CREATE TABLE soda_master.mermas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tipo VARCHAR(50) NOT NULL,
  producto_id UUID,
  cantidad NUMERIC(10,2) NOT NULL,
  descripcion TEXT,
  registrado_por UUID,
  responsable_id UUID,
  consecuencia VARCHAR(50),
  monto_descuento NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  ingrediente_id UUID,
  orden_id UUID,
  item_orden_id UUID,
  CONSTRAINT mermas_pkey PRIMARY KEY (id),
  CONSTRAINT mermas_ingrediente_id_fkey FOREIGN KEY (ingrediente_id) REFERENCES soda_master.ingredientes(id),
  CONSTRAINT mermas_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES soda_master.productos(id),
  CONSTRAINT mermas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES soda_master.usuarios(id),
  CONSTRAINT mermas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES soda_master.usuarios(id),
  CONSTRAINT mermas_consecuencia_check CHECK (consecuencia IS NULL OR consecuencia IN ('descuento_liquidacion', 'solo_registro', 'amonestacion')),
  CONSTRAINT mermas_tipo_check CHECK (tipo::text IN ('accidente', 'vencido', 'perdida_sin_explicacion', 'consumo_interno',
                                                     'comanda_no_pagada', 'error_preparacion', 'robo', 'item_preparado'))
);
CREATE INDEX mermas_ingrediente_idx ON soda_master.mermas (ingrediente_id);
CREATE UNIQUE INDEX mermas_item_orden_uk ON soda_master.mermas (item_orden_id) WHERE item_orden_id IS NOT NULL;

-- [base]. ultimo_reconteo sin zona horaria y sin uso en el código (F64, F65).
CREATE TABLE soda_master.inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER DEFAULT 10,
  unidad_medida VARCHAR(50) DEFAULT 'unidad',
  ultimo_reconteo TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventario_pkey PRIMARY KEY (id),
  CONSTRAINT inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES soda_master.productos(id)
);
CREATE INDEX idx_inventario_producto ON soda_master.inventario (producto_id);

-- [base] (la tabla real viene del seed original, no del CREATE de ensureRecetasTables: F62) + compra_id,
-- ingrediente_id, merma_id, item_orden_id, orden_id, notas, CHECK de tipo, producto_id sin NOT NULL y
-- cantidad NUMERIC(12,3) [ensureRecetasTables] + índice por ítem [ensureOrdenesAtomicasSchema].
-- referencia, usuario_id y razon no las usa el código (F62).
CREATE TABLE soda_master.movimientos_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  producto_id UUID,
  tipo VARCHAR(50) NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL,
  referencia VARCHAR(255),
  usuario_id UUID,
  razon TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  compra_id UUID,
  ingrediente_id UUID,
  merma_id UUID,
  item_orden_id UUID,
  orden_id UUID,
  notas TEXT,
  CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id),
  CONSTRAINT movimientos_inventario_ingrediente_id_fkey FOREIGN KEY (ingrediente_id) REFERENCES soda_master.ingredientes(id),
  CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES soda_master.productos(id),
  CONSTRAINT movimientos_inventario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES soda_master.usuarios(id),
  CONSTRAINT movimientos_inventario_tipo_check CHECK (tipo IN ('venta', 'merma', 'ajuste', 'entrada', 'compra', 'devolucion'))
);
CREATE INDEX idx_movimientos_producto ON soda_master.movimientos_inventario (producto_id);
CREATE INDEX movimientos_inventario_item_idx
  ON soda_master.movimientos_inventario (item_orden_id)
  WHERE item_orden_id IS NOT NULL;

-- [base]
CREATE TABLE soda_master.comandas_no_pagadas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  orden_id UUID,
  motivo VARCHAR(50) NOT NULL,
  autorizado_por UUID,
  merma_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT comandas_no_pagadas_pkey PRIMARY KEY (id),
  CONSTRAINT comandas_no_pagadas_autorizado_por_fkey FOREIGN KEY (autorizado_por) REFERENCES soda_master.usuarios(id),
  CONSTRAINT comandas_no_pagadas_merma_id_fkey FOREIGN KEY (merma_id) REFERENCES soda_master.mermas(id),
  CONSTRAINT comandas_no_pagadas_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES soda_master.ordenes(id),
  CONSTRAINT comandas_no_pagadas_motivo_check CHECK (motivo IN ('cliente_se_fue', 'error_mesero', 'cortesia'))
);

-- ─────────────────────────────── Compras y finanzas ───────────────────────────────

-- [ensureComprasTables]
CREATE TABLE soda_master.proveedores (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rut TEXT,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proveedores_pkey PRIMARY KEY (id)
);

-- [ensureComprasTables]
CREATE TABLE soda_master.compras (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  proveedor_id UUID,
  tipo_documento TEXT NOT NULL DEFAULT 'boleta',
  numero_documento TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuesto NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  usuario_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compras_pkey PRIMARY KEY (id),
  CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES soda_master.proveedores(id),
  CONSTRAINT compras_tipo_documento_check CHECK (tipo_documento IN ('boleta', 'factura', 'nota', 'otro'))
);

-- [ensureComprasTables] + factor, cantidad_consumo, unidad_compra y unidad_consumo [ensureComprasTables]
CREATE TABLE soda_master.compra_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL,
  ingrediente_id UUID NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL,
  precio_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  factor NUMERIC(12,4) NOT NULL DEFAULT 1,
  cantidad_consumo NUMERIC(12,3),
  unidad_compra TEXT,
  unidad_consumo TEXT,
  CONSTRAINT compra_items_pkey PRIMARY KEY (id),
  CONSTRAINT compra_items_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES soda_master.compras(id) ON DELETE CASCADE,
  CONSTRAINT compra_items_ingrediente_id_fkey FOREIGN KEY (ingrediente_id) REFERENCES soda_master.ingredientes(id)
);

-- [ensureFinanzasTables]
CREATE TABLE soda_master.activos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activos_pkey PRIMARY KEY (id),
  CONSTRAINT activos_estado_check CHECK (estado IN ('activo', 'baja', 'vendido', 'reparacion'))
);

-- [ensureFinanzasTables]
CREATE TABLE soda_master.empleados (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cargo TEXT,
  documento TEXT,
  telefono TEXT,
  email TEXT,
  sueldo_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  periodicidad TEXT NOT NULL DEFAULT 'mensual',
  fecha_ingreso DATE,
  fecha_egreso DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  usuario_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empleados_pkey PRIMARY KEY (id),
  CONSTRAINT empleados_periodicidad_check CHECK (periodicidad IN ('mensual', 'quincenal', 'semanal', 'diario', 'por_hora'))
);

-- [ensureFinanzasTables]
CREATE TABLE soda_master.gastos (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria TEXT NOT NULL DEFAULT 'otros',
  descripcion TEXT,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'operativo',
  recurrente BOOLEAN NOT NULL DEFAULT false,
  periodicidad TEXT,
  proveedor_id UUID,
  empleado_id UUID,
  activo_id UUID,
  usuario_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gastos_pkey PRIMARY KEY (id),
  CONSTRAINT gastos_tipo_check CHECK (tipo IN ('operativo', 'sueldo', 'servicio', 'impuesto', 'financiero', 'otros'))
);

-- ─────────────────────────────── Caja ───────────────────────────────

-- [ensureCajaSchema]
CREATE TABLE soda_master.cajas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  usuario_apertura_id UUID NOT NULL,
  usuario_apertura_nombre TEXT NOT NULL,
  fondo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  abierta_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en TIMESTAMPTZ,
  usuario_cierre_id UUID,
  usuario_cierre_nombre TEXT,
  efectivo_contado NUMERIC(12,2),
  diferencia NUMERIC(12,2),
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta',
  CONSTRAINT cajas_pkey PRIMARY KEY (id),
  CONSTRAINT cajas_estado_check CHECK (estado IN ('abierta', 'cerrada'))
);
CREATE UNIQUE INDEX cajas_solo_una_abierta ON soda_master.cajas ((estado)) WHERE estado = 'abierta';

-- [ensureCajaSchema]
CREATE TABLE soda_master.movimientos_caja (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  caja_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  pago_id UUID,
  usuario_id UUID,
  usuario_nombre TEXT,
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT movimientos_caja_pkey PRIMARY KEY (id),
  CONSTRAINT movimientos_caja_caja_id_fkey FOREIGN KEY (caja_id) REFERENCES soda_master.cajas(id) ON DELETE CASCADE,
  CONSTRAINT movimientos_caja_tipo_check CHECK (tipo IN ('apertura', 'venta_efectivo', 'vuelto', 'retiro', 'deposito', 'ajuste', 'cierre'))
);
CREATE INDEX movimientos_caja_caja_id_idx ON soda_master.movimientos_caja (caja_id, created_at);

-- ─────────────────────────────── Configuración y permisos ───────────────────────────────

-- [base]
CREATE TABLE soda_master.configuracion (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  clave VARCHAR(100) NOT NULL,
  valor VARCHAR(500),
  tipo VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT configuracion_pkey PRIMARY KEY (id),
  CONSTRAINT configuracion_clave_key UNIQUE (clave)
);

-- [base]
CREATE TABLE soda_master.permisos_descuento (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  rol VARCHAR(30) NOT NULL,
  puede_aplicar BOOLEAN DEFAULT false,
  limite_maximo NUMERIC(5,2) DEFAULT 0,
  requiere_motivo BOOLEAN DEFAULT true,
  CONSTRAINT permisos_descuento_pkey PRIMARY KEY (id),
  CONSTRAINT permisos_descuento_rol_key UNIQUE (rol)
);

-- [ensurePermisosEspecialesTable]
CREATE TABLE soda_master.permisos_especiales (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  motivo TEXT,
  otorgado_por UUID,
  otorgado_por_nombre TEXT,
  valido_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  valido_hasta TIMESTAMPTZ NOT NULL,
  revocado BOOLEAN NOT NULL DEFAULT false,
  revocado_at TIMESTAMPTZ,
  revocado_por UUID,
  revocado_por_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT permisos_especiales_pkey PRIMARY KEY (id),
  CONSTRAINT permisos_especiales_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES soda_master.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX permisos_especiales_usuario_idx ON soda_master.permisos_especiales (usuario_id, tipo, valido_hasta);

-- ─────────────────────────────── Sesiones, límites y notificaciones ───────────────────────────────

-- [ensureSesionesSchema] + ultima_actividad [ensureSesionesSchema]
CREATE TABLE soda_master.sesiones (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  usuario_id UUID NOT NULL,
  creada TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira TIMESTAMPTZ NOT NULL,
  revocada_at TIMESTAMPTZ,
  ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sesiones_pkey PRIMARY KEY (id),
  CONSTRAINT sesiones_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sesiones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES soda_master.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX sesiones_usuario_idx ON soda_master.sesiones (usuario_id);

-- [ensureSesionesSchema] + ultimo_exito [ensureSesionesSchema]
CREATE TABLE soda_master.intentos_login (
  clave TEXT NOT NULL,
  fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_exito TIMESTAMPTZ,
  CONSTRAINT intentos_login_pkey PRIMARY KEY (clave)
);

-- [ensureSesionesSchema]
CREATE TABLE soda_master.limite_peticiones (
  clave TEXT NOT NULL,
  ventana BIGINT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT limite_peticiones_pkey PRIMARY KEY (clave, ventana)
);

-- [ensureNotificacionesTable]
CREATE TABLE soda_master.notificaciones (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  orden_id UUID,
  mesa_nombre TEXT,
  mensaje TEXT NOT NULL,
  destinatario_usuario_id UUID,
  destinatario_rol TEXT,
  vista BOOLEAN NOT NULL DEFAULT false,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  vista_at TIMESTAMPTZ,
  CONSTRAINT notificaciones_pkey PRIMARY KEY (id),
  CONSTRAINT notificaciones_tipo_check CHECK (tipo IN ('problema', 'listo', 'nueva_orden')),
  CONSTRAINT notificaciones_check CHECK (destinatario_usuario_id IS NOT NULL OR destinatario_rol IS NOT NULL)
);
CREATE INDEX notificaciones_destinatario_usuario_idx
  ON soda_master.notificaciones (destinatario_usuario_id, vista, creado_at DESC)
  WHERE destinatario_usuario_id IS NOT NULL;
CREATE INDEX notificaciones_destinatario_rol_idx
  ON soda_master.notificaciones (destinatario_rol, vista, creado_at DESC)
  WHERE destinatario_rol IS NOT NULL;

-- ─────────────────────────────── Auditoría y datos personales ───────────────────────────────

-- [ensureAuditoriaAdminTable]
CREATE TABLE soda_master.auditoria_admin (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  usuario_id UUID,
  usuario_nombre TEXT,
  usuario_rol TEXT,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id UUID,
  entidad_nombre TEXT,
  detalles JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auditoria_admin_pkey PRIMARY KEY (id)
);
CREATE INDEX auditoria_admin_created_at_idx ON soda_master.auditoria_admin (created_at DESC);
CREATE INDEX auditoria_admin_entidad_idx ON soda_master.auditoria_admin (entidad, entidad_id);

-- [ensureSolicitudesArcoSchema] (el DDL de la migración vive en lib/arco-sql.ts, sentenciasTablaSolicitudes)
CREATE TABLE soda_master.solicitudes_arco (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  titular_tipo TEXT NOT NULL,
  titular_id UUID NOT NULL,
  canal TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  ingresada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingresada_por UUID,
  vence_en DATE NOT NULL,
  prorrogada BOOLEAN NOT NULL DEFAULT false,
  motivo_prorroga TEXT,
  prorrogada_en TIMESTAMPTZ,
  resolucion TEXT,
  resultado JSONB,
  resuelta_por UUID,
  resuelta_en TIMESTAMPTZ,
  CONSTRAINT solicitudes_arco_pkey PRIMARY KEY (id),
  CONSTRAINT solicitudes_arco_tipo_check CHECK (tipo IN ('acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad')),
  CONSTRAINT solicitudes_arco_titular_tipo_check CHECK (titular_tipo IN ('usuario', 'empleado', 'proveedor')),
  CONSTRAINT solicitudes_arco_canal_check CHECK (canal IN ('presencial', 'correo', 'formulario', 'telefono', 'otro')),
  CONSTRAINT solicitudes_arco_estado_check CHECK (estado IN ('pendiente', 'resuelta', 'rechazada')),
  CONSTRAINT solicitudes_arco_prorroga_ck CHECK (NOT prorrogada OR (motivo_prorroga IS NOT NULL AND length(btrim(motivo_prorroga)) >= 10 AND prorrogada_en IS NOT NULL)),
  CONSTRAINT solicitudes_arco_resuelta_ck CHECK (estado = 'pendiente' OR resuelta_en IS NOT NULL)
);
CREATE UNIQUE INDEX solicitudes_arco_pendiente_uk
  ON soda_master.solicitudes_arco (titular_tipo, titular_id, tipo) WHERE estado = 'pendiente';
CREATE INDEX solicitudes_arco_vence_idx ON soda_master.solicitudes_arco (estado, vence_en);

-- ─────────────────────────────── Funciones ───────────────────────────────

-- [ensurePagoSchema] Aborta la transacción con SQLSTATE SM409 y el código como mensaje (cobro seguro, sesión 5).
CREATE OR REPLACE FUNCTION soda_master.assert_cobro(cond boolean, codigo text)
RETURNS boolean LANGUAGE plpgsql AS $fn$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION '%', codigo USING ERRCODE = 'SM409';
  END IF;
  RETURN TRUE;
END
$fn$;

-- [ensureEstadoOrdenFuncion] Deja el estado de la orden según el peor estado de sus ítems (sesión 13, B5).
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
$fn$;
