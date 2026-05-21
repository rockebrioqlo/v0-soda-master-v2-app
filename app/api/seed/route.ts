import { neon } from '@neondatabase/serverless'
import bcryptjs from 'bcryptjs'

export async function POST() {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    // Hash for PINs
    const hash1234 = await bcryptjs.hash('1234', 10)
    const hash2222 = await bcryptjs.hash('2222', 10)
    const hash3333 = await bcryptjs.hash('3333', 10)
    const hash4444 = await bcryptjs.hash('4444', 10)
    const hash5555 = await bcryptjs.hash('5555', 10)

    // Check if usuarios already exist
    const existentes = await sql`SELECT COUNT(*) as count FROM soda_master.usuarios`
    if ((existentes[0] as any).count > 0) {
      return Response.json({ message: 'Base de datos ya inicializada' }, { status: 200 })
    }

    // Insert usuarios
    await sql`
      INSERT INTO soda_master.usuarios (email, nombre, pin_hash, rol, activo) VALUES
      ('admin@soda.cl', 'Administrador', ${hash1234}, 'admin', true),
      ('carlos@soda.cl', 'Carlos García', ${hash2222}, 'cajero', true),
      ('maria@soda.cl', 'María López', ${hash3333}, 'mesero', true),
      ('pedro@soda.cl', 'Pedro Martínez', ${hash4444}, 'cocina', true),
      ('laura@soda.cl', 'Laura Rodríguez', ${hash5555}, 'bar', true)
    `

    // Insert mesas
    for (let i = 1; i <= 20; i++) {
      const area = i <= 5 ? 'Patio' : i <= 10 ? 'Interior' : i <= 15 ? 'Barra' : 'Terraza'
      const capacidad = i <= 5 ? 4 : i <= 10 ? 6 : i <= 15 ? 2 : 8
      const nombre = `Mesa ${i}`
      await sql`
        INSERT INTO soda_master.mesas (nombre, numero, area, capacidad, estado) VALUES
        (${nombre}, ${i}, ${area}, ${capacidad}, 'disponible')
      `
    }

    // Get categoria IDs
    const categorias = await sql`SELECT id FROM soda_master.categorias`

    // Insert sample productos
    const productos = [
      { nombre: 'Coca Cola', precio: 2500, categoria: 0, desc: 'Bebida gaseosa' },
      { nombre: 'Fanta Naranja', precio: 2500, categoria: 0, desc: 'Bebida gaseosa' },
      { nombre: 'Agua', precio: 1500, categoria: 0, desc: 'Agua mineral' },
      { nombre: 'Hamburguesa', precio: 8500, categoria: 1, desc: 'Hamburguesa con papas' },
      { nombre: 'Pizza', precio: 12000, categoria: 1, desc: 'Pizza familiar' },
      { nombre: 'Pastel de Chocolate', precio: 5000, categoria: 2, desc: 'Postre de chocolate' },
      { nombre: 'Papas Fritas', precio: 3500, categoria: 3, desc: 'Papas crujientes' },
    ]

    for (const prod of productos) {
      const catId = (categorias[prod.categoria] as any).id
      await sql`
        INSERT INTO soda_master.productos (nombre, categoria_id, precio, descripcion, activo) VALUES
        (${prod.nombre}, ${catId}, ${prod.precio}, ${prod.desc}, true)
      `
    }

    // Create inventario entries
    const allProductos = await sql`SELECT id FROM soda_master.productos`
    for (const prod of allProductos) {
      await sql`
        INSERT INTO soda_master.inventario (producto_id, stock_actual, stock_minimo) VALUES
        (${(prod as any).id}, 100, 10)
      `
    }

    return Response.json({ message: 'Base de datos inicializada correctamente' }, { status: 200 })
  } catch (error) {
    console.error('Seed error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
