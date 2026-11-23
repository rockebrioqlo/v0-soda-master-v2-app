# PROCEDIMIENTO DE BRECHAS DE SEGURIDAD — Sodamaster

**Versión 1.0 · 22-11-2026 · BORRADOR, sujeto a revisión legal.** Sesión 19 del ROADMAP (Bloque D, K1).

Este documento dice qué hacer cuando se pierden, se filtran, se alteran o se usan sin permiso datos personales del sistema. **No es asesoría legal.** Lo marcado `[por confirmar]` o `[por verificar]` lo cierra el abogado o el usuario; nada de eso se inventa aquí.

Los datos que trata el sistema están en `INVENTARIO_DATOS_PERSONALES.md` y el texto que se ve en pantalla en `lib/aviso-privacidad.ts`.

## 0. Quién es quién y qué dice la ley

| Rol | Quién | Qué le toca en una brecha |
|---|---|---|
| **Responsable** | El local (el restaurante) | Decide si se notifica, notifica a la Agencia y avisa a los titulares. Datos de contacto: `[por completar por el local]`. |
| **Encargado** | Latencia Cero SpA (proveedor del software) | Detecta, contiene, investiga, informa al responsable sin demora y le entrega lo necesario para decidir. |
| **Subencargados** | Neon (base de datos) y Vercel (hosting) | Sus avisos de incidente llegan a Latencia Cero; se registran como una fuente más. |

**Chile (Ley N° 21.719, art. 14 sexies).** Cuando la brecha implica un **riesgo razonable** para los titulares, el responsable la notifica a la Agencia de Protección de Datos Personales **"por los medios más expeditos posibles y sin dilaciones indebidas"**. **La ley no fija un plazo en horas.**

**Estándar interno de Sodamaster: 72 horas.** Es una regla propia, no un mandato legal: desde que una brecha queda **confirmada**, a más tardar a las 72 horas la Agencia debe estar notificada o debe quedar escrito en el registro (sección 8) por qué no se notificó. Si el caso permite hacerlo antes, se hace antes: "sin dilaciones indebidas" manda sobre las 72 horas.

**México.** La autoridad (hoy la Secretaría Anticorrupción y Buen Gobierno), el plazo y el contenido de la notificación `[por verificar]` en el texto de la LFPDPPP vigente antes de preparar México (Bloque F). Mientras no se verifique, no se prometen plazos.

## 1. Qué es una brecha

Un evento que provoca la **pérdida, destrucción, alteración, divulgación o acceso sin autorización** a datos personales, sea por un ataque, un error o una persona con acceso que actúa mal. Se trata como brecha, hasta descartarla, cualquiera de estas:

- Alguien ingresa con la cuenta de otra persona (PIN adivinado, robado o compartido).
- Se descarga o se mira la lista de empleados, proveedores o usuarios sin motivo (lo que registra la auditoría, sección 2).
- Una credencial o un secreto queda expuesto: la `DATABASE_URL` de Neon, la `SESION_SECRETO`, un archivo `.env` o `variables.txt` en un lugar equivocado, o una captura con PINs.
- Un celular, tablet o computador con la sesión abierta se pierde o es robado.
- Un error del sistema muestra datos a quien no corresponde (una ruta sin protección, un dato de más en una respuesta).
- Neon o Vercel avisan de un incidente que toca nuestra cuenta.
- Se borran o se alteran datos sin autorización (ventas, caja, usuarios).

## 2. Cómo se detecta

No hay alertas automáticas hoy: la detección es **revisión humana** de estas fuentes. Revisarlas cada semana, y de inmediato ante cualquier sospecha.

| Fuente | Qué buscar | Dónde |
|---|---|---|
| **Auditoría** (`auditoria_admin`) | Lecturas de listas de empleados, proveedores o usuarios (`ver_datos_personales`) que nadie hizo; `exportar`, `anonimizar`, `eliminar` o `desactivar` inesperados; cambios fuera del horario del local; el usuario que los hizo. Solo guarda nombres de campo, nunca valores. | Configuración → Auditoría, o `GET /api/auditoria` (solo admin) con filtros por entidad, acción y fechas. |
| **Bloqueos de `intentos_login`** | Un usuario bloqueado que no se equivocó; muchos intentos fallidos contra uno o varios correos; bloqueos repetidos desde una misma IP; un ingreso correcto justo después de muchos fallidos. | Usuarios (el admin ve el estado de bloqueo de cada uno). |
| **Logs de Vercel** | Errores 401, 403 o 429 en ráfagas; peticiones raras a `/api/**`; picos de tráfico sin explicación; despliegues que nadie hizo. | Panel de Vercel → proyecto → Logs y Deployments. |
| **Neon** | Conexiones desde lugares o a horas que no corresponden; consultas pesadas; cambios en roles o contraseñas que nadie hizo. | Consola de Neon (monitoreo y registro de operaciones). |
| **Personas** | Un empleado o un proveedor avisa que le llegó algo raro; el admin ve que la sesión de alguien se cerró sola. | Cualquier canal; se anota igual. |

