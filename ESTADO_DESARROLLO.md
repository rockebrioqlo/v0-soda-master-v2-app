# Soda Master V2 - Estado del Desarrollo

## Resumen del Proyecto

Sistema POS completo para sodas y restaurantes desarrollado con Next.js 16, React 19, TypeScript y Tailwind CSS. **Ahora con persistencia real en Neon PostgreSQL** con arquitectura client-side state + API endpoints.

---

## Modulos Implementados

### 1. Autenticacion y Usuarios
- [x] Login con PIN y email
- [x] Teclado numerico para PIN
- [x] Multiples roles: administrador, cajero, mesero, cocina, bar
- [x] Control de acceso por rol
- [x] Logout y cambio de usuario
- [x] Hash de contrasenas con bcryptjs
- [x] Bloqueo por intentos fallidos (3 intentos = 5 min bloqueo)
- [x] Persistencia de sesion

### 2. Dashboard
- [x] KPIs principales (ventas del dia, ordenes, ticket promedio)
- [x] Grafico de ventas de los ultimos 7 dias
- [x] Top 5 productos vendidos
- [x] Alertas de bajo stock
- [x] Ordenes recientes
- [x] KPIs 100% reales desde Neon (sin mocks)
- [x] Gráfico ventas 7 días con días en cero reales
- [x] Top 5 productos desde items_orden real
- [x] Skeletons de carga y estados vacíos
- [x] Órdenes recientes desde BD

### 3. Gestion de Mesas
- [x] Visualizacion de mesas por area (Interior, Terraza, Barra, VIP)
- [x] Estados: libre, ocupada, reservada
- [x] Acceso rapido al POS desde cada mesa
- [x] Indicador de ocupacion y tiempo

### 4. Punto de Venta (POS)
- [x] Catalogo de productos por categoria
- [x] Busqueda de productos en tiempo real
- [x] Carrito de compras con modificadores
- [x] Notas especiales por item
- [x] Seleccion de mesa
- [x] Tipo de orden: mesa, llevar, delivery
- [x] Calculo automatico de totales
- [x] Envio a cocina (KDS)
- [x] Cobro rapido

### 5. Kitchen Display System (KDS)
- [x] Visualizacion de ordenes pendientes
- [x] Filtro por estado: pendiente, en cocina, lista
- [x] Temporizador por orden
- [x] Detalle de items con notas
- [x] Cambio de estado de ordenes
- [x] Indicador visual por prioridad (tiempo)
- [x] Vista fullscreen para cocina/bar

### 6. Inventario
- [x] Lista de items de inventario
- [x] Control de stock actual y minimo
- [x] Alertas de bajo stock
- [x] Agregar/editar/eliminar items
- [x] Categorias de inventario
- [x] Movimientos de entrada/salida
- [x] Historial de movimientos
- [x] **Recetas reales por producto** con `modo_stock` (`producto`/`receta`/`producto_y_receta`)
- [x] **Insumos reales** (`soda_master.ingredientes`) con tipo `comida`/`negocio`/`otro`
- [x] **Pestañas dedicadas**: Productos, Insumos, Proveedores, Compras, Márgenes
- [x] **Editor de recetas** con cantidades, opcional/extra y costo adicional por línea
- [x] **Generador de recetas base** (POST `/api/seed-recetas`) idempotente

### 6.1 Proveedores y Compras
- [x] CRUD completo de proveedores (RUT, contacto, teléfono, email, dirección)
- [x] Registro de boletas/facturas con líneas (insumo, cantidad, precio)
- [x] **Promedio ponderado** en `costo_unitario` cada vez que se registra una compra
- [x] Trazabilidad en `movimientos_inventario` con tipo `compra` y `compra_id`
- [x] Vista detalle de cada compra con todos sus ítems

### 6.2 Márgenes
- [x] Costo por receta (`Σ cantidad × costo_unitario` de insumos base)
- [x] Margen $ y % por producto
- [x] KPIs globales: total con receta, sin costo definido, margen total potencial, % promedio
- [x] Semáforo de color: verde ≥60%, ámbar ≥35%, rojo <35%

### 7. Gestion de Usuarios
- [x] CRUD completo de usuarios
- [x] Asignacion de roles
- [x] Activar/desactivar usuarios
- [x] Validacion de datos
- [x] Cambio de PIN

### 7.1 Finanzas (nuevo módulo)
- [x] Acceso desde sidebar/bottom-nav (ícono `Wallet`), permisos `administrador`/`admin`
- [x] **Pestaña Gastos**: filtro por fecha/tipo, KPIs (total, sueldos pagados, servicios, sueldos proyectados/mes), tipos `operativo`/`sueldo`/`servicio`/`impuesto`/`financiero`/`otros`, recurrencia, FKs opcionales a `proveedor`/`empleado`/`activo`
- [x] **Pestaña Empleados / sueldos**: alta, periodicidad (mensual/quincenal/semanal/diario/por_hora), vínculo opcional a `usuarios`, proyección automática a mensual con factores estándar
- [x] **Pestaña Activos**: máquinas y mobiliario con costo, vida útil en meses, valor residual, **depreciación lineal automática** al día de hoy (mensual, acumulada, valor actual neto)
- [x] **Pestaña Márgenes**: reutiliza el cálculo de costo de receta y muestra rentabilidad por producto
- [x] **Botón "Cargar datos de demostración"** (POST `/api/seed-demo`) que pobla todo de forma coherente con los usuarios iniciales

### 8. Pagos y Caja
- [x] Metodos de pago: efectivo, tarjeta (Transbank)
- [x] Pago dividido
- [x] Propinas
- [x] Calculo de cambio
- [x] Apertura y cierre de caja
- [x] Resumen de caja (Z report)
- [x] Historial de transacciones

