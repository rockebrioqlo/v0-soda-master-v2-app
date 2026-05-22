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

function mapUsuario(row: any): Usuario {
  const { pin_hash, pinHash, pin, password, ...safeUsuario } = row
  return {
    ...safeUsuario,
    intentosFallidos: 0,
    bloqueadoHasta: null,
  } as Usuario
}

function normalizarRol(rol?: string | null): string | null {
  if (!rol) return null
  if (rol === 'administrador') return 'admin'
  return rol
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
    metodo: row.metodo,
    monto,
    total: monto,
    propina,
    vuelto: row.vuelto !== undefined && row.vuelto !== null ? Number(row.vuelto) : undefined,
    referencia: row.referencia ?? undefined,
    aprobado: row.aprobado ?? true,
    descuento,
    divididoEn,
    fecha: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  } as Pago
}

function mapProducto(row: any): Producto {
  const stock = row.stock !== undefined && row.stock !== null ? Number(row.stock) : 0
  const stockMinimo = row.stockMinimo !== undefined && row.stockMinimo !== null
    ? Number(row.stockMinimo)
    : (row.stock_minimo !== undefined && row.stock_minimo !== null ? Number(row.stock_minimo) : 5)
  return {
    ...row,
    precio: row.precio !== undefined && row.precio !== null ? Number(row.precio) : 0,
    stock,
    stockMinimo,
    esIngredienteEspecial: row.es_ingrediente_especial === true,
    costoAdicional: row.costo_adicional !== undefined && row.costo_adicional !== null
      ? Number(row.costo_adicional)
      : 0,
  } as Producto
}

