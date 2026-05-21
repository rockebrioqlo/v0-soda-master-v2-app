import bcryptjs from 'bcryptjs'
import { neon } from '@neondatabase/serverless'

async function seedDatabase() {
  const sql = neon(process.env.DATABASE_URL!)

  // Hash for PIN 1234
  const hash1234 = await bcryptjs.hash('1234', 10)
  const hash2222 = await bcryptjs.hash('2222', 10)
  const hash3333 = await bcryptjs.hash('3333', 10)
  const hash4444 = await bcryptjs.hash('4444', 10)
  const hash5555 = await bcryptjs.hash('5555', 10)

  // Insert usuarios
  await sql`
    INSERT INTO soda_master.usuarios (email, nombre, pin_hash, rol) VALUES
    ('admin@soda.cl', 'Administrador', ${hash1234}, 'admin'),
    ('carlos@soda.cl', 'Carlos García', ${hash2222}, 'cajero'),
    ('maria@soda.cl', 'María López', ${hash3333}, 'mesero'),
    ('pedro@soda.cl', 'Pedro Martínez', ${hash4444}, 'cocina'),
    ('laura@soda.cl', 'Laura Rodríguez', ${hash5555}, 'bar')
  `

  // Insert mesas
  for (let i = 1; i <= 20; i++) {
    const area = i <= 5 ? 'Patio' : i <= 10 ? 'Interior' : i <= 15 ? 'Barra' : 'Terraza'
    const capacidad = i <= 5 ? 4 : i <= 10 ? 6 : i <= 15 ? 2 : 8
    await sql`
      INSERT INTO soda_master.mesas (numero, area, capacidad, estado) VALUES
      (${i}, ${area}, ${capacidad}, 'disponible')
    `
  }

  // Insert categorías
  const categorias = ['Bebidas', 'Comidas', 'Postres', 'Snacks']
  for (const cat of categorias) {
    await sql`
      INSERT INTO soda_master.categorias (nombre, descripcion) VALUES
      (${cat}, 'Categoría de ' + ${cat})
    `
  }

  console.log('✓ Base de datos poblada correctamente')
}

seedDatabase().catch(console.error)
