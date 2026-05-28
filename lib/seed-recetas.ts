import { neon } from '@neondatabase/serverless'
import { db } from '@/lib/db'

/** Crea insumos y recetas base de forma idempotente (no borra datos existentes). */
export async function runSeedRecetasBase(): Promise<{ insumos: number; recetas: number }> {
  const sql = neon(process.env.DATABASE_URL!)

  const INSUMOS: Array<{
    nombre: string
    categoria: string
    unidad: string
    stock: number
    min: number
  }> = [
    { nombre: 'Pan brioche', categoria: 'panaderia', unidad: 'unidad', stock: 200, min: 30 },
    { nombre: 'Carne 150g', categoria: 'proteina', unidad: 'unidad', stock: 200, min: 40 },
    { nombre: 'Queso Cheddar', categoria: 'lacteos', unidad: 'unidad', stock: 150, min: 25 },
    { nombre: 'Queso Mozzarella', categoria: 'lacteos', unidad: 'unidad', stock: 150, min: 25 },
    { nombre: 'Queso Azul', categoria: 'lacteos', unidad: 'unidad', stock: 80, min: 15 },
    { nombre: 'Queso Gouda', categoria: 'lacteos', unidad: 'unidad', stock: 80, min: 15 },
    { nombre: 'Tomate', categoria: 'vegetales', unidad: 'unidad', stock: 300, min: 50 },
    { nombre: 'Lechuga', categoria: 'vegetales', unidad: 'unidad', stock: 300, min: 50 },
    { nombre: 'Tocino', categoria: 'proteina', unidad: 'unidad', stock: 120, min: 20 },
    { nombre: 'Cebolla', categoria: 'vegetales', unidad: 'unidad', stock: 200, min: 30 },
    { nombre: 'Palta', categoria: 'vegetales', unidad: 'unidad', stock: 100, min: 20 },
    { nombre: 'Champiñones', categoria: 'vegetales', unidad: 'unidad', stock: 100, min: 20 },
    { nombre: 'Jalapeño', categoria: 'vegetales', unidad: 'unidad', stock: 80, min: 15 },
    { nombre: 'Cebolla Caramelizada', categoria: 'vegetales', unidad: 'unidad', stock: 80, min: 15 },
    { nombre: 'Mayonesa', categoria: 'salsas', unidad: 'porcion', stock: 500, min: 50 },
    { nombre: 'Ketchup', categoria: 'salsas', unidad: 'porcion', stock: 500, min: 50 },
    { nombre: 'Mostaza', categoria: 'salsas', unidad: 'porcion', stock: 500, min: 50 },
    { nombre: 'BBQ', categoria: 'salsas', unidad: 'porcion', stock: 300, min: 40 },
    { nombre: 'Salsa Picante', categoria: 'salsas', unidad: 'porcion', stock: 300, min: 40 },
    { nombre: 'Chimichurri', categoria: 'salsas', unidad: 'porcion', stock: 200, min: 30 },
    { nombre: 'Cheddar líquido', categoria: 'salsas', unidad: 'porcion', stock: 200, min: 30 },
    { nombre: 'Papa', categoria: 'vegetales', unidad: 'unidad', stock: 400, min: 60 },
    { nombre: 'Aceite fritura', categoria: 'insumos', unidad: 'litro', stock: 50, min: 10 },
    { nombre: 'Cerveza rubia 330ml', categoria: 'bebidas', unidad: 'unidad', stock: 120, min: 24 },
    { nombre: 'Cerveza negra 330ml', categoria: 'bebidas', unidad: 'unidad', stock: 80, min: 16 },
    { nombre: 'Cerveza IPA 330ml', categoria: 'bebidas', unidad: 'unidad', stock: 80, min: 16 },
    { nombre: 'Bebida cola 350ml', categoria: 'bebidas', unidad: 'unidad', stock: 100, min: 20 },
    { nombre: 'Agua 500ml', categoria: 'bebidas', unidad: 'unidad', stock: 100, min: 20 },
    { nombre: 'Jugo natural 400ml', categoria: 'bebidas', unidad: 'unidad', stock: 80, min: 16 },
    { nombre: 'Pisco 50ml', categoria: 'licores', unidad: 'unidad', stock: 200, min: 30 },
    { nombre: 'Gin 50ml', categoria: 'licores', unidad: 'unidad', stock: 150, min: 25 },
    { nombre: 'Ron 50ml', categoria: 'licores', unidad: 'unidad', stock: 150, min: 25 },
    { nombre: 'Vino tinto copa', categoria: 'licores', unidad: 'unidad', stock: 100, min: 20 },
    { nombre: 'Whisky 50ml', categoria: 'licores', unidad: 'unidad', stock: 80, min: 15 },
    { nombre: 'Helado vainilla', categoria: 'postres', unidad: 'unidad', stock: 60, min: 10 },
    { nombre: 'Brownie base', categoria: 'postres', unidad: 'unidad', stock: 60, min: 10 },
    { nombre: 'Cheesecake porción', categoria: 'postres', unidad: 'unidad', stock: 40, min: 8 },
    { nombre: 'Alitas crudas', categoria: 'proteina', unidad: 'unidad', stock: 150, min: 30 },
    { nombre: 'Aros cebolla congelados', categoria: 'congelados', unidad: 'unidad', stock: 100, min: 20 },
    { nombre: 'Nachos porción', categoria: 'congelados', unidad: 'unidad', stock: 80, min: 15 },
    { nombre: 'Tequeño unidad', categoria: 'congelados', unidad: 'unidad', stock: 120, min: 24 },
  ]

  const ingId: Record<string, string> = {}
  for (const ins of INSUMOS) {
    const existing = await sql`
      SELECT id FROM soda_master.ingredientes WHERE lower(trim(nombre)) = lower(trim(${ins.nombre})) LIMIT 1
    `
    if (existing[0]) {
      ingId[ins.nombre] = (existing[0] as { id: string }).id
    } else {
      const created = await db.crearIngrediente({
        nombre: ins.nombre,
        categoria: ins.categoria,
        unidad_medida: ins.unidad,
        stock_actual: ins.stock,
        stock_minimo: ins.min,
        costo_unitario: 0,
      })
      ingId[ins.nombre] = created.id
    }
  }

  const productos = await sql`
    SELECT p.id, p.nombre, c.nombre AS categoria
    FROM soda_master.productos p
    JOIN soda_master.categorias c ON c.id = p.categoria_id
    WHERE p.activo = true
  `

  let recetasCreadas = 0
  for (const prod of productos as { id: string; nombre: string; categoria: string }[]) {
    const cat = prod.categoria
    const nombre = prod.nombre
    const lineas: Array<{
      ingrediente_id: string
      cantidad: number
      opcional?: boolean
      extra?: boolean
      costo_adicional?: number
      nombre_display?: string
    }> = []

    const L = (
      n: string,
      qty = 1,
      opts?: Partial<{ opcional: boolean; extra: boolean; display: string; costo: number }>,
    ) => {
      const id = ingId[n]
      if (!id) return
      lineas.push({
        ingrediente_id: id,
        cantidad: qty,
        opcional: opts?.opcional,
        extra: opts?.extra,
        nombre_display: opts?.display || n,
        costo_adicional: opts?.costo ?? 0,
      })
    }

    if (cat === 'burgers') {
      L('Pan brioche')
      L('Carne 150g')
      L('Tomate', 1, { opcional: true, display: 'Tomate' })
      L('Lechuga', 1, { opcional: true, display: 'Lechuga' })
      L('Tocino', 1, { opcional: true, display: 'Tocino' })
      L('Cebolla', 1, { opcional: true, display: 'Cebolla' })
      L('Palta', 1, { opcional: true, display: 'Palta' })
      L('Champiñones', 1, { opcional: true, display: 'Champiñones' })
      L('Jalapeño', 1, { opcional: true, display: 'Jalapeño' })
      L('Cebolla Caramelizada', 1, { opcional: true, display: 'Cebolla Caramelizada' })
      L('Queso Cheddar', 1, { opcional: true, display: 'Queso Cheddar' })
      L('Queso Mozzarella', 1, { opcional: true, display: 'Queso Mozzarella' })
      L('Queso Azul', 1, { opcional: true, display: 'Queso Azul' })
      L('Queso Gouda', 1, { opcional: true, display: 'Queso Gouda' })
      L('Mayonesa', 1, { opcional: true, display: 'Mayonesa' })
      L('Ketchup', 1, { opcional: true, display: 'Ketchup' })
      L('Mostaza', 1, { opcional: true, display: 'Mostaza' })
      L('BBQ', 1, { opcional: true, display: 'BBQ' })
      L('Salsa Picante', 1, { opcional: true, display: 'Salsa Picante' })
      L('Chimichurri', 1, { opcional: true, display: 'Chimichurri' })
      L('Cheddar líquido', 1, { opcional: true, display: 'Cheddar' })
      await db.guardarRecetaProducto(prod.id, {
        nombre: `Receta ${nombre}`,
        modo_stock: 'receta',
        ingredientes: lineas,
      })
      recetasCreadas++
      continue
    }

    if (cat === 'acompañamientos') {
      if (nombre.toLowerCase().includes('papa')) L('Papa')
      else if (nombre.toLowerCase().includes('ensalada')) {
        L('Lechuga', 1, { opcional: true, display: 'Lechuga' })
        L('Tomate', 1, { opcional: true, display: 'Tomate' })
      }
      await db.guardarRecetaProducto(prod.id, {
        modo_stock: lineas.length ? 'receta' : 'producto',
        ingredientes: lineas,
      })
      recetasCreadas++
      continue
    }

    if (cat === 'entradas') {
      if (nombre.toLowerCase().includes('alita')) L('Alitas crudas', 8)
      if (nombre.toLowerCase().includes('aros')) L('Aros cebolla congelados', 6)
      if (nombre.toLowerCase().includes('nacho')) L('Nachos porción')
      if (nombre.toLowerCase().includes('teque')) L('Tequeño unidad', 6)
      await db.guardarRecetaProducto(prod.id, {
        modo_stock: lineas.length ? 'receta' : 'producto',
        ingredientes: lineas,
      })
      recetasCreadas++
      continue
    }

    if (cat === 'cervezas') {
      if (nombre.toLowerCase().includes('negra')) L('Cerveza negra 330ml')
      else if (nombre.toLowerCase().includes('ipa')) L('Cerveza IPA 330ml')
      else L('Cerveza rubia 330ml')
      await db.guardarRecetaProducto(prod.id, { modo_stock: 'receta', ingredientes: lineas })
      recetasCreadas++
      continue
    }

    if (cat === 'jugos_bebidas') {
      if (nombre.toLowerCase().includes('agua')) L('Agua 500ml')
      else if (nombre.toLowerCase().includes('cola') || nombre.toLowerCase().includes('coca'))
        L('Bebida cola 350ml')
      else L('Jugo natural 400ml')
      await db.guardarRecetaProducto(prod.id, { modo_stock: 'receta', ingredientes: lineas })
      recetasCreadas++
      continue
    }

    if (cat === 'tragos') {
      if (nombre.toLowerCase().includes('pisco')) L('Pisco 50ml')
      else if (nombre.toLowerCase().includes('gin')) L('Gin 50ml')
      else if (nombre.toLowerCase().includes('mojito') || nombre.toLowerCase().includes('ron'))
        L('Ron 50ml')
      else if (nombre.toLowerCase().includes('vino')) L('Vino tinto copa')
      else if (nombre.toLowerCase().includes('whisk')) L('Whisky 50ml')
      await db.guardarRecetaProducto(prod.id, {
        modo_stock: lineas.length ? 'receta' : 'producto',
        ingredientes: lineas,
      })
      recetasCreadas++
      continue
    }

    if (cat === 'postres') {
      if (nombre.toLowerCase().includes('brownie')) {
        L('Brownie base')
        L('Helado vainilla')
      } else if (nombre.toLowerCase().includes('cheesecake')) L('Cheesecake porción')
      else if (nombre.toLowerCase().includes('helado')) L('Helado vainilla', 3)
      await db.guardarRecetaProducto(prod.id, {
        modo_stock: lineas.length ? 'receta' : 'producto',
        ingredientes: lineas,
      })
      recetasCreadas++
    }
  }

  return { insumos: Object.keys(ingId).length, recetas: recetasCreadas }
}
