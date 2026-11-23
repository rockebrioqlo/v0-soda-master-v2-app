# AUDITORIA_ACCESIBILIDAD — Sodamaster

Sesión 20 (K2). Auditoría hecha el 22-11-2026; informe guardado el 23-11-2026. Solo lectura: no se cambió código de la app ni el esquema.

Estándar: WCAG 2.1 AA, sin certificación. Es una revisión técnica con el DOM, el código y el navegador integrado; **no se usó un lector de pantalla real**.

## 1. Cómo se midió

- **Código:** lectura de los componentes y tres scripts de solo lectura (etiquetas sin asociar, botones de solo ícono sin nombre, elementos clickeables que no son botones). Los scripts vivían en el scratchpad de la sesión, fuera del repositorio.
- **Navegador:** compilación de producción en el puerto 3011, un admin temporal propio ("prueba auditoria-accesibilidad 22-11-2026", borrado al terminar) y navegación solo con teclado: Tab, Shift+Tab, Enter, Esc. Contraste calculado con la fórmula de WCAG sobre los colores calculados por el navegador, componiendo las transparencias.
- **Pantallas vistas en el navegador:** login, `/menu`, Dashboard, Mesas (y su diálogo Nueva Mesa), POS (selector de mesa, pantalla de pedido y diálogo de personalizar), KDS, Pagos (lista y detalle sin cobrar), Caja (cerrada, y el diálogo Abrir caja), y el menú "Más" en 375 px.
- **Solo código:** Inventario, Mermas, Usuarios, Reportes, Configuración, Finanzas, vista previa de impresión, overlay de tablet (768 a 1023 px) y los toasts de notificaciones.

## 2. Hallazgo previo que condiciona el contraste

`<html>` nunca recibe la clase `dark` (`app/layout.tsx:38`; `ThemeProvider` no se usa y el commit inicial de v0 ya era así). El tema oscuro de `app/globals.css` es código muerto y la app se dibuja con los tokens **claros**, pero con colores pensados para fondo oscuro. Solo el login y `/menu` fuerzan fondo oscuro.

Medido al agregar la clase `dark` en vivo: Dashboard 9 fallos en claro y 0 en oscuro; Mesas 43 y 20; POS 37 y 1; Caja 2 y 0. Las lecturas en oscuro de KDS y Pagos no son confiables (las transiciones CSS contaminaron la medida): hay que remedirlas con el tema ya aplicado.

**Decisión del usuario (23-11-2026): opción A, activar el tema oscuro** con `className="dark"` en `<html>`. Va al inicio de la sesión 21a, antes de los demás arreglos, para verificarlos sobre el tema definitivo.

## 3. Hallazgos

Severidad: 🔴 impide usar el sistema con teclado o lector de pantalla · 🟡 dificulta · ⚪ menor. Tamaño: XS < 30 min, S ~1 h, M 2 a 3 h, L > 3 h.

### 🔴 Impiden usar el sistema

| # | Causa común y dónde | Qué falla y a quién afecta | Corrección y tamaño | Sesión |
|---|---|---|---|---|
| 1 | **Tarjetas clickeables que son `div`:** `components/mesas-page.tsx:254`, `components/pos-page.tsx:1217`, `components/pagos-page.tsx:1232` | Medido: 20 tarjetas de mesa en POS, 20 en Mesas y 3 filas en Pagos, ninguna enfocable. Con teclado no se abre una mesa ni se elige la comanda a cobrar. Teclado y lector. | Hacerlas botones reales. En Mesas la tarjeta contiene un Select y dos botones: botón en el título que cubra la tarjeta. **S–M** | 21a |
| 2 | **Menús desplegables hechos a mano:** `components/bottom-nav.tsx:142-185` (cajón "Más"), `components/main-layout.tsx:205-219` (overlay de tablet); mismo patrón de fondo con `onClick` en `components/pos-page.tsx:1549` (no verificado en navegador) | Medido en 375 px: sin `role=dialog`, el foco se queda en "Más", Esc no cierra, el fondo no queda inerte y el botón X no tiene nombre. En móvil ahí viven Pagos, Caja y Config. | Reemplazar por `Sheet` o `Dialog` de Radix (`components/ui/sheet.tsx` existe y no se usa). **M** | 21a |
| 3 | **Avisos que no se anuncian:** `components/toast.tsx:89` (228 llamadas a `showToast`, 4 s), `components/notificaciones-toast.tsx:73` (6 a 10 s), error del login (`components/login-form.tsx:193`), banner offline (`components/main-layout.tsx:133`), "Vuelto" y "Falta" en Pagos (`components/pagos-page.tsx:2041-2055`) | Sin `role` ni `aria-live`. Un lector no sabe si el cobro se hizo ni por qué falló. Los errores desaparecen a los 4 s (WCAG 2.2.1). | `role=status` o `alert` en los dos contenedores arregla las 228 llamadas; errores con más duración o hasta cerrarlos. **S** | 21a |

