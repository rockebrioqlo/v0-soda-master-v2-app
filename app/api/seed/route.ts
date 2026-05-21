import { neon } from '@neondatabase/serverless'
import bcryptjs from 'bcryptjs'

export async function POST() {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    // ── Check if already seeded ──────────────────────────────────────────
    const existentes = await sql`SELECT COUNT(*) as count FROM soda_master.usuarios`
    if (Number((existentes[0] as any).count) > 0) {
      return Response.json({ message: 'Base de datos ya inicializada' }, { status: 200 })
    }

    // ── Usuarios ─────────────────────────────────────────────────────────
    const [h1234, h2222, h3333, h4444, h5555] = await Promise.all([
      bcryptjs.hash('1234', 10),
      bcryptjs.hash('2222', 10),
      bcryptjs.hash('3333', 10),
      bcryptjs.hash('4444', 10),
      bcryptjs.hash('5555', 10),
    ])

    await sql`
      INSERT INTO soda_master.usuarios (email, nombre, pin_hash, rol, activo) VALUES
      ('admin@soda.cl',   'Administrador',    ${h1234}, 'administrador', true),
      ('cajero@soda.cl',  'Carlos García',    ${h2222}, 'cajero',        true),
      ('mesero@soda.cl',  'María López',      ${h3333}, 'mesero',        true),
      ('cocina@soda.cl',  'Pedro Martínez',   ${h4444}, 'cocina',        true),
      ('bar@soda.cl',     'Laura Rodríguez',  ${h5555}, 'bar',           true)
    `

    // ── Mesas ────────────────────────────────────────────────────────────
    const mesasData = [
      // Interior (1-6)
      ...[1,2,3,4,5,6].map(n => ({ numero: n, area: 'Interior', capacidad: n <= 4 ? 4 : 6 })),
      // Patio (7-12)
      ...[7,8,9,10,11,12].map(n => ({ numero: n, area: 'Patio', capacidad: n <= 9 ? 4 : 6 })),
      // Barra (13-16)
      ...[13,14,15,16].map(n => ({ numero: n, area: 'Barra', capacidad: 2 })),
      // Terraza (17-20)
      ...[17,18,19,20].map(n => ({ numero: n, area: 'Terraza', capacidad: 8 })),
    ]
    for (const m of mesasData) {
      await sql`
        INSERT INTO soda_master.mesas (numero, area, capacidad, estado)
        VALUES (${m.numero}, ${m.area}, ${m.capacidad}, 'libre')
      `
    }

    // ── Categorías ───────────────────────────────────────────────────────
    const categoriaRows = await sql`
      INSERT INTO soda_master.categorias (nombre, descripcion) VALUES
      ('burgers',        'Hamburguesas artesanales'),
      ('entradas',       'Entradas y aperitivos'),
      ('acompañamientos','Acompañamientos y guarniciones'),
      ('postres',        'Postres y dulces'),
      ('cervezas',       'Cervezas nacionales e importadas'),
      ('jugos_bebidas',  'Jugos naturales y bebidas'),
      ('tragos',         'Cocteles y licores')
      RETURNING id, nombre
    `
    const catMap: Record<string, string> = {}
    for (const row of categoriaRows) {
      catMap[(row as any).nombre] = (row as any).id
    }

    // ── Productos ────────────────────────────────────────────────────────
    type ProdInput = { nombre: string; cat: string; precio: number; desc: string }
    const productos: ProdInput[] = [
      // Burgers
      { nombre: 'Burger Clásica',     cat: 'burgers', precio: 4500, desc: 'Carne vacuno, lechuga, tomate, mayonesa' },
      { nombre: 'Burger Doble',       cat: 'burgers', precio: 5500, desc: 'Doble carne, doble queso, tocino' },
      { nombre: 'Burger Vegetariana', cat: 'burgers', precio: 4200, desc: 'Medallón vegetal, palta, rúcula' },
      { nombre: 'Burger BBQ',         cat: 'burgers', precio: 5000, desc: 'Carne, tocino, cebolla caramelizada, BBQ' },
      { nombre: 'Burger Especial',    cat: 'burgers', precio: 5800, desc: 'Carne wagyu, queso azul, champiñones' },
      // Entradas
      { nombre: 'Nachos',              cat: 'entradas', precio: 2500, desc: 'Nachos con queso cheddar derretido' },
      { nombre: 'Fingers de Pollo',    cat: 'entradas', precio: 3000, desc: 'Tiras de pollo apanadas' },
      { nombre: 'Alitas de Pollo',     cat: 'entradas', precio: 3500, desc: 'Alitas BBQ o picantes' },
      { nombre: 'Aros de Cebolla',     cat: 'entradas', precio: 2800, desc: 'Aros de cebolla crujientes' },
      // Acompañamientos
      { nombre: 'Papas Fritas',   cat: 'acompañamientos', precio: 1500, desc: 'Papas fritas crujientes' },
      { nombre: 'Papas Rústicas', cat: 'acompañamientos', precio: 1800, desc: 'Papas con piel al horno' },
      { nombre: 'Onion Rings',    cat: 'acompañamientos', precio: 2000, desc: 'Aros de cebolla' },
      { nombre: 'Ensalada',       cat: 'acompañamientos', precio: 1800, desc: 'Lechuga, tomate, pepino' },
      // Postres
      { nombre: 'Brownie con Helado', cat: 'postres', precio: 2800, desc: 'Brownie tibio con helado de vainilla' },
      { nombre: 'Cheesecake',         cat: 'postres', precio: 2500, desc: 'Cheesecake de frutos del bosque' },
      { nombre: 'Helado Chocolate',   cat: 'postres', precio: 1500, desc: 'Helado artesanal de chocolate' },
      { nombre: 'Helado Vainilla',    cat: 'postres', precio: 1500, desc: 'Helado artesanal de vainilla' },
      // Cervezas
      { nombre: 'Cerveza Rubia',  cat: 'cervezas', precio: 2500, desc: 'Cerveza rubia 330ml' },
      { nombre: 'Cerveza Negra',  cat: 'cervezas', precio: 2800, desc: 'Cerveza negra 330ml' },
      { nombre: 'Cerveza IPA',    cat: 'cervezas', precio: 3000, desc: 'India Pale Ale 330ml' },
      { nombre: 'Cerveza Artesanal', cat: 'cervezas', precio: 3500, desc: 'Cerveza artesanal local' },
      // Jugos y bebidas
      { nombre: 'Coca Cola',          cat: 'jugos_bebidas', precio: 1500, desc: 'Coca Cola 350ml' },
      { nombre: 'Sprite',             cat: 'jugos_bebidas', precio: 1500, desc: 'Sprite 350ml' },
      { nombre: 'Fanta',              cat: 'jugos_bebidas', precio: 1500, desc: 'Fanta naranja 350ml' },
      { nombre: 'Jugo Natural Naranja', cat: 'jugos_bebidas', precio: 2000, desc: 'Jugo exprimido' },
      { nombre: 'Jugo Natural Piña',  cat: 'jugos_bebidas', precio: 2000, desc: 'Jugo natural de piña' },
      { nombre: 'Agua Mineral',       cat: 'jugos_bebidas', precio: 1000, desc: 'Agua mineral 500ml' },
      // Tragos
      { nombre: 'Pisco Sour',   cat: 'tragos', precio: 4500, desc: 'Pisco, limón, azúcar, clara de huevo' },
      { nombre: 'Vino Tinto',   cat: 'tragos', precio: 3500, desc: 'Copa de vino tinto 150ml' },
      { nombre: 'Vino Blanco',  cat: 'tragos', precio: 3500, desc: 'Copa de vino blanco 150ml' },
      { nombre: 'Whisky',       cat: 'tragos', precio: 5500, desc: 'Whisky en las rocas' },
      { nombre: 'Ron Cola',     cat: 'tragos', precio: 4000, desc: 'Ron con Coca Cola' },
      { nombre: 'Gin Tonic',    cat: 'tragos', precio: 4500, desc: 'Gin con agua tónica' },
    ]

    const insertedProds: { id: string; nombre: string }[] = []
    for (const p of productos) {
      const rows = await sql`
        INSERT INTO soda_master.productos (nombre, categoria_id, precio, descripcion, activo)
        VALUES (${p.nombre}, ${catMap[p.cat]}, ${p.precio}, ${p.desc}, true)
        RETURNING id, nombre
      `
      insertedProds.push({ id: (rows[0] as any).id, nombre: (rows[0] as any).nombre })
    }

    // ── Inventario ────────────────────────────────────────────────────────
    // Also seed raw ingredient inventory for kitchen tracking
    const inventarioItems = [
      { nombre: 'Pan Hamburguesa', stock: 1500, minimo: 200 },
      { nombre: 'Carne Vacuno (kg)', stock: 120, minimo: 20 },
      { nombre: 'Queso Cheddar (kg)', stock: 15, minimo: 3 },
      { nombre: 'Queso Mozzarella (kg)', stock: 10, minimo: 2 },
      { nombre: 'Queso Azul (kg)', stock: 5, minimo: 1 },
      { nombre: 'Tomate (kg)', stock: 30, minimo: 5 },
      { nombre: 'Lechuga (kg)', stock: 20, minimo: 3 },
      { nombre: 'Tocino (kg)', stock: 15, minimo: 3 },
      { nombre: 'Cebolla (kg)', stock: 25, minimo: 5 },
      { nombre: 'Palta (kg)', stock: 12, minimo: 2 },
      { nombre: 'Champiñones (kg)', stock: 8, minimo: 2 },
      { nombre: 'Jalapeño (kg)', stock: 5, minimo: 1 },
      { nombre: 'Salsa BBQ (lt)', stock: 20, minimo: 3 },
      { nombre: 'Mayonesa (kg)', stock: 15, minimo: 3 },
      { nombre: 'Mostaza (kg)', stock: 10, minimo: 2 },
      { nombre: 'Ketchup (kg)', stock: 15, minimo: 3 },
      { nombre: 'Papas Fritas (kg)', stock: 80, minimo: 15 },
      { nombre: 'Aceite Frita (lt)', stock: 40, minimo: 10 },
    ]

    // Insert as productos with a special 'inventario' category marker (we reuse acompañamientos)
    // and create inventory tracking entries linked to products
    for (const prod of insertedProds) {
      // Default stock by category assumptions
      const stock = prod.nombre.toLowerCase().includes('burger') ? 999
        : prod.nombre.toLowerCase().includes('cerveza') ? 100
        : prod.nombre.toLowerCase().includes('vino') ? 40
        : prod.nombre.toLowerCase().includes('whisky') ? 30
        : prod.nombre.toLowerCase().includes('agua') ? 300
        : prod.nombre.toLowerCase().includes('coca') || prod.nombre.toLowerCase().includes('sprite') || prod.nombre.toLowerCase().includes('fanta') ? 200
        : prod.nombre.toLowerCase().includes('jugo') ? 80
        : prod.nombre.toLowerCase().includes('pisco') || prod.nombre.toLowerCase().includes('ron') || prod.nombre.toLowerCase().includes('gin') ? 50
        : prod.nombre.toLowerCase().includes('postre') || prod.nombre.toLowerCase().includes('helado') || prod.nombre.toLowerCase().includes('brownie') || prod.nombre.toLowerCase().includes('cheesecake') ? 40
        : 100
      const minimo = stock > 100 ? 20 : stock > 50 ? 10 : 5
      await sql`
        INSERT INTO soda_master.inventario (producto_id, stock_actual, stock_minimo, unidad_medida)
        VALUES (${prod.id}, ${stock}, ${minimo}, 'unidad')
        ON CONFLICT (producto_id) DO NOTHING
      `
    }

    return Response.json({
      message: 'Base de datos inicializada correctamente',
      usuarios: 5,
      mesas: mesasData.length,
      categorias: Object.keys(catMap).length,
      productos: insertedProds.length,
    }, { status: 200 })
  } catch (error) {
    console.error('Seed error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// DELETE to force re-seed (admin only in production - here open for dev)
export async function DELETE() {
  try {
    const sql = neon(process.env.DATABASE_URL!)
    await sql`DELETE FROM soda_master.items_orden`
    await sql`DELETE FROM soda_master.pagos`
    await sql`DELETE FROM soda_master.ordenes`
    await sql`DELETE FROM soda_master.inventario`
    await sql`DELETE FROM soda_master.modificadores`
    await sql`DELETE FROM soda_master.productos`
    await sql`DELETE FROM soda_master.categorias`
    await sql`DELETE FROM soda_master.mesas`
    await sql`DELETE FROM soda_master.usuarios`
    return Response.json({ message: 'Base de datos limpiada. Llama POST /api/seed para reinicializar.' })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
