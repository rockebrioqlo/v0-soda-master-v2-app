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

  // ───────── Sesión 14.5a: F14, C11 y F16 ─────────
  console.log('\n[permisos] F14: GET /api/items-orden valida el orden_id')
  const malo = await api(mesero, 'GET', '/api/items-orden?orden_id=hola')
  check('orden_id que no es uuid → 400 con código (antes 500)', malo.status === 400 && malo.json.codigo === 'DATOS_INVALIDOS', malo)
  check('sin orden_id, con parámetro extra o con comillas → 400', (await api(mesero, 'GET', '/api/items-orden')).status === 400 && (await api(admin, 'GET', '/api/items-orden?orden_id=' + L.UUID_FALSO + '&x=1')).status === 400 && (await api(cocina, 'GET', "/api/items-orden?orden_id=1'%20OR%201=1")).status === 400)
  const vacio = await api(cajero, 'GET', '/api/items-orden?orden_id=' + L.UUID_FALSO)
  check('uuid válido de una orden inexistente → 200 con lista vacía', vacio.status === 200 && Array.isArray(vacio.json) && vacio.json.length === 0, vacio)
  check('sin sesión → 401', (await api(null, 'GET', '/api/items-orden?orden_id=' + L.UUID_FALSO)).status === 401)

  console.log('\n[permisos] C11 y F16: lista blanca de campos y bloqueo por PIN solo para el admin')
  const PERMITIDOS = new Set(['id', 'email', 'nombre', 'rol', 'roles_adicionales', 'activo', 'created_at', 'updated_at', 'intentosFallidos', 'bloqueadoHasta'])
  const lista = await api(admin, 'GET', '/api/usuarios')
  const idUsuario = (lista.json.find((u) => u.rol === 'mesero') || lista.json[0]).id
  const extras = new Set()
  const revisar = (u) => Object.keys(u || {}).forEach((k) => { if (!PERMITIDOS.has(k)) extras.add(k) })
  lista.json.forEach(revisar)
  const unoAdmin = await api(admin, 'GET', '/api/usuarios?id=' + idUsuario)
  const unoMesero = await api(mesero, 'GET', '/api/usuarios?id=' + idUsuario)
  const listaMesero = await api(mesero, 'GET', '/api/usuarios')
  revisar(unoAdmin.json); revisar(unoMesero.json); listaMesero.json.forEach(revisar)
  const miSesion = await api(cajero, 'GET', '/api/auth/sesion')
  revisar(miSesion.json)
  check('ningún usuario devuelto trae campos fuera de la lista blanca (lista, uno, mesero y /auth/sesion)', extras.size === 0 && lista.json.length > 0, [...extras])
  check('los campos que usa la app siguen presentes (id, nombre, email, rol, roles_adicionales, activo, bloqueo)', lista.json.every((u) => u.id && u.nombre && u.email && u.rol && Array.isArray(u.roles_adicionales) && typeof u.activo === 'boolean' && 'intentosFallidos' in u && 'bloqueadoHasta' in u), lista.json[0])
  check('GET /api/usuarios?id=: admin lo ve con sus contadores y el mesero con el bloqueo en 0 y sin fecha', unoAdmin.status === 200 && typeof unoAdmin.json.intentosFallidos === 'number' && unoMesero.status === 200 && unoMesero.json.intentosFallidos === 0 && unoMesero.json.bloqueadoHasta === null, [unoAdmin.status, unoMesero.status])
  check('la lista completa para el mesero también va con el bloqueo enmascarado', listaMesero.json.every((u) => u.intentosFallidos === 0 && u.bloqueadoHasta === null))
  check('?id= sin sesión → 401 (antes respondía sin llamar a requireSesion) y con un id inválido → 400', (await api(null, 'GET', '/api/usuarios?id=' + idUsuario)).status === 401 && (await api(admin, 'GET', '/api/usuarios?id=hola')).status === 400 && (await api(admin, 'GET', '/api/usuarios?id=' + L.UUID_FALSO)).status === 404)
}
