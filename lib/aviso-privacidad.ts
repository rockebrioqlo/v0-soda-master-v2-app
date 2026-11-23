/**
 * Aviso de privacidad (sesión 19, K1). Módulo PURO: sin imports, para que la prueba estática lo cargue con el
 * type stripping de Node (`scripts/pruebas/aviso-privacidad.cjs`) y para que `components/aviso-privacidad.tsx`
 * solo dibuje lo que dice este archivo.
 *
 * ESTADO: BORRADOR, SUJETO A REVISIÓN LEGAL. El texto definitivo lo redacta el abogado.
 *
 * Reparto de roles (decidido el 22-11-2026): el RESPONSABLE es el local (el restaurante); Latencia Cero SpA
 * (proveedor del software) es ENCARGADO del tratamiento; Neon y Vercel son SUBENCARGADOS. Los datos del
 * responsable quedan como campos "[por completar por el local]": hoy el sistema es de un solo local y no hay
 * dónde configurarlos (la sesión 27 debe hacerlos configurables por local, ver ROADMAP).
 *
 * Versión y fecha: cada vez que cambie el texto, se sube `AVISO_VERSION`, se actualiza `AVISO_FECHA` y se agrega
 * una fila a `AVISO_HISTORIAL`. La pantalla siempre muestra la versión y la fecha vigentes.
 *
 * Marcas: lo que no se pudo verificar se escribe "[por confirmar]", "[por verificar]" o "por definir"; nunca
 * se inventa una cifra. Qué dice cada dato y por qué: `INVENTARIO_DATOS_PERSONALES.md` (secciones 1 a 5).
 */

export const AVISO_VERSION = '1.0'
/** Formato dd-mm-aaaa (America/Santiago). */
export const AVISO_FECHA = '22-11-2026'
export const AVISO_ESTADO = 'Borrador, sujeto a revisión legal'

export const POR_COMPLETAR = '[por completar por el local]'
export const POR_CONFIRMAR = '[por confirmar]'
export const POR_VERIFICAR = '[por verificar]'

export type PaisAviso = 'CL' | 'MX'

export interface SeccionAviso {
  id: string
  titulo: string
  parrafos?: string[]
  items?: string[]
  /** Tabla de dos columnas (por ejemplo, dato y plazo de conservación). */
  tabla?: { cabecera: [string, string]; filas: [string, string][] }
}

export interface AvisoPrivacidad {
  pais: PaisAviso
  titulo: string
  /** Ley y autoridad del país. */
  ley: string
  autoridad: string
  secciones: SeccionAviso[]
}

export const AVISO_HISTORIAL: { version: string; fecha: string; cambio: string }[] = [
  { version: '1.0', fecha: '22-11-2026', cambio: 'Primera versión (borrador para revisión legal).' },
]

/** Ids que tiene que traer toda versión completa del aviso (los comprueba la prueba estática). */
export const SECCIONES_OBLIGATORIAS = [
  'responsable',
  'datos',
  'finalidades',
  'licitud',
  'destinatarios',
  'transferencia',
  'conservacion',
  'derechos',
  'seguridad',
  'cambios',
] as const

const responsable: SeccionAviso = {
  id: 'responsable',
  titulo: 'Quién es el responsable de tus datos',
  parrafos: [
    'El responsable del tratamiento es el local (el restaurante) que usa este sistema.',
    'Latencia Cero SpA, proveedora del software Soda Master, trata los datos por cuenta del local como encargada del tratamiento. Neon (base de datos) y Vercel (hosting) actúan como subencargados.',
  ],
  items: [
    `Nombre o razón social del local: ${POR_COMPLETAR}`,
    `RUT del local: ${POR_COMPLETAR}`,
    `Contacto del responsable: ${POR_COMPLETAR}`,
  ],
}

const cambios: SeccionAviso = {
  id: 'cambios',
  titulo: 'Cómo te informamos los cambios',
  parrafos: [
    'Este aviso lleva una versión y una fecha, que ves al pie y en el enlace que lo abre. Cuando cambie, subiremos la versión, cambiaremos la fecha y publicaremos el texto nuevo en esta misma pantalla, y avisaremos al personal con acceso al sistema.',
  ],
}