### 🟡 Dificultan

| # | Causa común y dónde | Qué falla | Corrección y tamaño | Sesión |
|---|---|---|---|---|
| 4 | **Etiquetas sin asociar:** 113 de 153 `<label>` (31 con `htmlFor`, 9 envuelven el control). Comprobado en el navegador en login, Caja, Nueva Mesa y Pagos. | Los 2 campos del login (`components/login-form.tsx:127,139`), "Efectivo recibido" (`components/pagos-page.tsx:1981`, solo placeholder), Fondo inicial, Nota especial y 18 archivos más. Los Select de estado de cada mesa (`components/mesas-page.tsx:309`) salen como "combobox" sin nombre ×20. | `id` y `htmlFor`, o `aria-label` donde no hay etiqueta visible. Orden: login, Pagos, Caja, POS, Mermas, Inventario, Usuarios, resto. Mecánico. **M–L** | 21b |
| 5 | **Botones de solo ícono sin nombre:** 26 sitios (40 instancias solo en Mesas) | Borrar y "C" del login (`components/login-form.tsx:167,183`), cerrar de `components/bottom-nav.tsx:154`, `components/toast.tsx:100`, Salir de la cabecera de cocina (`components/main-layout.tsx:93`), editar y borrar mesa (`components/mesas-page.tsx:319,329`), 8 en POS (`components/pos-page.tsx:1412,1424,1429,1652,1664,1675,2050,2054`), y Usuarios, Compras, Activos, Config, Empleados, Gastos, Proveedores e historial KDS. Un Switch sin nombre en Pagos. | `aria-label`. **S–M** | 21b |
| 5b | **"Close" en inglés:** `components/ui/dialog.tsx:79`, `components/ui/sheet.tsx:77` | Afecta a todos los diálogos, incluido el aviso de privacidad. Confirmado en el navegador. | Cambiar a "Cerrar". **XS** | 21a |
| 6 | **Contraste** (sección 4) | Ver sección 4. | Opción A decidida. | 21a (tema) y 21b (el resto) |
| 7 | **Estados solo visuales:** método de pago (`components/pagos-page.tsx:1954-1975`), categoría activa de `/menu` (`app/menu/page.tsx:151`), nav (`components/main-layout.tsx:109`, `components/bottom-nav.tsx:109`) | Sin `aria-pressed` ni `aria-current`: el estado activo es solo color. | Agregar los atributos. **S** | 21a |
| 8 | **Estructura de la app** | `document.title` igual en todas las pantallas (es una SPA). Los 2 `<nav>` sin `aria-label`. Sin enlace "saltar al contenido" (14 paradas de Tab antes del contenido en escritorio). `CardTitle` es un `div` (`components/ui/card.tsx:31`), así que casi no hay encabezados. El POS con mesa abierta no tiene `h1`. Tras cambiar de pantalla el foco se queda en el botón del menú. | Título por pantalla, `aria-label` en los `nav`, skip link, `CardTitle` como `h2` o `h3`. **S–M** | 21b |
| 9 | **Foco tras cerrar diálogos abiertos por estado:** Nueva Mesa y personalizar producto | Esc y la trampa de foco funcionan (Radix), pero el foco vuelve a `body`, no al botón que abrió. El aviso de privacidad sí lo devuelve. | `onCloseAutoFocus` o guardar el elemento que abrió. **S** | 21a |
| 10 | **KDS:** `components/kds-page.tsx:557-585` | Los botones por ítem se llaman solo "Preparando", "Listo", "Problema", repetidos por cada ítem. Las comandas nuevas no se anuncian. `animate-pulse` (12 usos, ej. `components/kds-page.tsx:447`) no respeta `prefers-reduced-motion` (ninguna regla `motion-reduce`). | `aria-label` con el ítem, región `aria-live`, `motion-reduce`. **S** | 21a |
| 11 | **Teclado del login:** `components/login-form.tsx:155-191` | El teclado en pantalla suma 12 paradas de Tab entre el PIN y "Ingresar". Enter en el campo PIN sí envía (verificado) y el foco es visible. | Agrupar con `role=group aria-label`, o sacarlo del orden de Tab. A decidir en la sesión. **XS** | 21b |

