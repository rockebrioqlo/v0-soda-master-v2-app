import { neon } from '@neondatabase/serverless'
import { db } from '@/lib/db'
import { runSeedRecetasBase } from '@/lib/seed-recetas'

/**
 * POST /api/seed-demo
 *
 * Carga datos de demostración coherentes con lo que ya existe (usuarios
 * iniciales: Carlos García, María López, Pedro Martínez, Laura Rodríguez).
 * Es idempotente: si los registros ya existen no se duplican.
 *
 * Crea:
 *   - Proveedores (carnicería, panadería, bebidas, etc.)
 *   - Insumos base (vía runSeedRecetasBase, sin duplicar)
 *   - Insumos del negocio (servilletas, jabón, bolsas, papel térmico)
 *   - Activos / máquinas con depreciación
 *   - Empleados vinculados a los usuarios iniciales
 *   - Compras recientes (factura/boleta) que actualizan stock y costo promedio
 *   - Gastos operativos: arriendo, servicios, sueldos del mes
 */
export async function POST() {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    // ── 1) Asegura insumos + recetas base ─────────────────────────────────
    const recetasResult = await runSeedRecetasBase()

    // ── 2) Insumos del negocio (no comida) ────────────────────────────────
    const INSUMOS_NEGOCIO = [
      { nombre: 'Servilletas pack', categoria: 'limpieza', unidad: 'pack', stock: 30, min: 5, costo: 1500 },
      { nombre: 'Bolsas delivery', categoria: 'empaque', unidad: 'unidad', stock: 500, min: 100, costo: 80 },
      { nombre: 'Vaso desechable 350ml', categoria: 'empaque', unidad: 'unidad', stock: 400, min: 100, costo: 60 },
      { nombre: 'Tapa vaso desechable', categoria: 'empaque', unidad: 'unidad', stock: 400, min: 100, costo: 30 },
      { nombre: 'Caja burger', categoria: 'empaque', unidad: 'unidad', stock: 300, min: 60, costo: 250 },
      { nombre: 'Papel térmico 80mm', categoria: 'papeleria', unidad: 'rollo', stock: 12, min: 3, costo: 900 },
      { nombre: 'Lavavajilla', categoria: 'limpieza', unidad: 'litro', stock: 8, min: 2, costo: 3500 },
      { nombre: 'Cloro', categoria: 'limpieza', unidad: 'litro', stock: 6, min: 2, costo: 2200 },
      { nombre: 'Bolsa basura', categoria: 'limpieza', unidad: 'unidad', stock: 100, min: 30, costo: 200 },
    ]

    for (const ins of INSUMOS_NEGOCIO) {
      const existing = await sql`
        SELECT id FROM soda_master.ingredientes
        WHERE lower(trim(nombre)) = lower(trim(${ins.nombre})) LIMIT 1
      `
      if (existing[0]) continue
      await db.crearIngrediente({
        nombre: ins.nombre,
        categoria: ins.categoria,
        unidad_medida: ins.unidad,
        stock_actual: ins.stock,
        stock_minimo: ins.min,
        costo_unitario: ins.costo,
        tipo: 'negocio',
      })
    }

    // ── 3) Proveedores ─────────────────────────────────────────────────────
    const PROVEEDORES = [
      { nombre: 'Carnicería El Buen Corte', rut: '76.123.456-7', contacto: 'Don Manuel', telefono: '+56 9 1111 1111', email: 'ventas@elbuencorte.cl' },
      { nombre: 'Panadería La Esquina', rut: '76.222.333-4', contacto: 'Sra. Pilar', telefono: '+56 9 2222 2222', email: 'pedidos@laesquina.cl' },
      { nombre: 'Distribuidora Andina', rut: '90.123.000-9', contacto: 'Ejecutivo Andina', telefono: '+56 2 2333 3333', email: 'contacto@andina.cl' },
      { nombre: 'Verduras del Mercado', rut: '11.222.333-4', contacto: 'Carlos del Mercado', telefono: '+56 9 4444 4444', email: '' },
      { nombre: 'Lácteos Premium', rut: '76.555.666-7', contacto: 'María Ríos', telefono: '+56 9 5555 5555', email: 'maria@lacteospremium.cl' },
      { nombre: 'Importadora de Licores', rut: '76.777.888-9', contacto: 'Ricardo Vargas', telefono: '+56 9 6666 6666', email: 'ricardo@licores.cl' },
      { nombre: 'Insumos Profesionales', rut: '76.888.999-0', contacto: 'Ventas', telefono: '+56 2 2444 4444', email: 'ventas@insumospro.cl' },
    ]
    const provId: Record<string, string> = {}
    for (const p of PROVEEDORES) {
      const existing = await sql`
        SELECT id FROM soda_master.proveedores
        WHERE lower(trim(nombre)) = lower(trim(${p.nombre})) LIMIT 1
      `
      if (existing[0]) {
        provId[p.nombre] = (existing[0] as { id: string }).id
        continue
      }
      const created = await db.crearProveedor(p)
      provId[p.nombre] = (created as { id: string }).id
    }

    // ── 4) Empleados (coherentes con usuarios iniciales) ─────────────────
    const usuarios = await sql`
      SELECT id, email, nombre, rol FROM soda_master.usuarios
    `
    const userByEmail: Record<string, { id: string; email: string; nombre: string; rol: string }> = {}
    for (const u of usuarios as { id: string; email: string; nombre: string; rol: string }[]) {
      userByEmail[u.email] = u
    }

    const EMPLEADOS_DEMO: Array<{
      email: string
      cargo: string
      sueldo: number
      periodicidad: 'mensual' | 'quincenal' | 'semanal' | 'diario' | 'por_hora'
      documento: string
      telefono: string
      fecha_ingreso: string
    }> = [
      { email: 'cajero@soda.cl',  cargo: 'Cajero',     sueldo: 650_000, periodicidad: 'mensual', documento: '15.111.222-3', telefono: '+56 9 7000 0001', fecha_ingreso: '2025-01-15' },
      { email: 'mesero@soda.cl',  cargo: 'Mesera',     sueldo: 580_000, periodicidad: 'mensual', documento: '16.222.333-4', telefono: '+56 9 7000 0002', fecha_ingreso: '2025-02-10' },
      { email: 'cocina@soda.cl',  cargo: 'Cocinero',   sueldo: 780_000, periodicidad: 'mensual', documento: '14.333.444-5', telefono: '+56 9 7000 0003', fecha_ingreso: '2024-11-05' },
      { email: 'bar@soda.cl',     cargo: 'Bartender',  sueldo: 720_000, periodicidad: 'mensual', documento: '17.444.555-6', telefono: '+56 9 7000 0004', fecha_ingreso: '2025-03-01' },
      // Empleado adicional (no es usuario del sistema)
    ]

    const empleadoId: Record<string, string> = {}
    for (const e of EMPLEADOS_DEMO) {
      const usr = userByEmail[e.email]
      if (!usr) continue
      const existing = await sql`
        SELECT id FROM soda_master.empleados
        WHERE usuario_id = ${usr.id}::uuid OR lower(trim(nombre)) = lower(trim(${usr.nombre}))
        LIMIT 1
      `
      if (existing[0]) {
        empleadoId[usr.nombre] = (existing[0] as { id: string }).id
        continue
      }
      const created = await db.crearEmpleado({
        nombre: usr.nombre,
        cargo: e.cargo,
        documento: e.documento,
        telefono: e.telefono,
        email: usr.email,
        sueldo_base: e.sueldo,
        periodicidad: e.periodicidad,
        fecha_ingreso: e.fecha_ingreso,
        usuario_id: usr.id,
        notas: `Demo seed — rol ${usr.rol}`,
      })
      empleadoId[usr.nombre] = (created as { id: string }).id
    }

    // Empleado adicional sin cuenta de usuario
    {
      const nombre = 'Ana Soto'
      const existing = await sql`
        SELECT id FROM soda_master.empleados WHERE lower(trim(nombre)) = lower(trim(${nombre})) LIMIT 1
      `
      if (!existing[0]) {
        const c = await db.crearEmpleado({
          nombre,
          cargo: 'Ayudante de cocina',
          documento: '18.555.666-7',
          telefono: '+56 9 7000 0005',
          email: '',
          sueldo_base: 520_000,
          periodicidad: 'mensual',
          fecha_ingreso: '2025-04-20',
          notas: 'Demo seed — sin cuenta de usuario',
        })
        empleadoId[nombre] = (c as { id: string }).id
      } else {
        empleadoId[nombre] = (existing[0] as { id: string }).id
      }
    }

    // ── 5) Activos (máquinas y mobiliario) ───────────────────────────────
    const ACTIVOS = [
      { nombre: 'Plancha industrial 2 quemadores', categoria: 'maquinaria', costo: 850_000, vida: 96, residual: 50_000, fecha: '2024-06-15', ubicacion: 'Cocina', serie: 'PL-2024-001', proveedor: 'Insumos Profesionales' },
      { nombre: 'Freidora doble 10L', categoria: 'maquinaria', costo: 620_000, vida: 84, residual: 30_000, fecha: '2024-07-10', ubicacion: 'Cocina', serie: 'FR-2024-014', proveedor: 'Insumos Profesionales' },
      { nombre: 'Refrigerador industrial 600L', categoria: 'maquinaria', costo: 1_350_000, vida: 120, residual: 100_000, fecha: '2024-05-20', ubicacion: 'Cocina', serie: 'RF-2024-088', proveedor: 'Insumos Profesionales' },
      { nombre: 'Congelador horizontal 400L', categoria: 'maquinaria', costo: 780_000, vida: 120, residual: 60_000, fecha: '2024-09-01', ubicacion: 'Bodega', serie: 'CG-2024-012', proveedor: 'Insumos Profesionales' },
      { nombre: 'Cafetera espresso 2 grupos', categoria: 'maquinaria', costo: 1_120_000, vida: 96, residual: 80_000, fecha: '2024-08-12', ubicacion: 'Bar', serie: 'CE-2024-005', proveedor: 'Insumos Profesionales' },
      { nombre: 'Tablet POS Lenovo', categoria: 'tecnologia', costo: 320_000, vida: 36, residual: 20_000, fecha: '2025-01-10', ubicacion: 'Caja', serie: 'TB-2025-001', proveedor: 'Insumos Profesionales' },
      { nombre: 'Impresora térmica 80mm Cocina', categoria: 'tecnologia', costo: 95_000, vida: 60, residual: 0, fecha: '2025-01-10', ubicacion: 'Cocina', serie: 'IT-2025-002', proveedor: 'Insumos Profesionales' },
      { nombre: 'Impresora térmica 80mm Bar', categoria: 'tecnologia', costo: 95_000, vida: 60, residual: 0, fecha: '2025-01-10', ubicacion: 'Bar', serie: 'IT-2025-003', proveedor: 'Insumos Profesionales' },
      { nombre: 'Mesas y sillas (20)', categoria: 'mobiliario', costo: 1_800_000, vida: 60, residual: 100_000, fecha: '2024-06-01', ubicacion: 'Salón', serie: 'MOB-2024-001', proveedor: 'Insumos Profesionales' },
      { nombre: 'Aire acondicionado split 24K BTU', categoria: 'maquinaria', costo: 760_000, vida: 120, residual: 50_000, fecha: '2024-10-15', ubicacion: 'Salón', serie: 'AC-2024-007', proveedor: 'Insumos Profesionales' },
    ]

    const activoId: Record<string, string> = {}
    for (const a of ACTIVOS) {
      const existing = await sql`
        SELECT id FROM soda_master.activos WHERE lower(trim(nombre)) = lower(trim(${a.nombre})) LIMIT 1
      `
      if (existing[0]) {
        activoId[a.nombre] = (existing[0] as { id: string }).id
        continue
      }
      const created = await db.crearActivo({
        nombre: a.nombre,
        categoria: a.categoria,
        costo_compra: a.costo,
        vida_util_meses: a.vida,
        valor_residual: a.residual,
        fecha_compra: a.fecha,
        ubicacion: a.ubicacion,
        numero_serie: a.serie,
        proveedor_id: provId[a.proveedor] || null,
        notas: 'Demo seed',
      })
      activoId[a.nombre] = (created as { id: string }).id
    }

    // ── 6) Compras recientes (sólo si no hay compras todavía) ────────────
    const comprasCount = await sql`SELECT COUNT(*)::INT AS c FROM soda_master.compras`
    let comprasCreadas = 0
    if (Number((comprasCount[0] as any).c) === 0) {
      const findIng = async (nombre: string) => {
        const r = await sql`
          SELECT id FROM soda_master.ingredientes
          WHERE lower(trim(nombre)) = lower(trim(${nombre})) LIMIT 1
        `
        return (r[0] as { id: string } | undefined)?.id || null
      }
      const buildItems = async (lista: Array<[string, number, number]>) => {
        const out: { ingrediente_id: string; cantidad: number; precio_unitario: number }[] = []
        for (const [nombre, cantidad, precio] of lista) {
          const id = await findIng(nombre)
          if (id) out.push({ ingrediente_id: id, cantidad, precio_unitario: precio })
        }
        return out
      }

      const today = new Date()
      const isoDate = (d: Date) => d.toISOString().slice(0, 10)
      const minusDays = (n: number) => {
        const d = new Date(today)
        d.setDate(d.getDate() - n)
        return isoDate(d)
      }

      const compraSpecs: Array<{
        proveedor: string
        tipo: 'boleta' | 'factura'
        numero: string
        fecha: string
        items: Array<[string, number, number]>
        notas?: string
      }> = [
        {
          proveedor: 'Carnicería El Buen Corte',
          tipo: 'factura',
          numero: 'F-001234',
          fecha: minusDays(7),
          items: [
            ['Carne 150g', 60, 2200],
            ['Tocino', 30, 1800],
            ['Alitas crudas', 40, 1500],
          ],
        },
        {
          proveedor: 'Panadería La Esquina',
          tipo: 'boleta',
          numero: 'B-455',
          fecha: minusDays(5),
          items: [
            ['Pan brioche', 120, 450],
          ],
        },
        {
          proveedor: 'Verduras del Mercado',
          tipo: 'boleta',
          numero: 'B-998',
          fecha: minusDays(3),
          items: [
            ['Tomate', 80, 350],
            ['Lechuga', 60, 400],
            ['Cebolla', 50, 280],
            ['Palta', 30, 950],
            ['Papa', 100, 320],
            ['Champiñones', 25, 1500],
          ],
        },
        {
          proveedor: 'Lácteos Premium',
          tipo: 'factura',
          numero: 'F-7821',
          fecha: minusDays(4),
          items: [
            ['Queso Cheddar', 80, 750],
            ['Queso Mozzarella', 60, 850],
            ['Queso Azul', 30, 1500],
            ['Queso Gouda', 30, 1200],
          ],
        },
        {
          proveedor: 'Distribuidora Andina',
          tipo: 'factura',
          numero: 'F-2025-9981',
          fecha: minusDays(2),
          items: [
            ['Cerveza rubia 330ml', 96, 850],
            ['Cerveza negra 330ml', 48, 1200],
            ['Cerveza IPA 330ml', 48, 1400],
            ['Bebida cola 350ml', 96, 550],
            ['Agua 500ml', 60, 380],
          ],
        },
        {
          proveedor: 'Importadora de Licores',
          tipo: 'factura',
          numero: 'F-LIC-447',
          fecha: minusDays(10),
          items: [
            ['Pisco 50ml', 60, 950],
            ['Gin 50ml', 40, 1400],
            ['Ron 50ml', 40, 1200],
            ['Vino tinto copa', 30, 1800],
            ['Whisky 50ml', 25, 2200],
          ],
        },
        {
          proveedor: 'Insumos Profesionales',
          tipo: 'boleta',
          numero: 'B-INS-3320',
          fecha: minusDays(1),
          items: [
            ['Servilletas pack', 20, 1300],
            ['Bolsas delivery', 500, 75],
            ['Caja burger', 200, 220],
            ['Papel térmico 80mm', 8, 800],
            ['Lavavajilla', 5, 3200],
          ],
        },
      ]

      const adminUser = userByEmail['admin@soda.cl']
      for (const c of compraSpecs) {
        const items = await buildItems(c.items)
        if (items.length === 0) continue
        await db.crearCompra({
          proveedor_id: provId[c.proveedor] || null,
          tipo_documento: c.tipo,
          numero_documento: c.numero,
          fecha: c.fecha,
          impuesto: 0,
          notas: 'Demo seed — compra de prueba',
          usuario_id: adminUser?.id || null,
          items,
        })
        comprasCreadas++
      }
    }

    // ── 7) Gastos del mes (sueldos, servicios, arriendo) ────────────────
    const gastosCount = await sql`SELECT COUNT(*)::INT AS c FROM soda_master.gastos`
    let gastosCreados = 0
    if (Number((gastosCount[0] as any).c) === 0) {
      const today = new Date()
      const isoDate = (d: Date) => d.toISOString().slice(0, 10)
      const minusDays = (n: number) => {
        const d = new Date(today)
        d.setDate(d.getDate() - n)
        return isoDate(d)
      }

      const arriendoProveedor = await db.crearProveedor({
        nombre: 'Inmobiliaria Centro',
        rut: '76.999.000-1',
        contacto: 'Administración',
        telefono: '+56 2 2999 9999',
      }).catch(async () => {
        const r = await sql`SELECT id FROM soda_master.proveedores WHERE nombre = 'Inmobiliaria Centro' LIMIT 1`
        return (r[0] as { id: string }) || null
      })
      provId['Inmobiliaria Centro'] = (arriendoProveedor as { id: string })?.id || provId['Inmobiliaria Centro']

      const gastoSpecs: Array<{
        fecha: string
        tipo: 'operativo' | 'sueldo' | 'servicio' | 'impuesto'
        categoria: string
        descripcion: string
        monto: number
        recurrente?: boolean
        periodicidad?: string
        proveedor?: string
        empleado?: string
        activo?: string
      }> = [
        { fecha: minusDays(28), tipo: 'operativo', categoria: 'arriendo', descripcion: 'Arriendo local mes anterior', monto: 1_200_000, recurrente: true, periodicidad: 'mensual', proveedor: 'Inmobiliaria Centro' },
        { fecha: minusDays(25), tipo: 'servicio', categoria: 'electricidad', descripcion: 'Cuenta de luz mes anterior', monto: 185_000, recurrente: true, periodicidad: 'mensual' },
        { fecha: minusDays(25), tipo: 'servicio', categoria: 'agua', descripcion: 'Cuenta de agua', monto: 62_000, recurrente: true, periodicidad: 'mensual' },
        { fecha: minusDays(20), tipo: 'servicio', categoria: 'internet', descripcion: 'Internet fibra 600 Mbps', monto: 38_990, recurrente: true, periodicidad: 'mensual' },
        { fecha: minusDays(15), tipo: 'servicio', categoria: 'gas', descripcion: 'Recarga balón gas cocina', monto: 28_500 },
        { fecha: minusDays(5),  tipo: 'sueldo',   categoria: 'sueldos', descripcion: 'Sueldo mes anterior — Carlos García',   monto: 650_000, empleado: 'Carlos García' },
        { fecha: minusDays(5),  tipo: 'sueldo',   categoria: 'sueldos', descripcion: 'Sueldo mes anterior — María López',     monto: 580_000, empleado: 'María López' },
        { fecha: minusDays(5),  tipo: 'sueldo',   categoria: 'sueldos', descripcion: 'Sueldo mes anterior — Pedro Martínez',  monto: 780_000, empleado: 'Pedro Martínez' },
        { fecha: minusDays(5),  tipo: 'sueldo',   categoria: 'sueldos', descripcion: 'Sueldo mes anterior — Laura Rodríguez', monto: 720_000, empleado: 'Laura Rodríguez' },
        { fecha: minusDays(5),  tipo: 'sueldo',   categoria: 'sueldos', descripcion: 'Sueldo mes anterior — Ana Soto',         monto: 520_000, empleado: 'Ana Soto' },
        { fecha: minusDays(2),  tipo: 'operativo', categoria: 'mantenimiento', descripcion: 'Mantención freidora doble', monto: 45_000, activo: 'Freidora doble 10L' },
        { fecha: minusDays(10), tipo: 'impuesto', categoria: 'patente', descripcion: 'Patente municipal trimestre', monto: 95_000 },
      ]

      for (const g of gastoSpecs) {
        await db.crearGasto({
          fecha: g.fecha,
          tipo: g.tipo,
          categoria: g.categoria,
          descripcion: g.descripcion,
          monto: g.monto,
          recurrente: g.recurrente || false,
          periodicidad: g.periodicidad || undefined,
          proveedor_id: g.proveedor ? provId[g.proveedor] || null : null,
          empleado_id: g.empleado ? empleadoId[g.empleado] || null : null,
          activo_id: g.activo ? activoId[g.activo] || null : null,
          usuario_id: userByEmail['admin@soda.cl']?.id || null,
          notas: 'Demo seed',
        })
        gastosCreados++
      }
    }

    return Response.json({
      message: 'Datos de demostración cargados',
      recetas: recetasResult,
      insumos_negocio: INSUMOS_NEGOCIO.length,
      proveedores: Object.keys(provId).length,
      empleados: Object.keys(empleadoId).length,
      activos: Object.keys(activoId).length,
      compras_creadas: comprasCreadas,
      gastos_creados: gastosCreados,
    })
  } catch (error) {
    console.error('[seed-demo] error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