export const AVISO_CL: AvisoPrivacidad = {
  pais: 'CL',
  titulo: 'Aviso de privacidad',
  ley: 'Ley N° 21.719, sobre protección de los datos personales',
  autoridad: 'Agencia de Protección de Datos Personales',
  secciones: [
    responsable,
    {
      id: 'datos',
      titulo: 'Qué datos tratamos',
      items: [
        'Usuarios del sistema (personal con acceso): nombre, correo y PIN. El PIN se guarda cifrado y no se puede leer. También se registran las sesiones y los intentos de ingreso, con la dirección IP.',
        'Empleados: nombre, RUT u otro documento, teléfono, correo, cargo, sueldo, fechas de ingreso y de egreso, y notas.',
        'Proveedores: nombre o razón social, RUT, contacto, teléfono, correo, dirección y notas. Si el proveedor es una persona natural, son datos personales.',
        'Comensales: solo el nombre de pila que el personal escribe a mano cuando divide una cuenta por persona. No se pide ni se guarda otro dato del comensal, y no se guardan datos de tarjetas.',
        'Ventas, pagos y caja: cada operación registra el nombre de quien atendió o cobró.',
        'Registro de auditoría: quién consultó o cambió datos personales y cuándo, solo con los nombres de los campos, nunca con los valores.',
        'La carta pública (/menu) no pide ningún dato. El proveedor de hosting ve los datos técnicos de la conexión, como la dirección IP.',
      ],
    },
    {
      id: 'finalidades',
      titulo: 'Para qué los usamos',
      items: [
        'Operar el local: mesas, comandas, cocina, cobro, caja e inventario.',
        'Gestionar al personal y el pago de remuneraciones.',
        'Gestionar compras y proveedores.',
        'Cuidar la seguridad del sistema: control de accesos, bloqueo de intentos de ingreso repetidos y auditoría.',
        'Cumplir las obligaciones tributarias y laborales del local.',
        'Atender las solicitudes de derechos de las personas titulares.',
      ],
      parrafos: ['No usamos los datos para publicidad, no los vendemos y no tomamos decisiones automatizadas sobre las personas.'],
    },
    {
      id: 'licitud',
      titulo: 'En qué nos basamos para tratarlos',
      items: [
        'La relación laboral o comercial con el local (empleados y proveedores).',
        'El cumplimiento de obligaciones legales, como las tributarias y las laborales.',
        'El interés legítimo del local en la seguridad del sistema, el control de caja y la auditoría.',
      ],
      parrafos: ['No pedimos tu consentimiento como base general. El abogado confirma estas bases antes de publicar el texto definitivo.'],
    },
    {
      id: 'destinatarios',
      titulo: 'Quién más recibe los datos',
      items: [
        'Latencia Cero SpA: proveedora del software, encargada del tratamiento.',
        'Neon: base de datos donde se guardan todos los registros, subencargada.',
        'Vercel: hosting donde corre la aplicación, subencargado.',
        'Autoridades, cuando la ley lo exija (por ejemplo, el SII).',
      ],
      parrafos: ['No vendemos ni cedemos los datos a otras empresas.'],
    },
    {
      id: 'transferencia',
      titulo: 'Transferencia internacional',
      parrafos: [
        'Tus datos se guardan fuera de Chile. La base de datos está en Neon, en los servidores de Amazon Web Services de la región us-east-1 (Estados Unidos).',
        `La región donde corre la aplicación en Vercel: ${POR_CONFIRMAR}. Las garantías contractuales con Neon y Vercel (contratos de tratamiento de datos): ${POR_CONFIRMAR}.`,
      ],
    },
    {
      id: 'conservacion',
      titulo: 'Cuánto tiempo los conservamos',
      tabla: {
        cabecera: ['Dato', 'Plazo'],
        filas: [
          ['Ventas, pagos, caja, compras y gastos (respaldo tributario)', '6 años'],
          ['Registro de auditoría', '6 años (política interna del sistema)'],
          ['Datos de empleados (contratos y sueldos)', `${POR_CONFIRMAR} con el contador; hoy sin plazo definido`],
          ['Nombres de comensales en cuentas por persona', 'por definir'],
          ['Usuarios y proveedores', 'Mientras exista la relación con el local; plazo posterior por definir'],
          ['Sesiones y notificaciones', '90 días'],
          ['Intentos de ingreso (incluye la dirección IP)', '24 horas, o 30 días si hubo un ingreso correcto'],
        ],
      },
      parrafos: [
        'Cuando algo debe conservarse por ley, se conserva y se anonimiza lo demás. Las copias de respaldo de Neon pueden guardar un dato durante su ventana de restauración, que está por confirmar.',
      ],
    },
    {
      id: 'derechos',
      titulo: 'Tus derechos y cómo ejercerlos',
      items: [
        'Acceso: saber qué datos tuyos tratamos y recibir una copia.',
        'Rectificación: corregir o completar un dato inexacto.',
        'Supresión: pedir que se borre o anonimice un dato, salvo lo que la ley obliga a conservar.',
        'Oposición: oponerte a un tratamiento.',
        'Portabilidad: recibir tus datos en un formato que puedas llevar a otro lugar.',
        `Bloqueo temporal: ${POR_CONFIRMAR} con el abogado, según el texto de la ley.`,
      ],
      parrafos: [
        `Para ejercerlos, escribe al local: ${POR_COMPLETAR}. Respondemos dentro de 30 días corridos desde que ingresa la solicitud. Ese plazo se puede prorrogar una sola vez por 30 días más, en casos justificados, y te lo avisaremos.`,
        'Si no estás conforme con la respuesta, puedes reclamar ante la Agencia de Protección de Datos Personales.',
      ],
    },
    {
      id: 'seguridad',
      titulo: 'Cómo cuidamos tus datos',
      items: [
        'Cada persona ingresa con su PIN, que se guarda cifrado.',
        'Cada usuario ve solo lo que su rol permite, y los datos de empleados y proveedores los ve solo el administrador.',
        'La sesión se cierra sola tras un tiempo sin actividad.',
        'Los intentos de ingreso repetidos con un PIN errado se bloquean.',
        'Las consultas y los cambios a datos personales quedan registrados.',
      ],
      parrafos: ['Si hubiera una brecha de seguridad que te afecte, la gestionamos con un procedimiento escrito y avisamos a la Agencia y a las personas afectadas cuando corresponda.'],
    },
    cambios,
  ],
}