### ⚪ Menores (sin sesión asignada salvo que se indique)

- Objetivos táctiles: los checkboxes "Cobrar" de Pagos miden 16×16 px (WCAG 2.2 pide 24; la 2.1 no exige mínimo). Las pastillas de categoría de `/menu` miden 32 px. El resto cumple (barra inferior 64 px, teclado del login 56 px).
- Desborde horizontal a 1024 px: POS 1158/1009 con "Enviar" recortado, Mesas 1026/1009 (reflow).
- Gráficos de Recharts 2.15 (`components/dashboard-page.tsx:207,288`, `components/reportes-page.tsx:481,549`) sin `accessibilityLayer` ni alternativa en texto. Su contraste no se midió.
- La sesión por inactividad vence sin aviso previo (WCAG 2.2.1). Es una decisión de producto de F42; no se toca sin pedirlo.
- `lang="es"` está bien (`es-CL` sería más preciso). `/menu` no tiene `<img>` (no hay imágenes que describir); el recuadro "SM" del logo no tiene `aria-hidden`.
- Viewport meta correcto (el zoom está permitido). Sin scroll horizontal en `/menu` ni en el login a 375 px.

## 4. Contraste medido

Umbral: 4,5:1 texto normal, 3:1 texto grande. Colores de Tailwind v4.

| Caso | Razón | Dónde |
|---|---|---|
| `text-amber-500` sobre blanco | **2,06 a 2,13** (1,83 en el ítem activo del menú) | 79 usos: precios del POS (35 en una pantalla), marca de la cabecera |
| `text-green-500` sobre blanco | **2,22** | Montos de Pagos |
| Blanco sobre `bg-green-500` | **2,22**, texto de 10 px, en claro y en oscuro | Badges "Libre" de Mesas, POS, Pagos |
| Blanco sobre `bg-red-500` | 3,81 | Badges "Ocupada" y "DEMORADO" |
| Blanco sobre `bg-green-600` | 3,22 | "Listo" del KDS, "Para entregar" |
| "Iniciar Sesion" (blanco) sobre la tarjeta | **1,21** (`components/login-form.tsx:113`) | Login |
| `zinc-400` sobre la tarjeta del login | **2,17** | Etiquetas y "Acceso rápido" |
| `muted-foreground` sobre fondos tintados | 4,09 a 4,35 | "Capacidad", "Reimprimir" |
| `zinc-500` sobre `zinc-950` | **4,12** | Pie de `/menu`, incluido el enlace del aviso |
| Diálogo del aviso de privacidad | Sin fallos | — |

Con el tema oscuro activo se espera que desaparezcan los de amber-500 y green-500 como texto y queden unos 20 fallos propios (sobre todo los badges con texto blanco). **Remedirlos al aplicar el tema.** En oscuro hay que vigilar `rose-700` (2,94 sobre zinc-900) y `red-600` (3,71), y el login, que hoy pone una tarjeta clara sobre fondo oscuro.

## 5. Lo que ya está bien

Radix atrapa el foco y cierra con Esc en todos los diálogos. Los productos del POS son botones reales. Los checkboxes de Pagos ya tienen `aria-label`. Configuración tiene 23 de 33 etiquetas asociadas. `/menu` tiene `main`, `nav`, `footer`, encabezados h1 y h2 y título propio. El zoom está permitido. El foco es visible en botones y campos. En el aviso de privacidad el foco entra al diálogo y vuelve al enlace al cerrar.

