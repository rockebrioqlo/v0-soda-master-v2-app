# INVENTARIO DE DATOS PERSONALES — Sodamaster

Sesión 16 del ROADMAP (21-11-2026), Bloque D, hallazgo K1. Inventario hecho **leyendo el esquema real de Neon y el código** (no solo la documentación) y plan detallado de las sesiones 17 a 19.

- **Método:** consultas `SELECT` de solo lectura (columnas, restricciones y conteos) y lectura del código. No se escribió ni se borró nada en la base; no se imprimieron valores personales, PINs ni correos.
- **Datos de prueba:** los datos de Neon son de prueba (AGENTS.md). Los proveedores y empleados vienen de `seed-demo` con RUT y correos ficticios. Lo que importa aquí es **cómo se guarda y se expone cada dato**, no los valores de hoy.
- **Esto no es asesoría legal.** Los puntos marcados "a confirmar" deben revisarse con el contador o el abogado antes de vender.

---

## 1. Marco legal y fechas

| Tema | Qué se sabe | Estado |
|---|---|---|
| **Ley 21.719 (Chile), vigencia** | Publicada en el Diario Oficial el 13-12-2024. **Fecha legal vigente: 01-12-2026**, hasta que se publique la postergación. **Fecha aprobada: 15-10-2027** (Boletín N° 18.623-07, aprobado por el Senado y por la Cámara el 17-11-2026; **pendiente de promulgación y publicación**). El 01-12-2027 era la propuesta original del Ejecutivo y no se usa. | La publicación de la ley (13-12-2024) y la vigencia del 01-12-2026 constan en la BCN y el Diario Oficial. La aprobación de la Cámara el 17-11-2026 (Boletín N° 18.623-07, pendiente de promulgación y publicación) la informa AZ Abogados, y la fecha del 15-10-2027 consta en la Cámara (ver fuentes). |
| **Derechos ARCOP (Chile)** | Acceso, rectificación, supresión, oposición y portabilidad (la ley además menciona el bloqueo temporal; confirmar en el texto). **Plazo de respuesta: 30 días corridos desde el ingreso, prorrogables una vez por 30 más en casos justificados.** | Plazo informado por el usuario; es el que usa el diseño de la sesión 18. |
| **Brechas de seguridad (Chile)** | El art. 14 sexies exige notificar a la Agencia de Protección de Datos Personales "por los medios más expeditos posibles y sin dilaciones indebidas" cuando hay riesgo razonable. **La ley no fija un plazo en horas.** | Informado por el usuario. **Las 72 horas son un estándar interno de Sodamaster (nivel GDPR), no un mandato legal**, y así deben escribirse en el procedimiento de la sesión 19. |
| **LFPDPPP (México)** | Nueva ley publicada el 20-03-2025, en vigor desde el 21-03-2025. La autoridad es la Secretaría Anticorrupción y Buen Gobierno (reemplaza al INAI). Exige aviso de privacidad. | Los plazos de respuesta a derechos ARCO y de notificación de vulneraciones **no se verificaron**: revisar el texto antes de preparar México (Bloque F). |
| **Conservación tributaria (Chile)** | Los documentos de respaldo tributario (boletas, facturas, libros contables) se conservan **6 años**; destruirlos antes exige autorización del SII (formulario 2117). Código Tributario art. 17: revisión ordinaria a 3 años, extraordinaria a 6. | Verificado en ChileAtiende y el SII (ver fuentes). |
| **Conservación laboral (contratos, liquidaciones de sueldo)** | **A confirmar con el contador. Sin cifra.** | Pendiente. |

Fuentes consultadas:
- BCN, ficha de la Ley 21.719: https://www.bcn.cl/balance-legislativo/detalle/ficha_LEY_21719_2024-12-13
- Diario Constitucional sobre la vigencia: https://www.diarioconstitucional.cl/2026/06/12/la-ley-21-719-entra-en-vigor-el-1-de-diciembre-y-expone-vacios-en-regulacion-de-pequenas-empresas/
- AZ Abogados, postergación (la Cámara aprobó el 17-11-2026 el Boletín N° 18.623-07, pendiente de promulgación y publicación): https://www.az.cl/?p=264501
- Cámara de Diputadas y Diputados, postergación de la entrada en vigencia (fecha 15-10-2027): https://www.camara.cl/cms/2026/11/05/proteccion-de-datos-comision-aprobo-postergar-entrada-en-vigencia-de-la-ley/
- ChileAtiende, conservación de documentos tributarios: https://www.chileatiende.gob.cl/fichas/3142-autorizacion-para-destruir-documentacion-tributaria
- LFPDPPP (Cámara de Diputados de México): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf

---

## 2. Inventario por tabla y columna

El esquema `soda_master` tiene **31 tablas**. **No existe tabla de clientes ni de fiados** (confirmado). Los conteos son del 21-11-2026.

### 2.1 Personas con cuenta o ficha

| Tabla (filas) | Columnas con datos personales | Para qué se usa | Quién lo ve hoy | Riesgo |
|---|---|---|---|---|
| `usuarios` (11) | `email`, `nombre`, `pin_hash` (bcrypt) | Login y nombre en pantallas, tickets y reportes | `GET /api/usuarios` lo entrega a **toda sesión** (nombre, email, rol y estado de todos); la app lo carga entero en cada dispositivo al iniciar, también en cocina y bar. El hash no sale nunca (lista blanca `mapUsuario`, probada). El bloqueo por PIN solo lo ve el admin. | 🟡 Cualquier rol ve el email de todos. |
| `usuarios`, vía `GET /api/auth/accesos-rapidos` | `nombre`, `email` de hasta 5 usuarios activos | Botones de acceso rápido del login (desarrollo) | **Sin sesión, cualquiera en internet** | 🔴 Se apaga con `ACCESOS_RAPIDOS=false`; ya está en P1 y P3 como obligatorio antes de producción. No se agrega como pendiente nuevo. |
| `empleados` (10; 1 con documento, 1 con teléfono, 0 con email, 10 con sueldo, 9 con fecha de egreso) | `nombre`, `documento` (RUT), `telefono`, `email`, `sueldo_base`, `fecha_ingreso`, `fecha_egreso`, `notas`, `usuario_id` | Pestaña Finanzas → Empleados y nómina estimada; los gastos de tipo sueldo se asocian por `gastos.empleado_id` | **Solo admin**, en la API (tabla de permisos: por defecto solo admin, más `requireAcceso`) y en la pantalla (`finanzas`: solo admin) | 🟡 Ver el detalle abajo (2.4). |
| `proveedores` (17; todos con RUT, contacto y teléfono) | `nombre`, `rut`, `contacto`, `telefono`, `email`, `direccion`, `notas` | Compras, gastos y activos | **Solo admin** (API y pantalla) | 🟡 Mismo patrón que empleados. Si el proveedor es persona natural, su RUT y contacto son datos personales (1 de 17 parece RUT de persona natural). |
| `cuentas_persona` (313; 162 con nombre) | `nombre` (texto libre del comensal) | Dividir la cuenta por persona en POS y Pagos | **Toda sesión**, vía `GET /api/cuentas-persona` | 🟡 Es lo más parecido a datos de clientes; sin identificación fuerte (nombre de pila escrito a mano). |

### 2.2 Nombres copiados como texto (no se corrigen al editar al usuario)

Estas columnas guardan una **copia del nombre** de quien actuó. Corregir o anonimizar al usuario **no las alcanza**; la sesión 18 tiene que tratarlas.

| Tabla | Columnas | Quién las ve |
|---|---|---|
| `pagos` | `cobrado_por_nombre` | Admin y cajero (Pagos, reportes) |
| `cajas` | `usuario_apertura_nombre`, `usuario_cierre_nombre` | Admin y cajero (Caja) |
| `movimientos_caja` | `usuario_nombre` | Admin y cajero |
| `perdidas_comanda` | `autorizado_por_nombre`, `responsable_nombre`, `resuelto_por_nombre` | Admin y cajero |
| `permisos_especiales` | `otorgado_por_nombre`, `revocado_por_nombre` | Admin |
| `auditoria_admin` | `usuario_nombre` | Nadie hoy (ver 2.3) |

Son **10 columnas en 6 tablas**. Además hay nombres dentro de texto libre, por ejemplo la nota de un ajuste manual de stock (`Ajuste manual por <nombre>: <motivo>`, en `movimientos_inventario`) y la nota que deja el cierre de una orden con "quién borró". La boleta que se imprime al cliente muestra "Atendido por: <nombre>", leído en vivo desde `usuarios`.

### 2.3 Registro y operación

