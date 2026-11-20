/**
 * Módulo `sondeo` (sesión 10, A4/B7): `GET /api/sondeo?secciones=...`, el sondeo agrupado de órdenes
 * del KDS + mesas + notificaciones que usa el sondeo central de la app.
 *
 * Sobre el 403: esta ruta NO tiene un caso 403 a propósito. Su acceso en lib/permisos-api.ts es
 * 'sesion' (cualquier usuario logueado), igual que los tres endpoints que agrupa; lo que cambia por
 * rol son las notificaciones, que salen del usuario y rol de la sesión (se prueba abajo).
 */
const L = require('./lib.cjs')
const { check, api } = L

exports.nombre = 'sondeo'

const stable = (x) => JSON.stringify(x)

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina } = ctx
  const roles = [['admin', admin], ['mesero', mesero], ['cajero', cajero], ['cocina', cocina]]

  console.log('\n[sondeo] sin sesión (401)')
  const falsa = { cookie: 'sm_sesion=cookie-falsa.firma-falsa' }
  const a = await api(null, 'GET', '/api/sondeo')
  const b = await api(falsa, 'GET', '/api/sondeo?secciones=notificaciones')
  check('sin cookie y con cookie falsa → 401', a.status === 401 && b.status === 401, [a.status, b.status])

  console.log('\n[sondeo] parámetros inválidos (400)')
  const invalidos = ['secciones=foo', 'secciones=ordenes,foo', 'secciones=', 'secciones=ordenes,,mesas', 'secciones=ORDENES', 'otro=1', 'secciones=mesas&otro=1']
  const malos = []
  for (const q of invalidos) {
    const r = await api(cocina, 'GET', '/api/sondeo?' + q)
    if (r.status !== 400 || r.json?.codigo !== 'SECCIONES_INVALIDAS') malos.push(`${q}: ${r.status} ${r.json?.codigo}`)
  }
  check(`${invalidos.length} variantes de parámetros inválidos → 400 con código SECCIONES_INVALIDAS`, malos.length === 0, malos)

  console.log('\n[sondeo] 200 por rol (acceso "sesion": no hay 403)')
  const fallosRol = []
  for (const [nombre, ses] of roles) {
    const r = await api(ses, 'GET', '/api/sondeo')
    const ok = r.status === 200 && Array.isArray(r.json?.ordenes) && Array.isArray(r.json?.mesas) && Array.isArray(r.json?.notificaciones)
    if (!ok) fallosRol.push(`${nombre}: ${r.status}`)
  }
  check('los 4 roles reciben 200 con ordenes, mesas y notificaciones (arreglos)', fallosRol.length === 0, fallosRol)

  console.log('\n[sondeo] solo las secciones pedidas')
  const soloN = await api(mesero, 'GET', '/api/sondeo?secciones=notificaciones')
  check('secciones=notificaciones → solo esa clave', soloN.status === 200 && eqKeys(soloN.json, ['notificaciones']), soloN.json && Object.keys(soloN.json))
  const om = await api(cocina, 'GET', '/api/sondeo?secciones=ordenes,mesas')
  check('secciones=ordenes,mesas → sin la clave notificaciones', om.status === 200 && eqKeys(om.json, ['ordenes', 'mesas']), om.json && Object.keys(om.json))
  const dup = await api(cocina, 'GET', '/api/sondeo?secciones=mesas,mesas')
  check('secciones repetidas se aceptan sin duplicar la clave', dup.status === 200 && eqKeys(dup.json, ['mesas']), dup.json && Object.keys(dup.json))

  console.log('\n[sondeo] coincide con los 3 endpoints que agrupa')
  for (const [nombre, ses] of [['cocina', cocina], ['mesero', mesero], ['admin', admin]]) {
    let iguales = false
    let detalle = null
    for (let intento = 0; intento < 3 && !iguales; intento++) {
      const [s, ord, mes, not] = [
        await api(ses, 'GET', '/api/sondeo'),
        await api(ses, 'GET', '/api/ordenes?kds=true'),
        await api(ses, 'GET', '/api/mesas'),
        await api(ses, 'GET', '/api/notificaciones?solo_pendientes=true'),
      ]
      iguales =
        s.status === 200 && ord.status === 200 && mes.status === 200 && not.status === 200 &&
        stable(s.json.ordenes) === stable(ord.json) &&
        stable(s.json.mesas) === stable(mes.json) &&
        stable(s.json.notificaciones) === stable(not.json)
      detalle = [s.status, ord.status, mes.status, not.status]
    }
    check(`${nombre}: ordenes = /api/ordenes?kds=true, mesas = /api/mesas, notificaciones = /api/notificaciones`, iguales, detalle)
  }

  console.log('\n[sondeo] las notificaciones salen del usuario y rol de la sesión')
  const mensaje = `${ctx.marca} sondeo`
  const crear = await api(admin, 'POST', '/api/notificaciones', { tipo: 'listo', mesa_nombre: 'Mesa de prueba', mensaje, destinatario_usuario_id: ctx.usuarios.cocina.id })
  check('se crea una notificación dirigida al usuario de cocina', crear.status === 200 || crear.status === 201, [crear.status, crear.json])
  const id = crear.json?.id
  const verCocina = await api(cocina, 'GET', '/api/sondeo?secciones=notificaciones')
  const verMesero = await api(mesero, 'GET', '/api/sondeo?secciones=notificaciones')
  const tiene = (r) => Array.isArray(r.json?.notificaciones) && r.json.notificaciones.some((n) => n.id === id)
  check('cocina la ve en el sondeo y el mesero no', !!id && tiene(verCocina) && !tiene(verMesero), [verCocina.status, verMesero.status])
  if (id) {
    const vista = await api(cocina, 'PATCH', `/api/notificaciones/${id}`, { vista: true })
    const despues = await api(cocina, 'GET', '/api/sondeo?secciones=notificaciones')
    check('al marcarla vista deja de salir en el sondeo', vista.status === 200 && !tiene(despues), [vista.status, despues.status])
  }

  console.log('\n[sondeo] un ritmo de sondeo del KDS no toca el límite')
  // 1 sondeo cada 6 s son ~10/min contra un tope de 240/min: se verifica que 12 seguidos pasan sin 429.
  const codigos = []
  for (let i = 0; i < 12; i++) codigos.push((await api(cocina, 'GET', '/api/sondeo')).status)
  check('12 sondeos seguidos → todos 200 (sin 429)', codigos.every((c) => c === 200), codigos)
}

function eqKeys(obj, esperadas) {
  if (!obj || typeof obj !== 'object') return false
  const k = Object.keys(obj).sort()
  return JSON.stringify(k) === JSON.stringify([...esperadas].sort())
}