/** Versión para México: borrador con lo que no se pudo verificar marcado. No se muestra en pantalla hasta la sesión 27. */
export const AVISO_MX: AvisoPrivacidad = {
  pais: 'MX',
  titulo: 'Aviso de privacidad',
  ley: 'Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP, vigente desde el 21-03-2025)',
  autoridad: `Secretaría Anticorrupción y Buen Gobierno (autoridad según la ley vigente; ${POR_VERIFICAR})`,
  secciones: [
    responsable,
    {
      id: 'datos',
      titulo: 'Qué datos personales tratamos',
      items: [
        'Usuarios del sistema: nombre, correo y PIN (cifrado), sesiones e intentos de ingreso con la dirección IP.',
        'Empleados: nombre, documento de identidad, teléfono, correo, cargo, sueldo, fechas de ingreso y de egreso, y notas.',
        'Proveedores: nombre o razón social, identificador fiscal, contacto, teléfono, correo, dirección y notas.',
        'Comensales: solo el nombre de pila que el personal escribe a mano al dividir una cuenta por persona.',
        'Ventas, pagos y caja, con el nombre de quien atendió o cobró, y el registro de auditoría.',
        `Datos personales sensibles: ${POR_VERIFICAR} si alguno de los anteriores lo es según la ley.`,
      ],
    },
    {
      id: 'finalidades',
      titulo: 'Finalidades',
      items: [
        'Operar el local, gestionar al personal y a los proveedores, y cuidar la seguridad del sistema.',
        `Cumplir las obligaciones fiscales y laborales del local: ${POR_VERIFICAR} las que correspondan en México.`,
        'Atender las solicitudes de derechos de las personas titulares.',
      ],
      parrafos: ['Finalidades que requieren consentimiento, si las hubiera: ninguna por ahora.'],
    },
    {
      id: 'licitud',
      titulo: 'Base para el tratamiento',
      parrafos: [`Base jurídica del tratamiento según la LFPDPPP: ${POR_VERIFICAR} con el abogado.`],
    },
    {
      id: 'destinatarios',
      titulo: 'Con quién compartimos los datos',
      items: [
        'Latencia Cero SpA (proveedora del software, encargada), Neon (base de datos) y Vercel (hosting).',
        'Autoridades, cuando la ley lo exija.',
      ],
      parrafos: ['No vendemos ni cedemos los datos a otras empresas.'],
    },
    {
      id: 'transferencia',
      titulo: 'Transferencias',
      parrafos: [
        'Los datos se guardan fuera de México: la base de datos está en Neon, en la región us-east-1 de Amazon Web Services (Estados Unidos).',
        `Región de Vercel: ${POR_CONFIRMAR}. Requisitos de la ley para las transferencias: ${POR_VERIFICAR}.`,
      ],
    },
    {
      id: 'conservacion',
      titulo: 'Plazos de conservación',
      parrafos: [
        `Los plazos de conservación en México (fiscales y laborales): ${POR_VERIFICAR}. Los plazos de Sodamaster para registros técnicos son los mismos que en Chile: sesiones y notificaciones 90 días; intentos de ingreso 24 horas (30 días con un ingreso correcto).`,
      ],
    },
    {
      id: 'derechos',
      titulo: 'Derechos y cómo ejercerlos',
      items: ['Acceso, rectificación, cancelación y oposición (derechos ARCO), y los demás que reconozca la ley vigente.'],
      parrafos: [
        `Para ejercerlos, escribe al local: ${POR_COMPLETAR}.`,
        `Plazo de respuesta y reclamo ante la autoridad: ${POR_VERIFICAR}.`,
      ],
    },
    {
      id: 'seguridad',
      titulo: 'Medidas de seguridad',
      items: [
        'PIN cifrado, permisos por rol, cierre de sesión por inactividad, bloqueo de intentos repetidos y registro de consultas y cambios a datos personales.',
      ],
      parrafos: [`Qué debe hacerse y en qué plazo si hay una vulneración de seguridad: ${POR_VERIFICAR}.`],
    },
    cambios,
  ],
}

