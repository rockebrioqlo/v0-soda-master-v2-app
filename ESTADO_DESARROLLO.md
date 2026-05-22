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

### 7. Gestion de Usuarios
- [x] CRUD completo de usuarios
- [x] Asignacion de roles
- [x] Activar/desactivar usuarios
- [x] Validacion de datos
- [x] Cambio de PIN

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
- **Version:** 3.0.0-real-db
- **Fecha:** Mayo 2026
- **Estado:** Sistema Completo 100% Real con BD Neon
- **BD:** Neon PostgreSQL con 7 categorías, 33 productos, inventario real
- **Ambiente:** Vercel deployment ready
- **Última Actualización:** Eliminación completa de datos mock, menú real en BD, todos los datos desde Neon