## 6. No se pudo verificar

- Sin lector de pantalla real (NVDA): los nombres accesibles salen del DOM.
- Con el foco en el botón de cerrar del aviso, las flechas no desplazaron el texto; puede ser una limitación de cómo el navegador integrado envía las teclas.
- La primera pulsación de Esc en el aviso no lo cerró y la segunda sí; no se reprodujo de forma concluyente.
- No se ejecutó un cobro de punta a punta (no se abrió caja ni se crearon comandas, para no tocar datos).
- Las lecturas en oscuro de KDS y Pagos (transiciones CSS).
- Pantallas solo vistas en el código: ver sección 1.

## 7. Plan para la sesión 21

Decisiones del usuario (23-11-2026): contraste con la opción A, y la sesión se divide en dos.

**21a — tema oscuro y arreglos de componentes compartidos.** Orden:
1. **Tema oscuro:** `className="dark"` en `<html>`. Antes de seguir, capturas de login, Mesas, POS, KDS, Pagos y Caja para detectar fondos claros fijos (por ejemplo la tarjeta del login) y arreglar lo que quede roto en esta misma sesión.
2. #5b: "Close" → "Cerrar" en `dialog.tsx` y `sheet.tsx`.
3. #3: `role=status` o `alert` y duración de los errores en `toast.tsx`, `notificaciones-toast.tsx`, el error del login, el banner offline y "Vuelto"/"Falta".
4. #1: tarjetas de `mesas-page`, `pos-page` y `pagos-page` como botones.
5. #2: cajón "Más" y overlay de tablet con `Sheet`/`Dialog` de Radix; revisar el cajón de comanda del POS.
6. #7: `aria-pressed` y `aria-current`.
7. #9: devolver el foco al cerrar diálogos abiertos por estado.
8. #10: KDS (`aria-label` por ítem, `aria-live`, `motion-reduce`).

Pruebas de la 21a: teclado y lector sobre lo cambiado, `pnpm build`, `pnpm prueba:humo`, y navegador (con usuario temporal propio, que se borra) en login, Mesas, POS, KDS, Pagos y Caja. Como toca cobro y caja, también `pnpm prueba:completa --modulo=cobro`.

**21b — etiquetas, nombres, estructura y contraste restante.**
1. #4: etiquetas, en el orden de la tabla.
2. #5: `aria-label` en los 26 botones de solo ícono.
3. #8: título por pantalla, `aria-label` en los `nav`, skip link, encabezados.
4. #11: teclado del login.
5. Los ~20 fallos de contraste que queden en oscuro, remedidos.
6. Nueva corrida de medición y de teclado (los mismos criterios de este informe) para comparar contra los números de arriba.

## 8. Fuera de alcance de K2

La pista de PINs del login y `accesos-rapidos` (P1 y P3), F59, F57, F58, C10, la certificación WCAG, los textos legales del aviso y los cambios de diseño que no sean de accesibilidad.

## 9. Estado tras la 21a

Sesión 21a (23-11-2026, local, sin push). Mismo método que la sesión 20: compilación de producción en el puerto 3011, un admin temporal propio, teclado real (Tab, Shift+Tab, Enter, Espacio, Esc) y contraste calculado con la fórmula de WCAG sobre los colores calculados por el navegador, componiendo transparencias. Sigue sin verificarse con un lector de pantalla real (NVDA).

### Qué cambió