| Tabla (filas) | Datos personales | Quién lo ve | Riesgo |
|---|---|---|---|
| `auditoria_admin` (1.503; 7 tipos de acción: órdenes eliminadas y canceladas, pérdidas cobradas parcialmente, precio manual, descuadre de cierre, producto e insumo eliminados) | `usuario_id`, `usuario_nombre`, `usuario_rol`, `detalles` (JSON sin datos personales, solo ids, montos y motivos) | **Nadie**: `getAuditoriaAdmin` no tiene llamadores; no hay ruta ni pantalla que la lea | 🟡 **No registra accesos ni cambios** a empleados, proveedores o usuarios, y no se purga. Es la tabla que la sesión 17 debe extender. |
| `intentos_login` (22) | La **clave contiene email + IP** (`ui:<email>\|<ip>`, `ug:<email>`, `ip:<ip>`; 4 filas viejas con prefijo `u:`) | Solo el servidor; el admin ve el estado de bloqueo | 🟡 IP y email juntos son dato personal. Se limpia a las 24 h, salvo 30 días si hubo un ingreso correcto. |
| `sesiones` (730; 0 vigentes) | `usuario_id`, hash del token, fechas. **No guarda IP ni user-agent** | Solo el servidor | 🟡 Nunca se purgan (la más antigua es del 19-11-2026). |
| `notificaciones` (54; la más antigua del 28-05-2026) | `destinatario_usuario_id`, `mesa_nombre`, `mensaje` (generado por la app) | El destinatario | 🟡 Sin purga. |
| `limite_peticiones` (185) | Clave con hash del token de sesión | Solo el servidor | ⚪ Se limpia sola (1 h). |
| `configuracion` (24 claves) | `nombre_negocio`, `direccion`, `telefono` del local (datos del negocio; personales solo si el local es persona natural) | Lectura: toda sesión; escritura: admin | ⚪ |

### 2.4 Detalle de `empleados` y `proveedores`

- **Lectura sin lista blanca:** `getEmpleados` y `getProveedores` hacen `SELECT *`. Una columna sensible nueva saldría hacia afuera por defecto (el mismo defecto que `mapUsuario` ya corrigió en C11).
- **Exceso de datos en pantalla:** la pestaña Gastos pide `/api/empleados` y `/api/proveedores` completos solo para mostrar nombres; Compras y Activos piden los proveedores completos por lo mismo. Solo el admin lo recibe, pero la descarga trae documento y sueldo.
- **No se puede vaciar un campo:** `actualizarEmpleado` y `actualizarProveedor` usan `COALESCE(nuevo, actual)`, así que enviar vacío o nulo deja el valor anterior. Esto impide la rectificación a "sin dato" y la supresión parcial (sesión 18).
- **No hay `DELETE`** de empleados ni de proveedores (solo desactivar con `activo = false`): los datos personales permanecen para siempre.
- **Sin auditoría:** nadie registra quién abrió, consultó, creó, cambió o desactivó un empleado, proveedor o usuario.
- **Sin validación del RUT:** `documento` y `rut` son texto libre de hasta 40 y 20 caracteres (sin Módulo 11; está pendiente en AGENTS.md).
- **Sueldo sin protección extra:** `sueldo_base` es texto numérico en claro, como todo el resto de la base (sin cifrado a nivel de columna). El acceso se controla por rol; no hay más defensa.

### 2.5 Texto libre y pagos

| Dato | Filas con valor | Observación |
|---|---|---|
| `ordenes.notas` | 1.864 | Las escribe el personal; puede contener un nombre o teléfono de cliente. Sin control. |
| `items_orden.notas_especiales` | 174 | Igual |
| `perdidas_comanda.motivo` | 304 | Igual |
| `cajas.notas` | 79 | Igual |
| `pagos.referencia` | 142 | Ninguna parece número de tarjeta (0 con 13 a 19 dígitos). **No se guardan datos de tarjeta.** ✅ |

### 2.6 Lo que sí está bien

- `pin_hash` es bcrypt y **nunca sale por la API** (lista blanca `mapUsuario`; revisado en vivo en la sesión 6.5: 40 rutas GET y 4 roles, 0 hallazgos).
- Las sesiones no guardan IP ni user-agent.
- `/menu` (`GET /api/menu-publico`) devuelve solo carta (id, nombre, descripción, precio, categoría) y el nombre del negocio, sin datos personales.
- El acceso a empleados y proveedores es solo admin tanto en la API como en la pantalla.

---

## 3. Encargados del tratamiento y transferencia internacional