/**
 * Versión corta para /menu (la carta pública): ahí no se pide ningún dato, así que solo se dice eso, quién es el
 * responsable, qué ve el hosting y cómo ejercer derechos.
 */
export const AVISO_MENU_CL: AvisoPrivacidad = {
  pais: 'CL',
  titulo: 'Aviso de privacidad',
  ley: AVISO_CL.ley,
  autoridad: AVISO_CL.autoridad,
  secciones: [
    responsable,
    {
      id: 'datos',
      titulo: 'Qué datos tratamos aquí',
      parrafos: [
        'Esta carta no te pide ningún dato ni usa cookies de seguimiento. Como en cualquier sitio web, el proveedor de hosting (Vercel) ve los datos técnicos de la conexión, como la dirección IP, para que la página funcione y se mantenga segura.',
      ],
    },
    {
      id: 'transferencia',
      titulo: 'Transferencia internacional',
      parrafos: [`La aplicación corre en Vercel, en una región ${POR_CONFIRMAR}, y puede estar fuera de Chile.`],
    },
    {
      id: 'derechos',
      titulo: 'Tus derechos',
      parrafos: [
        `Si el local trata datos tuyos, puedes ejercer tus derechos de acceso, rectificación, supresión, oposición y portabilidad escribiendo al local: ${POR_COMPLETAR}. Respondemos dentro de 30 días corridos, prorrogables una vez por 30 más, y puedes reclamar ante la Agencia de Protección de Datos Personales.`,
      ],
    },
    cambios,
  ],
}

/** Texto de la versión y la fecha vigentes, para el enlace y el pie: `v1.0 · 22-11-2026`. */
export function etiquetaVersion(): string {
  return `v${AVISO_VERSION} · ${AVISO_FECHA}`
}

/** Aviso completo del país (hoy solo se muestra el de Chile; México queda listo para la sesión 27). */
export function avisoPara(pais: PaisAviso = 'CL'): AvisoPrivacidad {
  return pais === 'MX' ? AVISO_MX : AVISO_CL
}