| # | Estado | Cómo quedó |
|---|---|---|
| Tema oscuro | ✅ | `<html className="bg-background dark">` y `color-scheme: dark` en `.dark` (`app/globals.css`): las barras de scroll nativas salían blancas. La tarjeta del login queda oscura (`bg-card`), así que no hizo falta rediseñarla; los claros fijos que quedan son el papel del recibo y las vistas previas de impresión, a propósito |
| 5b | ✅ | "Cerrar" en `ui/dialog.tsx` y `ui/sheet.tsx` (confirmado en el navegador en Nueva Mesa, personalizar, el cajón "Más" y el aviso) |
| 3 | ✅ | `toast.tsx`: dos regiones siempre montadas, `role="alert"` para errores y `role="status"` para el resto; los errores no se cierran solos (solo con la X, `aria-label="Cerrar aviso"`), máximo 3 a la vez (sale el más viejo) y los demás siguen en 4 s. `notificaciones-toast.tsx`: lo mismo (problemas `alert`, resto `status`, con sus 10 s y 6 s de siempre). Error del login, banner offline (los dos) y "Vuelto"/"Falta" de Pagos en una región con `role` siempre montada. Comprobado en el DOM: "El nombre es requerido" aparece en `role=alert`; 4 errores seguidos dejan 3, siguen a los 6,5 s y la X cierra uno; "Falta $35.000" aparece en `role=status`; "Comanda enviada/actualizada en cocina/bar" en `role=status` |
| 1 | ✅ | Mesas: el título de cada tarjeta es un `<button>` cuyo `::after` cubre la tarjeta; el Select y los botones de editar y borrar quedan encima (`z-10`). POS: la tarjeta de mesa es un `<button>` entero. Pagos: la fila de la comanda es un `<button>` entero. Comprobado con teclado: en Mesas Tab recorre Nueva Mesa, "Mesa 1" y su Select, y Enter abre la mesa en el POS; en el POS Enter ("Cambiar Mesa") y Espacio (Mesa 12) abren la mesa; en Pagos Enter elige la comanda |
| 2 | ✅ | `bottom-nav.tsx` (cajón "Más"), `main-layout.tsx` (overlay de tablet, `Sheet` lateral izquierdo "Menú") y el cajón de comanda de `pos-page.tsx` (el mismo patrón, ahora `Sheet` inferior): Radix da `role=dialog` con nombre, foco dentro, Esc, fondo inerte y botón "Cerrar". Comprobado en 375 px y 800 px: el foco entra, Shift+Tab da la vuelta dentro del cajón, Esc y "Cerrar" cierran y el foco vuelve a "Más", a la hamburguesa y a "Ver comanda" |
| 7 | ✅ | `aria-pressed` en Efectivo/Tarjeta (Pagos: `Efectivo=true`, `Tarjeta=false`) y en las categorías de `/menu`; `aria-current="page"` en los dos menús (comprobado en "Mesas" y "Pagos") |
| 9 | ✅ | `ui/restaurar-foco.tsx`: guarda el elemento activo al abrir (diálogos abiertos por estado) y lo devuelve al cerrar; lo usan `dialog.tsx`, `sheet.tsx` y `alert-dialog.tsx`, así que cubre todos. Comprobado: Nueva Mesa vuelve a "Nueva Mesa" y personalizar vuelve al producto que lo abrió (Burger BBQ y Agua Mineral) |
| 10 | ✅ | KDS: `aria-label` "Preparando: 1x Nachos", "Listo: …", "Problema: …" por ítem; región `aria-live="polite"` que anuncia "Nueva comanda: Mesa 13" (comprobado en vivo al entrar una comanda con el KDS abierto; la primera lectura no anuncia nada); `motion-reduce:animate-none` en el `animate-pulse` de las comandas nuevas |

Comanda de prueba del KDS (mesas 12 y 13): solo se miraron los nombres, la región `aria-live` y el contraste; **no se cambió el estado de ningún ítem**. Se cancelaron con los ítems en pendiente y las mesas quedaron libres. Lectura de la base: las 2 órdenes en `cancelado`, 0 mermas, 0 pagos, los movimientos de inventario son `venta` y `devolucion` con neto 0 y las mesas 12 y 13 disponibles.

### Contraste medido con el tema oscuro (build de producción)

Cuenta elementos de texto con razón menor a 4,5:1 (3:1 en texto grande). Los botones deshabilitados están exentos de WCAG y se anotan aparte.

