# ROADMAP — Sodamaster

Repositorio: `rockebrioqlo/v0-soda-master-v2-app` (se trabaja solo con la cuenta GitHub **rockebrioqlo**).
Diagnóstico inicial: 19-11-2026. Última revisión del ROADMAP: 19-11-2026 (sesión 6).

---

## 1. Resumen del diagnóstico

Sodamaster es un POS para sodas y restaurantes (mesas, comandas, KDS, pagos, caja, inventario, recetas, finanzas y reportes). A diferencia de la típica maqueta de v0, **el backend es real**: unas 60 rutas de API que leen y escriben en Neon Postgres. Estuvo en producción en Vercel con un cliente de prueba hasta junio de 2026.

Se verificó en el código lo que `ESTADO_DESARROLLO.md` da por hecho: los 18 arreglos revisados existen, pero algunos quedaron a medias y hay afirmaciones falsas (el bloqueo por intentos fallidos y la protección de `DELETE /api/seed`).

El problema principal es la **seguridad**: la API no exige sesión y varias reglas de negocio (montos, permisos por rol) se aplican solo en la pantalla.

### Avance real

| Área | Avance |
|---|---|
| Visual / pantallas | ~90% |
| Backend funcional | ~70% |
| Seguridad | ~10% |
| Multi-tenant (SaaS) | 0% |

### Stack detectado

| Pieza | Detalle |
|---|---|
| Framework | Next.js 16.2.6, React 19, TypeScript 5.7 |
| Estilos | Tailwind v4, shadcn/ui (Radix), Lucide |
| Base de datos | Neon Postgres con SQL directo (`@neondatabase/serverless`), sin ORM, esquema `soda_master` |
| Login | Propio: email + PIN con bcrypt; sesión solo en `sessionStorage` del navegador (sin cookie ni token) |
| Paquetes / deploy | pnpm 10, Vercel, sincronizado con v0 |
| Sin uso | `dexie` y `dexie-react-hooks` (instalados, nadie los importa) |

### Variables de entorno

- Obligatoria: `DATABASE_URL` (Neon). Opcional: `DEBUG_NTP`.
- `.env.local` creado en la sesión 1 (ignorado por git).

### Decisiones del usuario

- **Meta:** dejar el sistema en estado decente para vender en Chile y preparado para México.
- **Estándar:** cumplir con el más exigente de cada tema: WCAG 2.1 AA en accesibilidad (sin certificación) y nivel GDPR en datos personales (cubre Ley 21.719 de Chile y LFPDPPP 2025 de México).
- **Base de datos de pruebas:** se prueba contra la base Neon actual, con datos reales, a propósito. Antes de producción final se vacían los datos (no las tablas). Ver sección 5.
- **Accesos rápidos del login (PINs demo):** se mantienen durante el desarrollo. Se controlan con una variable de entorno antes de producción final (sección 5).
- **Prioridad:** los bugs van antes que cualquier mejora nueva. Única excepción pedida: la sesión de inventario con conversión de unidades va justo después de los bugs críticos. Después de los bugs: cumplimiento para vender en Chile, mejoras técnicas, preparación para México y SaaS.

---

## 2. Hallazgos

### 🔴 Rompe o expone