**Límite honesto:** la auditoría registra accesos y cambios a **datos personales de personas** (usuarios, empleados, proveedores). No registra quién mira ventas, pagos o caja. Una filtración de esos registros se detectaría por los logs o por un aviso externo.

## 3. Quién decide

1. Quien detecta (cualquier persona del local o de Latencia Cero) avisa de inmediato al **encargado de incidentes de Latencia Cero** `[por designar]`, que abre una fila en el registro (sección 8) y anota la hora de detección.
2. El encargado de incidentes **contiene** (sección 4) y **evalúa** (sección 5) con lo que haya, sin esperar a tener todo.
3. El encargado informa al **responsable (el local)** `[por completar por el local]` en cuanto la brecha queda confirmada, con la plantilla de la sección 6.
4. **La decisión de notificar a la Agencia y a los titulares es del responsable**, con el abogado `[por designar]` si se puede. Latencia Cero entrega los hechos y recomienda; ante la duda, la recomendación es **notificar**.

## 4. Cómo se contiene

Contener primero, investigar después. Cada acción se anota en el registro con la hora.

| Situación | Qué hacer | Cómo |
|---|---|---|
| Una cuenta está comprometida | Cambiar su PIN (revoca todas sus sesiones) o desactivarla (también las revoca). | Usuarios → editar. Un `PATCH /api/usuarios/[id]` con PIN nuevo o `activo: false`. Cada cambio queda en la auditoría. |
| No se sabe qué cuentas | Desactivar las cuentas sospechosas; para sacar a todo el mundo, rotar `SESION_SECRETO` (invalida todas las cookies; cada persona vuelve al login). | Variables de entorno de Vercel y un nuevo despliegue. |
| Hay un bloqueo falso o real que atender | Revisar antes de desbloquear: quitar el bloqueo no limpia la causa. | Usuarios → desbloquear (`POST /api/auth/desbloquear`, solo admin). |
| Una credencial se expuso | Rotar la contraseña de Neon (y actualizar `DATABASE_URL` y `DATABASE_URL_UNPOOLED`), rotar `SESION_SECRETO`, borrar el archivo expuesto y volver a desplegar. | Consola de Neon, variables de Vercel, nuevo despliegue. |
| Los accesos rápidos del login están encendidos | Apagarlos (`ACCESOS_RAPIDOS=false`): esa ruta pública muestra nombre y correo sin sesión. | Variable de Vercel y nuevo despliegue. |
| Un dispositivo se perdió | Desactivar al usuario o cambiar su PIN, para cerrar la sesión abierta. | Igual que la primera fila. |
| Un error del sistema expone datos | Cerrar la ruta o desplegar el arreglo; si no se puede en minutos, retirar el despliegue. | Vercel → Deployments. |
| Datos borrados o alterados | **No** escribir encima. Anotar la hora y evaluar restaurar a un punto en el tiempo (ventana de restauración `[por confirmar]`). | Neon, restauración a un punto en el tiempo. |

**Preservar evidencia:** antes de cambiar nada, copiar (sin PINs ni valores personales) los logs, las entradas de auditoría y los datos de bloqueo relevantes. Nunca pegar PINs, correos de personas ni valores personales en el registro, en el chat ni en el CHAT_LOG.

## 5. Cómo se evalúa el riesgo razonable

El responsable debe poder explicar por qué notificó o por qué no. Se responde por escrito, con lo que se sabe en ese momento:

1. **Qué datos** se vieron o se perdieron: lo más sensible es sueldo y RUT (empleados), RUT y contacto de proveedores personas naturales y correos. Menos: nombres de pila de cuentas por persona. El PIN se guarda cifrado (hash); no se puede leer, pero un hash filtrado se puede atacar.
2. **A cuántas personas** y de qué tipo (personal, proveedores, comensales).
3. **Quién accedió:** un tercero ajeno, una persona del local sin permiso, o un error sin que nadie lo usara.
4. **Qué pudo hacer con los datos:** solo ver, copiar, alterar o borrar.
5. **Cuánto duró** y si ya se contuvo.
6. **Qué daño razonable puede sufrir cada titular:** suplantación, fraude, daño económico, laboral o a su reputación, o un riesgo para su integridad.
7. **Si los datos estaban protegidos** de forma que no se pueden usar (hoy solo el PIN lo está).

**Criterio (borrador, lo confirma el abogado):** si hay una probabilidad razonable de afectar los derechos o intereses de los titulares, hay riesgo razonable y se notifica. Si es un error contenido de inmediato, que nadie usó y que solo expuso datos de poco riesgo, se puede decidir **no notificar**, pero la decisión y sus razones quedan en el registro. Ante la duda, se notifica.

## 6. Notificaciones

### 6.1 A la Agencia de Protección de Datos Personales

- **Cuándo:** si hay riesgo razonable (sección 5), **sin dilaciones indebidas**; estándar interno, a más tardar 72 horas desde la confirmación.
- **Quién:** el responsable (el local), apoyado por Latencia Cero.
- **Cómo:** por los medios más expeditos que ofrezca la Agencia `[por verificar: canal y formulario vigentes]`.
- **Qué incluir:** lo que se sabe hoy (aunque sea parcial), y completarlo después sin retrasar el primer aviso.

### 6.2 A los titulares

- **Cuándo:** si la brecha puede afectarles de modo significativo, **lo antes posible** y en lenguaje claro `[por verificar con el abogado el estándar exacto]`.
- **Cómo:** el medio más directo disponible (correo o teléfono del titular, o aviso del local si es personal del local).
- **Qué decir:** sin tecnicismos, y sin culpar ni minimizar.

### 6.3 Plantilla (borrador, adaptar a cada caso)

```
Asunto: Aviso de incidente de seguridad que puede afectar tus datos personales

Estimado/a [nombre]:

El [fecha] detectamos que [qué pasó, en una o dos frases claras].

Qué datos pudieron verse afectados: [lista; por ejemplo, tu nombre y tu RUT].
Qué datos NO se vieron afectados: [lista, si se sabe].
Qué hicimos: [contención, con las fechas].
Qué puedes hacer tú: [medidas concretas; por ejemplo, desconfiar de mensajes que pidan tu PIN].
Qué haremos nosotros: [seguimiento y fecha del próximo aviso].

Para consultas y para ejercer tus derechos (acceso, rectificación, supresión, oposición y portabilidad),
escribe a: [contacto del local: por completar].
También puedes reclamar ante la Agencia de Protección de Datos Personales.

[Nombre del responsable: por completar por el local]
[Fecha]
```

Para la Agencia, la misma estructura más: fecha y hora de detección y de confirmación, tipo de brecha, categorías y cantidad aproximada de personas y de registros, consecuencias probables, medidas de contención y contacto del responsable y de Latencia Cero.

## 7. Después de contener

1. **Investigar la causa** y cerrarla de verdad (una ruta, un PIN débil, una credencial en el lugar equivocado).
2. **Sumar una prueba** que habría atrapado el problema, si el sistema la admite (`scripts/pruebas/`).
3. **Revisar este procedimiento** y el inventario de datos si el incidente mostró un hueco; subir la versión del documento.
4. **Cerrar el registro** con las lecciones y las fechas.

## 8. Registro de incidentes

Una fila por incidente, **aunque se haya decidido no notificar**. Sin PINs, correos ni valores personales: solo ids, cantidades, tipos de dato y fechas. Este registro es de solo adición; no se borran filas.

| N° | Detección (fecha y hora) | Qué pasó | Datos y titulares afectados (tipos y cantidad) | Contención (qué y cuándo) | Riesgo razonable (sí/no y por qué) | Agencia (fecha o razón de no notificar) | Titulares (fecha o razón) | Cierre y lecciones |
|---|---|---|---|---|---|---|---|---|
| — | — | Sin incidentes registrados. | — | — | — | — | — | — |

## Pendientes de este documento

- Designar al encargado de incidentes de Latencia Cero y los datos de contacto del responsable (el local).
- Confirmar con el abogado: el criterio de riesgo razonable, el estándar de aviso a los titulares, el canal vigente de la Agencia y el contenido exigido.
- México: autoridad, plazos y contenido de la notificación, a verificar.
