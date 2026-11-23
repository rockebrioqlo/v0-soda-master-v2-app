# Boleta electrónica: análisis y recomendación (K3, sesión 22)

- **Fecha:** 23-11-2026. **Modelo:** Opus 5.5, esfuerzo alto.
- **Estado:** análisis terminado. **La decisión queda pendiente de las respuestas de Pedro (cliente) y de Wibo** (secciones 9 y 10). No se implementó nada: sin cambios de código, esquema, rutas ni pruebas.
- **Recomendación:** opción **(c) híbrida** (sección 8).
- **Fuentes:** cada cifra o requisito lleva su enlace. Todas se consultaron el **23-11-2026**; la fecha que muestra cada página va entre paréntesis cuando la tiene. Lo que no se pudo confirmar dice **"no confirmado"**. La lista completa está en la sección 12.

> Este documento no es asesoría tributaria. Los puntos marcados "confirmar con el contador" deben revisarse antes de implementar.

---

## 1. Resumen

1. Por cada venta pagada en **efectivo o transferencia**, el SII exige entregar la **boleta electrónica**, impresa o virtual (correo, SMS, QR), **en el momento de la venta**. Con **tarjeta**, el comprobante de pago (voucher) vale como boleta **solo si** el local declaró ese "modelo de emisión" ante el SII.
2. **"Boletear al cierre" no cumple la ley.** La boleta se emite en cada venta, no al final del día, así que la opción (b) se corrigió (sección 6).
3. Con el reenfoque de Pedro, el **tótem Wibo** recibe los pedidos y cobra con tarjeta en su propio terminal. A SodaMaster le tocan sobre todo **los cobros en efectivo y transferencia en caja**. La boleta (o voucher) de las ventas con tarjeta del tótem depende de Wibo y del modelo de emisión declarado; queda pendiente averiguarlo (sección 9).
4. Hoy SodaMaster **no emite ningún documento tributario**. Imprime desde el navegador un ticket que **se titula "Boleta" sin serlo** (F60) y **no tiene el método "transferencia"** (F61).
5. Se recomienda la **opción (c)**:
   - **Ahora:** la boleta se emite en cada cobro con el sistema gratuito del SII (app e-Boleta) y SodaMaster ayuda: muestra el monto a boletear, guarda el folio y avisa en el cierre de caja los cobros sin boleta. El modelo de datos queda listo para un proveedor.
   - **Después:** conectar un proveedor de DTE por API cuando el volumen o la venta a otros locales lo justifique.

---

## 2. Cómo fluye hoy un cobro y un ticket (código al 23-11-2026, commit f3cc763)

**Cobro** (`components/pagos-page.tsx` → `POST /api/pagos` → `db.crearPago` en `lib/db.ts:4461`):

- El servidor calcula todo (`lib/cobro.ts`, `calcularCobro`): subtotal, descuento prorrateado, base, IVA, total y propina. Con `precios_incluyen_iva = true` (decisión del 19-11-2026) el IVA se desglosa del precio: `impuesto = base − base / (1 + tasa/100)` (`lib/cobro.ts:191-196`).
- Una sola transacción inserta en `pagos` el método, el monto (total fiscal **sin** propina), la propina, el descuento, `dividido_en`, el vuelto, `referencia` (texto libre), `cobrado_por` y `cobrado_por_nombre`. En efectivo se registran `movimientos_caja` (`venta_efectivo` y `vuelto`). El IVA **no se guarda** en el pago: se recalcula.
- **Métodos:** solo `'efectivo' | 'tarjeta'` (`lib/types.ts:23`, `app/api/pagos/route.ts:31`). **No existe "transferencia"** (F61).
- El cobro retroactivo de una pérdida (`app/api/perdidas/resolver`) también recibe dinero y también necesitaría boleta.

**Ticket** (`lib/print-ticket.ts`, `components/print-preview-dialog.tsx`):

- HTML que se imprime desde el navegador, con el ancho de papel configurable (58 a 210 mm). Los tipos son comanda, **"boleta"**, precuenta, cocina y bar.
- El ticket de tipo `boleta` se titula **"Boleta"** (`lib/print-ticket.ts:277`), igual que el diálogo de Pagos (`components/pagos-page.tsx:2132`). **No es un documento tributario:** no tiene folio, RUT emisor ni timbre, y no se informa al SII (F60).
- Muestra el subtotal, el descuento, el IVA, el TOTAL (sin propina), "Propina (sin IVA)" aparte, el total a pagar, el método, lo recibido y el vuelto.