export const db = {
  // Usuarios
  async getUsuarios(): Promise<Usuario[]> {
    const sql = getSql()
    const result = await sql`
      SELECT id, email, nombre, rol, activo, created_at, updated_at
      FROM soda_master.usuarios
      ORDER BY nombre
    `
    return result.map(mapUsuario)
  },

  async getUsuarioById(id: string): Promise<Usuario | null> {
    const sql = getSql()
    const result = await sql`
      SELECT id, email, nombre, rol, activo, created_at, updated_at
      FROM soda_master.usuarios
      WHERE id = ${id}
    `
    return result[0] ? mapUsuario(result[0]) : null
  },

  async verificarPIN(email: string, pin: string): Promise<Usuario | null> {
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
    const rol = normalizarRol(usuario.rol)
    const result = await sql`
      INSERT INTO soda_master.usuarios (email, nombre, pin_hash, rol, activo)
      VALUES (${usuario.email}, ${usuario.nombre}, ${pinHash}, ${rol}, ${usuario.activo ?? true})
      RETURNING id, email, nombre, rol, activo, created_at, updated_at
    `
    return mapUsuario(result[0])
  },

  async actualizarUsuario(
    id: string,
    updates: Partial<Usuario> & { pin?: string; pinHash?: string; pin_hash?: string }
  ) {
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
    const result = await sql`
      UPDATE soda_master.usuarios 
      SET nombre = COALESCE(${updates.nombre ?? null}, nombre),
          email = COALESCE(${updates.email ?? null}, email),
          rol = COALESCE(${rol}, rol),
          activo = COALESCE(${updates.activo ?? null}, activo),
          pin_hash = COALESCE(${nuevoPinHash}, pin_hash),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, email, nombre, rol, activo, created_at, updated_at
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
        p.costo_adicional
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
    const result = await sql`
      INSERT INTO soda_master.ordenes (mesa_id, usuario_id, estado, subtotal, impuesto, total, notas, enviado_a_cocina)
      VALUES (${orden.mesa_id}, ${orden.usuario_id}, ${orden.estado}, ${orden.subtotal}, ${orden.impuesto}, ${orden.total}, ${orden.notas}, false)
      RETURNING *
    `
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
    const sql = getSql()
    const result = await sql`
      SELECT o.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', i.id,
                   'producto_id', i.producto_id,
                   'producto_nombre', p.nombre,
                   'cantidad', i.cantidad,
                   'precio_unitario', i.precio_unitario,
                   'modificadores', i.modificadores,
                   'notas_especiales', i.notas_especiales,
                   'estado_item', i.estado_item
                 ) ORDER BY i.created_at
               ) FILTER (WHERE i.id IS NOT NULL),
               '[]'::json
             ) AS items
      FROM soda_master.ordenes o
      LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
      LEFT JOIN soda_master.productos p ON i.producto_id = p.id
      WHERE o.estado NOT IN ('pagado', 'cancelado')
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `
    return result as Orden[]
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
        WHERE created_at::date = ${fechaIso}::date
        ORDER BY created_at ASC
        LIMIT ${limite}
      ` as unknown as Orden[]
    }
    if (fechaIso) {
      return await sql`
        SELECT * FROM soda_master.ordenes
        WHERE created_at::date = ${fechaIso}::date
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
      WHERE mesa_id = ${mesaId} AND estado NOT IN ('pagado', 'cancelado')
      ORDER BY created_at DESC
    `
    return result as Orden[]
  },

  async actualizarOrden(id: string, updates: Partial<Orden>) {
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

  // Items de orden
  async crearItemOrden(item: Omit<ItemOrden, 'id' | 'created_at'>) {
    const sql = getSql()
    const result = await sql`
      INSERT INTO soda_master.items_orden (orden_id, producto_id, cantidad, precio_unitario, modificadores, notas_especiales, estado_item)
      VALUES (${item.orden_id}, ${item.producto_id}, ${item.cantidad}, ${item.precio_unitario}, ${JSON.stringify(item.modificadores)}, ${item.notas_especiales}, 'pendiente')
      RETURNING *
    `
    return result[0] as ItemOrden
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

  async actualizarItemOrden(id: string, updates: Partial<ItemOrden>) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.items_orden 
      SET cantidad = COALESCE(${updates.cantidad}, cantidad),
          estado_item = COALESCE(${updates.estado_item}, estado_item),
          notas_especiales = COALESCE(${updates.notas_especiales}, notas_especiales)
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] as ItemOrden
  },

  async eliminarItemOrden(id: string) {
    const sql = getSql()
    await sql`DELETE FROM soda_master.items_orden WHERE id = ${id}`
  },

  // Pagos
  async crearPago(pago: any) {
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
    const vueltoVal = pago.vuelto !== undefined && pago.vuelto !== null ? Number(pago.vuelto) : null
    const referencia = pago.referencia ?? null
    const aprobado = pago.aprobado !== undefined ? !!pago.aprobado : true
    const result = await sql`
      INSERT INTO soda_master.pagos (orden_id, metodo, monto, propina, descuento, dividido_en, vuelto, referencia, aprobado)
      VALUES (${ordenId}, ${metodoNormalizado}, ${monto}, ${propina}, ${descuento}, ${divididoEn}, ${vueltoVal}, ${referencia}, ${aprobado})
      RETURNING *
    `
    return mapPago(result[0])
  },

  async getPagos(filtro?: { fecha?: string }): Promise<Pago[]> {
    const sql = getSql()
    let rows: any[]
    if (filtro?.fecha === 'hoy') {
      rows = await sql`
        SELECT * FROM soda_master.pagos
        WHERE created_at::date = CURRENT_DATE
        ORDER BY created_at DESC
      `
    } else if (filtro?.fecha) {
      rows = await sql`
        SELECT * FROM soda_master.pagos
        WHERE created_at::date = ${filtro.fecha}::date
        ORDER BY created_at DESC
      `
    } else {
      rows = await sql`
        SELECT * FROM soda_master.pagos
        ORDER BY created_at DESC
        LIMIT 200
      `
    }
    return rows.map(mapPago)
  },

  // Inventario
  async getInventario(): Promise<Inventario[]> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.inventario ORDER BY created_at DESC`
    return result as Inventario[]
  },

  async actualizarInventario(productoId: string, cantidad: number) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.inventario 
      SET stock_actual = ${cantidad}, updated_at = CURRENT_TIMESTAMP
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
      INSERT INTO soda_master.descuentos (orden_id, tipo, valor, aplicado_por, autorizado_por, motivo)
      VALUES (
        ${input.orden_id},
        ${input.tipo},
        ${input.valor},
        ${input.aplicado_por},
        ${input.autorizado_por || null},
        ${input.motivo}
      )
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
      WHERE (${desde}::date IS NULL OR d.created_at::date >= ${desde}::date)
        AND (${hasta}::date IS NULL OR d.created_at::date <= ${hasta}::date)
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
        AND (${desde}::date IS NULL OR m.created_at::date >= ${desde}::date)
        AND (${hasta}::date IS NULL OR m.created_at::date <= ${hasta}::date)
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
    cantidad: number
    descripcion?: string | null
    registrado_por: string
    comanda_no_pagada?: {
      orden_id: string
      motivo: string
      autorizado_por?: string | null
    } | null
  }) {
    const sql = getSql()
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

    if (input.producto_id && input.tipo !== 'comanda_no_pagada') {
      await sql`
        UPDATE soda_master.inventario
        SET stock_actual = GREATEST(stock_actual - ${input.cantidad}, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE producto_id = ${input.producto_id}
      `
    }

    if (input.tipo === 'comanda_no_pagada' && input.comanda_no_pagada) {
      const { orden_id, motivo, autorizado_por } = input.comanda_no_pagada
      await sql`
        INSERT INTO soda_master.comandas_no_pagadas (orden_id, motivo, autorizado_por, merma_id)
        VALUES (${orden_id}, ${motivo}, ${autorizado_por || null}, ${merma.id})
      `
    }

    return merma
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
    const sql = getSql()
    const [totales] = await sql`
      SELECT
        COALESCE(SUM(m.monto_descuento), 0)::numeric AS total_descuento,
        COALESCE(SUM(m.cantidad * COALESCE(p.precio, 0)), 0)::numeric AS total_perdida_estimada,
        COUNT(*)::int AS total_registros
      FROM soda_master.mermas m
      LEFT JOIN soda_master.productos p ON p.id = m.producto_id
      WHERE m.created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
      WHERE m.created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
      WHERE m.created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
      WHERE cnp.created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
    const sql = getSql()
    const rows = await sql`
      SELECT
        COALESCE(SUM(monto), 0)::numeric AS total,
        COUNT(*)::int AS ordenes
      FROM soda_master.pagos
      WHERE created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
      WHERE o.created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
      WHERE o.created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
    const sql = getSql()
    const rows = await sql`
      SELECT
        metodo,
        COUNT(*)::int AS cantidad_transacciones,
        COALESCE(SUM(monto), 0)::numeric AS total
      FROM soda_master.pagos
      WHERE created_at::date BETWEEN ${desde}::date AND ${hasta}::date
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
    const sql = getSql()
    const rows = await sql`
      WITH dias AS (
        SELECT (CURRENT_DATE - i)::date AS fecha
        FROM generate_series(6, 0, -1) AS i
      )
      SELECT
        to_char(d.fecha, 'YYYY-MM-DD') AS fecha,
        COALESCE(SUM(p.monto), 0)::numeric AS total,
        COUNT(p.id)::int AS ordenes
      FROM dias d
      LEFT JOIN soda_master.pagos p ON p.created_at::date = d.fecha
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