### 9. Reportes y Estadisticas
- [x] Filtro por rango de fechas
- [x] Reporte de ventas con graficos
- [x] Top productos vendidos
- [x] Ventas por categoria
- [x] Metodos de pago utilizados
- [x] Estado del inventario
- [x] Exportacion a CSV
- [x] Endpoints /api/reportes/* (ventas, top-productos, ventas-categoria, metodos-pago, ventas-semana)
- [x] Filtros: Hoy, Esta semana, Este mes, Rango personalizado
- [x] Re-fetch automático al cambiar período
- [x] Export CSV con datos reales de Neon
- [x] Mensajes de estado vacío cuando no hay datos
- [x] Métodos de pago: solo Efectivo y Tarjeta (Transbank)

### 10. Configuracion
- [x] Informacion del negocio
- [x] Gestion de mesas (CRUD)
- [x] Configuracion de impresion (placeholder)
- [x] Metodos de pago habilitados
- [x] Propinas
- [x] Notificaciones
- [x] Moneda y tasa de impuesto

### 11. Menu Publico (/menu)
- [x] Pagina publica sin login, accesible en `/menu`
- [x] Mobile-first, responsive (360px en adelante)
- [x] Tema oscuro con acentos ambar, layout independiente del SPA
- [x] 7 categorias en orden: burgers, entradas, acompañamientos, postres, cervezas, jugos_bebidas, tragos
- [x] Solo muestra productos activos con stock > 0
- [x] Precios en formato chileno ($4.500, sin decimales, punto de miles)
- [x] Nav horizontal con scroll suave entre categorias
- [x] IntersectionObserver resalta la categoria visible al hacer scroll
- [x] Header con nombre del negocio desde configuracion en Neon
- [x] Footer con leyenda "Precios incluyen IVA"

---

## Arquitectura Tecnica

### Stack Tecnologico
- **Frontend:** Next.js 16, React 19, TypeScript
- **Backend:** Next.js API Routes
- **Base de Datos:** Neon PostgreSQL (serverless)
- **ORM/Client:** @neondatabase/serverless (sql tagged template)
- **Autenticacion:** bcryptjs + custom auth
- **Estilos:** Tailwind CSS v4, shadcn/ui
- **Graficos:** Recharts
- **Fechas:** date-fns
- **Iconos:** Lucide React

### Base de Datos Neon
**Conexión:** `DATABASE_URL` en variables de entorno

**Tablas Principales:**
- `usuarios` - Usuarios del sistema con PIN hasheado
- `mesas` - Mesas del restaurante
- `categorias` - Categorías de productos
- `productos` - Catálogo de productos
- `modificadores` - Opciones/modificadores de productos
- `ordenes` - Órdenes de mesas/clientes
- `items_orden` - Líneas de items en ordenes
- `pagos` - Registro de pagos
- `inventario` - Stock actual de productos
- `movimientos_inventario` - Historial de movimientos
- `configuracion` - Configuración del negocio

### Estructura de Archivos
```
/app
  page.tsx           - Pagina principal (SPA)
  layout.tsx         - Layout con metadata
  globals.css        - Estilos globales
  /api
    /seed            - Inicializar base de datos
    /auth/login      - Endpoint de autenticacion
    /usuarios        - CRUD de usuarios
    /mesas           - Listado de mesas
    /productos       - CRUD de productos
    /ordenes         - CRUD de ordenes
    /items-orden     - Items de ordenes
    /pagos           - Registrar pagos
    /inventario      - CRUD de inventario

/components
  ui/*               - Componentes shadcn/ui
  main-layout.tsx    - Layout principal con navegacion
  login-form.tsx     - Formulario de login con PIN
  toast.tsx          - Notificaciones toast
  dashboard-page.tsx - Dashboard con KPIs
  mesas-page.tsx     - Gestion de mesas
  pos-page.tsx       - Punto de venta
  kds-page.tsx       - Kitchen Display System
  inventario-page.tsx - Control de inventario
  usuarios-page.tsx  - Gestion de usuarios
  pagos-page.tsx     - Pagos y caja
  reportes-page.tsx  - Reportes y estadisticas
  configuracion-page.tsx - Configuracion del sistema

/lib
  types.ts           - Tipos TypeScript
  app-context.tsx    - Context global (sin estado local, usa APIs)
  db.ts              - Cliente Neon PostgreSQL
  initial-data.ts    - Datos de referencia
  helpers.ts         - Funciones utilitarias
  utils.ts           - Utilidades (cn)
  seed-database.ts   - Script de inicializacion
```

### Usuarios de Prueba
| Usuario | Email | PIN | Rol |
|---------|-------|-----|-----|
| Admin | admin@soda.cl | 1234 | Administrador |
| Carlos | carlos@soda.cl | 2222 | Cajero |
| Maria | maria@soda.cl | 3333 | Mesero |
| Pedro | pedro@soda.cl | 4444 | Cocina |
| Laura | laura@soda.cl | 5555 | Bar |

### Permisos por Rol
| Modulo | Admin | Cajero | Mesero | Cocina | Bar |
|--------|-------|--------|--------|--------|-----|
| Dashboard | X | X | | | |
| Mesas | X | X | X | | |
| POS | X | X | X | | |
| KDS | X | | | X | X |
| Inventario | X | | | | |
| Usuarios | X | | | | |
| Pagos | X | X | | | |
| Reportes | X | X | | | |
| Configuracion | X | | | | |

---

## Funcionalidades Pendientes (Para Version Produccion)

### Alta Prioridad
- [ ] Sincronizacion en tiempo real entre dispositivos (WebSockets)
- [ ] Sistema de respaldo automatico de BD
- [ ] Impresion real de tickets (ESC/POS)
- [ ] Autenticación con JWT (en lugar de sessionStorage)
- [ ] Rate limiting en endpoints API
- [ ] Paginación en listados largos
- [ ] Validación de datos en BD (constraints, triggers)

### Media Prioridad
- [ ] Sistema de reservaciones con calendario
- [ ] Gestion de turnos de empleados
- [ ] Integracion con datafono/Stripe
- [ ] Facturacion electronica
- [ ] API para delivery (Uber Eats, etc.)
- [ ] Tests unitarios e integración
- [ ] Caché de datos en cliente para mejor rendimiento
- [ ] Soporte multi-idioma

### Baja Prioridad
- [ ] App movil nativa
- [ ] Dashboard de analytics avanzado
- [ ] Sistema de fidelizacion/puntos
- [ ] Integracion con WhatsApp Business
- [ ] Manejo de multiples sucursales

---

## Bugs Pendientes — Detectados en Scan (Mayo 2026)

Lista priorizada de bugs reales (no nitpicks) detectados después de poner la app en producción.
Cada uno incluye archivo:línea aproximada, causa y propuesta de fix corta.

### Estado actual del scan (28 bugs)

- **Corregidos en Tandas 1-5:** 23 bugs (#1-#8, #11-#22, #25 — *los marcados como `[CORREGIDO ✅]`*).
- **Pendientes para producción final** (decisión consciente): #9 (PINs demo visibles) y #10 (APIs sin auth). Ver sección 🚨 al final del documento.
- **Pendientes activos:**
  - Alta: #11 (transacción única `crearOrden` + items — refuerzo, ya hay locks).
  - Media: #23 (nombre personalizado de mesa).
  - Baja: #24 (logs `[v0]`), #26 (initError visible), #27 (commits con `Co-authored-by: Cursor`).

### ALTA prioridad — afectan flujo de negocio o exponen datos

1. **[CORREGIDO ✅]** KDS marca toda la comanda como `listo` con un solo click
   - **Archivo:** `components/kds-page.tsx`
   - **Solución:** Implementado estado por ítem (`items_orden.estado_item`). `handleMarkReady` actualiza solo los items del rol (cocina/bar) y la orden global pasa a `listo` solo cuando *todos* sus items están `listo`. `getComandasForSection` filtra ítems ya listos para evitar doble marcado.

2. **[CORREGIDO ✅]** Stock no se descuenta al enviar comanda a cocina
   - **Archivo:** `lib/db.ts crearItemOrden`
   - **Solución:** Al insertar cada `items_orden` ahora se descuenta `inventario.stock_actual` con `UPDATE ... GREATEST(stock_actual - cantidad, 0)`. Si no hay stock suficiente, la API responde 400 y el POS muestra toast "Stock insuficiente".

3. **[CORREGIDO ✅]** POS permite agregar productos con stock 0
   - **Archivo:** `components/pos-page.tsx`
   - **Solución:** Botones de producto deshabilitados con badge "Agotado" cuando `stock <= 0`. `handleSelectBurger` / `handleSelectItem` bloquean también la selección manual.

4. **[CORREGIDO ✅]** `POST /api/pagos` no valida `monto > 0`
   - **Archivo:** `app/api/pagos/route.ts` + `lib/db.ts crearPago`
   - **Solución:** Validación doble en API y BD: rechaza con 400 si `monto <= 0`, `propina < 0`, `descuento < 0` o `dividido_en < 1`.

5. **[CORREGIDO ✅]** "Editar descuento" en POS inserta un nuevo registro en BD (duplica)
   - **Archivo:** `lib/db.ts crearDescuento`
   - **Solución:** Antes del `INSERT` se hace `DELETE FROM descuentos WHERE orden_id = ?`. Solo queda un descuento por orden, sin duplicados en reportes.

6. **[CORREGIDO ✅]** Inconsistencia `pagado` (BD) vs `pagada` (cliente)
   - **Archivos:** `lib/types.ts`, `components/pagos-page.tsx`, `mesas-page.tsx`, `app-context.tsx`
   - **Solución:** Unificado a `'pagado'` (el valor real en BD). Tipo `EstadoComanda` actualizado, dispatches y filtros sincronizados.

7. **[CORREGIDO ✅]** Impuesto y propina configurados NO se aplican en POS/Pagos
   - **Archivos:** `components/pos-page.tsx`, `components/pagos-page.tsx`
   - **Solución:** Ambos módulos leen `tasa_impuesto`, `impuesto_habilitado`, `propinas_habilitadas`, `propina_default` desde `state.configuracion` y los aplican al subtotal, total y boleta. Si `impuesto_habilitado=false` no se aplica IVA; si `propinas_habilitadas=false` se deshabilita la UI de propina.

8. **[CORREGIDO ✅]** "Guardar permisos" en `usuarios-page.tsx` no persiste en BD
   - **Archivo:** `components/usuarios-page.tsx`
   - **Solución:** `handleSavePermisos` ahora llama a `guardarPermisosDescuento` del context (que hace `PUT /api/permisos-descuento`). El cambio queda persistido en Neon.

9. **[BUG]** PINs de usuarios visibles en pantalla de login
   - **Archivo:** `components/login-form.tsx:200`
   - **Causa:** Línea de demo "PINs: Admin=1234, Carlos=2222, Maria=3333, Pedro=4444, Laura=5555". En producción cualquiera con la URL ve credenciales válidas.
   - **Estado actual:** Se decidió **mantener visible por ahora** porque el cliente aún usa estos PINs por defecto.
   - **Pendiente para producción final:** Ver sección "🚨 Correcciones obligatorias antes de la implementación de producción final" al final del documento.

10. **[BUG]** APIs sin ninguna autenticación
    - **Archivos:** Todas las rutas en `app/api/**` excepto `/api/auth/*`.
    - **Causa:** Cualquier persona con la URL pública puede `POST /api/usuarios`, `POST /api/pagos`, `PATCH /api/configuracion`, etc.
    - **Fix corto:** Middleware que valide al menos cookie/header con id de usuario activo. Roadmap real: migrar a JWT (ya está como pendiente).

11. **[BUG]** `crearOrden` + items no es transaccional
    - **Archivo:** `components/pos-page.tsx:371-390`
    - **Causa:** Loop secuencial `crearItemOrden` después de `crearOrden`. Si falla a la mitad queda orden con items parciales o sin items. Hay un `.filter(c => c.items.length > 0)` en `app-context` que la oculta, pero la orden huérfana se queda en BD.
    - **Fix:** Endpoint nuevo `POST /api/ordenes/completa` que recibe `{ orden, items[] }` y los inserta dentro de una sola transacción Neon.

### MEDIA prioridad — comportamiento incorrecto pero no bloqueante

12. **[CORREGIDO ✅]** Logout no limpia el state global
    - **Archivo:** `lib/app-context.tsx`
    - **Solución:** Nueva action `RESET_SESSION_DATA` que vacía `comandas`, `pagos`, `mermas`, `notificaciones`, `usuarioActual`, etc. `logout()` la dispatchea antes de limpiar `sessionStorage`.

13. **[CORREGIDO ✅]** Usuario desactivado con sesión activa sigue trabajando
    - **Archivo:** `lib/app-context.tsx`
    - **Solución:** `useEffect` que cada 60s (y en `window.focus`) consulta `/api/usuarios` y verifica que `usuarioActual.activo === true`. Si fue desactivado, fuerza `logout()` con toast informativo.

14. **[CORREGIDO ✅]** Filtros de fecha en reportes usan zona horaria del server (UTC), no Chile
    - **Archivo:** `lib/db.ts`
    - **Solución:** Todas las queries de reportes/pagos/órdenes que filtran por fecha usan ahora `(created_at AT TIME ZONE 'America/Santiago')::date`. Un pago hecho a las 23:30 hora Chile cae en el día correcto del dashboard.

15. **[CORREGIDO ✅]** Dos meseros pueden duplicar comanda sobre la misma mesa
    - **Archivo:** `lib/db.ts crearOrden` + `app/api/ordenes/route.ts`
    - **Solución:** `crearOrden` usa `pg_advisory_xact_lock` por `mesa_id` y solo inserta si no existe una orden activa (`estado NOT IN ('pagado','cancelado')`). Si ya existe, la API responde `409` con "Ya existe una comanda activa para esta mesa".

16. **[CORREGIDO ✅]** Mermas pueden exceder stock real silenciosamente
    - **Archivo:** `lib/db.ts crearMerma` + `app/api/mermas/route.ts`
    - **Solución:** Las mermas con producto ahora descuentan stock solo si `stock_actual >= cantidad`. Si no alcanza, no inserta la merma y responde 400 con el stock actual. `comanda_no_pagada` queda exceptuada porque no descuenta producto directo.

17. **[CORREGIDO ✅]** Múltiples descuentos por comanda permitidos en backend
    - **Archivo:** `lib/db.ts crearDescuento`
    - **Solución:** El reemplazo de descuento por orden ahora es atómico: `pg_advisory_xact_lock` por `orden_id`, `DELETE` del descuento anterior e `INSERT` del nuevo en una sola sentencia. Mantiene el flujo de editar descuento sin duplicados por carrera.

18. **[CORREGIDO ✅]** Notificaciones se acumulan sin tope
    - **Archivo:** `lib/app-context.tsx ADD_NOTIFICACION`
    - **Solución:** `ADD_NOTIFICACION` limita el arreglo a las últimas 50 con `.slice(-50)`.

19. **[CORREGIDO ✅]** `Top 5 productos` y `Ventas por categoría` filtran por `estado='pagado'`
    - **Archivo:** `lib/db.ts`, `lib/helpers.ts`
    - **Solución:** La app ya usa `'pagado'` como único estado de pago desde la Tanda 1. En esta tanda se limpió el helper legacy que todavía exponía labels/colores para `'pagada'` y `'lista'`, reemplazándolo por `pagado`, `listo`, `en_preparacion` y `problema`.

20. **[CORREGIDO ✅]** `mapPago` duplica `monto` y `total` con el mismo valor
    - **Archivo:** `lib/db.ts`, `lib/types.ts`, `components/pagos-page.tsx`
    - **Solución:** `monto` queda como campo canónico del pago. `mapPago` ya no agrega `total`; la interfaz `Pago` marca `monto` como requerido y `total` como legacy opcional. Pagos usa `monto` para historial y cierre de caja.

21. **[CORREGIDO ✅]** `recargarOrdenes` resetea `SET_COMANDAS` y borra comandas en construcción
    - **Archivo:** `lib/app-context.tsx`
    - **Solución:** `recargarOrdenes` hace merge: conserva comandas locales `pendiente` con id no-UUID y sin comanda remota activa en la misma mesa, y luego agrega las comandas remotas de Neon.

22. **[CORREGIDO ✅]** Inventario edit no persiste `unidad_medida`
    - **Archivos:** `components/inventario-page.tsx`, `app/api/inventario/route.ts`, `app/api/inventario/[id]/route.ts`, `lib/db.ts`
    - **Solución:** El modal ya valida y envía `unidad_medida`; ambas rutas PATCH la persisten en `soda_master.inventario`. `actualizarInventario` acepta `stock_actual`, `stock_minimo` y `unidad_medida`.

23. **[BUG]** Crear/editar mesa puede ignorar el campo `nombre` personalizado
    - **Archivo:** `app/api/mesas/route.ts` (resuelve `numero` desde el nombre con MAX+1).
    - **Causa:** Si el `nombre` no contiene un número, asigna `MAX(numero)+1` pero el `nombre` no siempre se guarda como tal.
    - **Fix:** Asegurar que `nombre` se persista tal cual lo escribió el usuario y validar que sea único.

### BAJA prioridad — cosmética / mejoras

24. **[BUG]** Logs con prefijo `[v0]` quedan en código
    - **Archivo:** `components/pos-page.tsx:405` (`'[v0] Error sending to kitchen'`) y posiblemente otros.
    - **Fix:** Reemplazar por logs neutros o quitar.

25. **[CORREGIDO ✅]** `window.print()` en mobile no usa impresora térmica
    - **Archivos:** `lib/print-ticket.ts` (nuevo), `components/print-preview-dialog.tsx` (nuevo), `components/pos-page.tsx`, `components/pagos-page.tsx`, `components/configuracion-page.tsx`, `lib/types.ts`, `lib/initial-data.ts`.
    - **Solución:** Sistema de impresión configurable, agnóstico de impresora. `buildTicketHtml` genera un documento HTML autocontenido con `@page { size: <ancho>mm auto }`, fuente, tamaño en pt, márgenes y textos personalizables. `PrintPreviewDialog` muestra el ticket en un `<iframe>` con zoom y dispara `iframe.contentWindow.print()`. Tab "Impresión" en Configuración con personalización (ancho 58/72/80/110/A4 o libre, familia tipográfica, tamaño, márgenes, encabezado, pie, mostrar logo) y vista previa en vivo + botón "Probar impresión". POS y Pagos ya no llaman `window.print()` directamente; abren el dialog reutilizable con el ticket configurado, así funciona igual de bien en escritorio, móvil, impresora térmica, A4 o "Guardar como PDF" del navegador.

26. **[BUG]** Init silencia errores de API y muestra app vacía sin feedback
    - **Archivo:** `lib/app-context.tsx initializeDatabase`
    - **Causa:** Cada `fetch` está dentro de try/catch que solo loguea por consola. Si Neon está caído el usuario ve "Cargando..." indefinidamente o pantalla en blanco.
    - **Fix:** Estado `initError` en context; cuando hay error mostrar pantalla "Error de conexión con la BD - reintentar".

27. **[BUG]** Commits firmados con `Co-authored-by: Cursor`
    - Cosmético, no afecta producción.

28. **[CORREGIDO ✅]** Notificaciones tipo "problema" desde KDS no llegan visualmente al mesero
    - **Archivo:** `components/kds-page.tsx`, `lib/db.ts`, `lib/app-context.tsx`, `app/api/notificaciones/*`, `components/notificaciones-toast.tsx`
    - **Causa:** Las notificaciones vivían sólo en el `state` del cliente; cuando cocina marcaba "problema", el mesero (en otro dispositivo / pestaña / navegador) nunca las recibía a menos que estuviera en el mismo browser tab.
    - **Solución (polling cross-device, no WS porque la app corre en Vercel serverless):**
      1. **Tabla `soda_master.notificaciones`** auto-bootstrapped por `ensureNotificacionesTable()` en `lib/db.ts` con `CREATE TABLE IF NOT EXISTS` + dos índices parciales (`destinatario_usuario_id` y `destinatario_rol`). Columnas: `id`, `tipo` (`problema`/`listo`/`nueva_orden`, con CHECK), `orden_id`, `mesa_nombre`, `mensaje`, `destinatario_usuario_id` (UUID nullable), `destinatario_rol` (text nullable), `vista` (bool), `creado_at`, `vista_at`. Constraint: al menos uno de los dos destinatarios.
      2. **Helpers en `db.ts`:** `crearNotificacion`, `listarNotificacionesPara({ usuario_id, rol, solo_pendientes, limite })`, `marcarNotificacionVista`.
      3. **API REST:** `POST /api/notificaciones`, `GET /api/notificaciones?usuario_id=&rol=&solo_pendientes=true&limite=N` con `Cache-Control: no-store`, `PATCH /api/notificaciones/[id]` con body `{ vista: true }`.
      4. **KDS dispara cross-device:** al marcar "problema" se crea una notificación dirigida a `comanda.usuarioId` (el mesero que tomó la orden); al marcar TODA la comanda como "listo" se crea otra notificación tipo `listo` al mismo mesero para que pase a retirar. La anterior dispatch local de `ADD_NOTIFICACION` quedó reemplazada por la llamada a `crearNotificacionApi`.
      5. **Polling del lado del cliente** (`lib/app-context.tsx`): cuando hay `usuarioActual`, cada 10 segundos (y al `focus` de la ventana) se consulta `/api/notificaciones?usuario_id=<id>&rol=<rol>&solo_pendientes=true`. Sólo dispatcha las que no estaban ya en memoria (dedupe por `id`). El polling se pausa cuando la pestaña no está visible (`document.visibilityState !== 'visible'`).
      6. **Toast mejorado** (`components/notificaciones-toast.tsx`): al cerrar la notificación (botón X o auto-dismiss tras 10 s problema / 6 s listo) se llama a `marcarNotificacionVistaApi`, que hace `PATCH /api/notificaciones/[id]` así no se vuelve a entregar por el polling. Notificaciones tipo `problema` muestran un botón **"Ir a POS"** que navega a la comanda. Tipo `listo` se ve en verde con `Check` y mensaje "Pasa a retirar a [mesa]". Se desduplica internamente con `dismissedRef` para evitar mostrar dos veces la misma.
      7. **Compatibilidad legacy:** `marcarNotificacionVistaApi` sólo persiste si el id es UUID válido (las notificaciones locales antiguas con `id="notif_<ts>"` no rompen el flujo).
    - **Resultado:** cocina marca "problema" o "listo" → en máximo ~10 segundos (o al instante si la ventana del mesero gana foco) el mesero recibe el toast en cualquier dispositivo donde esté logueado con su usuario. Una vez cerrado, ningún otro dispositivo ni el polling lo re-entregará. Funciona en Vercel serverless sin WebSockets.

---

## Bugs Corregidos Recientemente

### Mayo 2026
1. **[CORREGIDO]** Mesero abre mesa → refresca → mesa se cierra
   - **Causa:** Datos solo en contexto local, no en BD
   - **Solución:** Todas las acciones ahora persisten en Neon via APIs

2. **[CORREGIDO]** Popups con fondo oscuro en tema claro
   - **Causa:** Colores hardcodeados (`bg-zinc-800`) 
   - **Solución:** Tokens semánticos (`bg-card`, `bg-muted`) que respetan tema

3. **[CORREGIDO]** Mesas sin nombres ("disponible")
   - **Causa:** Tabla sin columna `nombre`, solo `numero`
   - **Solución:** Generación en SQL `'Mesa ' || numero`

4. **[CORREGIDO]** KDS no ve órdenes nuevas sin refrescar
   - **Causa:** Sin mecanismo de polling
   - **Solución:** Polling automático cada 5 segundos

5. **[CORREGIDO]** TypeScript compila sin errores (ignoreBuildErrors eliminado)
   - **Causa:** `next.config.mjs` tenía `typescript.ignoreBuildErrors = true` enmascarando errores reales (interfaces incompletas, handlers de rutas dinámicas con firma legacy, comparaciones de estado inconsistentes).
   - **Solución:** Cerrar interfaces (`AppState`, `Orden`, `ItemOrden`, `Inventario`), agregar campos faltantes en `Mesa` y `Pago`, migrar handlers `[id]` a `params: Promise<{ id: string }>`, alinear strings de estado (`libre`, `listo`) y remover `ignoreBuildErrors`. `npx tsc --noEmit` pasa limpio.

6. **[CORREGIDO]** Estados de mesa funcionan en BD
   - **Causa:** El constraint `mesas_estado_check` exige `disponible|ocupada|reservada|limpiando`, pero el frontend usa `libre`.
   - **Solución:** Helpers `toDatabaseMesaEstado` y `mapMesa` en `lib/db.ts` traducen `libre <-> disponible` de forma transparente en todas las queries de mesas.

7. **[CORREGIDO]** PIN hash no se expone al cliente
   - **Causa:** `/api/auth/login` y `/api/usuarios` devolvían el objeto crudo con `pin_hash`.
   - **Solución:** `mapUsuario` filtra `pin_hash`, `pinHash`, `pin` y `password` antes de devolver al cliente. Verificado en login y listados.

8. **[CORREGIDO]** Usuarios persisten en Neon (CRUD completo)
   - **Causa:** `usuarios-page.tsx` solo despachaba al reducer local, los cambios se perdían al refrescar.
   - **Solución:** Endpoints `POST /api/usuarios`, `PATCH /api/usuarios/[id]` y `DELETE /api/usuarios/[id]` con `bcrypt` para PIN (hasheado antes de enviarse). La UI llama a la API en crear, editar, toggle activo, cambio de PIN y eliminar.

9. **[CORREGIDO]** Pagos persisten en Neon con `descuento` y `dividido_en`
   - **Causa:** `handleConfirmarPago` solo despachaba `ADD_PAGO`; la tabla `pagos` no tenía columnas para descuento ni división de cuenta.
   - **Solución:** `ALTER TABLE soda_master.pagos ADD COLUMN descuento NUMERIC(10,2) DEFAULT 0, dividido_en INTEGER DEFAULT 1`. Secuencia atómica en la UI: `POST /api/pagos` → `PATCH /api/ordenes/[id] estado='pagado'` → `PATCH /api/mesas/[id] estado='libre'`. Historial y cierre de caja usan `GET /api/pagos?fecha=hoy`.

10. **[CORREGIDO]** Mesas crear/eliminar persisten en Neon
    - **Causa:** `mesas-page.tsx` y `configuracion-page.tsx` solo despachaban `ADD_MESA`/`DELETE_MESA` al estado local.
    - **Solución:** `POST /api/mesas` (resuelve `numero` desde el nombre o usa `MAX(numero)+1`) y `DELETE /api/mesas/[id]` (con `409` si hay órdenes asociadas). Ambas pantallas llaman a la API.

11. **[CORREGIDO]** Configuración persiste en Neon (14 claves)
    - **Causa:** `configuracion-page.tsx` mostraba un toast pero no guardaba en BD.
    - **Solución:** Endpoint `/api/configuracion` con `GET` y `PATCH` sobre la tabla `configuracion` (key/value tipado: string/number/boolean/json) usando `INSERT ... ON CONFLICT (clave) DO UPDATE`. La pantalla carga al montar y persiste 14 claves (nombre_negocio, direccion, telefono, moneda, tasa_impuesto, impuesto_habilitado, propinas_habilitadas, propina_default, impresora_habilitada, impresora_ip, notificaciones_habilitadas, sonido_habilitado, kds_auto_completar, kds_tiempo_auto_completar).

12. **[CORREGIDO]** Métodos de pago simplificados a efectivo/tarjeta (Transbank)
    - **Causa:** El sistema arrastraba métodos no usados en Chile (qr, sinpe, transferencia, voucher) con un constraint laxo en BD.
    - **Solución:** `ALTER TABLE pagos DROP CONSTRAINT pagos_metodo_check; ADD CONSTRAINT pagos_metodo_check CHECK (metodo IN ('efectivo','tarjeta'))`. UI con dos botones (Efectivo y Tarjeta), eliminados el dialog QR, los toggles de Sinpe/Transferencia en configuración y el slice "Sinpe" en reportes. `MetodoPago` ahora es `'efectivo' | 'tarjeta'` y `normalizarMetodoPago` ya no traduce métodos extranjeros.

13. **[CORREGIDO]** Tanda 1 — Bugs críticos de flujo de negocio (#1, #2, #3, #4, #5, #6, #7)
    - KDS por ítem (cocina vs bar), stock se descuenta al enviar a cocina, productos agotados no se pueden agregar, validación de pagos en API y BD, descuentos sin duplicados, estados `pagado` unificados, impuesto/propina configurados se aplican en POS y Pagos. Ver detalle en cada bug arriba.

14. **[CORREGIDO]** Tanda 2 — Sesión, permisos y zona horaria (#8, #12, #13, #14)
    - Permisos de descuento desde `usuarios-page` se persisten en API. Logout limpia todo el state global (action `RESET_SESSION_DATA`). Usuario desactivado se detecta por polling cada 60s + on focus y fuerza logout. Reportes filtran por fecha con `AT TIME ZONE 'America/Santiago'`.

15. **[CORREGIDO]** Tanda 3 — Integridad operativa y memoria (#15, #16, #17, #18)
    - Bloqueo anti-duplicado de comanda activa por mesa con `pg_advisory_xact_lock` y respuesta `409`. Mermas rechazan cantidades superiores al stock real. Descuentos por orden se reemplazan de forma atómica para evitar duplicados por carrera. Notificaciones quedan limitadas a las últimas 50 en memoria.

16. **[CORREGIDO]** Tanda 4 — Reportes, pagos, recarga e inventario (#19, #20, #21, #22)
    - Helper de estados alineado a `pagado/listo/en_preparacion/problema`. `Pago` usa `monto` como campo canónico y deja `total` solo como legacy opcional. `recargarOrdenes` conserva comandas locales en construcción al refrescar desde Neon. Edición de inventario persiste `unidad_medida` en ambos endpoints PATCH.

17. **[CORREGIDO]** Tanda 5 — Impresión configurable agnóstica (#25)
    - Nuevo módulo `lib/print-ticket.ts` que genera HTML imprimible con `@page` y CSS. Nuevo `PrintPreviewDialog` muestra el ticket en `<iframe>` con zoom y dispara la impresión. Tab "Impresión" en Configuración permite personalizar ancho (58/72/80/110/A4 o libre), familia tipográfica, tamaño en pt, márgenes, encabezado, pie y mostrar logo, con vista previa en vivo y botón "Probar impresión". POS y Pagos usan el dialog reutilizable y respetan la configuración del usuario; sirve para impresoras térmicas, A4 o "Guardar como PDF".
    - **Precuenta para el cliente:** se añadió el tipo `precuenta` al motor de impresión. En POS, botón "Precuenta para cliente" → mini-dialog con switch "Incluir propina" + vista previa del total → al confirmar abre el `PrintPreviewDialog`. La precuenta lleva el encabezado "PRECUENTA — No es comprobante de pago", muestra todo lo consumido en la mesa y marca los ítems aún en preparación con su estado ("Pendiente", "En preparación", "Con problema") y un aviso al pie con el conteo de ítems que faltan.

19. **[NUEVO]** Tanda 6 — Recetas reales e inventario por insumos
    - **Modelo de datos** (idempotente desde `lib/db.ts → ensureRecetasTables`):
      - `soda_master.ingredientes` (insumos reales con `nombre`, `categoria`, `unidad_medida`, `stock_actual`, `stock_minimo`, `costo_unitario`, `tipo` ∈ {`comida`,`negocio`,`otro`}, `activo`).
      - `soda_master.recetas` (cabecera por producto, FK única a `productos`).
      - `soda_master.receta_ingredientes` (líneas con `cantidad`, `opcional`, `extra`, `costo_adicional`, `nombre_display`).
      - `soda_master.movimientos_inventario` extendida con `tipo='compra'` y `compra_id`.
      - Columna `productos.modo_stock` (`producto`/`receta`/`producto_y_receta`, default `producto` para no romper datos existentes).
    - **`crearItemOrden` refactorizado**: ahora es la fuente única de descuento de stock. Lee `modo_stock` y descuenta del producto, expande la receta (base siempre, opcional según `modificadores`, extra según `extras_ingredientes`/`notas_especiales.ingredientesEspeciales`), o ambos. Valida stock antes de insertar e informa errores claros (`Stock insuficiente: Pan brioche (faltan 3 unidad)`). Registra cada descuento en `movimientos_inventario` para trazabilidad.
    - **APIs nuevas**: `GET/POST /api/ingredientes`, `PATCH /api/ingredientes/[id]`, `GET/POST /api/recetas` (con `?opciones=true` para el POS), `PATCH /api/productos/[id]` extendido para `modo_stock`.
    - **POS actualizado**: al personalizar un burger consulta `/api/recetas?producto_id=...&opciones=true`. Quesos/ingredientes/salsas vienen de la receta (con fallback a `initial-data.ts`). Al enviar a cocina envía `extras_ingredientes` con `ingrediente_id` reales en lugar de strings.
    - **Inventario UI**: pestañas Productos | Insumos | Proveedores | Compras | Márgenes con filtro de tipo en Insumos, columna `Modo stock` y `Costo` en las tablas, editor de receta accesible desde cada producto, botón **Generar recetas base** que llama `/api/seed-recetas` (idempotente).
    - **Seed integrado** en `lib/seed-recetas.ts` + `POST /api/seed-recetas`. El seed principal `POST /api/seed` ahora invoca también `runSeedRecetasBase()` después de inicializar productos.

20. **[NUEVO]** Tanda 7 — Proveedores, Compras y Márgenes
    - **Modelo de datos** (idempotente desde `ensureComprasTables`):
      - `soda_master.proveedores` (nombre, rut, contacto, teléfono, email, dirección, notas, activo).
      - `soda_master.compras` (cabecera con `proveedor_id`, `tipo_documento` ∈ {`boleta`,`factura`,`nota`,`otro`}, `numero_documento`, `fecha`, `subtotal`, `impuesto`, `total`, `usuario_id`).
      - `soda_master.compra_items` (líneas con `ingrediente_id`, `cantidad`, `precio_unitario`, `subtotal`).
    - **Lógica clave**: `db.crearCompra` inserta cabecera + ítems, suma cantidades al `stock_actual` del insumo y recalcula `costo_unitario` con **promedio ponderado** (`(stock·costo + cantidad·precio) / (stock+cantidad)`), registrando movimiento `'compra'` con `compra_id` para trazabilidad full.
    - **APIs**: `GET/POST /api/proveedores`, `PATCH /api/proveedores/[id]`, `GET/POST /api/compras`, `GET /api/compras/[id]`, `GET /api/margenes`.
    - **UI Inventario** (3 pestañas nuevas):
      - **Proveedores**: CRUD completo con activar/desactivar.
      - **Compras**: lista con fecha/proveedor/tipo doc./totales + formulario con líneas (selector de insumo + cantidad + precio sugerido del último costo) + impuesto + total en vivo. Vista de detalle con todos los ítems.
      - **Márgenes**: por producto suma `cantidad·costo_unitario` de insumos base y compara con precio. Semáforo de color por % margen.

21. **[NUEVO]** Tanda 8 — Finanzas, activos, depreciación y gastos
    - **Modelo de datos** (idempotente desde `ensureFinanzasTables`):
      - `soda_master.activos` (nombre, categoría, `costo_compra`, `vida_util_meses`, `valor_residual`, `metodo_depreciacion` lineal, `proveedor_id`, ubicación, n° serie, estado ∈ {`activo`,`reparacion`,`baja`,`vendido`}).
      - `soda_master.empleados` (nombre, cargo, documento, contacto, `sueldo_base`, `periodicidad` ∈ {`mensual`,`quincenal`,`semanal`,`diario`,`por_hora`}, fechas ingreso/egreso, `usuario_id` opcional).
      - `soda_master.gastos` (fecha, `tipo` ∈ {`operativo`,`sueldo`,`servicio`,`impuesto`,`financiero`,`otros`}, categoría libre, `monto`, recurrente + periodicidad, FKs opcionales a `proveedor`/`empleado`/`activo`).
      - Columna `ingredientes.tipo` (`comida`/`negocio`/`otro`) para separar insumos de cocina vs limpieza/empaque/papelería.
    - **Depreciación lineal automática** (helper `computarDepreciacion`): calcula al vuelo `mensual = (costo − residual) / vida_util_meses`, `acumulada = min(meses_transcurridos, vida_util) × mensual`, `valor_actual = max(residual, costo − acumulada)` y marca `completamente_depreciado` cuando aplica.
    - **APIs nuevas**: `GET/POST /api/activos`, `PATCH/DELETE /api/activos/[id]`, `GET /api/depreciacion` (resumen portfolio), `GET/POST /api/empleados`, `PATCH /api/empleados/[id]`, `GET/POST /api/gastos`, `DELETE /api/gastos/[id]`, `GET /api/gastos?resumen=true&desde=&hasta=`.
    - **Nueva página Finanzas** (`components/finanzas-page.tsx`) accesible desde sidebar y bottom-nav, permisos `administrador`/`admin`. Cuatro pestañas: **Gastos**, **Empleados/sueldos**, **Activos y depreciación**, **Márgenes**.
    - **Insumos por tipo** en Inventario → Insumos: filtro arriba (Todos/Comida/Negocio/Otro), columna `Tipo` y `Costo`, selector en el diálogo de alta/edición.

22. **[NUEVO]** Tanda 8.1 — Seed de demostración coherente (`POST /api/seed-demo`)
    - **Botón "Cargar datos de demostración"** en el header de Finanzas (ámbar). Es **idempotente**: detecta registros existentes por nombre/email/serie y no duplica.
    - Crea/usa: insumos base (vía `runSeedRecetasBase`) + **9 insumos del negocio** (servilletas, bolsas delivery, vasos, tapas, cajas burger, papel térmico, lavavajilla, cloro, bolsas basura) marcados `tipo='negocio'`.
    - **8 proveedores** reales (Carnicería El Buen Corte, Panadería La Esquina, Distribuidora Andina, Verduras del Mercado, Lácteos Premium, Importadora de Licores, Insumos Profesionales, Inmobiliaria Centro).
    - **5 empleados** vinculados a los `usuarios` iniciales del seed: Carlos García (Cajero, $650k), María López (Mesera, $580k), Pedro Martínez (Cocinero, $780k), Laura Rodríguez (Bartender, $720k) + Ana Soto (Ayudante cocina, $520k, sin usuario).
    - **10 activos** con costos, vida útil y fechas reales para que la depreciación quede calculada: plancha, freidora doble, refrigerador 600L, congelador 400L, cafetera 2 grupos, tablet POS, 2 impresoras térmicas (Cocina/Bar), mesas+sillas, aire acondicionado split.
    - **7 compras recientes** (sólo si no hay compras previas): factura/boleta por proveedor con líneas que actualizan stock y `costo_unitario` con promedio ponderado, dejando los **márgenes calculados con precios reales**.
    - **12 gastos del último mes**: arriendo $1.2M, luz/agua/internet/gas, 5 sueldos asociados al empleado correspondiente, mantención de freidora asociada al activo, patente municipal.

18. **[NUEVO]** Tanda 5.1 — KDS doble (impresión física como respaldo del KDS digital)
    - **Motor de impresión:** `lib/print-ticket.ts` ahora soporta los tipos `'cocina'` y `'bar'` (sin precios, con cantidades en tamaño grande y notas/especiales/salsas resaltadas) además de los existentes (`'comanda'`, `'boleta'`, `'precuenta'`). Nueva función `buildMultiTicketHtml(tickets, config)` une varios tickets en un solo documento con `page-break-after: always`, de modo que cocina + bar se imprimen en un solo trabajo de impresión. Helper público `splitComandaParaEstaciones(comanda, productos, { nombreNegocio, soloPendientes })` separa los ítems entre cocina y bar reutilizando exactamente la misma regla que usa el KDS digital (`CATEGORIAS_BAR = ['bebidas','cervezas','jugos_bebidas','tragos']`).
    - **Configuración:** nuevo campo `Configuracion.impresora_copias_auto` (default `true`) y switch en Configuración → Impresión: "Preguntar por copias para cocina y bar (KDS doble)". Si se desactiva, "Enviar a cocina" no abre ningún diálogo de impresión.
    - **POS (flujo opt-in con memoria):** tras "Enviar a cocina" exitoso, si el switch está activo y se enviaron ítems nuevos, aparece un mini-diálogo con dos checkboxes — "Cocina" y "Bar" — sólo con las opciones aplicables habilitadas (si no hay ítems para una estación, su checkbox se ve deshabilitado con el detalle "Sin ítems para X en este envío"). La selección se persiste por dispositivo en `localStorage` (`sodamaster.kds.print_cocina` / `sodamaster.kds.print_bar`), así la próxima comanda viene con los mismos checkboxes preseleccionados. Botones: "No imprimir" (cierra sin imprimir y aún así guarda la preferencia) e "Imprimir [N copias]" (deshabilitado si no hay nada marcado). Al confirmar se abre el `PrintPreviewDialog` con SOLO los tickets seleccionados, en un único documento.
    - **KDS:** cada `ComandaCard` (vista admin y vista por rol) tiene un botón "Reimprimir" en la esquina superior derecha. Genera el ticket de la estación correspondiente (cocina o bar según rol/columna) marcado como "REIMPRESIÓN" y abre el `PrintPreviewDialog` para reimpresión manual.
    - **`PrintPreviewDialog`:** acepta ahora un prop opcional `tickets?: TicketData[]` (lista para imprimir como documento único) en paralelo al prop `data?: TicketData` existente. Cuando hay varias copias, el botón muestra "Imprimir N copias" y la descripción del dialog indica el conteo.
    - **Resultado:** el operador nunca imprime "siempre por defecto". Decide por comanda qué copias necesita y la app recuerda su preferencia para que el flujo sea de un solo click la mayor parte del tiempo. Si el KDS digital falla, basta con marcar las copias y disparar la impresión. Si el ticket original se pierde, el operador del KDS puede reimprimirlo desde su pantalla.

---

### Persistencia con Neon - Optimizado para Serverless
El sistema ahora usa **Neon PostgreSQL serverless** con arquitectura eficiente:
- Datos se almacenan en base de datos
- Endpoint de seed (`/api/seed`) inicializa BD con datos de demo
- **Mesero crea orden en POS** → POST `/api/ordenes` + `/api/items-orden` persisten en BD
- **Orden se envía a cocina** → PATCH `/api/ordenes` con `estado='en_cocina'`
- **KDS refrescar manual** → GET `/api/ordenes` cuando cocinero presiona botón "Refrescar" (sin polling = costo bajo)
- **Cocinero/Barman marcan estados** → PATCH `/api/ordenes` con `estado='en_preparacion'|'listo'|'problema'`
- **Problema notifica mesero** → Toast emergente para cancelar orden o cambiar items
- **Auto-refrescar al enviar** → KDS se actualiza cuando mesero envía nueva orden

### Arquitectura - Optimizada
- **Frontend:** React Context + Reducers + APIs (estado local + persistencia)
- **Backend:** Next.js API Routes (lógica de negocio)
- **BD:** Neon PostgreSQL (persistencia real, sin polling automático)
- **Autenticación:** bcryptjs para hash de PINs
- **Notificaciones:** Toast emergentes del sistema

### Flujo de Datos - Optimizado
1. Usuario hace login → Endpoint `/api/auth/login` verifica PIN en BD
2. Mesero abre mesa → API actualiza `estado` a 'ocupada' en BD
3. Mesero agrega productos → Se mantiene en estado local
4. **Mesero envía orden → POST `/api/ordenes` + items se crean en BD**
5. **Cocinero presiona "Refrescar" → GET `/api/ordenes` obtiene orden nueva**
6. **Cocinero marca "Preparando" → PATCH `/api/ordenes` con estado='en_preparacion'**
7. **Cocinero marca "Listo" → PATCH `/api/ordenes` con estado='listo'**
8. **Si hay "Problema" → Toast al mesero con opción de cancelar/cambiar**
9. **Mesero ve orden lista → Entrega y cobra**

### Cambios Recientes (Mayo 2026 - Fase 3: BD 100% Real)

#### Eliminación Completa de Datos Mock
1. **initial-data.ts**: Reducido a solo 3 constantes de UI (quesos, ingredientes, salsas para dialog del POS)
2. **app-context.tsx**: Iniciala con todos los arrays vacíos (`mesas: []`, `productos: []`, `usuarios: []`, etc.)
3. **Cero fallbacks**: Si Neon no devuelve datos, la app muestra vacío — no hay datos legado que confundan

#### Menú Real en Neon (33 Productos)
- **7 Categorías**: burgers, entradas, acompañamientos, postres, cervezas, jugos_bebidas, tragos
- **33 Productos**: Cada uno con descripción, precio y categoría correcta
  - Burgers: Clásica, BBQ, Doble, Vegana, Pollo, Italiana
  - Entradas: Alitas, Aros, Nachos, Tequeños
  - Acompañamientos: Papas, Wedges, Ensaladas
  - Postres: Brownie, Cheesecake, Helados
  - Cervezas: Rubia, Negra, IPA, Sin Alcohol
  - Jugos: Coca, Sprite, Agua, Naturales
  - Tragos: Pisco, Gin, Mojito, Ron, Vino, Whisky
- **Inventario Automático**: Stock inicial según categoría (30-50 unidades) + stock_minimo + unidad_medida

#### Actualización de db.ts
- `getProductos()`: JOIN con `categorias` e `inventario` — devuelve `categoria` como string (ej: 'burgers')
- `getUsuarios()`: Normaliza shape de usuarios desde Neon
- `getInventarioCompleto()`: Query completa con producto, categoría y stock
- `crearProducto()`: Inserta producto e inventario en transacción

#### Limpieza de Componentes
- `pos-page.tsx`: Carga productos desde API → dialog del burger ahora muestra quesos, ingredientes, salsas desde las constantes UI
- `inventario-page.tsx`: Carga desde `/api/inventario` con `useEffect` propio → muestra resumen (total/OK/bajo/sin stock)
- `kds-page.tsx`: Filter `isBarItem` actualizado para las 3 categorías de bebidas (`cervezas`, `jugos_bebidas`, `tragos`)
- `mesas-page.tsx`: `getComandaActiva()` filtra por `items.length > 0` para nunca mostrar "Comanda activa (0 items)"

#### Seed Actualizado
- `/api/seed`: Ahora documenta el menú real (7 categorías + 33 productos)
- Ejecuta solo si BD está vacía — no fuerza inserción si ya hay datos
- DELETE `/api/seed` disponible en desarrollo para limpiar y re-inicializar

#### Flujo 100% Real
1. App inicia → carga vacío
2. `/api/seed` verifica si BD está poblada
3. Si vacía: inserta 7 categorías + 33 productos + 20 mesas + 5 usuarios + inventario
4. Si llena: solo devuelve status OK
5. Todo se carga desde Neon en tiempo real

#### Ventajas Finales
- **Transparencia total**: Datos en BD, visible siempre, sincronizado en todos los dispositivos
- **Cero confusión**: No hay fallback a mock — el sistema enseña exactamente qué hay en la BD
- **Escalable**: Agregar/quitar productos/usuarios es solo insertar en tablas
- **Real desde día 1**: El POS muestra el menú real, inventario real, usuarios reales

#### Cambios Fase 2 (Mayo 2026)
1. **KDS Optimizado para Serverless**: Botón refrescar manual (sin polling automático)
2. **Estados Granulares**: pendiente → en_preparacion → listo → problema
3. **Notificaciones Emergentes**: Toast rojo para problemas en órdenes
4. **Mapper Correcto**: `mapOrdenToComanda` convierte items de Neon al formato frontend

#### Cambios Fase 1 (Mayo 2026)
1. **Corrección de Temas**: Tokens semánticos (`bg-card`, `bg-muted`, `border-border`)
2. **Nombres de Mesas**: Generación en SQL `'Mesa ' || numero`
3. **APIs Completadas**: GET/POST/PATCH/DELETE para mesas, órdenes, items
4. **Mapeo BD->Frontend**: Función `mapOrdenToComanda` convierte snake_case a camelCase

---

## 🚨 Correcciones obligatorias antes de la implementación de producción final

Esta sección agrupa las decisiones que están **postergadas a propósito** durante la etapa actual (cliente sigue probando con PINs por defecto y sin login corporativo). Antes del go-live real con caja abierta al público hay que ejecutar TODAS estas tareas.

### Seguridad y credenciales

1. **Ocultar / eliminar PINs demo del login**
   - **Archivo:** `components/login-form.tsx` (línea ~200)
   - **Estado hoy:** Visible siempre. `"PINs: Admin=1234, Carlos=2222, Maria=3333, Pedro=4444, Laura=5555"`.
   - **Razón de postergación:** El cliente aún usa estos PINs por defecto durante la fase de pruebas.
   - **Acción para producción final:** O bien envolver en `process.env.NODE_ENV !== 'production'`, o eliminar la línea por completo. Antes hay que asegurarse de que el cliente haya cambiado los PINs de Admin, Carlos, Maria, Pedro y Laura por valores propios desde Configuración → Usuarios.

2. **Cambiar PINs por defecto en BD**
   - Forzar al cliente a actualizar los 5 PINs sembrados por `/api/seed` (1234, 2222, 3333, 4444, 5555). Idealmente añadir un flag `requiere_cambio_pin` en `usuarios` que obligue a renovarlo en el primer login.

3. **Autenticación real en APIs (Bug #10)**
   - **Archivos:** Todas las rutas en `app/api/**` excepto `/api/auth/*`.
   - **Estado hoy:** Cualquier persona con la URL pública puede `POST /api/pagos`, `PATCH /api/configuracion`, etc.
   - **Acción para producción final:** Middleware con JWT o cookie firmada que valide rol y usuario activo en cada request. Marcar las rutas administrativas como protegidas por rol `admin`.

4. **Rate limiting + protección contra fuerza bruta en `/api/auth/login`**
   - Hoy se puede probar 10.000 PINs por segundo. Agregar rate limit por IP + bloqueo temporal tras N intentos fallidos.

### Integridad de datos

5. **Transacción única para `crearOrden` + items (Bug #11)**
   - Hoy el POS hace `POST /api/ordenes` y luego N `POST /api/items-orden` en loop. Si la red corta a la mitad queda una orden huérfana o parcial.
   - **Acción:** Endpoint `POST /api/ordenes/completa` que reciba `{ orden, items[] }` y los inserte en una sola transacción Neon. POS migra a este endpoint.

6. **Constraints de BD como refuerzo de integridad**
   - Tanda 3 ya bloquea duplicados por backend con `pg_advisory_xact_lock`. Para producción final conviene reforzar además con constraints/índices en BD: `UNIQUE (mesa_id) WHERE estado NOT IN ('pagado','cancelado')` para comandas activas y `UNIQUE(orden_id)` en `descuentos`.

### UX / robustez

7. **Init con `initError` visible (Bug #26)**
   - Cuando `initializeDatabase` falla, mostrar pantalla "Error de conexión con la BD - reintentar" en vez de quedarse en blanco.

8. **~~WebSocket o SSE para KDS / notificaciones (Bug #28)~~** ✅ Corregido sin WebSocket
    - Resuelto con polling ligero cross-device (`/api/notificaciones` + tabla `soda_master.notificaciones` + interval cada 10 s mientras la pestaña está visible). Ver detalle del bug #28. Si más adelante se quiere reducir la latencia a "tiempo real real", se puede migrar a SSE o WS sin cambiar la API ni el contrato del cliente.

### Cosmética / housekeeping

9. **Eliminar logs `[v0]` del código (Bug #24)**
    - Reemplazar por logger estructurado o quitar.

10. **Decidir destino de `Co-authored-by: Cursor` en commits (Bug #27)**
    - Cosmético, sin impacto en producción.

### Cómo usar esta lista
- Cuando el usuario diga **"hay que corregir antes de producción final"**, este bloque es la checklist.
- Marcar cada ítem como `[CORREGIDO]` aquí y mover el detalle al historial cuando se complete.
- No tocar estas correcciones durante la fase de demo/pruebas con el cliente salvo que se pida explícitamente.

---

## Como Usar

### Login
1. Abrir la aplicacion
2. Ingresar email (ej: admin@soda.cl)
3. Usar el teclado numerico para ingresar PIN (ej: 1234)
4. Click en "Ingresar"

### Flujo de Trabajo Tipico
1. **Mesero:** Mesas > Seleccionar mesa > POS > Agregar productos > Enviar a cocina
2. **Cocina:** KDS > Ver ordenes > Marcar como preparando > Marcar como lista
3. **Cajero:** Pagos > Seleccionar orden > Procesar pago > Imprimir ticket

---

## Version
- **Version:** 3.8.0-finanzas
- **Fecha:** Mayo 2026
- **Estado:** Sistema Completo 100% Real con BD Neon + 5 tandas de bugs + 3 tandas de funcionalidad (recetas, compras, finanzas)
- **BD:** Neon PostgreSQL con 7 categorías, 33 productos, inventario por insumos, recetas reales, proveedores, compras, activos, empleados, gastos
- **Ambiente:** Vercel deployment ready
- **Última Actualización:** Tandas 6 → 8.1 (Mayo 2026) — Recetas reales por producto con `modo_stock` y descuento real de insumos en `crearItemOrden`; módulo Proveedores + Compras con promedio ponderado en `costo_unitario`; nuevo módulo **Finanzas** (gastos, sueldos, empleados, activos con depreciación lineal automática, márgenes); insumos clasificados por `tipo` (comida/negocio/otro); endpoint `/api/seed-demo` idempotente que pobla todo coherente con los usuarios iniciales (Carlos García, María López, Pedro Martínez, Laura Rodríguez, Ana Soto). Antes de eso (Tanda 5.2) — Notificaciones cross-device (bug #28). Nueva tabla `soda_master.notificaciones` (auto-bootstrap), endpoints `GET/POST /api/notificaciones` y `PATCH /api/notificaciones/[id]`. Cuando cocina marca "problema" o "listo" se persiste una notificación dirigida al mesero dueño de la orden; el cliente hace polling cada 10 s (solo con tab visible) y dispatcha las nuevas. El toast tiene auto-dismiss diferenciado (10 s problema / 6 s listo), botón "Ir a POS" para problemas y persiste el `vista=true` en backend al cerrar para no re-entregar. Reemplaza el "roadmap WebSocket" sin perder el contrato. 24/28 bugs del scan corregidos + funcionalidades de "Precuenta", "KDS doble opt-in" y notificaciones cross-device; los 4 bugs restantes son #9-#10 (postergados a producción final), #11 (refuerzo opcional), #23 (mesas), #24, #26-#27 (cosmética / housekeeping).