| # | Hallazgo | Dónde |
|---|---|---|
| R1 | Ninguna ruta de la API exige sesión; no hay middleware. Cualquiera con la URL puede crear pagos, cambiar configuración, editar usuarios/PINs o borrar datos. Algunas rutas confían en un `usuario_id` enviado por el navegador. Incluye los 5 endpoints nuevos de C3. ✅ **Resuelto en sesión 3:** sesión en servidor (tabla `sesiones` + cookie httpOnly firmada, 12 h), `proxy.ts` exige sesión y rol en `app/api/**` según `lib/permisos-api.ts`, las rutas toman el usuario de la sesión y las autorizaciones de admin usan un token firmado de 5 min. | `app/api/**`, `proxy.ts`, `lib/sesion.ts`, `lib/permisos-api.ts` |
| R2 | El monto de los pagos lo decidía el navegador (A1). Un pago de `$1` por una mesa de `$50.000` se aceptaba. ✅ **Resuelto en sesión 5:** el servidor calcula el monto desde la base (ítems, descuento de la orden y configuración) con `lib/cobro.ts`, la misma función que usa la pantalla de Pagos; `POST /api/pagos` valida el body con zod (`.strict()`), toma al cobrador de la sesión y rechaza con 409 `MONTO_DISTINTO` si el monto de pantalla no coincide. El cobro va en una sola `sql.transaction` (bloqueo de la orden, `assert_cobro`, reclamo de ítems, pago, cierre de orden y caja): doble cobro → 409, cobros concurrentes → solo uno gana. | `lib/db.ts` → `crearPago`, `lib/cobro.ts`, `app/api/pagos/route.ts` |
| R3 | `PATCH /api/ordenes` aceptaba cambiar total o estado de una orden sin restricciones (A7); cambiar el total siendo mesero devolvía 200. ✅ **Resuelto en sesión 6:** body validado con zod `.strict()` (solo `id`, `action`, `estado`, `notas`; montos, `enviado_a_cocina`, `hora_envio` y `usuario_id` → 400); estados y transiciones por rol (`lib/ordenes-reglas.ts`): mesero/cajero → `en_cocina` y notas, cocina/bar → `en_preparacion`/`listo`/`problema`, admin → además `cancelado` (con motivo, solo sin ítems pagados, queda en `auditoria_admin`); nadie fija `pagado`, `perdida` ni `entregado` ni reabre órdenes pagadas, canceladas o perdidas. `subtotal`, `impuesto` y `total` los calcula el servidor desde los ítems y el descuento (`db.recalcularTotalesOrden`). Cancelar y borrar órdenes y editar o borrar ítems usan el patrón del cobro (`sql.transaction` con la orden bloqueada y `assert_cobro`): un cobro parcial concurrente nunca deja una orden cancelada o borrada con ítems pagados. `DELETE /api/ordenes` nunca borra órdenes con ítems pagados o históricas; mesero y cajero solo la propia con ítems en `pendiente`. | `app/api/ordenes/route.ts`, `lib/ordenes-patch.ts`, `lib/ordenes-reglas.ts`, `lib/db.ts` |
| R4 | **No existe bloqueo por intentos fallidos, ni en el servidor ni en la pantalla.** `ESTADO_DESARROLLO.md` lo marca como hecho ("3 intentos = 5 min bloqueo"), pero `mapUsuario` siempre devuelve `intentosFallidos: 0` y `bloqueadoHasta: null`, el login no cuenta intentos y la BD no guarda nada. Solo queda un aviso de "bloqueado" en `usuarios-page.tsx` que nunca se muestra. Con PINs de 4 dígitos se prueban todos en segundos. ✅ **Resuelto en las sesiones 3 y 4.** Sesión 3: bloqueo en el servidor por usuario (3 fallos → 5 min, se duplica hasta 1 h) y por IP (20 fallos en 15 min → 15 min) en `/api/auth/login` y `/api/auth/verificar-pin`, tabla `intentos_login`; un admin desbloquea con `POST /api/auth/desbloquear`. Sesión 4: `GET /api/usuarios` (solo para admin) devuelve el bloqueo real leído de `intentos_login`; `usuarios-page.tsx` muestra "Bloqueado hasta HH:MM" y un botón "Desbloquear" (solo admin, usa `POST /api/auth/desbloquear`); sesión única por usuario (`a81ae1a`, `db.crearSesion` revoca las anteriores); límite de 240 peticiones/min por sesión en `proxy.ts` (`lib/limite-api.ts`, tabla `limite_peticiones`, fail-open); el 429 en la interfaz avisa y pausa los sondeos (`lib/pausa-limite.ts`). **Pendiente del usuario:** configurar en Vercel WAF el límite por IP y de anónimos (P4). | `app/api/auth/login/route.ts`, `lib/db.ts:34-46`, `components/login-form.tsx` |
| R6 | `/api/seed`, `/api/seed-demo` y `/api/seed-recetas` son públicas. **`DELETE /api/seed` vacía usuarios, mesas, productos, órdenes y pagos sin ninguna protección** (el doc heredado dice "solo desarrollo", pero no hay chequeo de entorno). Una sola petición borra la base. ✅ **Resuelto en sesión 2:** `DELETE` eliminado; `POST /api/seed*` cerradas con `PERMITIR_SEED` y bloqueadas siempre en Vercel producción; la app ya no siembra al cargar. | `app/api/seed/route.ts`, `lib/seed-guard.ts` |
| R7 | Operaciones de varios pasos sin transacción real: cobro, división de cuenta (A2), crear orden + ítems (#11), descuento de stock por receta (si falta un ingrediente, los anteriores ya se descontaron), crear producto, compras. | `lib/db.ts`, `components/pos-page.tsx` |

> R5 (PINs demo visibles en el login) dejó de ser un hallazgo urgente por decisión del usuario: pasa a la sección 5, "Antes de producción final".

### 🟡 Frágil

| # | Hallazgo |
|---|---|
| F1 | Sin pruebas automáticas ni validación con zod en la API. |
| F2 | Las tablas base (usuarios, productos, mesas, órdenes, ítems, pagos) no se crean en ningún archivo del repo; solo hay migraciones incrementales en `lib/db.ts`. **Por verificar.** |
| F6 | Componentes muy grandes: `pos-page.tsx` (~2.700 líneas), `pagos-page.tsx` (~2.400), `lib/db.ts` (~4.800). |
| F7 | **El navegador nunca carga `configuracion` al iniciar:** solo la pantalla de Configuración la pide (`cargarConfiguracion`). POS y Pagos usan los valores por defecto del cliente (IVA apagado, propina por defecto 0 %) aunque la base diga otra cosa (hoy `impuesto_habilitado = true`, `tasa_impuesto = 19`, `propina_default = 10`, guardados el 22-05-2026 al grabar la pantalla de Configuración). Por eso las boletas no desglosaban IVA hasta que alguien abría Configuración en esa pestaña. Sesión 5: el cobro no se ve afectado (el IVA va incluido en el precio y no cambia el total), pero conviene cargar la configuración al iniciar sesión y decidir con el usuario si el IVA se desglosa en la boleta. Con `propinas_habilitadas = false` en la base el servidor rechaza propinas (400) aunque la pantalla las ofrezca. |
| F8 | El mesero que editaba ingredientes extra de un ítem ya enviado a cocina recibía 403 si el extra cambiaba el precio, porque el precio lo mandaba el navegador. ✅ **Resuelto en sesión 6:** el servidor calcula `precio_unitario` (`db.calcularPrecioItem`: producto + extras de receta o ingredientes especiales, con su `costo_adicional` de la base); el valor del navegador se ignora y la respuesta trae el precio real. El mesero edita extras tras enviar a cocina (200). Solo el admin fija un precio a mano (`precio_manual` + `motivo`, con registro en `auditoria_admin`). Las variantes no existen en el modelo de datos (una "variante" es un producto clonado). |
| F9 | La función SQL `assert_cobro` y las columnas `pagos.cobrado_por` / `cobrado_por_nombre` se crean desde `ensurePagoSchema()` (idempotente, en el primer cobro de cada instancia). En una base nueva el primer cobro corre esa migración; probado contra Neon, no contra una base vacía. |
| F10 | Borrar un ítem o una orden no devuelve el stock descontado, y editar los extras de un ítem ya creado no ajusta el inventario. Visto en las pruebas de la sesión 6 (el stock de un producto de prueba se agotó). Va con la atomicidad de la sesión 8. |
| F11 | `PATCH /api/items-orden` acepta cualquier `estado_item` de cualquier rol permitido (mesero, cajero, cocina, bar); solo se restringió que cocina y bar no toquen cantidad, extras, notas ni precio. La matriz de estados de ítem por rol queda para la sesión 13 (KDS). El servidor tampoco impide editar ítems `listo` o `entregado` (solo lo bloquea el POS). |

### ⚪ Estético

- README genérico de v0 (corregido en sesión 1); `package.json` se llama `"my-project"`.
- `dexie` instalado sin uso; rutas `/api/depreciacion` y `/api/productos/especiales` sin uso desde la app.

### 📋 Cumplimiento (para vender en Chile y preparar México)

| # | Hallazgo |
|---|---|
| K1 | Datos personales sin aviso de privacidad, sin forma de exportar, corregir o eliminar los datos de una persona y sin registro de quién los ve. Hay datos sensibles: `empleados` guarda documento, teléfono, email y sueldo; `proveedores` guarda RUT. No se encontró tabla de clientes ni fiados (por confirmar en la sesión 16). |
| K2 | Accesibilidad sin revisar (teclado, textos alternativos, etiquetas de formularios). |
| K3 | Sin boleta electrónica: solo se imprimen tickets desde el navegador. El SII exige boleta electrónica por pagos en efectivo y transferencias (el voucher de tarjeta ya vale como boleta). |
| K4 | Localización fija en Chile: `formatCurrency` y otros 15 usos de `es-CL` en el código. La tasa de IVA ya es configurable (`tasa_impuesto`), pero moneda, formato de fecha e identificador fiscal no. |

### Fuera de alcance actual: SaaS multi-tenant

El sistema es para **un solo local**: sin tenants, sin planes, amarrado al esquema `soda_master`.

---

## 3. Bugs pendientes de `ESTADO_DESARROLLO.md`

Todos quedan asignados a una sesión (sección 4). C2 ya está corregido. Estado verificado en el código el 19-11-2026.

| Bug | Gravedad | Resumen | Sesión |
|---|---|---|---|
| #10 / C3 | 🔴 Crítico | APIs sin autenticación (incluye 5 endpoints nuevos) | 3 ✅ |
| A1 | 🔴 Crítico | `crearPago`: monto del cliente, no atómico | 5 ✅ |
| A5 | 🔴 Crítico | Primer pago muestra "Mesa desconocida" | 5 ✅ |
| A7 | 🔴 Crítico | `PATCH /api/ordenes` acepta cualquier campo | 6 ✅ |
| A6 | 🔴 Crítico | Error de permiso especial se devuelve como 500 genérico | 6 ✅ |
| A2 | 🔴 Crítico | `aplicarAsignacionesCuentas` no atómico ni valida pertenencia | 7 |
| #11 | 🔴 Crítico | Orden + ítems no transaccional | 8 |
| A3 | 🔴 Crítico | Eliminar persona borra historial de lo pagado | 9 |
| A4 | 🔴 Crítico | Polling del KDS se reinicia en cada cambio | 10 |
| B1 | 🟠 Importante | `crearOrden` puede borrar una orden recién creada por otra request | 8 |
| B2 | 🟠 Importante | `registrarPerdida` permite doble registro en paralelo | 7 |
| B3 | 🟠 Importante | `resolverPerdida` no valida el monto | 9 |
| B7 | 🟠 Importante | Polling agresivo combinado (~1.080 requests/hora por sesión) | 10 |
| B4 | 🟠 Importante | Prorrateo de descuento con ítems ya pagados | 12 |
| B5 | 🟠 Importante | KDS: "problema" en 1 ítem marca toda la orden | 13 |
| B6 | 🟠 Importante | `handleMarkReady` sin manejo de errores | 13 |
| C4 | 🟡 Menor | POS no explica que falta un permiso especial | 6 ✅ |
| C1 | 🟡 Menor | `pagos.sort()` muta el estado | 14 |
| C5 | 🟡 Menor | `mapPago` reexporta campos extra (`total`) | 14 |
| C6 | 🟡 Menor | Falta índice en `items_orden(orden_id, pagado)` | 14 |
| C7 | 🟡 Menor | `setTimeout` del toast no se cancela al desmontar | 14 |
| C8 | 🟡 Menor | Botón "quitar persona" visible con ítems recién asignados | 14 |
| C9 | 🟡 Menor | Pagos: tras cobrar, el formulario no se limpia y queda un "Vuelto $10.000" residual (con el total en $0). Es estado del formulario (efectivo recibido) que no se reinicia. Visto en la sesión 6 | 14 |
| #23 | 🟡 Menor | Crear/editar mesa ignora el nombre personalizado | 15 |
| #26 | 🟡 Menor | Init silencia errores y muestra app vacía | 15 |
| B8 / #24 | 🟡 Menor | Log `[v0]` en `pos-page.tsx:810` | 15 |
| #27 | 🟡 Menor | Commits con `Co-authored-by: Cursor` (decidir y documentar; no reescribir historial) | 15 |
| #9 | Antes de producción | PINs demo visibles en el login | P1 |

---

## 4. Sesiones planificadas

Regla: **1 tarea atómica por sesión**, `pnpm build` antes de cerrar, sin `git push` sin autorización. Las pruebas se hacen contra la base Neon actual (decisión del usuario).

### Hecho

| Sesión | Tarea | Modelo |
|---|---|---|
| 1 ✅ | Archivos de control, `.env.example`, `.env.local`, `pnpm install` + `pnpm build`, servidor local | Opus 5.5 |
| 2 ✅ | Rutas de seed cerradas: `DELETE /api/seed` eliminado (405), `POST /api/seed*` responden 403 salvo `PERMITIR_SEED=true` y nunca en `VERCEL_ENV=production`; el arranque ya no llama `/api/seed`. | Opus 5.5 |
| 3 ✅ | Login real: sesión en servidor (tabla `sesiones`, cookie httpOnly `sm_sesion` firmada con `SESION_SECRETO`, 12 h), `proxy.ts` + `requireSesion()` con la tabla de `lib/permisos-api.ts`, rutas que toman el usuario de la sesión, autorización firmada de admin de 5 min, usuarios desactivados rechazados y con sesiones revocadas, límite de PIN fallidos por usuario e IP, desbloqueo por admin, logout que revoca, `GET /api/menu-publico` para el menú QR. | Opus 5.5 |

### Bloque A — Bugs críticos (seguridad, dinero, datos)

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 4 ✅ | Rate limiting: 240 peticiones/min por sesión en `proxy.ts` (contador atómico en Neon, hash de la cookie con firma ya verificada, en paralelo con la validación de sesión, fail-open); anónimas y cookie falsa → 401 en memoria sin tocar la base; 429 con `Retry-After`; la interfaz avisa y pausa los sondeos; Usuarios muestra el bloqueo por PIN y el botón "Desbloquear" (solo admin). El límite por IP y anónimo queda en Vercel WAF (P4). **Añadido en la misma sesión (`a81ae1a`):** sesión única por usuario; el login revoca las sesiones anteriores del usuario (cuentas nominales para trazabilidad de ventas y entregas; si roban una tablet, el admin entra desde otro equipo y la anterior se cierra), y por eso el cupo de 240/min queda efectivamente por usuario. | Sonnet 5.5 | R4 |
| 5 ✅ | **Cobro seguro.** `crearPago` transaccional (`sql.transaction` + función SQL `soda_master.assert_cobro`, código de error `SM409`): el servidor calcula monto, descuento, IVA y vuelto desde la base (`lib/cobro.ts`, compartido con la pantalla de Pagos); `monto_esperado` distinto → 409; orden o ítems ya pagados → 409 (`ORDEN_YA_PAGADA`, `ITEMS_YA_PAGADOS`); cobros concurrentes → solo uno gana; efectivo sin caja abierta → 409 `CAJA_CERRADA` (tarjeta sí se permite); caja: `venta_efectivo = monto + propina + vuelto` y `vuelto` como salida, con el cobrador de la sesión (el arqueo cuadra con el efectivo físico); el pago creado trae `mesa_id` y `mesa_nombre` (A5); zod `.strict()` en el body; `pagos.cobrado_por` / `cobrado_por_nombre` desde la sesión; pago dividido con cuotas enteras (la última absorbe el redondeo); descuento visible tras recargar (se une a la orden) y lista de pendientes con descuento. **Añadido:** candado mínimo en `PATCH` y `DELETE /api/items-orden` (ítem pagado → 409; solo admin cambia `precio_unitario` → 403). **Decisión de IVA (la pidió el usuario):** los precios incluyen IVA, que se desglosa y no se suma (reproduce los totales que mostraba la boleta); con `precios_incluyen_iva = false` en `configuracion` se suma. | Sonnet 5.5 | R2, A1, A5 |
| 6 ✅ | **Órdenes y permisos.** `PATCH /api/ordenes` con zod `.strict()`, allowlist de campos y transiciones de estado por rol (`lib/ordenes-reglas.ts`); `subtotal`, `impuesto` y `total` calculados por el servidor (`recalcularTotalesOrden`, también al aplicar un descuento); cancelar (solo admin, con motivo y auditoría) y `DELETE /api/ordenes` nunca con ítems pagados, PATCH/DELETE de ítems con la orden bloqueada (`FOR UPDATE` + `assert_cobro`, mismo patrón del cobro: probado con cobros parciales en paralelo); precio de ítems calculado por el servidor (producto + extras, F8) con precio manual solo para admin (`precio_manual`, motivo y auditoría); el mesero edita extras tras enviar a cocina (200); cocina y bar solo cambian `estado_item`; POST de orden sin permiso `apertura_mesa` → 403 con el mensaje real y `codigo` (A6), el POS muestra "Pídele al admin un permiso temporal…" (C4); errores de estas rutas con su estado real (400/403/404/409). **Añadido:** `/api/ordenes/[id]` (sin uso en la app) pasa por la misma lógica; `DELETE` de una orden con descuento ya no falla (se borra el descuento). | Sonnet 5.5 | R3, A7, A6, C4, F8 |
| 7 | Atomicidad con lock por orden: `aplicarAsignacionesCuentas` (y validar que la persona pertenezca a la orden) y `registrarPerdida` (sin doble registro). | Sonnet 5.5 | R7, A2, B2 |
| 8 | Endpoint único orden + ítems en una transacción; mover el borrado de órdenes vacías dentro del lock; descuento de stock por receta todo-o-nada; devolver el stock al borrar una orden o un ítem y ajustarlo al editar extras (F10). | Sonnet 5.5 | R7, #11, B1, F10 |
| 9 | Integridad de cobros y pérdidas: no permitir eliminar personas con ítems pagados (A3); validar el monto en `resolverPerdida`, con motivo obligatorio si es menor (B3). | Sonnet 5.5 | A3, B3 |
| 10 | Polling y efectos: `recargarOrdenes` con ref para que no se reinicie (A4); subir intervalos y agrupar `mesas` + `notificaciones` en un solo endpoint (B7); **revisar todos los `useEffect` e intervalos de la app** (contexto, KDS, notificaciones, usuario activo, reloj del servidor) para encontrar los que se reinician solos o pueden entrar en loop. | Sonnet 5.5 | A4, B7 |

### Sesión pedida: inventario con conversión de unidades

| Sesión | Tarea | Modelo sugerido |
|---|---|---|
| 11 | Inventario con unidad de compra y unidad de consumo (detalle abajo). | Sonnet 5.5 |

**Alcance de la sesión 11.** Extender lo que ya existe, no rehacerlo: `ingredientes.unidad_medida`, `ingredientes.stock_actual` y `costo_unitario`, `receta_ingredientes.cantidad`, `compra_items` y `crearCompra` (que ya calcula promedio ponderado).

1. **Insumo con dos unidades:** cada ingrediente tiene una unidad de compra (ej. "paquete 1 kg" de salchichas), una unidad de consumo (ej. "unidad") y un factor por defecto (ej. 20). `unidad_medida` pasa a ser la unidad de consumo; se agregan columnas nuevas para la unidad de compra y el factor.
2. **Compra con factor corregible:** al registrar una compra, el formulario propone el factor por defecto y permite corregirlo con lo que realmente trajo el paquete (el envase dice 20, pero pueden venir 18 o 22). El factor real se guarda en `compra_items`.
3. **Stock y costo en unidad de consumo:** `crearCompra` convierte cantidad × factor real a unidad de consumo y calcula el costo unitario por unidad de consumo en el promedio ponderado.
4. **Recetas en unidad de consumo o en peso/volumen:** `receta_ingredientes.cantidad` descuenta en unidad de consumo (1 salchicha por completo) o en g/ml (150 g de carne), según la unidad de consumo del insumo.
5. **% de rendimiento opcional por insumo:** para lo que pierde peso al procesarse (carne cruda vs cocida). Si la receta pide 150 g cocidos y el rendimiento es 75%, se descuentan 200 g crudos. Se refleja también en el costo por receta y en márgenes.
6. **Migración segura de datos existentes:** factor 1 y rendimiento 100% por defecto, para que los insumos actuales sigan funcionando igual.
7. `crearCompra` hoy lee stock y costo y luego actualiza en pasos separados; dejar esa actualización atómica de paso (R7).

### Sesión pedida: permisos por usuario con selector de menús y funciones

| Sesión | Tarea | Modelo sugerido |
|---|---|---|
| 29 | Permisos por usuario: el admin marca con ticks qué menús ve y qué acciones operativas puede hacer cada persona (detalle abajo). Pedida por el usuario en la sesión 3; el orden respecto de los bugs lo decide el usuario. | Opus 5.5 |

**Alcance de la sesión 29.** Hoy los menús se ocultan por rol (`permisosModulo` en `lib/app-context.tsx`), más `roles_adicionales` y `permisos_especiales` temporales, y el servidor revisa por rol con la tabla de `lib/permisos-api.ts` (sesión 3). No hay selector por persona.

1. **Solo el admin crea cuentas y edita permisos** (crear usuarios ya es solo admin desde la sesión 3).
2. **Catálogo de permisos:** menús (Inicio, Mesas, POS, KDS, Pagos, Caja, Mermas, Reportes, Inventario, Finanzas, Usuarios, Configuración) y acciones operativas (crear/borrar mesas, cobrar, aplicar descuentos, autorizar descuentos, anular ítems o comandas, registrar mermas, abrir/cerrar caja, ver costos…). Definir la lista final con el usuario en la Fase 1.
3. **Por usuario:** columna o tabla de permisos (ej. `usuarios.permisos TEXT[]` o `usuario_permisos`), con migración idempotente que cargue a cada usuario actual lo que hoy le da su rol, para que nadie pierda acceso.
4. **Pantalla de Usuarios:** selector con ticks agrupados (menús / acciones), con botón "restablecer según rol".
5. **Interfaz:** el menú lateral, la navegación y los botones dentro de cada pantalla muestran solo lo marcado (ej. "Nueva Mesa" y borrar mesa; en la sesión 3 quedaron visibles solo para admin como solución provisoria).
6. **Servidor:** `proxy.ts` y `requireSesion()` revisan el permiso de la acción (la tabla de `lib/permisos-api.ts` pasa de "ruta → roles" a "ruta → permiso"); los permisos se leen frescos de la base en cada petición, igual que el rol hoy.
7. **Decisión pendiente para la Fase 1:** qué pasa con `roles_adicionales` y `permisos_especiales` temporales (por ejemplo `apertura_mesa`): reemplazarlos por los ticks, o mantener los temporales como permiso con vencimiento encima de los ticks.
8. Probar con más de un caso: usuario sin un menú no lo ve ni puede llamar su API (403); usuario al que se le agrega un permiso lo obtiene sin volver a ingresar; admin no puede quitarse a sí mismo el permiso de Usuarios.

### Bloque B — Bugs importantes

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 12 | Prorrateo de descuento solo sobre ítems vigentes, o persistido por ítem. | Sonnet 5.5 | B4 |
| 13 | KDS: estado de la orden según el peor estado de sus ítems (problema > en preparación > pendiente > listo); try/catch con reversión y toast en `handleMarkReady`. | Sonnet 5.5 | B5, B6 |

### Bloque C — Bugs menores

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 14 | Lote de menores en pagos, toasts e índices: `[...pagos].sort`, `mapPago` explícito, índice `items_orden(orden_id, pagado)`, limpiar `setTimeout` del toast, botón "quitar persona", limpiar el estado del formulario de Pagos tras cobrar (efectivo recibido y vuelto residual). | Haiku 5.5 o Sonnet 5.5 | C1, C5, C6, C7, C8, C9 |
| 15 | Mesas y robustez: guardar el nombre personalizado de mesa y validarlo único (#23); pantalla "Error de conexión con la BD – reintentar" (#26); quitar log `[v0]` (B8/#24); documentar la decisión sobre commits con `Co-authored-by: Cursor` (#27). | Sonnet 5.5 | #23, #26, B8, #24, #27 |

### Bloque D — Cumplimiento para vender en Chile (después de todos los bugs)

Datos personales a nivel GDPR (cubre Ley 21.719 de Chile y LFPDPPP 2025 de México). Las sesiones 17 a 19 dependen del login real (sesión 3) y pueden ajustarse según lo que encuentre la sesión 16.

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 16 | **Inventario de datos personales y plan (solo lectura + documento):** listar qué datos personales guarda el sistema y dónde (usuarios, empleados con documento y sueldo, proveedores persona natural, clientes y fiados si existen), para qué se usan, quién los ve y cuánto tiempo deben conservarse (incluida la obligación tributaria). Dejar el plan detallado de las sesiones 17 a 19. | Sonnet 5.5 | K1 |
| 17 | Datos sensibles (documento, sueldo) visibles y editables solo por admin, tanto en la API como en la pantalla; **registro de quién ve y modifica datos personales**, extendiendo `auditoria_admin`. | Sonnet 5.5 | K1 |
| 18 | **Derechos ARCO:** exportar, corregir y eliminar (o anonimizar) los datos de una persona, conservando lo que deba guardarse por obligación tributaria. | Sonnet 5.5 | K1 |
| 19 | **Aviso de privacidad visible** (México lo exige expresamente) en el login y en `/menu`; **procedimiento escrito para avisar brechas de seguridad en 72 horas** (documento, no código). | Sonnet 5.5 | K1 |

Accesibilidad WCAG 2.1 AA (sin certificación):

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 20 | **Auditoría de accesibilidad (solo lectura):** pantallas que no se pueden usar solo con teclado (Tab, Enter, Esc; ingreso de PIN y de efectivo con teclado físico), elementos clickeables no alcanzables por teclado, imágenes sin texto alternativo (sobre todo `/menu`) y formularios sin etiquetas. Entrega una lista priorizada. | Sonnet 5.5 | K2 |
| 21 | Corregir lo encontrado en la sesión 20. | Sonnet 5.5 | K2 |

Boleta electrónica:

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 22 | **Sesión de decisión, sin implementar:** comparar (a) integrar un proveedor de DTE por API para emitir boleta electrónica por pagos en efectivo y transferencias, o (b) que el local emita la boleta aparte con el sistema gratuito del SII. Costos, esfuerzo, operación en caja y riesgos. **No se implementa hasta que el usuario decida.** | Opus 5.5 | K3 |

### Bloque E — Mejoras técnicas

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 23 | Script SQL que crea las tablas base desde cero (verificado contra Neon). | Sonnet 5.5 | F2 |
| 24 | Validación con zod en rutas de API + primeras pruebas automáticas. | Sonnet 5.5 | F1 |
| 25 | Limpieza: `dexie` sin uso, rutas sin uso, nombre del paquete. | Haiku 5.5 | ⚪ |
| 26 | Dividir componentes gigantes (`pos-page`, `pagos-page`, `lib/db.ts`). | Sonnet 5.5 | F6 |

### Bloque F — Preparación para México (sin implementar aún)

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 27 | **Localización configurable por local:** moneda (CLP sin decimales / MXN con decimales), formato de fecha, tasa de IVA (ya existe `tasa_impuesto`; revisar valores por país) e identificador fiscal (RUT con Módulo 11 / RFC). Reemplazar los usos fijos de `es-CL` por la configuración del local. | Sonnet 5.5 | K4 |
| — | **Facturación CFDI (México):** módulo local futuro, fuera de alcance por ahora. Solo queda anotado. | — | — |

### Bloque G — SaaS

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 28 | Diseño multi-tenant (solo si se decide vender como SaaS). Incluir **RLS (Row Level Security) de Postgres como segundo candado** entre locales, además del filtro por local en cada consulta. | Opus 5.5 | SaaS |

---

## 5. Antes de producción final

Tareas que se dejan a propósito para el final, por decisión del usuario.

| Sesión | Tarea | Modelo sugerido |
|---|---|---|
| P1 | **Accesos rápidos del login controlados por variable de entorno:** mostrar los PINs demo solo si `NEXT_PUBLIC_MOSTRAR_ACCESOS_DEMO=true`, para poder apagarlos sin tocar código. Documentarla en `.env.example`. Obligar a cambiar los PINs por defecto (flag `requiere_cambio_pin` en el primer ingreso). | Sonnet 5.5 |
| P2 | **Vaciar datos antes de salir a producción:** script que borre los datos de prueba (órdenes, pagos, caja, mermas, notificaciones, etc.) **sin borrar las tablas**, y deje lo que el local necesita (configuración, usuarios reales, productos y recetas definitivos, según se decida). Ejecutarlo solo con confirmación explícita del usuario. | Sonnet 5.5 |
| P3 | **Primer admin en una base de producción vacía, sin PINs demo:** `POST /api/seed` crea 5 usuarios con PINs conocidos (1234, 2222…), así que no sirve para producción. Crear un camino propio (por ejemplo un script local `pnpm crear-admin` que pida email, nombre y PIN por consola, valide el PIN y lo guarde con bcrypt, y se niegue a correr si ya existe un admin). Los productos, mesas y recetas reales se cargan después desde la app. **Regla:** el seed (y este script) en producción solo se corre desde local contra la base de producción, con `DATABASE_URL` de producción en `.env.local` y `PERMITIR_SEED=true` solo mientras dure; en Vercel producción las rutas de seed están bloqueadas siempre (`VERCEL_ENV=production`) y `PERMITIR_SEED` nunca se configura en Vercel. Anotado en sesión 2; no ejecutado. **Antes de pasar a producción con el cliente es obligatorio configurar `ACCESOS_RAPIDOS=false` en Vercel** (sesión 3: los accesos rápidos del login salen de `GET /api/auth/accesos-rapidos`, que con esa variable devuelve una lista vacía y la pantalla oculta el bloque). No ejecutado. | Sonnet 5.5 |
| P4 | **Reglas de Vercel WAF para el límite por IP y de peticiones anónimas** (las crea el usuario en el dashboard; reglas y números en `README.md`, "Rate limiting"): 60/min anónimas, 1.500/min por IP con sesión, 300/min rutas públicas, 120/min login. Probarlas primero en modo Log. | Usuario |
| P5 | **Credenciales de Neon y Vercel (a cargo del usuario, solo al salir a producción):** rotar la contraseña de Neon, borrar `variables.txt` y revisar la variable `POSTGRES_URL` marcada "Needs Attention" en Vercel (la app usa `DATABASE_URL`). Durante el desarrollo no se toca. | Usuario |

---

## 6. Pendientes del usuario

- ~~Entregar `DATABASE_URL` de Neon~~ ✅ (sesión 1, `.env.local` creado).
- Credenciales de Neon y `variables.txt`: se atienden al salir a producción (P5), no ahora.
- Confirmar si el cliente de prueba sigue usando la app en producción (afecta cuándo se cierran las rutas abiertas). Las rutas de seed quedan cerradas en cuanto se haga merge de la sesión 2 a `main`.
- Decidir si el objetivo es un POS para un local o un SaaS multi-tenant.
- ~~**Decidir el IVA en la boleta (sesión 5)**~~ ✅ **Decidido por el usuario (19-11-2026): precios con IVA incluido.** Hoy los precios de la carta se tratan como IVA incluido (el total es el precio menos el descuento, que es lo que mostraba la boleta). Si el IVA debe sumarse sobre el precio, se cambia con `precios_incluyen_iva = false` en `configuracion` (sin código). Ver F7.
- **Revisar y autorizar el push de la sesión 5** (cada push a `main` despliega en producción).
