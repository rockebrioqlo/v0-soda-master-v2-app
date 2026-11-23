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
