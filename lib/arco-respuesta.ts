/**
 * Texto sugerido de respuesta al titular (sesión 18, K1). Módulo puro. **BORRADOR para revisión legal**: lo compone el
 * sistema a partir del resultado guardado (solo nombres de campo) y el administrador lo copia o lo ajusta; no se envía solo.
 * No lleva ningún valor personal. Sin imports en tiempo de ejecución (la prueba lo carga con el type stripping de Node).
 */

/**
 * Lo que se conserva por obligación y su fundamento (sin esto la respuesta al titular no puede decir qué se guardó y por qué).
 * Los identificadores van en `solicitudes_arco.resultado` y en `auditoria_admin.detalles` (solo estos nombres, nunca valores).
 * Los fundamentos están en BORRADOR para revisión legal (ver `INVENTARIO_DATOS_PERSONALES.md`, secciones 1 y 4).
 */
export const RETENCION: Record<string, { texto: string; fundamento: string }> = {
  ventas_pagos_y_caja: {
    texto: 'los registros de ventas, pagos, caja y pérdidas en los que participó, que se conservan sin su nombre',
    fundamento: 'respaldo tributario: los documentos de respaldo se conservan 6 años (SII y Código Tributario, art. 17)',
  },
  sueldo_y_fechas_laborales: {
    texto: 'el sueldo base, el cargo y las fechas de ingreso y egreso, y los montos de los gastos de sueldo asociados',
    fundamento: 'obligaciones laborales y tributarias; el plazo de conservación laboral está por confirmar con el contador',
  },
  rut: {
    texto: 'el RUT del proveedor, asociado a sus compras y gastos',
    fundamento: 'respaldo tributario de compras y gastos de los últimos 6 años (SII y Código Tributario, art. 17)',
  },
  compras_y_gastos: {
    texto: 'las compras, gastos y activos asociados (montos, fechas y documentos), sin los datos de contacto',
    fundamento: 'respaldo tributario de 6 años (SII y Código Tributario, art. 17)',
  },
  registro_de_auditoria: {
    texto: 'el registro de auditoría de los accesos y cambios, sin su nombre',
    fundamento: 'registro de seguridad del sistema, que acompaña los plazos tributarios (6 años; propuesta del sistema)',
  },
}

/** Etiquetas de lo anonimizado (para el texto de respuesta). */
export const ANONIMIZADO_ETIQUETA: Record<string, string> = {
  nombre: 'el nombre',
  email: 'el correo electrónico',
  documento: 'el documento de identidad',
  telefono: 'el teléfono',
  notas: 'las notas',
  contacto: 'el contacto',
  direccion: 'la dirección',
  rut: 'el RUT',
  pin: 'el PIN de acceso',
  sesiones: 'las sesiones abiertas (se cerraron)',
  intentos_login: 'los registros de intentos de ingreso (correo e IP)',
  nombre_en_registros: 'su nombre copiado en los registros de pagos, caja, pérdidas, permisos y auditoría',
  nombre_en_notas: 'su nombre dentro de notas de texto libre conocidas',
  usuario_vinculado: 'la cuenta de usuario vinculada',
  sueldo_y_fechas_laborales: 'el sueldo, el cargo y las fechas laborales',
}

export interface ResultadoSupresion {
  anonimizado?: string[]
  conservado?: string[]
}

const DERECHO: Record<string, string> = {
  acceso: 'acceso',
  rectificacion: 'rectificación',
  supresion: 'supresión',
  oposicion: 'oposición',
  portabilidad: 'portabilidad',
}

function lista(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1]
}

function fechaChile(valor: string | Date | null | undefined): string {
  if (!valor) return ''
  const s = typeof valor === 'string' ? valor.slice(0, 10) : valor.toISOString().slice(0, 10)
  const [a, m, d] = s.split('-')
  return a && m && d ? `${d}-${m}-${a}` : s
}

export function componerRespuesta(input: {
  tipo: string
  titular_tipo?: string
  ingresada_en?: string | Date | null
  resultado?: ResultadoSupresion | null
}): string {
  const derecho = DERECHO[input.tipo] ?? input.tipo
  const fecha = fechaChile(input.ingresada_en)
  const partes: string[] = [`[BORRADOR, sujeto a revisión legal] Hemos atendido su solicitud de ${derecho}${fecha ? ` ingresada el ${fecha}` : ''}.`]
  const r = input.resultado ?? {}
  if (input.tipo === 'supresion') {
    const anon = (r.anonimizado ?? []).map((k) => ANONIMIZADO_ETIQUETA[k] ?? k.replace(/_/g, ' '))
    if (anon.length) partes.push(`Anonimizamos ${lista(anon)}.`)
    const conservado = (r.conservado ?? []).map((k) => RETENCION[k]).filter(Boolean)
    if (conservado.length) {
      partes.push(
        'No pudimos eliminar todo: conservamos ' +
          conservado.map((c) => `${c.texto} (${c.fundamento})`).join('; ') +
          '.',
      )
    } else {
      partes.push('No quedan datos que debamos conservar por obligación legal.')
    }
    partes.push(
      'Copias de seguridad de nuestro proveedor de base de datos (Neon) pueden conservar los datos originales dentro de su ventana de restauración, que se confirmará, y se eliminan por su propio ciclo.',
    )
  } else if (input.tipo === 'acceso' || input.tipo === 'portabilidad') {
    partes.push(
      input.tipo === 'portabilidad'
        ? 'Le entregamos los datos que usted nos proporcionó en un formato estructurado (JSON).'
        : 'Le entregamos una copia de sus datos y de los registros donde figura.',
    )
    partes.push('Los nombres de comensales de las cuentas por persona son texto libre y no se pueden asociar con certeza a una persona.')
  } else if (input.tipo === 'rectificacion') {
    partes.push('Corregimos los datos indicados en su solicitud.')
  } else {
    partes.push('Dejamos constancia de su solicitud y de la respuesta.')
  }
  partes.push('Si no está conforme con esta respuesta, puede presentar un reclamo ante la Agencia de Protección de Datos Personales.')
  return partes.join(' ')
}