| Proveedor | Para qué | Región | Transferencia internacional |
|---|---|---|---|
| **Neon** (Postgres) | Guarda **toda** la base (usuarios, empleados, proveedores, ventas) | **AWS us-east-1** (EE. UU.). Consta en la configuración local y en `ARQUITECTURA.md`. | **Sí**: fuera de Chile (y de México). Debe ir en el aviso de privacidad (sesión 19). |
| **Vercel** (hosting y funciones) | Ejecuta la app; ve cada petición | **No consta en el repo:** `vercel.json` no fija regiones y ningún documento la menciona. | **A confirmar por el usuario en P5** (Vercel → proyecto → Settings → Functions). Si es EE. UU., es transferencia internacional. |
| **Vercel Analytics** (`@vercel/analytics` en `app/layout.tsx`, solo se carga con `NODE_ENV=production`) | Mide visitas, también las de `/menu` (clientes del local) | No consta | **Decidido (21-11-2026): se quita en la sesión 17** (`app/layout.tsx` y la dependencia, que nada más usa). Con eso deja de ser un encargado y **el aviso de la sesión 19 no lo menciona**. |

Neon y Vercel son **encargados del tratamiento**: hace falta revisar sus contratos de tratamiento de datos (DPA) y listarlos en el aviso. El rol legal de Latencia Cero SpA frente al del local (responsable o encargado) lo define el abogado antes de redactar el aviso.

### Respaldos de Neon

Neon permite restaurar la base a un punto en el tiempo. Eso significa que **la anonimización o el borrado de la sesión 18 no alcanzan las copias** dentro de la ventana de restauración. La respuesta a un titular debe decirlo. La **ventana de restauración vigente no consta** en el repo: **a confirmar por el usuario en P5** (depende del plan de Neon).

---

## 4. Retención propuesta

| Dato | Plazo | Origen |
|---|---|---|
| Órdenes, pagos, caja, compras, gastos, pérdidas (respaldo tributario) | **6 años** | Verificado (SII). No se borran antes: solo se anonimiza lo personal que no sea necesario. |
| `empleados` (contratos, sueldos) | **A confirmar con el contador. Sin cifra.** | Pendiente |
| `auditoria_admin` | 6 años (acompaña lo tributario) | **Propuesta del sistema**, no mandato legal |
| `sesiones` revocadas o vencidas | 90 días | **Propuesta del sistema** |
| `notificaciones` | 90 días | **Propuesta del sistema** |
| `intentos_login` | Como hoy: 24 h, o 30 días con un ingreso correcto | Ya implementado |
| `limite_peticiones` | Como hoy: 1 h | Ya implementado |

### Purgas: decidido por el usuario (21-11-2026), va en la sesión 17

Hoy `sesiones` y `notificaciones` solo crecen. **Decisión: borrado oportunista en el login**, sin cron ni peticiones periódicas nuevas (la opción del cron queda descartada):

- `sesiones` vencidas o revocadas hace más de 90 días (`expira` o `revocada_at` anteriores a ahora menos 90 días; una sesión vigente nunca se toca).
- `notificaciones` con más de 90 días (`creado_at`).
- Un `DELETE` **acotado con `LIMIT`**: Postgres no admite `LIMIT` en `DELETE`, así que va como `DELETE ... WHERE id IN (SELECT id ... LIMIT N)`; el tamaño de `N` se fija al implementar. Una purga grande se reparte entre varios logins.
- Se ejecuta dentro del flujo de ingreso, como ya hace `limpiarIntentosViejos`; **un fallo de la purga no puede bloquear ni demorar el login** (se anota en el log).

---

## 5. Plan detallado de las sesiones 17 a 19

### Sesión 17: datos sensibles solo admin y registro de accesos

