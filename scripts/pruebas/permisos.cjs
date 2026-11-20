/**
 * Módulo `permisos` (sesiones 3 y 4, F16): sesión obligatoria, roles por ruta, sesión única por
 * usuario, seed cerrado y búsqueda de fugas de PIN o hashes en las respuestas GET de cada rol.
 */
const L = require('./lib.cjs')
const { check, api } = L

exports.nombre = 'permisos'

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina } = ctx

  console.log('\n[permisos] sin sesión')
  const falsa = { cookie: 'sm_sesion=cookie-falsa.firma-falsa' }
  const cerradas = [['GET', '/api/ordenes'], ['GET', '/api/usuarios'], ['GET', '/api/mesas'], ['POST', '/api/pagos'], ['POST', '/api/ordenes'], ['POST', '/api/caja'], ['POST', '/api/ordenes/enviar'], ['PATCH', '/api/items-orden'], ['DELETE', '/api/ordenes']]
  const sin = []
  for (const [m, ruta] of cerradas) {
    const a = await api(null, m, ruta, m === 'GET' ? undefined : {})
    const b = await api(falsa, m, ruta, m === 'GET' ? undefined : {})
    if (a.status !== 401 || b.status !== 401) sin.push(`${m} ${ruta}: ${a.status}/${b.status}`)
  }
  check('rutas privadas: sin sesión y con cookie falsa → 401', sin.length === 0, sin)
  check('rutas públicas responden sin sesión (/api/hora y /api/menu-publico)', (await api(null, 'GET', '/api/hora')).status === 200 && (await api(null, 'GET', '/api/menu-publico')).status === 200)
  const seed = await api(null, 'POST', '/api/seed', {})
  check('POST /api/seed sin sesión no siembra (cerrado por PERMITIR_SEED)', seed.status !== 200, seed.status)

  console.log('\n[permisos] roles')
  check('cada rol se ve a sí mismo en /api/auth/sesion', (await Promise.all([admin, mesero, cajero, cocina].map((s) => api(s, 'GET', '/api/auth/sesion')))).every((r) => r.status === 200))
  check('cocina y mesero no abren caja (403)', (await api(cocina, 'POST', '/api/caja', { fondo_inicial: 1 })).status === 403 && (await api(mesero, 'POST', '/api/caja', { fondo_inicial: 1 })).status === 403)
  check('cocina y mesero no ven pagos (403)', (await api(cocina, 'GET', '/api/pagos')).status === 403 && (await api(mesero, 'GET', '/api/pagos')).status === 403)
  check('solo admin: crear usuarios y desbloquear (mesero y cajero 403)', (await api(mesero, 'POST', '/api/usuarios', {})).status === 403 && (await api(cajero, 'POST', '/api/usuarios', {})).status === 403 && (await api(mesero, 'POST', '/api/auth/desbloquear', {})).status === 403)
  check('cocina no crea órdenes ni ítems (403)', (await api(cocina, 'POST', '/api/ordenes', { mesa_id: ctx.mesa[2] })).status === 403 && (await api(cocina, 'POST', '/api/items-orden', {})).status === 403)
  check('mesero no registra pérdidas ni resuelve (403)', (await api(mesero, 'POST', '/api/perdidas', {})).status === 403 && (await api(mesero, 'POST', '/api/perdidas/resolver', {})).status === 403)
  check('mesero no ve reportes (403)', (await api(mesero, 'GET', '/api/reportes/ventas')).status === 403)

  console.log('\n[permisos] sesión única por usuario')
  const nueva = await L.iniciarSesion(ctx.usuarios.cocina)
  const vieja = await api(cocina, 'GET', '/api/mesas')
  const vigente = await api(nueva, 'GET', '/api/mesas')
  check('ingresar de nuevo con el mismo usuario cierra la sesión anterior (401) y la nueva sirve (200)', vieja.status === 401 && vigente.status === 200, [vieja.status, vigente.status])
  ctx.cocina.cookie = nueva.cookie

  console.log('\n[permisos] fugas de PIN y hashes en las respuestas GET (F16)')
  const rutas = ['/api/usuarios', '/api/mesas', '/api/productos', '/api/ordenes', '/api/ordenes?kds=true', '/api/configuracion', '/api/auth/sesion', '/api/auth/accesos-rapidos', '/api/caja', '/api/perdidas', '/api/permisos-descuento', '/api/permisos-especiales', '/api/inventario', '/api/recetas']
  const patron = /\$2[aby]\$\d{2}\$|pin_hash|pinHash|"pin"\s*:|"password"\s*:/
  const hallazgos = []
  let leidas = 0
  for (const [nombre, ses] of [['admin', admin], ['mesero', mesero], ['cajero', cajero], ['cocina', ctx.cocina]]) {
    for (const ruta of rutas) {
      const r = await api(ses, 'GET', ruta)
      if (r.status !== 200) continue
      leidas++
      if (patron.test(typeof r.json === 'string' ? r.json : JSON.stringify(r.json))) hallazgos.push(`${nombre} ${ruta}`)
    }
  }
  check(`ninguna de ${leidas} respuestas GET (4 roles) trae hashes ni campos de PIN`, hallazgos.length === 0 && leidas > 20, hallazgos)
}