**Configuración** (`app/api/configuracion/route.ts:29-60`): `nombre_negocio`, `direccion`, `telefono`, `moneda`, `tasa_impuesto`, `impuesto_habilitado`, `precios_incluyen_iva`, propinas e impresora.

| Dato | ¿Existe? | Dónde |
|---|---|---|
| Neto e IVA | Calculables, no guardados | `lib/cobro.ts` |
| Total sin propina | Sí | `pagos.monto` |
| Propina | Sí, aparte | `pagos.propina` |
| Método de pago | Sí, sin transferencia | `pagos.metodo` |
| Número de comprobante | No (solo el uuid del pago) | — |
| RUT del emisor, razón social, giro, comuna, actividad económica | **No** | — |
| Folio, tipo de documento (39 boleta afecta / 41 exenta), CAF | **No** | — |
| Certificado digital | **No** (no corresponde guardarlo en la base) | — |
| Estado del envío al SII, track id, enlace o PDF de la boleta | **No** | — |
| RUT del receptor (opcional en boleta) | No | — |
| Anulación (nota de crédito) | **No** | — |
| Vínculo pago ↔ documento tributario | **No** | — |

---

## 3. Normativa vigente

| # | Requisito | Fuente (fecha de la página) |
|---|---|---|
| N1 | **Res. Ex. SII N°53 de 2025** (29-04-2025): con **efectivo o transferencia** se entrega la representación impresa o virtual de la **boleta electrónica**; con **tarjeta u otro medio electrónico**, la boleta o el comprobante de pago "dependiendo de su modelo de emisión". Dejó sin efecto la Res. N°12 de 2025. | [reso53.pdf](https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso53.pdf) (el PDF no se pudo leer como texto; el contenido se tomó de [Círculo Verde](https://www.circuloverde.cl/avance-o-retroceso-en-el-proceso-de-emision-en-papel-de-las-boletas-de-ventas-y-servicios/) (act. 24-10-2025) y de [BioBio](https://www.biobiochile.cl/noticias/economia/actualidad-economica/2025/04/29/luego-de-varias-criticas-sii-ajusta-normativa-sobre-entrega-fisica-o-digital-de-boleta-en-el-comercio.shtml) (29-04-2025)); cambios que produjo: [FAQ SII 8793](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_8793.htm) (act. 10-11-2026) |
| N2 | **Vigencia de la Res. 53:** desde el 01-05-2025 para quien tiene dispositivo de impresión y desde el 01-03-2026 para los demás dispositivos. Que haya prórrogas posteriores al 01-03-2026: **no confirmado**. | Círculo Verde (arriba); [noticia SII 27-02-2025](https://www.sii.cl/noticias/2025/270225noti01aav.htm) |
| N3 | **Entrega virtual:** correo, SMS, mensajería, QR u otro medio. Ya no vale la excepción "si el cliente no la requiere". Si el cliente no quiere la copia impresa debe dar un medio de contacto; si no lo da, la infracción es del consumidor (art. 97 N°19), según el oficio N°1.900 del 25-09-2025 citado por Círculo Verde (el oficio no se leyó: **no confirmado** en la fuente primaria). | FAQ 8793; Círculo Verde |
| N4 | **Voucher como boleta:** vale desde la Res. 176 de 2020 y se mantiene **según el modelo de emisión declarado** en el SII: "Siempre emito boleta" o "No emito boleta cuando recibo un pago electrónico". | [noticia SII 05-01-2021](https://www.sii.cl/noticias/2021/050121noti01er.htm); [LibreDTE, modelos de emisión](https://www.libredte.cl/docs/procesos-sii/boletas-o-comprobante-de-pago) (act. 05-11-2026) |
| N5 | **Momento de emisión:** la boleta se emite en la entrega real o simbólica (art. 55 de la Ley de IVA). La jurisprudencia aplica esto a restaurantes: un restaurante que no emitía al entregar la comida fue sancionado. **Por eso no se puede boletear al cierre.** Texto vigente del art. 55 revisado en bcn.cl: **no confirmado**. | [SII, jurisprudencia administrativa 2016](https://www.sii.cl/normativa_legislacion/jurisprudencia_administrativa/ley_impuesto_ventas/2016/ja3008.htm); [Tribunal tributario 2016](https://www.sii.cl/normativa_legislacion/jurisprudencia_judicial/tribunales_tributarios/2016/jj4329.htm) |
| N6 | **Monto mínimo de la boleta:** $180. Cómo se agrupan las ventas menores: **no confirmado**. | [Res. SII 60 de 2023](https://www.sii.cl/normativa_legislacion/resoluciones/2023/reso60.pdf) (solo el fragmento de búsqueda) |
| N7 | **Timbre:** desde el 01-01-2026 su impresión en la boleta impresa es **opcional** (Res. Ex. N°207 del 30-12-2025). | [reso207.pdf](https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso207.pdf) (no legible como texto); [Diario Constitucional](https://www.diarioconstitucional.cl/2026/01/04/sii-elimina-obligacion-de-incorporar-la-impresion-del-timbre-electronico-en-la-representacion-impresa-de-la-boleta-electronica-de-ventas-y-servicios/) (04-01-2026) |
| N8 | **Sanciones:** no otorgar la boleta se sanciona por el art. 97 N°10 del Código Tributario, con multa del 50% al 500% del monto de la operación (mínimo 2 UTM, máximo 40 UTA). Otro incumplimiento de la Res. 53 cae en el art. 109; el consumidor responde por el art. 97 N°19. La **clausura** no aparece en la FAQ: **no confirmado**. | [FAQ SII 8795](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_8795.htm) (act. 10-11-2026) |
| N9 | **Resumen de Ventas Diarias (RVD):** obligatorio para todo emisor de boleta electrónica. El sistema gratuito del SII lo envía solo; con software propio o de un proveedor, lo envía el software. | [FAQ SII 7807](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7807.htm) (act. 26-05-2025); [instructivo de emisión de boleta](https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf) (solo el fragmento de búsqueda) |
| N10 | **Folios (CAF):** los pide en el SII el firmante autorizado; no se asignan solos. El archivo CAF se custodia y los folios que no se usen se anulan. | [FAQ SII 6569](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_6569.htm) (act. 02-11-2026) |
| N11 | **Contingencia sin conexión:** si la falta de datos es transitoria, se generan las boletas sin enviarlas y se envían al volver la conexión. Las excepciones permanentes se piden al SII. | [FAQ SII 7676](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7676.htm) (act. 05-11-2026); [FAQ SII 7677](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7677.htm) |
| N12 | **Envío de boletas al SII:** servicios REST (semilla y token, envío, estado), con un máximo de 500 boletas por envío. | Instructivo de emisión de boleta (solo el fragmento de búsqueda) |
| N13 | **Propina:** si va fuera de la boleta (hoy el ticket la muestra aparte como "sin IVA"): **no confirmado** en una fuente del SII. **Confirmar con el contador.** | — |

---

## 4. Sistema gratuito del SII

| Punto | Qué dice el SII | Fuente |
|---|---|---|
| Qué es | "Sistema de Emisión de Boletas Electrónicas del SII": una versión web y la app móvil **e-Boleta**. Emite boletas afectas y exentas. | [FAQ 7802](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7802.htm) (act. 22-07-2026); [FAQ 7801](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7801.htm) (act. 22-07-2026) |
| Certificado digital | **No se necesita.** | [FAQ 7800](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7800.htm) (act. 22-07-2026) |
| Inscripción | En el sitio del SII (Servicios online → Boleta electrónica de ventas y servicios), para contribuyentes habilitados. | [FAQ 7819](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7819.htm) (act. 24-07-2026) |
| Sin internet | La web exige conexión; la app e-Boleta permite emitir "en casos de intermitencia". | FAQ 7801 |
| Integración | **No tiene API**: la emisión es manual, una por una. La "calculadora" solo ayuda a sumar el monto; si admite varios ítems: **no confirmado**. | [FAQ 8144](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_8144.htm) (act. 24-07-2026) |
| RVD | Lo envía el propio sistema. | FAQ 7807 |
| Pasar a otro software | No se hace en línea: se presenta el Formulario 2117 en la Dirección Regional y se habilita el otro software "en forma paralela". Si se pueden usar los dos a la vez: **no confirmado**. | [FAQ 7816](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7816.htm) (act. 23-07-2026) |
| Costo | Gratuito. | FAQ índice [2288](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/arbol_faqs_bol_electr_vtas_serv_2288.htm) |

---

## 5. Proveedores de DTE con API (páginas públicas leídas el 23-11-2026; ninguna mostraba fecha de precios)

| Proveedor | Precio publicado | Boleta / API | Pruebas / certificación | Notas |
|---|---|---|---|---|
| **OpenFactura** (Haulmer) — [precios](https://www.openfactura.cl/factura-electronica/precios) | Plan Pyme **$360.000 + IVA al año** (ventas < $200 millones al mes), equivalente a $30.000 + IVA al mes. Firma electrónica: $11.790 + IVA por 1 año. | Emisión ilimitada, boleta afecta y exenta, "acceso API ilimitado". | "Habilitación y certificación incluida". Sandbox: **no confirmado** (la [documentación de la API](https://docsapi-openfactura.haulmer.com/) no se pudo leer sin JavaScript). | Cobro por razón social. |
| **LibreDTE** — [Servicio Plus](https://www.libredte.cl/plus) | **$40.000 + IVA al mes** hasta 2.000 documentos (emitidos + recibidos); $55.000 hasta 3.000; fórmula MAX(docs × 15 + 10.000; 40.000). Firma no incluida. | [API REST/JSON](https://www.libredte.cl/docs/api) (05-11-2026): emite tipo 39; devuelve PDF de 57, 75, 80 o 110 mm, **ESC/POS** para térmica, timbre y XML; envío por correo; administra folios (CAF); **emisión offline con CAF**; responde 429 por límite y 503 por mantención. | Ambiente de **certificación** por parámetro (requiere cuenta). | La documentación pública más completa. Licencia de la biblioteca autoalojable: **no confirmado**. |
| **Facturacion.cl** — [planes](https://facturacion.cl/?Planes=) | Alta única **$9.990 IVA incluido** (firma 1 año, enrolamiento y certificación básica). Boletas al mes + IVA: 0-500 → 0,25 UF; 501-1.500 → 0,5 UF; 1.501-3.000 → 0,75 UF; 3.001-5.000 → 1 UF. | Boleta sí. API: **no aparece** en su página. | Certificación incluida. Sandbox: no aparece. | El más barato, pero sin API confirmada. |
| **Bsale** — [precios](https://www.bsale.cl/sheet/precios) | Digital **1,3 UF + IVA al mes** (500 DTE); Estándar 1,9 UF (1.000); Full 2,9 UF (2.000); 1.000 DTE extra 0,3 UF. Certificado incluido. | [API](https://docs.bsale.dev/documentos): `POST /v1/documents.json`, `salesId` para no duplicar en reintentos, devuelve PDF, timbre y estado SII. | Sandbox: **no confirmado**. | Es un POS que compite con SodaMaster. |
| **SimpleAPI** — [precios](https://www.simpleapi.cl/Precios) | Gratis 12 meses (500 consultas al mes, pruebas y producción); Básico **5 UF + IVA al año** (10.000 al mes); código fuente 70 UF. Set de certificación de boleta: 2 UF. Firma: $11.990 por 1 año. | API REST + SDK .NET; el formato del endpoint de boleta está en Postman (**no leído**). | Ambiente de pruebas: sí. | El local aporta su certificado y su CAF. Atención de 09:00 a 17:30. |
| Nubox, Defontana, otros | **No revisados.** | | | |
| Código abierto autoalojado (biblioteca PHP de LibreDTE y otras) | Sin costo de licencia (licencia **no confirmada**) | Firma, timbre y envío propios. | La certificación ante el SII es por cuenta propia. | **No recomendado:** es PHP (SodaMaster es TypeScript), tendríamos que guardar el certificado y los folios, y certificarnos ante el SII. |

El valor de la UF no se convirtió a pesos: se usa la UF del día al contratar.

**Volumen:** no se conoce cuántas boletas habría (pregunta P3). Como referencia, 50 ventas en efectivo al día son unas 1.500 boletas al mes (cálculo, no medición): caben en 0,5 UF en Facturacion.cl, en $40.000 en LibreDTE y en el plan anual de OpenFactura.

---

## 6. Opciones

### (a) Proveedor de DTE por API, emitido desde SodaMaster en cada cobro en efectivo o transferencia
- El servidor, al confirmar el cobro, pide la boleta al proveedor con el monto que él mismo calculó, guarda el folio, el estado y el enlace o PDF, e imprime la boleta en vez del ticket actual (o la envía por correo o QR).
- Requiere: inscripción del local como emisor con ese software, certificado digital, folios y la certificación del proveedor. La cuenta y las claves del proveedor las crea el usuario (pasos para él en el plan).

### (b) Sistema gratuito del SII, sin integración — **corregida**
- ~~Listar lo cobrado en efectivo y transferencia para boletear al cierre.~~ **No cumple (N5):** la boleta va en cada venta.
- La versión que cumple: **en cada cobro en efectivo o transferencia, el cajero emite la boleta en la app e-Boleta** (u otro dispositivo del local que la emita) y la entrega impresa o virtual. SodaMaster ayuda así:
  - muestra el monto exacto a boletear (el total fiscal sin propina, por confirmar con el contador, N13);
  - deja anotar el folio de la boleta emitida;
  - en el cierre de caja, lista los cobros en efectivo o transferencia **sin folio** y compara la suma de esos cobros con lo boleteado.
- El ticket de SodaMaster deja de llamarse "Boleta" (F60).

### (c) Híbrida (recomendada)
- **Fase 1:** la (b) corregida, más el modelo de datos preparado para la (a): una tabla de documentos tributarios ligada a cada pago, con origen `sii_manual` o `proveedor`, tipo de documento, folio, estado y país, y los datos tributarios del emisor en Configuración.
- **Fase 2:** la (a) se conecta a esa misma tabla, sin rehacer el cobro ni los reportes.

---

## 7. Comparación

| Criterio | (a) Proveedor por API | (b) e-Boleta manual (corregida) | (c) Híbrida |
|---|---|---|---|
| **Costo mensual** | De 0,25 UF (Facturacion.cl, sin API confirmada) a $40.000 + IVA (LibreDTE) o $30.000 + IVA equivalente (OpenFactura, pago anual), más la firma (unos $11.790 a $11.990 al año). | $0 en software. Costo en tiempo de caja. | $0 en la fase 1; el de (a) cuando se conecte. |
| **Costo por documento** | Incluido hasta el tope del plan; LibreDTE cobra $15 + IVA por documento sobre 2.000. | $0 | Igual que (b) y luego (a). |
| **Esfuerzo (sesiones del ROADMAP)** | 4 sesiones (22a, 22c, 22d, 22e), una con Opus 5.5. | 2 sesiones Sonnet 5.5 (22a, 22b). | 22a y 22b ahora; 22c a 22e cuando se decida conectar el proveedor. |
| **Operación en caja** | Sin pasos extra: la boleta sale al confirmar el cobro. | Un paso extra por cobro en otro dispositivo: abrir e-Boleta, teclear el monto, emitir y entregar, y luego anotar el folio en SodaMaster. Tiempo por cobro: **no medido**. | Como (b) mientras dure la fase 1. |
| **Sin internet** | SodaMaster tampoco funciona sin internet (Vercel + Neon). Si cae el proveedor: cola de envíos con reintento, y una boleta de contingencia con CAF local si el proveedor lo permite (LibreDTE lo documenta; los demás: **no confirmado**). | La app e-Boleta tolera intermitencia (FAQ 7801); se envía al volver la conexión (N11). | Igual que (b) y luego (a). |
| **Si el proveedor falla** | El cobro no se bloquea: queda "boleta pendiente", con reintento y aviso. Hay que definir qué se entrega al cliente mientras tanto. | No depende de un proveedor; depende del SII y del celular. | — |
| **Riesgo legal** | Emitir mal: monto distinto, duplicada o propina dentro (se corrige con nota de crédito). Se mitiga calculando el monto en el servidor y con idempotencia. | **Olvido humano:** un cobro sin boleta se multa por el art. 97 N°10 (N8). Riesgo de teclear mal el monto. El aviso de cobros sin folio lo reduce, no lo elimina. | El de (b) en la fase 1, mitigado por el aviso del cierre. |
| **Cierre de caja y reportes** | Estado de cada boleta (aceptada, rechazada o pendiente) en el cierre; reporte de ventas con y sin boleta. | Lista de cobros en efectivo o transferencia sin folio y total cobrado frente a total boleteado; el RVD lo manda el SII. | Igual que (b), con la misma tabla que usará (a). |
| **Localización (K4, sesión 27)** | Exige separar el emisor por país: en México el CFDI va con un proveedor certificado (PAC) y RFC, un esquema distinto (**no investigado**, fuera de alcance). | No tiene equivalente directo fuera de Chile. | La tabla de documentos tributarios neutra por país es la pieza que la sesión 27 puede extender. |
| **Valor comercial (SaaS)** | Alto: un POS chileno se espera con boleta integrada. | Bajo. | Prepara la venta sin pagar hoy por un proveedor. |

---

## 8. Recomendación: (c) híbrida

**Por qué:**
1. Con el reenfoque de Pedro, SodaMaster solo cobra el **efectivo y la transferencia en caja**; la tarjeta se cobra en el tótem Wibo. El volumen que le toca boletear a SodaMaster es menor, y emitirlo a mano en e-Boleta por cada cobro es manejable y cumple la ley.
2. La fase 1 hace cosas que hacen falta de todas formas: quitar el título "Boleta" del ticket (F60), agregar "transferencia" (F61), guardar los datos tributarios del local y avisar en el cierre los cobros sin boleta.
3. Lo que haga Wibo puede decidir el proveedor: si Wibo ya se integra con un emisor, conviene usar el mismo para el efectivo. Elegir proveedor antes de saberlo es arriesgado.
4. Deja la (a) lista para conectar sin rehacer nada. Para la (a), el primer candidato es **LibreDTE** (API documentada con ambiente de certificación, PDF térmico, ESC/POS, folios y emisión offline) y el segundo **OpenFactura** (más barato al año, con emisión ilimitada, pero sin documentación de API legible ni sandbox confirmado).

**Qué cambiaría la recomendación:**
- **Ir directo a (a):** si el efectivo y la transferencia en caja son muchos (más de unos 80 cobros al día, estimación, no medición), si Pedro no acepta un paso manual por cobro, o si se concreta pronto la venta a otros locales.
- **Usar el emisor de Wibo para el efectivo** si Wibo ya se integra con un proveedor de DTE que acepte emitir también los cobros de caja.
- **Quedarse más tiempo en la fase 1** si el local ya tiene un terminal que emite boleta también para efectivo. En ese caso SodaMaster solo guarda el folio de ese equipo.

---

## 9. Dimensión Wibo (pendiente)

Según el reenfoque de Pedro (contado por el usuario el 23-11-2026), el **tótem Wibo** recibe los pedidos y cobra con tarjeta en su terminal. SodaMaster queda para el inventario por recetas, los pedidos en efectivo, los gastos y los reportes.

**Pendiente averiguar con Wibo** (va junto con la consulta de su API):
- W1. ¿Wibo emite boleta electrónica por las ventas del tótem, o se integra con un emisor de DTE? ¿Con cuál?
- W2. ¿El voucher de su terminal vale como boleta con el modelo de emisión declarado por el local ("No emito boleta cuando recibo un pago electrónico")? ¿O el local declaró "Siempre emito boleta"? En ese caso, ¿quién la emite por las ventas del tótem?
- W3. ¿El tótem acepta efectivo o transferencia? Si es así, ¿quién emite esa boleta?
- W4. ¿Cómo llegan las ventas del tótem a SodaMaster (API, webhook, exportación)? ¿Traen el folio o la referencia del documento tributario? SodaMaster las necesita para descontar inventario por receta y para los reportes, y sin duplicar una boleta ya emitida por Wibo.

**Riesgo a evitar:** emitir dos boletas por la misma venta (Wibo y SodaMaster). Si pasa, el SII exige anular la sobrante con nota de crédito.

---

## 10. Pendientes

**Del cliente (Pedro):**
- P1. ¿El local ya emite boletas hoy? ¿Con qué (app e-Boleta, un terminal de pago u otro software)? ¿Qué modelo de emisión tiene declarado para los pagos con tarjeta?
- P2. ¿Tiene certificado digital? ¿Quién es el firmante autorizado que puede pedir folios?
- P3. ¿Cuántos cobros en efectivo o transferencia hay al día en caja?
- P4. ¿Cómo se registran hoy las transferencias: como efectivo, como tarjeta o no se registran?
- P5. ¿La caja tiene conexión estable? ¿Hay impresora térmica en caja?
- P6. ¿El contador confirma que la propina va fuera de la boleta (N13)?

**Del usuario:**
- U1. ¿Habrá venta a otros locales? **Respuesta al 23-11-2026: posible venta a otros locales, sin fecha.** Por ahora no fuerza la (a).

**De Wibo:** W1 a W4 (sección 9).

---

## 11. Plan de implementación tentativo (se confirma al decidir)

El plan sigue la opción (c). Las sesiones 22a y 22b sirven para cualquier decisión; 22c a 22e solo se hacen si se conecta un proveedor.

| Sesión | Tarea | Modelo | Terminado cuando | Pruebas |
|---|---|---|---|---|
| **22a** | **Base común:** (1) método `transferencia` en tipos, zod, cobro (no mueve el efectivo de caja), cobro de pérdidas, reportes y caja (F61); (2) el ticket `boleta` pasa a "Comprobante de pago (no válido como boleta)" y el diálogo de Pagos igual (F60); (3) datos tributarios del emisor en Configuración (RUT con Módulo 11, razón social, giro, dirección y comuna de la sucursal, actividad económica) con zod `.strict()`; (4) tabla `documentos_tributarios` (`pago_id`, `pais`, `tipo`, `folio`, `origen` `sii_manual` o `proveedor`, `estado`, `monto`, `emitido_en`, `registrado_por`), idempotente en `ensure*Schema()` y registrada en `REFERENCIAS_HISTORIAL` si apunta a un usuario. | Sonnet 5.5 | Cobro en transferencia de punta a punta sin mover la caja; el ticket ya no dice "Boleta"; datos del emisor guardados y validados; `pnpm build` limpio. | Módulo `cobro` (transferencia, 400 por método desconocido, carrera de 3 rondas de doble cobro); módulo `accesibilidad` para los campos nuevos; `rutas`; `usuarios` (referencias); `pnpm prueba:humo`. |
| **22b** | **Boleta manual (fase 1 de la c):** al cobrar en efectivo o transferencia, aviso "Emitir boleta SII por $X" con el monto del servidor y un campo opcional de folio; corregir o agregar el folio después (solo cajero o admin, con auditoría); cierre de caja con la lista de cobros sin folio y el total cobrado frente al boleteado; reporte de cobros sin boleta. | Sonnet 5.5 | Ningún cobro en efectivo o transferencia queda sin aparecer en la lista del cierre si no tiene folio; el folio no se repite (único por tipo). | Módulo `cobro` y `caja`: folio duplicado → 409; 403 por rol; carrera de 3 rondas registrando el mismo folio; navegador: cobro con folio y cierre con un cobro sin folio. |
| 22c | **Elegir proveedor y certificar** (con las respuestas de Wibo y Pedro): pasos del usuario (crear la cuenta sandbox del proveedor, el certificado digital del local, los folios y la inscripción ante el SII; el Formulario 2117 si deja e-Boleta). Cliente HTTP del proveedor en el servidor, con las claves en variables de entorno (nunca en el navegador ni en el repo). | Opus 5.5 | Una boleta emitida y aceptada en el ambiente de certificación desde un script local. | Prueba contra el sandbox del proveedor (fuera de `prueba:humo`). |
| 22d | **Emisión en el cobro:** tabla de salida con reintento e idempotencia (el `pago_id` como clave externa en el proveedor), estado pendiente, aceptada o rechazada, la representación impresa (PDF térmico o ESC/POS) o virtual (correo o QR), y la contingencia si el proveedor cae (el cobro no se bloquea). | Opus 5.5 | Corte simulado del proveedor: el cobro sigue, la boleta queda pendiente y se emite una sola vez al volver. | Proveedor simulado local: caída, respuesta lenta, reintento doble (sin duplicar), carrera de 3 rondas. |
| 22e | **Notas de crédito, cierre y reportes:** anulación de una boleta (al cancelar o corregir un cobro), estado de las boletas en el cierre de caja, reporte de boletas por día y conciliación con el RVD. | Sonnet 5.5 | Una boleta anulada queda con su nota de crédito; el cierre muestra cero pendientes o las lista. | Módulos `cobro` y `caja`; navegador: Pagos y Caja. |

---

## 12. Fuentes (todas consultadas el 23-11-2026)

**SII y normativa**
- Res. Ex. SII N°53 de 2025: https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso53.pdf (PDF no legible como texto)
- Extracto en el Diario Oficial (08-05-2025): https://www.diariooficial.interior.gob.cl/publicaciones/2025/05/08/44143/01/2641550.pdf (no leído)
- FAQ cambios de la Res. 53 (act. 10-11-2026): https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_8793.htm
- FAQ sanciones (act. 10-11-2026): https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_8795.htm
- Noticia SII sobre la Res. 12 de 2025 (27-02-2025): https://www.sii.cl/noticias/2025/270225noti01aav.htm
- Noticia SII sobre el voucher como boleta (05-01-2021): https://www.sii.cl/noticias/2021/050121noti01er.htm
- Res. Ex. SII N°207 de 2025: https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso207.pdf (no legible como texto)
- Res. SII 60 de 2023 (monto mínimo): https://www.sii.cl/normativa_legislacion/resoluciones/2023/reso60.pdf (solo el fragmento de búsqueda)
- Jurisprudencia sobre el art. 55: https://www.sii.cl/normativa_legislacion/jurisprudencia_administrativa/ley_impuesto_ventas/2016/ja3008.htm y https://www.sii.cl/normativa_legislacion/jurisprudencia_judicial/tribunales_tributarios/2016/jj4329.htm
- FAQ del sistema gratuito: 7800 (certificado), 7801 (internet y e-Boleta), 7802 (documentos), 7807 (RVD), 7819 (inscripción), 7816 (cambio de software), 8144 (calculadora), 6569 (folios), 7676 y 7677 (contingencia), en https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_NNNN.htm
- Instructivo de emisión de boleta electrónica: https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf (solo el fragmento de búsqueda)

**Prensa y guías**
- Círculo Verde (act. 24-10-2025): https://www.circuloverde.cl/avance-o-retroceso-en-el-proceso-de-emision-en-papel-de-las-boletas-de-ventas-y-servicios/
- BioBio (29-04-2025): https://www.biobiochile.cl/noticias/economia/actualidad-economica/2025/04/29/luego-de-varias-criticas-sii-ajusta-normativa-sobre-entrega-fisica-o-digital-de-boleta-en-el-comercio.shtml
- Diario Constitucional (04-01-2026): https://www.diarioconstitucional.cl/2026/01/04/sii-elimina-obligacion-de-incorporar-la-impresion-del-timbre-electronico-en-la-representacion-impresa-de-la-boleta-electronica-de-ventas-y-servicios/
- LibreDTE, boletas o comprobante de pago (act. 05-11-2026): https://www.libredte.cl/docs/procesos-sii/boletas-o-comprobante-de-pago
- Laudus (sostiene que el voucher ya no reemplaza a la boleta; contradice a las fuentes del SII, no se usó como base): https://laudus.cl/contenidos/ventas-inventario/sii-nuevas-boletas-y-vales-transbank/

**Proveedores**
- OpenFactura: https://www.openfactura.cl/factura-electronica/precios ; documentación de API: https://docsapi-openfactura.haulmer.com/ (no legible)
- LibreDTE: https://www.libredte.cl/plus ; API: https://www.libredte.cl/docs/api (05-11-2026)
- Facturacion.cl: https://facturacion.cl/?Planes=
- Bsale: https://www.bsale.cl/sheet/precios ; API: https://docs.bsale.dev/documentos
- SimpleAPI: https://www.simpleapi.cl/Precios ; https://www.simpleapi.cl/Documentacion (05-11-2026)

**Método:** solo lectura de páginas públicas, con consultas genéricas (sin datos del proyecto, del local ni de usuarios). No se creó ninguna cuenta, no se aceptaron términos y no se descargaron archivos de los proveedores. Los PDF del SII se intentaron leer como página y no entregaron texto legible.