| Pantalla | Textos | Fallos (elementos) | Detalle |
|---|---|---|---|
| Login | 26 | 2 + 1 deshabilitado | `zinc-500` 4,10 en "Acceso rapido (demo)" y en la pista "PINs:" (fuera de K2, ver P1 y P3); "Ingresar" deshabilitado 2,78. **"Iniciar Sesion" pasó de 1,21 a legible** |
| Dashboard | 85 | 0 | antes 9 en claro |
| Mesas | 103 | 20 | blanco sobre `green-500` 2,22 en "Libre" (17), blanco sobre `red-500` 3,81 en "Ocupada" (3). Antes 43 en claro |
| POS, selector de mesa | 80 | 21 | los mismos badges (17 y 3) y "Para entregar" blanco sobre `green-600` 3,22 |
| POS, pedido | 110 | 2 + 4 deshabilitados | "Para entregar" 2,62 y su contador 3,62; deshabilitados: "Agotado" 2,39, `$2.200` amber 3,02, "Enviar" 2,78, "Ir a Pago" 1,79. Antes 37 en claro |
| KDS (con comandas) | 622 | 94 | "Listo" blanco sobre `green-600` 3,01 a 3,22 (botones y badge). Antes sin medida fiable |
| Pagos | 610 | 160 | `rose-700` 3,24 en los montos de "Pérdidas pendientes" (79), "Cobrar" blanco sobre `green-600` 3,65 (79), título "Pérdidas pendientes" 3,28, "Listo" 2,22. Antes sin medida fiable |
| Caja | 23 | 0 | antes 2 en claro |

El amber-500 sobre fondo oscuro ya no falla (era 2,06 a 2,13 sobre blanco) y el `green-500` como texto tampoco.

### Pasa a la 21b (además de lo que ya tenía)