1. **Lista blanca de campos.** Módulos puros `mapEmpleado` y `mapProveedor` (como `usuario-map.ts`, con prueba unitaria) y `SELECT` con columnas explícitas: una columna nueva no sale por defecto.
2. **Vista reducida para quien solo necesita nombres.** `?vista=basica` (o ruta aparte) que devuelve `id`, `nombre` y `activo`; Gastos, Compras y Activos pasan a usarla. El detalle (documento, sueldo, teléfono, email) solo en Finanzas → Empleados y Proveedores.
3. **Registro de accesos, extendiendo `auditoria_admin`** (sin tabla nueva). Acciones nuevas: `ver_datos_personales`, `crear`, `modificar` y `desactivar` sobre `empleado`, `proveedor` y `usuario`. En `detalles` van los **campos tocados, nunca los valores** (ni documento, ni sueldo, ni PIN). Una entrada por consulta de lista (con la cantidad de filas) y una por detalle abierto. **Decidido (21-11-2026):** el registro de una **lectura** que falla solo se anota en el log y la respuesta sigue; el registro de una **modificación** va dentro de la misma `sql.transaction` del cambio y, **si falla, el cambio se revierte**.
4. **Lectura de la auditoría.** `GET /api/auditoria` solo admin (zod `.strict()`, filtros por entidad, acción y fechas, límite) y una vista en Configuración o Usuarios. Hoy nadie puede leerla.
5. **Menos datos hacia los demás roles.** Para quien no es admin, `GET /api/usuarios` deja de devolver el `email`. **Antes de cambiarlo, revisar qué pantallas leen `email` de otros usuarios** (el login y Usuarios son del admin); si alguna lo necesita, se discute.
6. **Purga oportunista en el login** (decidida, sección 4): `DELETE` acotado con `LIMIT` de las `sesiones` vencidas o revocadas hace más de 90 días y de las `notificaciones` de más de 90 días. Sin cron ni peticiones periódicas nuevas.
7. **Quitar Vercel Analytics** (decidido): borrar el uso en `app/layout.tsx` y la dependencia `@vercel/analytics` con `pnpm remove`, dejando el lockfile actualizado (Vercel instala con `--frozen-lockfile`) y comprobando con `pnpm build` que nada más la importa (hoy solo `app/layout.tsx`).
8. **Pruebas.** Módulo nuevo `datos-personales` (o dentro de `permisos` y `rutas`): 403 para cada rol no admin en lista y detalle, la lista blanca (una columna extra no sale), una entrada de auditoría por cada acción y sin valores en `detalles`, la ruta de auditoría solo admin, **una lectura cuyo registro falla responde igual y deja el log, una modificación cuyo registro falla se revierte (el cambio no queda)** y la purga (borra solo lo viejo y acotado por el `LIMIT`; no toca sesiones vigentes ni notificaciones recientes; un fallo de la purga no impide el login). Las filas viejas de prueba se siembran marcadas "prueba <comando> <fecha>" y se limpian al terminar.

**Decisiones del usuario (21-11-2026), ya tomadas:** el fallo del registro de una lectura solo se anota en el log y el de una modificación revierte el cambio; la purga es oportunista en el login; Vercel Analytics se quita. No queda ninguna decisión pendiente para esta sesión.

### Sesión 18: derechos ARCOP

1. **Tabla de solicitudes** `solicitudes_arco`: tipo (acceso, rectificación, supresión, oposición, portabilidad), titular (tipo y id), canal, `ingresada_en`, **`vence_en` = ingreso + 30 días corridos**, `prorrogada` (una sola vez, con motivo, que suma 30 días más), estado, resolución, quién la resolvió y cuándo. Cada solicitud y cada resolución quedan en `auditoria_admin`.
2. **Exportar** (acceso y portabilidad): un JSON por titular con sus datos de `usuarios`, `empleados` y `proveedores`, y los registros donde figura. Solo admin. Los nombres de `cuentas_persona` no son identificables por persona (texto libre); se documenta que no se pueden ubicar con certeza.
3. **Rectificar:** el `PATCH` de empleados y proveedores distingue "campo ausente" de "campo vacío" (hoy `COALESCE` lo impide) y permite dejar un dato en blanco.
4. **Suprimir o anonimizar, en una sola `sql.transaction` por titular:**
   - Empleado: nombre, documento, teléfono, email y notas se reemplazan o quedan nulos; se conserva el id y los montos de gastos (respaldo tributario y laboral a 6 años o lo que confirme el contador).
   - Usuario: email y nombre se anonimizan, se desactiva, se revocan sus sesiones. Se anonimizan **las 10 columnas de nombre copiado** (sección 2.2). Los nombres dentro de texto libre se buscan por el nombre del titular y se tratan caso a caso (lista conocida: nota del ajuste de stock y nota de cierre de orden).
   - Proveedor persona natural: contacto, teléfono, email, dirección y notas se anonimizan; el RUT queda mientras existan compras con documento dentro de los 6 años.
   - **Regla de retención:** si algo debe conservarse por obligación tributaria, no se borra y la respuesta al titular lo dice con su fundamento. Se anonimiza solo lo que no es necesario.
   - La respuesta menciona que **los respaldos de Neon** conservan el dato dentro de su ventana (a confirmar en P5).
