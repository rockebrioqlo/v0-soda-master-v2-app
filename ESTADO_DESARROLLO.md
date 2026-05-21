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
- [x] Metodos de pago: efectivo, tarjeta, Sinpe, transferencia
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

### 10. Configuracion
- [x] Informacion del negocio
- [x] Gestion de mesas (CRUD)
- [x] Configuracion de impresion (placeholder)
- [x] Metodos de pago habilitados
- [x] Propinas
- [x] Notificaciones
- [x] Moneda y tasa de impuesto

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

### Cambios Recientes (Mayo 2026 - Fase 2)

#### KDS Optimizado para Serverless
1. **Quitar Polling Automático**: Eliminado refresco cada 5 segundos para ahorrar llamadas a BD
2. **Botón Refrescar Manual**: KDS/Cocina/Bar presiona botón para obtener órdenes nuevas
3. **Estados por Item**:
   - **Pendiente**: Estado inicial cuando llega orden
   - **En Preparación**: Cocinero marca manualmente al comenzar
   - **Listo**: Comida/bebida lista para entregar
   - **Problema**: Error o falta ingrediente

#### Sistema de Notificaciones Emergentes
- Toast rojo con ícono de alerta en esquina inferior derecha
- Desaparece automáticamente en 8 segundos
- Mesero puede cerrar manualmente antes
- Tipo "problema": Notifica que hay orden con problema, opción de cancelar y crear nueva

#### Cambios de Código
- Tipos: `EstadoComanda` agregó 'en_preparacion' y 'problema', nuevo `EstadoItem`
- Interface `Notificacion` en `AppState` con `tipo | ordenId | mesaNombre | vista`
- Componente `NotificacionesToast` muestra notificaciones emergentes
- KDS: 3 botones por orden: "Preparando", "Listo", "Problema"
- Reducer: acciones `ADD_NOTIFICACION`, `MARCAR_NOTIFICACION_VISTA`, `LIMPIAR_NOTIFICACIONES`
- Context: función `updateOrden` maneja estados

#### Ventajas de esta Solución
- **Serverless viable**: Sin polling, bajo consumo de BD (ideal para capa gratuita)
- **Mejor UX**: Cocinero controla cuándo refrescar, menos distracciones
- **Flexible**: Problema notifica mesero para cambiar item o cancelar orden
- **Escalable**: Funciona igual con 1 o 1000 órdenes/hora
- **Costo controlado**: Paga solo por llamadas reales, no por polling

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
- **Version:** 2.1.0-serverless
- **Fecha:** Mayo 2026
- **Estado:** Prototipo Funcional - KDS Optimizado para Serverless
- **BD:** Neon PostgreSQL serverless (sin polling automático)
- **Ambiente:** Vercel deployment ready
- **Última Actualización:** KDS refrescar manual, estados granulares, notificaciones emergentes para problemas
