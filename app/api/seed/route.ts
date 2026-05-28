import { neon } from '@neondatabase/serverless'
import bcryptjs from 'bcryptjs'
import { runSeedRecetasBase } from '@/lib/seed-recetas'

// Checks if DB already has data - if yes, returns status. If no, seeds it.
export async function POST() {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    const existing = await sql`SELECT COUNT(*) as count FROM soda_master.productos`
    if (Number((existing[0] as any).count) > 0) {
      return Response.json({ message: 'Base de datos ya inicializada', productos: Number((existing[0] as any).count) })
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
      ('admin@soda.cl',  'Administrador',    ${h1234}, 'admin',  true),
      ('cajero@soda.cl', 'Carlos García',    ${h2222}, 'cajero', true),
      ('mesero@soda.cl', 'María López',      ${h3333}, 'mesero', true),
      ('cocina@soda.cl', 'Pedro Martínez',   ${h4444}, 'cocina', true),
      ('bar@soda.cl',    'Laura Rodríguez',  ${h5555}, 'bar',    true)
      ON CONFLICT (email) DO NOTHING
    `

    // ── Mesas (solo si no hay) ────────────────────────────────────────────
    const mesasCount = await sql`SELECT COUNT(*) as c FROM soda_master.mesas`
    if (Number((mesasCount[0] as any).c) === 0) {
      const mesas = [
        ...[1,2,3,4,5,6].map(n => ({ n, area: 'Interior', cap: n <= 4 ? 4 : 6 })),
        ...[7,8,9,10,11,12].map(n => ({ n, area: 'Patio', cap: n <= 9 ? 4 : 6 })),
        ...[13,14,15,16].map(n => ({ n, area: 'Barra', cap: 2 })),
        ...[17,18,19,20].map(n => ({ n, area: 'Terraza', cap: 8 })),
      ]
      for (const m of mesas) {
        await sql`INSERT INTO soda_master.mesas (numero, area, capacidad, estado) VALUES (${m.n}, ${m.area}, ${m.cap}, 'libre')`
      }
    }

    // ── Categorías ───────────────────────────────────────────────────────
    const catRows = await sql`
      INSERT INTO soda_master.categorias (nombre, descripcion) VALUES
      ('burgers',         'Hamburguesas artesanales'),
      ('entradas',        'Entradas y aperitivos'),
      ('acompañamientos', 'Acompañamientos y guarniciones'),
      ('postres',         'Postres y dulces'),
      ('cervezas',        'Cervezas nacionales e importadas'),
      ('jugos_bebidas',   'Jugos naturales y bebidas'),
      ('tragos',          'Cocteles y licores')
      RETURNING id, nombre
    `
    const catMap: Record<string, string> = {}
    for (const r of catRows) catMap[(r as any).nombre] = (r as any).id

    // ── Productos ─────────────────────────────────────────────────────────
    type P = { nombre: string; cat: string; precio: number; desc: string }
    const prods: P[] = [
      { nombre: 'Burger Clásica',    cat: 'burgers', precio: 7500,  desc: 'Carne 150g, lechuga, tomate, cebolla' },
      { nombre: 'Burger BBQ',        cat: 'burgers', precio: 8500,  desc: 'Carne 150g, tocino, cebolla caramelizada, salsa BBQ' },
      { nombre: 'Burger Doble',      cat: 'burgers', precio: 10500, desc: 'Doble carne 300g, queso cheddar, lechuga, tomate' },
      { nombre: 'Burger Vegana',     cat: 'burgers', precio: 8000,  desc: 'Medallón de lentejas, palta, rúcula, tomate' },
      { nombre: 'Burger Pollo',      cat: 'burgers', precio: 7800,  desc: 'Pechuga grillada, lechuga, tomate, mayo' },
      { nombre: 'Burger Italiana',   cat: 'burgers', precio: 9000,  desc: 'Carne, mozzarella, tomate confitado, albahaca' },
      { nombre: 'Alitas BBQ',        cat: 'entradas', precio: 5500, desc: '8 alitas con salsa BBQ y ranch' },
      { nombre: 'Aros de Cebolla',   cat: 'entradas', precio: 3800, desc: 'Aros de cebolla apanados con dip' },
      { nombre: 'Nachos',            cat: 'entradas', precio: 4500, desc: 'Nachos con queso cheddar, jalapeño y guacamole' },
      { nombre: 'Tequeños',          cat: 'entradas', precio: 4000, desc: '6 tequeños de queso mozzarella' },
      { nombre: 'Papas Fritas',      cat: 'acompañamientos', precio: 2500, desc: 'Papas fritas crujientes con sal' },
      { nombre: 'Papas Wedges',      cat: 'acompañamientos', precio: 3000, desc: 'Papas en gajos con especias' },
      { nombre: 'Ensalada Verde',    cat: 'acompañamientos', precio: 2800, desc: 'Mix de lechugas, tomate cherry, pepino' },
      { nombre: 'Coleslaw',          cat: 'acompañamientos', precio: 2200, desc: 'Ensalada de repollo con mayo' },
      { nombre: 'Brownie',           cat: 'postres', precio: 3500, desc: 'Brownie de chocolate con helado de vainilla' },
      { nombre: 'Cheesecake',        cat: 'postres', precio: 4000, desc: 'Cheesecake de frambuesa con coulis' },
      { nombre: 'Helado 3 Bolas',    cat: 'postres', precio: 2800, desc: 'Elección de 3 sabores' },
      { nombre: 'Cerveza Rubia',     cat: 'cervezas', precio: 2500, desc: 'Cerveza lager nacional 330ml' },
      { nombre: 'Cerveza Negra',     cat: 'cervezas', precio: 3200, desc: 'Cerveza stout importada 330ml' },
      { nombre: 'Cerveza IPA',       cat: 'cervezas', precio: 3500, desc: 'Cerveza artesanal IPA 330ml' },
      { nombre: 'Cerveza Sin Alcohol', cat: 'cervezas', precio: 2800, desc: 'Cerveza sin alcohol 330ml' },
      { nombre: 'Coca Cola',         cat: 'jugos_bebidas', precio: 1800, desc: 'Coca Cola 350ml' },
      { nombre: 'Sprite',            cat: 'jugos_bebidas', precio: 1800, desc: 'Sprite 350ml' },
      { nombre: 'Agua Mineral',      cat: 'jugos_bebidas', precio: 1200, desc: 'Agua mineral sin gas 500ml' },
      { nombre: 'Agua con Gas',      cat: 'jugos_bebidas', precio: 1300, desc: 'Agua mineral con gas 500ml' },
      { nombre: 'Jugo Naranja',      cat: 'jugos_bebidas', precio: 2500, desc: 'Jugo natural de naranja 400ml' },
      { nombre: 'Jugo Piña',         cat: 'jugos_bebidas', precio: 2500, desc: 'Jugo natural de piña 400ml' },
      { nombre: 'Pisco Sour',        cat: 'tragos', precio: 4500, desc: 'Pisco, limón, azúcar, clara de huevo' },
      { nombre: 'Gin Tonic',         cat: 'tragos', precio: 4800, desc: 'Gin con agua tónica y lima' },
      { nombre: 'Mojito',            cat: 'tragos', precio: 4500, desc: 'Ron, menta, limón, azúcar, soda' },
      { nombre: 'Ron Cola',          cat: 'tragos', precio: 4000, desc: 'Ron con Coca Cola y limón' },
      { nombre: 'Vino Tinto Copa',   cat: 'tragos', precio: 3800, desc: 'Copa de vino tinto de la casa' },
      { nombre: 'Whisky',            cat: 'tragos', precio: 5500, desc: 'Whisky en las rocas' },
    ]

    const insertedProds: string[] = []
    for (const p of prods) {
      const rows = await sql`
        INSERT INTO soda_master.productos (nombre, categoria_id, precio, descripcion, activo)
        VALUES (${p.nombre}, ${catMap[p.cat]}, ${p.precio}, ${p.desc}, true)
        RETURNING id
      `
      insertedProds.push((rows[0] as any).id)
    }

    // ── Inventario ─────────────────────────────────────────────────────────
    for (const prodId of insertedProds) {
      await sql`
        INSERT INTO soda_master.inventario (producto_id, stock_actual, stock_minimo, unidad_medida)
        VALUES (${prodId}, 50, 10, 'unidad')
        ON CONFLICT (producto_id) DO NOTHING
      `
    }

    const recetasSeed = await runSeedRecetasBase()

    return Response.json({
      message: 'Base de datos inicializada correctamente',
      productos: insertedProds.length,
      insumos: recetasSeed.insumos,
      recetas: recetasSeed.recetas,
    })
  } catch (error) {
    console.error('[seed] error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// DELETE /api/seed — limpia todo para re-seed (solo desarrollo)
export async function DELETE() {
  try {
    const sql = neon(process.env.DATABASE_URL!)
    await sql`TRUNCATE soda_master.items_orden, soda_master.pagos, soda_master.ordenes, soda_master.inventario, soda_master.modificadores RESTART IDENTITY CASCADE`
    await sql`TRUNCATE soda_master.productos, soda_master.categorias RESTART IDENTITY CASCADE`
    await sql`TRUNCATE soda_master.mesas, soda_master.usuarios RESTART IDENTITY CASCADE`
    return Response.json({ message: 'BD limpiada. Llama POST /api/seed para reinicializar.' })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