5. **Validar el RUT con Módulo 11** en `empleados.documento` y `proveedores.rut` (aceptar otro tipo de documento para extranjeros; no bloquear los datos antiguos).
6. **F51** (claves foráneas de usuario) no es requisito; conviene revisarlo antes para no dejar referencias huérfanas al anonimizar.
7. **Pruebas:** titulares de prueba marcados "prueba <comando> <fecha>"; exportar, rectificar a vacío, anonimizar (se verifican las 10 columnas, la auditoría y que los montos y totales no cambian), el rechazo cuando hay algo que conservar, el cálculo de `vence_en` y la prórroga única, 403 a los no admin y carreras de 3 rondas.

**Pendiente del usuario:** si el sueldo se conserva o se anonimiza al cerrar la relación laboral; **sigue pendiente hasta la respuesta del contador**. También el texto de la respuesta al titular. (La purga ya está decidida y va en la sesión 17.)

### Sesión 19: aviso de privacidad y procedimiento de brechas

1. **Aviso de privacidad visible** en el login y en `/menu`, con versión y fecha (módulo `lib/aviso-privacidad.ts` y un componente reutilizable). Contenido: responsable y su rol (a definir con el abogado), datos tratados, finalidades, base de licitud, destinatarios y **encargados (Neon y Vercel; Vercel Analytics ya no se menciona porque se quita en la sesión 17)**, **transferencia internacional** (Neon en AWS us-east-1; Vercel según lo que confirme el usuario en P5), plazos de conservación (sección 4), cómo ejercer los derechos (canal y plazo de 30 días corridos) y cómo se informan los cambios. Versión para Chile y para México (México exige el aviso expresamente). **Textos en borrador, para revisión legal.**
2. **Procedimiento escrito de brechas** (documento, no código; por ejemplo `PROCEDIMIENTO_BRECHAS.md`): qué es una brecha, cómo se detecta (logs de Vercel y Neon, bloqueos de `intentos_login`), quién decide, cómo se contiene (revocar sesiones, rotar secretos), cómo se evalúa el riesgo razonable, la notificación a la Agencia **"por los medios más expeditos posibles y sin dilaciones indebidas" (art. 14 sexies)**, el aviso a los titulares, el registro del incidente y una plantilla de comunicación. **El plazo interno de 72 horas se escribe como estándar propio, no como mandato legal.** México: autoridad y plazos por verificar.
3. **Pruebas:** el aviso aparece en el login y en `/menu`, muestra la versión y no rompe la pantalla (verificación en navegador); el procedimiento es un documento y no tiene prueba.

---

## 6. Datos a confirmar por el usuario en P5

- Región de Vercel (funciones).
- Ventana de restauración de los respaldos de Neon.
- Contratos de tratamiento de datos (DPA) de Neon y Vercel.
- Rol legal de Latencia Cero SpA (responsable o encargado) y canal para ejercer derechos.
- Conservación laboral con el contador (sin cifra hoy).

## 7. Resumen de riesgos

| | Riesgo | Sesión |
|---|---|---|
| 🔴 | `accesos-rapidos` público muestra nombre y email sin sesión | P1 y P3 (ya anotado) |
| 🟡 | Cualquier rol ve el email de todos los usuarios | 17 |
| 🟡 | Empleados y proveedores sin lista blanca y descargados completos para ver nombres | 17 |
| 🟡 | Nadie registra accesos ni cambios a datos personales; la auditoría no se puede leer | 17 |
| 🟡 | No se puede vaciar un campo ni borrar un empleado o proveedor | 18 |
| 🟡 | 10 columnas de nombre copiado y nombres en texto libre sin tratamiento | 18 |
| 🟡 | Sin aviso de privacidad ni procedimiento de brechas; Neon y Vercel sin declarar | 19 |
| 🟡 | Vercel Analytics procesa visitas (también de `/menu`) sin declarar | 17 (se quita, decidido) |
| 🟡 | `sesiones` y `notificaciones` sin purga | 17 (decidido: borrado oportunista en el login) |
| 🟡 | La clave de `intentos_login` guarda email e IP | Se limpia a las 24 h o 30 días (ya implementado); sin cambio previsto |
| 🟡 | Respaldos de Neon fuera del alcance de una anonimización | P5 (dato a confirmar) |