- **Contraste** (lo anterior): badges "Libre" y "Ocupada" (`green-500`/`red-500` con texto blanco de 10 px), "Listo" y "Cobrar" (`green-600`), "Para entregar", `rose-700` en Pagos y `zinc-500` del pie del login.
- #5 `aria-label`: el árbol de accesibilidad todavía muestra decenas de botones sin nombre (por ejemplo el lápiz y el basurero del cajón de comanda, y el lápiz es el primer botón al que cae el foco dentro de ese cajón; también los de las tarjetas de Mesas y los de la pantalla de pedido).
- Los avisos `problema` de `notificaciones-toast.tsx` siguen cerrándose a los 10 s (solo se les dio `role=alert`). **Decidido el 23-11-2026:** también hasta cerrarlos (`role=alert`, sin autocierre y dentro del tope de 3 visibles, como los errores de `showToast`); va en la 21b.
- `animate-pulse` queda sin `motion-reduce` fuera del KDS (esqueletos de carga y otros); una regla global bajo `prefers-reduced-motion` lo arreglaría de una vez.
- Tras elegir un destino en el cajón "Más" o en la hamburguesa, el foco vuelve a ese botón y no al contenido de la pantalla nueva (parte de #8).

### Visto y no tocado

- El layout de Mesas a 375 px mide 398 px de ancho (el desborde conocido de 1024 px aparece también en móvil); no es de esta sesión.
- `pnpm prueba:completa --modulo=cobro` deja en el KDS comandas pagadas con ítems sin "listo" (31 pendientes y 79 pérdidas pendientes tras la corrida, F37): son datos de prueba que se vacían antes de entregar al cliente (P2).


## 10. Estado tras la 21b

Sesión 21b (23-11-2026, local, sin push). Mismo método que las sesiones 20 y 21a: compilación de producción en el puerto 3011, un admin temporal propio (creado con un script, eliminado al terminar), teclado real (Tab, Shift+Tab, Enter, Espacio, Esc) y contraste calculado con la fórmula de WCAG sobre los colores calculados por el navegador, componiendo transparencias. Sigue sin verificarse con un lector de pantalla real (NVDA).

**Aviso sobre el medidor:** el navegador entrega los fondos de Tailwind como `lab(...)`, un formato que el primer medidor de esta sesión no leía (trataba esos fondos como transparentes y daba 0 fallos en todo). Se detectó al validar el medidor con tres `span` de prueba (blanco sobre `green-500`, `red-500` y `green-600`) y se corrigió hasta reproducir 2,22, 3,82 y 3,22. Todas las cifras de abajo son del medidor corregido.

### Qué cambió

| # | Estado | Cómo quedó |
|---|---|---|
| #4 Etiquetas | ✅ | Todo `<label>` tiene `htmlFor` con su `id` (login, Pagos, Caja, POS, Mermas, Inventario, Usuarios y el resto), y todo control sin etiqueta visible lleva `aria-label` (por ejemplo los Select de estado de cada mesa: "Estado de Mesa 1", y los campos que solo tenían `placeholder`). Cuatro `<label>` que no tenían control pasaron a `span`, `div` o `h3` (Stock actual, Límite máximo, Cantidad del POS, Vista previa en vivo). Corregido de paso un `htmlFor` que apuntaba a un `id` que no existía (Moneda y Área en Configuración: el `id` estaba en el Select y no en su `SelectTrigger`). Comprobado en el navegador: en Pagos, hacer clic en "Efectivo recibido" enfoca el campo; en Caja, el diálogo Abrir caja enfoca "Fondo inicial" |
| #5 Botones de solo ícono | ✅ | 24 botones, más "C" y borrar del login, el Switch de Pagos, el cambio de estado activo/inactivo de Usuarios (que el recuento no veía: su contenido es una expresión con dos íconos) y los de las tarjetas de Mesas. Los del cajón de comanda del POS nombran el ítem ("Editar …", "Quitar …", "Agregar una unidad de …"); el lápiz, primer foco del cajón, es "Editar <producto>". `ui/slider.tsx` pasa el `aria-label` al control deslizante |
| #8 Estructura | ✅ | Título por pantalla (`Mesas - Soda Master`, `Ingresar - Soda Master`, etc.; se actualiza al cambiar de pantalla, al recargar y en el login); `aria-label` en los 4 `<nav>`; enlace "Saltar al contenido" (primer Tab, visible al enfocarlo) hacia `<main id="contenido" tabIndex={-1}>`; `CardTitle` es `h2`; `h1` en el POS con la mesa abierta y en el cobro de una comanda de Pagos; el foco pasa al contenido al cambiar de pantalla, también tras elegir un destino en el cajón "Más" (375 px) y en la hamburguesa de tablet (800 px) |
| #11 Teclado del login | ✅ | Decisión B del usuario: las 12 teclas con `tabIndex={-1}` dentro de `role="group" aria-label="Teclado numérico"`. De Email a "Ingresar" hay 3 Tab (Email, PIN, Ingresar) y Enter en el campo PIN envía; antes eran 12 paradas más. Las teclas siguen funcionando con ratón y con toque. La pista de PINs y los accesos rápidos no se tocaron |
| Avisos "problema" del KDS | ✅ | `role="alert"`, sin autocierre, tope de 3 visibles (sale el más viejo por `timestamp`, no por orden de llegada, porque un sondeo trae varios a la vez; el desplazado no se marca como visto en el servidor, así que reaparece al recargar). Comprobado en el navegador con notificaciones de prueba dirigidas al usuario temporal: 4 seguidas dejan 3, siguen a los 24 s, el botón "Cerrar notificación" cierra uno con Enter, y al llegar 2 más con 3 visibles quedan los 3 más recientes. Los demás avisos conservan sus 6 s |
| `motion-reduce` | ✅ | Una regla global en `app/globals.css` bajo `prefers-reduced-motion: reduce` que anula `animate-pulse` (el giro de `animate-spin` se mantiene: es la señal de que algo carga). Solo comprobada leyendo el código, porque el navegador integrado no cambia la preferencia |
| Contraste | ✅ | Los pares fondo + texto de los estados de mesa y de comanda viven en `lib/helpers.ts`: "Libre" texto `zinc-950` sobre `green-500` (8,95), "Ocupada" y "Problema" blanco sobre `red-700` (6,42), "Listo", "Cobrar" y "Para entregar" blanco sobre `green-700` (4,94), `entregado` sobre `emerald-700` (5,37), `pagado` sobre `blue-600` (5,26), `en_cocina` y `en_preparacion` con texto `zinc-950`. `rose-700` como texto pasa a `rose-400` (6,92), `zinc-500` del login y de `/menu` a `zinc-400` (7,53), `red-600` del aviso a `red-400` (6,84). Al medir aparecieron fallos que la 21a no vio: `emerald-600` blanco 3,67 (los 80 botones "Cobrar" de Pagos), textos `emerald-600`, `sky-600` y `amber-700` en Inventario, y "Sin asignar" de Mermas (blanco sobre `orange-500`, 2,89); todos corregidos con tonos que funcionan en oscuro. Las insignias de rol de Usuarios también salían con blanco sobre `green-500`, `orange-500` o `pink-500` |

### Contraste medido (build de producción, medidor corregido)

Cuenta de elementos de texto con razón menor a 4,5:1 (3:1 en texto grande). Los controles deshabilitados están exentos de WCAG y se anotan aparte.

| Pantalla | Antes (21a, sección 9) | Después (21b) |
|---|---|---|
| Login | 2 fallos + 1 deshabilitado | **0** + 1 deshabilitado ("Ingresar", 2,78) |
| `/menu` | `zinc-500` 4,12 en el pie | **0** |
| Dashboard | 0 | **0** |
| Mesas | 20 | **0** |
| POS, selector de mesa | 21 | **0** |
| POS, pedido | 2 + 4 deshabilitados | **0** + 3 deshabilitados ("Agotado" 2,38, `$2.200` 3,01 y "Enviar nuevos" 2,78, todos dentro de botones deshabilitados) |
| KDS (con comandas) | 94 | **0** (661 textos) |
| Pagos | 160 | **0** (630 textos) |
| Caja (y el diálogo Abrir caja) | 0 | **0** + 1 deshabilitado ("Abrir", 2,78) |
| Cajón "Más" a 375 px | sin medida | **0** |
| Inventario, Mermas, Usuarios, Finanzas, Reportes, Config | sin medida | **0** (antes de corregir: 40 en Inventario y 1 en Mermas) |

**"Agotado" y los ámbar del POS:** decididos con la medida real. Los tres textos que quedan bajo 4,5:1 están dentro de botones deshabilitados (un producto agotado, "Enviar nuevos" sin ítems nuevos), así que están exentos y no se tocaron. Los demás textos ámbar del POS miden por encima de 4,5:1.

### Etiquetas y nombres: antes y después

| | Antes | Después |
|---|---|---|
| `<label>` sin asociar (recuento de la Fase 1) | 114 de 155 | **0** |
| Controles sin nombre accesible (sin `aria-label`, sin `htmlFor`→`id`, fuera de un label) | 163 | **0** |
| Botones de solo ícono sin nombre | 24 (más "C", el Switch de Pagos y el de Usuarios) | **0** |
| Elementos interactivos sin nombre, en el árbol del navegador (12 pantallas) | decenas (la 21a lo anotó por pantalla) | **0** en las 12 (Dashboard 17, Mesas 98, POS 38, KDS 336, Inventario 178, Finanzas 27, Usuarios 66, Pagos 101, Caja 19, Mermas 29, Reportes 21, Config 32) |
| Pantallas con un solo `h1` y título propio | 1 título para todas | **12 de 12**, más login y `/menu` |

### Lo que sigue fallando o no se pudo verificar

- **Lector de pantalla real (NVDA):** no se usó; los nombres salen del DOM.
- **Solo por código:** los diálogos que solo se ven con datos o roles que la sesión no abrió (Nueva Mesa, personalizar producto, Usuarios, Compras, Activos, Gastos, Empleados, Proveedores, Recetas) están cubiertos por la prueba estática de etiquetas y nombres, no por el navegador. `prefers-reduced-motion` tampoco se puede conmutar en el navegador integrado.
- **Teclado en pantalla del login:** con la decisión B ya no se llega a las teclas con Tab; quien dependa de un conmutador o de un teclado virtual por barrido llega al campo PIN pero no a las teclas.
- **Gráficos de Recharts** (Dashboard, Reportes): después del enlace "saltar al contenido", el siguiente Tab cae en elementos internos del gráfico. Sin `accessibilityLayer` ni alternativa en texto; menor, fuera del alcance de K2.
- **Menores de la auditoría que no se tocaron:** objetivos táctiles de 16 px, desborde horizontal a 800 y 1024 px (también en Pagos), aviso previo de fin de sesión, `lang="es-CL"` y el recuadro "SM" sin `aria-hidden`.
- **Datos de prueba que dejan las baterías:** `pnpm prueba:completa --modulo=cobro` sigue sumando ítems pendientes y pérdidas en el KDS y Pagos (F37, se vacían en P2).
