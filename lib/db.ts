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

export const db = {
  // Usuarios
  async getUsuarios(): Promise<Usuario[]> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.usuarios WHERE activo = true`
    return result as Usuario[]
  },

  async getUsuarioById(id: string): Promise<Usuario | null> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.usuarios WHERE id = ${id}`
    return result[0] as Usuario | null
  },

  async verificarPIN(email: string, pin: string): Promise<Usuario | null> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.usuarios WHERE email = ${email} AND activo = true`
    if (!result[0]) return null
    
    const usuario = result[0] as any
    const esValido = await bcryptjs.compare(pin, usuario.pin_hash)
    
    return esValido ? (usuario as Usuario) : null
  },

  async crearUsuario(usuario: Omit<Usuario, 'id' | 'created_at' | 'updated_at'>) {
    const sql = getSql()
    const pinHash = await bcryptjs.hash(usuario.pin_hash, 10)
    const result = await sql`
      INSERT INTO soda_master.usuarios (email, nombre, pin_hash, rol, activo)
      VALUES (${usuario.email}, ${usuario.nombre}, ${pinHash}, ${usuario.rol}, true)
      RETURNING *
    `
    return result[0] as Usuario
  },

  async actualizarUsuario(id: string, updates: Partial<Usuario>) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.usuarios 
      SET nombre = COALESCE(${updates.nombre}, nombre),
          rol = COALESCE(${updates.rol}, rol),
          activo = COALESCE(${updates.activo}, activo),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] as Usuario
  },

  // Mesas
  async getMesas(): Promise<Mesa[]> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.mesas ORDER BY numero`
    return result as Mesa[]
  },

  async getMesaById(id: string): Promise<Mesa | null> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.mesas WHERE id = ${id}`
    return result[0] as Mesa | null
  },

  async actualizarEstadoMesa(id: string, estado: string) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.mesas 
      SET estado = ${estado}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] as Mesa
  },

  async actualizarMesa(id: string, updates: Partial<Mesa>) {
    const sql = getSql()
    const result = await sql`
      UPDATE soda_master.mesas 
      SET estado = COALESCE(${updates.estado}, estado),
          capacidad = COALESCE(${updates.capacidad}, capacidad),
          area = COALESCE(${updates.area}, area),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    return result[0] as Mesa
  },

  // Productos
  async getProductos(): Promise<Producto[]> {
    const sql = getSql()
    const result = await sql`SELECT * FROM soda_master.productos WHERE activo = true ORDER BY nombre`
    return result as Producto[]
  },

  async getProductosPorCategoria(categoriaId: string): Promise<Producto[]> {
    const sql = getSql()
    const result = await sql`
      SELECT * FROM soda_master.productos 
      WHERE categoria_id = ${categoriaId} AND activo = true
      ORDER BY nombre
    `
    return result as Producto[]
  },

  async crearProducto(producto: Omit<Producto, 'id' | 'created_at' | 'updated_at'>) {
    const sql = getSql()
    const result = await sql`
      INSERT INTO soda_master.productos (nombre, categoria_id, precio, descripcion, imagen_url, activo)
      VALUES (${producto.nombre}, ${producto.categoria_id}, ${producto.precio}, ${producto.descripcion}, ${producto.imagen_url}, true)
      RETURNING *
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
             json_agg(json_build_object(
               'id', i.id,
               'producto_id', i.producto_id,
               'cantidad', i.cantidad,
               'precio_unitario', i.precio_unitario,
               'modificadores', i.modificadores,
               'notas_especiales', i.notas_especiales,
               'estado_item', i.estado_item
             )) as items
      FROM soda_master.ordenes o
      LEFT JOIN soda_master.items_orden i ON o.id = i.orden_id
      WHERE o.enviado_a_cocina = true AND o.estado IN ('en_cocina', 'listo')
      GROUP BY o.id
      ORDER BY o.hora_envio ASC
    `
    return result as Orden[]
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
  async crearPago(pago: Omit<Pago, 'id' | 'created_at'>) {
    const sql = getSql()
    const result = await sql`
      INSERT INTO soda_master.pagos (orden_id, metodo, monto, propina, vuelto, referencia, aprobado)
      VALUES (${pago.orden_id}, ${pago.metodo}, ${pago.monto}, ${pago.propina}, ${pago.vuelto}, ${pago.referencia}, ${pago.aprobado})
      RETURNING *
    `
    return result[0] as Pago
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
}
