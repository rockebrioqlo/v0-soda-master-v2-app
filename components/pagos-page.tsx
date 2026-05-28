'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate, getEstadoComandaLabel, getEstadoComandaColor } from '@/lib/helpers'
import {
  CreditCard,
  DollarSign,
  Receipt,
  Calculator,
  Check,
  Users,
  FileText,
  Printer,
  AlertTriangle,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/components/toast'
import { MetodoPago } from '@/lib/types'
import { PrintPreviewDialog } from '@/components/print-preview-dialog'
import {
  comandaToTicketItems,
  readPrintConfigFromState,
  type TicketData,
} from '@/lib/print-ticket'

export function PagosPage() {
  const {
    state,
    dispatch,
    crearPagoApi,
    registrarPerdidaApi,
    getPerdidasApi,
    resolverPerdidaApi,
    recargarPagos,
    recargarOrdenes,
    crearCuentaPersonaApi,
    eliminarCuentaPersonaApi,
    asignarItemsACuentasApi,
  } = useApp()
  const { comandas, pagos, usuarios, usuarioActual, configuracion } = state
  const impuestoHabilitado = configuracion.impuesto_habilitado === true
  const tasaImpuesto = Number(configuracion.tasa_impuesto) || 0
  const propinasHabilitadas = configuracion.propinas_habilitadas !== false

  useEffect(() => {
    recargarPagos()
  }, [recargarPagos])

  const [selectedComandaId, setSelectedComandaId] = useState<string | null>(null)

  // Get comanda to pay
  const comandaAPagar = selectedComandaId
    ? comandas.find(c => c.id === selectedComandaId)
    : null

  // State for payment
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [propinaTipo, setPropinaTipo] = useState<'porcentaje' | 'monto'>('porcentaje')
  const [propinaValor, setPropinaValor] = useState('10')
  const [dividirCuenta, setDividirCuenta] = useState(false)
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [creandoPersona, setCreandoPersona] = useState(false)
  // Operaciones en curso sobre las cuentas (agregar/quitar persona,
  // guardar asignaciones). Se usa para deshabilitar botones y evitar
  // dobles clicks.
  const [guardandoAsignaciones, setGuardandoAsignaciones] = useState(false)
  const [showBoletaDialog, setShowBoletaDialog] = useState(false)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  // Vista previa de la "cuenta" (precuenta) que se entrega al cliente
  // antes de cobrar. Tiene los mismos totales que la boleta pero sin
  // método de pago / vuelto.
  const [showPrecuentaPrint, setShowPrecuentaPrint] = useState(false)
  // División de cuenta:
  // - 'equitativa' = se reparte el total entre N personas.
  // - 'productos'  = el cajero asigna cada unidad a una persona (o "compartido")
  //                  y se imprime una precuenta por persona.
  const [modoDivision, setModoDivision] = useState<'equitativa' | 'productos'>('equitativa')
  // Mapa { unitId -> 'compartido' | personaId (UUID) }
  // unitId tiene la forma `<itemId>:<unitIndex>`, donde unitIndex va de 0 a
  // cantidad-1 (así una "2x Burger" se puede repartir entre dos personas).
  //
  // Esto es un BORRADOR LOCAL del estado del dialog "Asignar productos":
  //  - se hidrata desde `comandaAPagar.items[].cuentaPersonaId` cuando el
  //    cajero selecciona una comanda (o cuando se recarga la orden);
  //  - los cambios en el dialog quedan en este state mientras está abierto;
  //  - al guardar, se traduce a llamadas a `asignarItemsACuentasApi` y
  //    se recargan las órdenes (que rehidratan este state).
  const [asignaciones, setAsignaciones] = useState<Record<string, 'compartido' | string>>({})
  const [showAsignarDialog, setShowAsignarDialog] = useState(false)
  // Pago parcial por items:
  // - 'completo' = se cobra TODO lo que falta por pagar en la comanda.
  // - 'parcial'  = el cajero selecciona qué items va a cobrar ahora (típico
  //   cuando un cliente se va antes y paga sólo lo suyo). El resto queda
  //   abierto para futuros pagos en la misma mesa.
  const [modoPago, setModoPago] = useState<'completo' | 'parcial'>('completo')
  // Items (por id) que se cobrarán en este pago. En modo "completo" se
  // mantiene sincronizado con todos los items aún no pagados.
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Set<string>>(new Set())
  // Cobros parciales por LÍNEA (cuando se paga sólo X de Y unidades de un
  // mismo item_orden). El backend splittea la línea al confirmar. Se
  // setea desde "Cobrar Persona N" cuando una unidad de una línea con
  // cantidad > 1 quedó asignada a otra persona.
  const [pendingPartialPay, setPendingPartialPay] = useState<
    Array<{ id: string; cantidad: number }> | null
  >(null)
  // Snapshot del ticket de boleta al momento de confirmar el pago. Lo
  // necesitamos porque después de dispatch UPDATE_COMANDA los items
  // cobrados pasan a `pagado=true` y ya no aparecen en `itemsAPagar`, así
  // que `ticketDataBoleta` reactivo mostraría 0 items.
  const [boletaSnapshot, setBoletaSnapshot] = useState<TicketData | null>(null)
  // Perro muerto: dialog y datos del registro.
  const [showPerdidaDialog, setShowPerdidaDialog] = useState(false)
  const [motivoPerdida, setMotivoPerdida] = useState('')
  const [registrandoPerdida, setRegistrandoPerdida] = useState(false)

  // Pérdidas pendientes (perros muertos sin cobrar). El admin puede
  // marcarlas como "cobrado retroactivamente" cuando el cliente vuelve.
  const [perdidasPendientes, setPerdidasPendientes] = useState<any[]>([])
  const [perdidaSeleccionada, setPerdidaSeleccionada] = useState<any | null>(null)
  const [showResolverDialog, setShowResolverDialog] = useState(false)
  const [montoResolver, setMontoResolver] = useState('')
  const [metodoResolver, setMetodoResolver] = useState<MetodoPago>('efectivo')
  const [resolviendoPerdida, setResolviendoPerdida] = useState(false)

  const cargarPerdidas = useCallback(async () => {
    try {
      const data = await getPerdidasApi()
      // Mostramos sólo las pendientes (no resueltas). Las resueltas
      // quedan en BD y se pueden ver luego en reportes.
      setPerdidasPendientes(data.filter((p: any) => p.resuelto !== true))
    } catch (error) {
      console.error('Error cargando perdidas:', error)
    }
  }, [getPerdidasApi])

  useEffect(() => {
    cargarPerdidas()
  }, [cargarPerdidas])
  const printConfig = readPrintConfigFromState(configuracion)

  useEffect(() => {
    setPropinaValor(String(propinasHabilitadas ? Number(configuracion.propina_default) || 0 : 0))
  }, [configuracion.propina_default, propinasHabilitadas])

  // Si cambia la comanda seleccionada, reinicia los flags de cobro.
  // Las asignaciones se rehidratan en el efecto siguiente desde la BD.
  useEffect(() => {
    setModoPago('completo')
    setMotivoPerdida('')
    setShowPerdidaDialog(false)
    setPendingPartialPay(null)
  }, [selectedComandaId])

  // Hidrata `asignaciones` (borrador local) desde `items_orden.cuenta_persona_id`.
  // Como las asignaciones viven en BD, cualquier cajero que abra la misma
  // comanda ve lo mismo. Si el dialog "Asignar productos" está abierto,
  // NO sobreescribimos para no pisar el borrador del cajero ante refetchs
  // globales (otra ventana cambió algo, polling, etc).
  useEffect(() => {
    if (!comandaAPagar) {
      setAsignaciones({})
      return
    }
    if (showAsignarDialog) return
    const next: Record<string, 'compartido' | string> = {}
    for (const item of comandaAPagar.items) {
      const destino = item.cuentaPersonaId || 'compartido'
      for (let u = 0; u < item.cantidad; u++) {
        next[`${item.id}:${u}`] = destino
      }
    }
    setAsignaciones(next)
  }, [comandaAPagar, showAsignarDialog])

  // Al volver a "cobrar todo lo pendiente" un pendingPartialPay deja de
  // aplicar (sería contradictorio cobrar la línea completa + parcial).
  useEffect(() => {
    if (modoPago === 'completo' && pendingPartialPay !== null) {
      setPendingPartialPay(null)
    }
  }, [modoPago, pendingPartialPay])

  // Lista de items "elegibles" para cobro (los que aún no han sido pagados
  // en pagos parciales previos). Es el universo del que puede partir el
  // cajero, tanto en modo completo como parcial.
  const itemsElegibles = useMemo(
    () => (comandaAPagar?.items || []).filter((i) => !i.pagado),
    [comandaAPagar],
  )

  // Mantén `itemsSeleccionados` sincronizado:
  //  - en modo "completo": SIEMPRE = todos los items elegibles (no editable).
  //  - en modo "parcial":  conserva la selección del cajero, pero quita ids
  //    que ya no son elegibles (porque alguien los pagó en otra ventana).
  useEffect(() => {
    if (modoPago === 'completo') {
      setItemsSeleccionados(new Set(itemsElegibles.map((i) => i.id)))
    } else {
      setItemsSeleccionados((prev) => {
        const valid = new Set(itemsElegibles.map((i) => i.id))
        const next = new Set<string>()
        prev.forEach((id) => {
          if (valid.has(id)) next.add(id)
        })
        return next
      })
    }
  }, [modoPago, itemsElegibles])

  // Items que efectivamente se van a cobrar en ESTE pago. De aquí en
  // adelante todos los totales se calculan sobre esta lista, así el
  // recálculo de IVA / propina / dividir cuenta se da gratis.
  //
  // Cuando hay pendingPartialPay (cobrar 1 de 2 cervezas) "clonamos" el
  // ítem en memoria con la cantidad parcial, así totales/ticket reflejan
  // sólo la porción cobrada. El split real en BD ocurre al confirmar.
  const itemsAPagar = useMemo(() => {
    const enteros = itemsElegibles.filter((i) => itemsSeleccionados.has(i.id))
    if (!pendingPartialPay || pendingPartialPay.length === 0) return enteros
    const enterosIds = new Set(enteros.map((i) => i.id))
    const parciales = pendingPartialPay
      .map((p) => {
        const original = itemsElegibles.find((i) => i.id === p.id)
        if (!original) return null
        if (enterosIds.has(p.id)) return null
        if (p.cantidad <= 0) return null
        const cantidadFinal = Math.min(p.cantidad, original.cantidad)
        return { ...original, cantidad: cantidadFinal }
      })
      .filter(Boolean) as typeof enteros
    return [...enteros, ...parciales]
  }, [itemsElegibles, itemsSeleccionados, pendingPartialPay])

  // Personas asociadas a la comanda actual (persistidas en BD). Sirven
  // para el modo "Dividir por productos". Si no hay personas creadas, la
  // división por productos está deshabilitada hasta que se cree la primera.
  const personasOrden = useMemo(() => {
    if (!comandaAPagar?.cuentasPersona) return []
    return [...comandaAPagar.cuentasPersona].sort((a, b) => a.idx - b.idx)
  }, [comandaAPagar])
  const numPersonasInt = personasOrden.length
  const personaIdById = useMemo(() => {
    const map = new Map<string, number>()
    personasOrden.forEach((p, i) => map.set(p.id, i))
    return map
  }, [personasOrden])

  // Calculate totals
  const subtotalCompleto =
    comandaAPagar?.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0) || 0
  const subtotal = itemsAPagar.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  // Para pagos parciales, prorrateamos el descuento (cuando es monto fijo)
  // en proporción al subtotal de los items que se están cobrando.
  const ratioParcial = subtotalCompleto > 0 ? subtotal / subtotalCompleto : 0
  const descuentoMonto = comandaAPagar?.tipoDescuento === 'porcentaje'
    ? subtotal * ((comandaAPagar?.descuento || 0) / 100)
    : (comandaAPagar?.descuento || 0) * ratioParcial

  const baseImponible = Math.max(subtotal - descuentoMonto, 0)
  // El IVA grava sólo el consumo (subtotal - descuento). Nunca grava la propina.
  const impuestoMonto = impuestoHabilitado ? baseImponible * (tasaImpuesto / 100) : 0
  // La propina se calcula sobre el consumo (excluyente de IVA), no sobre el total final.
  const propinaCalculada = propinaTipo === 'porcentaje'
    ? baseImponible * (parseFloat(propinaValor) / 100)
    : parseFloat(propinaValor) || 0

  // "Total" = consumo + IVA, SIN propina. Es la cifra fiscal de la boleta.
  const total = baseImponible + impuestoMonto
  // "Total a pagar" = lo que el cliente entrega. Incluye la propina (sugerida).
  const totalAPagar = total + propinaCalculada
  const montoPorPersona =
    dividirCuenta && numPersonasInt > 0 ? totalAPagar / numPersonasInt : totalAPagar
  const vuelto = parseFloat(efectivoRecibido) - totalAPagar

  // Sólo cajero/administrador pueden registrar el pago.
  const puedeCobrar =
    !!usuarioActual &&
    ['cajero', 'administrador', 'admin'].includes(usuarioActual.rol)

  // El registro de "perro muerto" (cliente que se fue sin pagar) es una
  // operación sensible: deja constancia de pérdida monetaria. Sólo el
  // administrador la autoriza.
  const esAdmin =
    !!usuarioActual && ['administrador', 'admin'].includes(usuarioActual.rol)

  // Construye los items del ticket reutilizando `comandaToTicketItems` pero
  // limitándolo a los items que se van a cobrar en ESTE pago (en pagos
  // parciales el cliente sólo paga su parte, así que la boleta/precuenta
  // sólo muestra esa parte; los demás items siguen abiertos para futuros
  // pagos del resto de la mesa).
  const ticketItemsCobro = useMemo(() => {
    if (!comandaAPagar) return []
    return comandaToTicketItems({ ...comandaAPagar, items: itemsAPagar })
  }, [comandaAPagar, itemsAPagar])

  const ticketDataBoleta = useMemo<TicketData | null>(() => {
    if (!comandaAPagar) return null
    const efectivoNum = parseFloat(efectivoRecibido)
    return {
      tipo: 'boleta',
      nombre_negocio:
        configuracion.nombre_negocio || configuracion.nombreRestaurante || 'Soda Master',
      mesa:
        modoPago === 'parcial'
          ? `${comandaAPagar.mesaNombre} (pago parcial)`
          : comandaAPagar.mesaNombre,
      atendido_por: comandaAPagar.usuarioNombre,
      fecha: Date.now(),
      metodo_pago: metodoPago,
      dividido_en: dividirCuenta ? numPersonasInt || 1 : 1,
      monto_por_persona: dividirCuenta ? montoPorPersona : null,
      items: ticketItemsCobro,
      totales: {
        subtotal,
        descuento: descuentoMonto,
        descuento_label:
          comandaAPagar.tipoDescuento === 'porcentaje'
            ? `Descuento (${comandaAPagar.descuento}%)`
            : 'Descuento',
        impuesto: impuestoMonto,
        impuesto_label: impuestoHabilitado ? `IVA (${tasaImpuesto}%)` : null,
        propina: propinaCalculada,
        // total = monto fiscal (consumo + IVA, SIN propina).
        total,
        // total_a_pagar = lo que entrega el cliente (Total + propina).
        total_a_pagar: totalAPagar,
        pagado:
          metodoPago === 'efectivo' && Number.isFinite(efectivoNum) && efectivoNum >= totalAPagar
            ? efectivoNum
            : null,
        vuelto:
          metodoPago === 'efectivo' && Number.isFinite(efectivoNum) && efectivoNum >= totalAPagar
            ? vuelto
            : null,
      },
    }
  }, [
    comandaAPagar,
    configuracion,
    metodoPago,
    modoPago,
    dividirCuenta,
    numPersonasInt,
    montoPorPersona,
    ticketItemsCobro,
    subtotal,
    descuentoMonto,
    impuestoMonto,
    impuestoHabilitado,
    tasaImpuesto,
    propinaCalculada,
    total,
    totalAPagar,
    efectivoRecibido,
    vuelto,
  ])

  // Ticket de "cuenta para cliente" (precuenta): mismos totales que la
  // boleta, pero SIN método de pago / efectivo / vuelto.
  const ticketDataPrecuenta = useMemo<TicketData | null>(() => {
    if (!comandaAPagar) return null
    return {
      tipo: 'precuenta',
      nombre_negocio:
        configuracion.nombre_negocio || configuracion.nombreRestaurante || 'Soda Master',
      mesa:
        modoPago === 'parcial'
          ? `${comandaAPagar.mesaNombre} (pago parcial)`
          : comandaAPagar.mesaNombre,
      atendido_por: comandaAPagar.usuarioNombre,
      fecha: Date.now(),
      dividido_en: dividirCuenta ? numPersonasInt || 1 : 1,
      monto_por_persona: dividirCuenta ? montoPorPersona : null,
      items: ticketItemsCobro,
      totales: {
        subtotal,
        descuento: descuentoMonto,
        descuento_label:
          comandaAPagar.tipoDescuento === 'porcentaje'
            ? `Descuento (${comandaAPagar.descuento}%)`
            : 'Descuento',
        impuesto: impuestoMonto,
        impuesto_label: impuestoHabilitado ? `IVA (${tasaImpuesto}%)` : null,
        propina: propinaCalculada,
        total,
        total_a_pagar: totalAPagar,
      },
    }
  }, [
    comandaAPagar,
    configuracion,
    modoPago,
    dividirCuenta,
    numPersonasInt,
    montoPorPersona,
    ticketItemsCobro,
    subtotal,
    descuentoMonto,
    impuestoMonto,
    impuestoHabilitado,
    tasaImpuesto,
    propinaCalculada,
    total,
    totalAPagar,
  ])

  // ──── División por productos ─────────────────────────────

  type Unidad = {
    unitId: string
    itemId: string
    productoNombre: string
    variante?: string
    precio: number
    ingredientesEstandar: string[]
    ingredientesEspeciales: { nombre: string; costoAdicional: number }[]
    notas?: string
    notaEspecial?: string
    categoria?: string
  }

  // Expande cada item del comanda en sus unidades (1 entrada por cantidad).
  // Esto permite asignar parte de un "2x Burger" a una persona y parte a otra.
  // Se consideran todos los items pendientes de pago. La asignación por
  // persona sirve como herramienta para decidir quién paga qué; luego el
  // botón "Cobrar Persona X" transforma esa asignación en un pago parcial
  // real seleccionando sólo esos item ids.
  const unidadesItems = useMemo<Unidad[]>(() => {
    if (!comandaAPagar) return []
    const out: Unidad[] = []
    for (const item of itemsElegibles) {
      for (let u = 0; u < item.cantidad; u++) {
        out.push({
          unitId: `${item.id}:${u}`,
          itemId: item.id,
          productoNombre: item.productoNombre,
          variante: item.variante,
          precio: item.precio,
          ingredientesEstandar: item.ingredientesEstandar || [],
          ingredientesEspeciales: (item.ingredientesEspeciales || []).map((e) => ({
            nombre: e.nombre,
            costoAdicional: Number(e.costoAdicional) || 0,
          })),
          notas: item.notas,
          notaEspecial: item.notaEspecial,
          categoria: item.categoria,
        })
      }
    }
    return out
  }, [comandaAPagar, itemsElegibles])

  // Cálculo por persona. Reparte descuento / IVA / propina proporcionalmente
  // al subtotal consumido por cada persona. Lo "compartido" se divide en
  // partes iguales (típico para cosas como una entrada que ordenaron entre
  // todos).
  const calculoPorPersona = useMemo(() => {
    type Persona = {
      idx: number
      items: Unidad[]
      subtotalDirecto: number
      subtotalCompartido: number
      subtotal: number
      descuento: number
      base: number
      iva: number
      propina: number
      total: number
      totalAPagar: number
      totalDirectoAPagar: number
    }
    const personas: Persona[] = personasOrden.map((p, i) => ({
      idx: i,
      items: [],
      subtotalDirecto: 0,
      subtotalCompartido: 0,
      subtotal: 0,
      descuento: 0,
      base: 0,
      iva: 0,
      propina: 0,
      total: 0,
      totalAPagar: 0,
      totalDirectoAPagar: 0,
    }))
    let totalCompartido = 0
    const compartidoItems: Unidad[] = []
    for (const u of unidadesItems) {
      const a = asignaciones[u.unitId]
      const idx = typeof a === 'string' && a !== 'compartido'
        ? personaIdById.get(a)
        : undefined
      if (idx !== undefined && idx >= 0 && idx < personas.length) {
        personas[idx].items.push(u)
        personas[idx].subtotalDirecto += u.precio
      } else {
        totalCompartido += u.precio
        compartidoItems.push(u)
      }
    }
    const compartidoPorPersona = numPersonasInt > 0 ? totalCompartido / numPersonasInt : 0

    for (const p of personas) {
      p.subtotalCompartido = compartidoPorPersona
      p.subtotal = p.subtotalDirecto + p.subtotalCompartido
      const ratio = subtotal > 0 ? p.subtotal / subtotal : 0
      p.descuento = descuentoMonto * ratio
      p.base = Math.max(p.subtotal - p.descuento, 0)
      p.iva = impuestoHabilitado ? p.base * (tasaImpuesto / 100) : 0
      p.propina = propinaTipo === 'porcentaje'
        ? p.base * (parseFloat(propinaValor) / 100)
        : (parseFloat(propinaValor) || 0) * ratio
      p.total = p.base + p.iva
      p.totalAPagar = p.total + p.propina

      const ratioDirecto = subtotal > 0 ? p.subtotalDirecto / subtotal : 0
      const descuentoDirecto = descuentoMonto * ratioDirecto
      const baseDirecta = Math.max(p.subtotalDirecto - descuentoDirecto, 0)
      const ivaDirecto = impuestoHabilitado ? baseDirecta * (tasaImpuesto / 100) : 0
      const propinaDirecta = propinaTipo === 'porcentaje'
        ? baseDirecta * (parseFloat(propinaValor) / 100)
        : (parseFloat(propinaValor) || 0) * ratioDirecto
      p.totalDirectoAPagar = baseDirecta + ivaDirecto + propinaDirecta
    }
    return { personas, compartidoItems, totalCompartido, compartidoPorPersona }
  }, [
    unidadesItems,
    asignaciones,
    personasOrden,
    personaIdById,
    subtotal,
    descuentoMonto,
    impuestoHabilitado,
    tasaImpuesto,
    propinaTipo,
    propinaValor,
  ])

  // Tickets de precuenta uno por persona. Se imprimen en un solo trabajo
  // separados por salto de página (el PrintPreviewDialog ya soporta arrays).
  const ticketsPorPersona = useMemo<TicketData[]>(() => {
    if (!comandaAPagar || modoDivision !== 'productos') return []
    const negocio =
      configuracion.nombre_negocio || configuracion.nombreRestaurante || 'Soda Master'
    const propinaActiva = !!(propinaCalculada > 0)
    return calculoPorPersona.personas.map((p) => {
      const items = p.items.map((u) => ({
        cantidad: 1,
        nombre: u.productoNombre,
        variante: u.variante,
        precio_unitario: u.precio,
        modificadores: u.ingredientesEstandar,
        especiales: u.ingredientesEspeciales.map((e) => e.nombre),
        notas: u.notaEspecial || u.notas,
      }))
      if (p.subtotalCompartido > 0) {
        items.push({
          cantidad: 1,
          nombre: `Parte compartida (1/${numPersonasInt})`,
          variante: undefined,
          precio_unitario: p.subtotalCompartido,
          modificadores: [],
          especiales: [],
          notas: undefined,
        })
      }
      return {
        tipo: 'precuenta' as const,
        nombre_negocio: negocio,
        mesa: `${comandaAPagar.mesaNombre} — Persona ${p.idx + 1} de ${numPersonasInt}`,
        atendido_por: comandaAPagar.usuarioNombre,
        fecha: Date.now(),
        items,
        totales: {
          subtotal: p.subtotal,
          descuento: p.descuento,
          descuento_label:
            comandaAPagar.tipoDescuento === 'porcentaje'
              ? `Descuento (${comandaAPagar.descuento}%)`
              : 'Descuento',
          impuesto: p.iva,
          impuesto_label: impuestoHabilitado ? `IVA (${tasaImpuesto}%)` : null,
          propina: propinaActiva ? p.propina : null,
          total: p.total,
          total_a_pagar: p.totalAPagar,
        },
      }
    })
  }, [
    comandaAPagar,
    modoDivision,
    calculoPorPersona,
    numPersonasInt,
    configuracion,
    propinaCalculada,
    impuestoHabilitado,
    tasaImpuesto,
  ])

  // Recent payments
  const pagosRecientes = pagos
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, 10)

  // Comandas pending payment
  const comandasPendientes = comandas.filter(c => 
    c.estado === 'listo' || c.estado === 'en_cocina' || c.estado === 'en_preparacion' || c.estado === 'entregado'
  )

  const handleSelectComanda = (comandaId: string) => {
    setSelectedComandaId(comandaId)
  }

  // Cuenta cuántas unidades del `itemId` están asignadas a `personaId`.
  // Lo usamos para distinguir "se lleva toda la línea" (cobro normal) de
  // "se lleva sólo X de Y unidades" (split en BD).
  const contarUnidadesDePersona = useCallback(
    (itemId: string, personaId: string) => {
      return unidadesItems.filter(
        (u) => u.itemId === itemId && asignaciones[u.unitId] === personaId,
      ).length
    },
    [unidadesItems, asignaciones],
  )

  // Calcula el desglose de cobro para una persona (por UUID): qué líneas
  // se cobran completas (`fullItemIds`) y cuáles parciales
  // (`partials: {id, cantidad}`), junto con el subtotal directo en dinero.
  const desgloseCobroPersona = useCallback(
    (personaId: string) => {
      const fullItemIds = new Set<string>()
      const partials: Array<{ id: string; cantidad: number }> = []
      let subtotalDirecto = 0
      const itemIdsTocados = new Set<string>()
      for (const u of unidadesItems) {
        if (asignaciones[u.unitId] === personaId) itemIdsTocados.add(u.itemId)
      }
      for (const itemId of itemIdsTocados) {
        const item = itemsElegibles.find((it) => it.id === itemId)
        if (!item) continue
        const unidadesPersona = contarUnidadesDePersona(itemId, personaId)
        if (unidadesPersona <= 0) continue
        subtotalDirecto += item.precio * unidadesPersona
        if (unidadesPersona >= item.cantidad) {
          fullItemIds.add(itemId)
        } else {
          partials.push({ id: itemId, cantidad: unidadesPersona })
        }
      }
      return { fullItemIds, partials, subtotalDirecto }
    },
    [unidadesItems, asignaciones, itemsElegibles, contarUnidadesDePersona],
  )

  const calcularTotalParaSubtotal = useCallback(
    (subtotalSeleccionado: number) => {
      const ratio = subtotalCompleto > 0 ? subtotalSeleccionado / subtotalCompleto : 0
      const descuentoSeleccionado =
        comandaAPagar?.tipoDescuento === 'porcentaje'
          ? subtotalSeleccionado * ((comandaAPagar?.descuento || 0) / 100)
          : (comandaAPagar?.descuento || 0) * ratio
      const base = Math.max(subtotalSeleccionado - descuentoSeleccionado, 0)
      const iva = impuestoHabilitado ? base * (tasaImpuesto / 100) : 0
      const propina =
        propinaTipo === 'porcentaje'
          ? base * (parseFloat(propinaValor) / 100)
          : parseFloat(propinaValor) || 0
      return base + iva + propina
    },
    [
      subtotalCompleto,
      comandaAPagar,
      impuestoHabilitado,
      tasaImpuesto,
      propinaTipo,
      propinaValor,
    ],
  )

  const handleCobrarPersonaAsignada = useCallback(
    (personaId: string) => {
      const idx = personaIdById.get(personaId)
      const label = idx !== undefined ? `Persona ${idx + 1}` : 'la persona'
      const { fullItemIds, partials, subtotalDirecto } =
        desgloseCobroPersona(personaId)
      if (fullItemIds.size === 0 && partials.length === 0) {
        showToast(
          `${label} no tiene productos asignados directamente`,
          'error',
        )
        return
      }

      setModoPago('parcial')
      // En modo parcial el checkbox por línea controla "líneas enteras".
      // Las parciales (cobrar parte de una línea) se manejan aparte vía
      // `pendingPartialPay`, que aplica al confirmar.
      setItemsSeleccionados(new Set(fullItemIds))
      setPendingPartialPay(partials.length > 0 ? partials : null)
      // Ya usamos "dividir por productos" para elegir quién paga. Para el
      // cobro real apagamos la división, así no vuelve a dividir $12.500 / 2
      // ni muestra "por persona" sobre un subtotal que ya es individual.
      setDividirCuenta(false)
      // No tocamos `efectivoRecibido`: el cajero lo escribe a mano cuando
      // recibe el dinero. El placeholder del input ya muestra el monto
      // exacto a cobrar (`totalAPagar`), evitando inconsistencias de
      // redondeo entre lo que se "sugería" y lo que pedía el botón.
      const totalPersona = calcularTotalParaSubtotal(subtotalDirecto)
      showToast(
        `Pago parcial listo para ${label}: ${formatCurrency(totalPersona)}`,
        'success',
      )
    },
    [
      personaIdById,
      desgloseCobroPersona,
      calcularTotalParaSubtotal,
    ],
  )

  // ──── Personas (BD): crear/eliminar y guardar asignaciones ────
  const handleAgregarPersona = useCallback(async () => {
    if (!comandaAPagar) return
    setCreandoPersona(true)
    try {
      await crearCuentaPersonaApi({ orden_id: comandaAPagar.id })
      await recargarOrdenes()
      showToast('Persona agregada a la mesa', 'success')
    } catch (error: any) {
      showToast(error?.message || 'No se pudo agregar la persona', 'error')
    } finally {
      setCreandoPersona(false)
    }
  }, [comandaAPagar, crearCuentaPersonaApi, recargarOrdenes])

  const handleQuitarPersona = useCallback(
    async (personaId: string) => {
      if (!comandaAPagar) return
      try {
        await eliminarCuentaPersonaApi(personaId)
        await recargarOrdenes()
        showToast('Persona eliminada. Sus productos quedaron compartidos.', 'success')
      } catch (error: any) {
        showToast(error?.message || 'No se pudo eliminar la persona', 'error')
      }
    },
    [comandaAPagar, eliminarCuentaPersonaApi, recargarOrdenes],
  )

  // Persiste las asignaciones actuales del borrador local en BD.
  // Traduce `asignaciones` (unitId → 'compartido' | personaId) a una lista
  // agrupada por item_orden (sólo cuenta unidades NO pagadas: las pagadas
  // son inmutables porque ya están cerradas).
  const guardarAsignacionesEnBD = useCallback(async () => {
    if (!comandaAPagar) return false
    setGuardandoAsignaciones(true)
    try {
      const payload: Array<{
        item_orden_id: string
        cantidad: number
        cuenta_persona_id: string | null
      }> = []
      for (const item of itemsElegibles) {
        // Suma por destino dentro del item, basándonos en las unidades.
        const conteo = new Map<string, number>() // destinoKey -> cantidad
        for (let u = 0; u < item.cantidad; u++) {
          const dest = asignaciones[`${item.id}:${u}`]
          const key = dest && dest !== 'compartido' ? String(dest) : 'NULL'
          conteo.set(key, (conteo.get(key) || 0) + 1)
        }
        for (const [destinoKey, cant] of conteo.entries()) {
          // Si el item ya está totalmente en ese destino y NO hay
          // múltiples destinos para el mismo item, no necesitamos
          // tocarlo (es no-op). Pero si hay múltiples destinos, igual
          // mandamos las asignaciones para que el server las procese.
          if (cant <= 0) continue
          payload.push({
            item_orden_id: item.id,
            cantidad: cant,
            cuenta_persona_id: destinoKey === 'NULL' ? null : destinoKey,
          })
        }
      }
      if (payload.length === 0) return true
      await asignarItemsACuentasApi({
        orden_id: comandaAPagar.id,
        asignaciones: payload,
      })
      await recargarOrdenes()
      return true
    } catch (error: any) {
      showToast(error?.message || 'No se pudieron guardar las asignaciones', 'error')
      return false
    } finally {
      setGuardandoAsignaciones(false)
    }
  }, [
    comandaAPagar,
    itemsElegibles,
    asignaciones,
    asignarItemsACuentasApi,
    recargarOrdenes,
  ])

  const handleConfirmarPago = async () => {
    if (!comandaAPagar || !usuarioActual) return
    if (!puedeCobrar) {
      showToast('Sólo el cajero o administrador puede registrar el pago', 'error')
      return
    }
    if (itemsAPagar.length === 0) {
      showToast('No hay items seleccionados para cobrar', 'error')
      return
    }

    try {
      // monto = total fiscal (consumo + IVA). La propina se registra aparte,
      // así el cuadro de ventas no la mezcla con el ingreso facturable.
      // En modo "parcial" mandamos item_orden_ids: el servidor marca SÓLO
      // esos items como pagados y deja la orden abierta hasta que se cobre
      // todo lo demás.
      const payload: any = {
        orden_id: comandaAPagar.id,
        metodo: metodoPago,
        monto: total,
        propina: propinaCalculada,
        descuento: descuentoMonto,
        dividido_en: dividirCuenta ? numPersonasInt || 1 : 1,
        vuelto:
          metodoPago === 'efectivo' && parseFloat(efectivoRecibido) >= totalAPagar ? vuelto : null,
        referencia: null,
        aprobado: true,
      }
      if (modoPago === 'parcial') {
        payload.item_orden_ids = Array.from(itemsSeleccionados)
        if (pendingPartialPay && pendingPartialPay.length > 0) {
          payload.item_partials = pendingPartialPay
        }
      }
      // Congelamos la boleta ANTES de dispatch (después los items quedan
      // marcados pagados y `ticketDataBoleta` mostraría 0 items).
      const ticketSnapshot = ticketDataBoleta

      const nuevoPago = await crearPagoApi(payload)
      dispatch({ type: 'ADD_PAGO', payload: nuevoPago })
      if (ticketSnapshot) setBoletaSnapshot(ticketSnapshot)

      // El servidor marca los items cobrados como pagados y, si ya no quedan
      // items por pagar, cierra la orden con estado='pagado'. Aquí reflejamos
      // lo mismo en el state local. NO llamamos a recargarOrdenes porque el
      // endpoint /api/ordenes?kds=true filtra las órdenes pagadas, y eso
      // borraría la comanda del estado antes de que mesas-page pueda mostrar
      // el hint "Pagada — listo para liberar".
      const tienePartials = !!(pendingPartialPay && pendingPartialPay.length > 0)
      // Sólo cerramos la comanda si esto cubre EXACTAMENTE todos los items
      // elegibles y no hay parciales abiertos.
      const esPagoQueCierra =
        !tienePartials && itemsAPagar.length === itemsElegibles.length
      const idsPagados = new Set(itemsSeleccionados)
      const itemsActualizados = comandaAPagar.items.map((it) =>
        idsPagados.has(it.id) && !it.pagado ? { ...it, pagado: true } : it,
      )
      dispatch({
        type: 'UPDATE_COMANDA',
        payload: {
          ...comandaAPagar,
          items: itemsActualizados,
          estado: esPagoQueCierra ? 'pagado' : comandaAPagar.estado,
        },
      })

      // Si hubo split de líneas en BD (cobrar 1 de 2), el state local
      // refleja sólo lo que ya sabíamos. Recargamos ordenes para traer la
      // nueva línea remanente con la cantidad restante. Se omite cuando
      // este pago cerró la comanda (recargarOrdenes la sacaría de KDS).
      if (tienePartials && !esPagoQueCierra) {
        try {
          await recargarOrdenes()
        } catch {
          /* ignore: el siguiente refresh resolverá */
        }
      }

      // IMPORTANTE: la mesa NO se libera automáticamente al cobrar.
      // Permanece ocupada hasta que el mesero/admin la marque como libre
      // manualmente desde la pantalla de Mesas (los clientes pueden seguir
      // en la mesa, pedir otra ronda, etc.).

      if (esPagoQueCierra) {
        showToast('Pago confirmado. La mesa sigue ocupada hasta liberarla.', 'success')
      } else {
        // Pago parcial que deja items abiertos: volvemos a modo completo y
        // limpiamos la selección para el siguiente cobro.
        setModoPago('completo')
        showToast(
          `Pago parcial registrado por ${formatCurrency(total)}. La mesa sigue abierta para el resto.`,
          'success',
        )
      }
      setShowBoletaDialog(true)
    } catch (error: any) {
      showToast(error?.message || 'Error al registrar pago', 'error')
    }
  }

  // Marca la comanda actual como "perro muerto" (cliente que consumió y se
  // fue sin pagar). El servidor calcula el monto perdido (items que aún no
  // estaban pagados) y deja un registro en `perdidas_comanda` con quién
  // autorizó la operación. La mesa NO se libera automáticamente: queda con
  // un hint rojo "Pérdida — lista para liberar" para que el mesero/admin
  // la libere a mano una vez se hayan ido los clientes.
  const handleRegistrarPerdida = async () => {
    if (!comandaAPagar || !usuarioActual) return
    if (!esAdmin) {
      showToast('Sólo el administrador puede registrar un perro muerto', 'error')
      return
    }
    const motivo = motivoPerdida.trim()
    if (motivo.length < 3) {
      showToast('Describe brevemente lo que pasó (mínimo 3 caracteres)', 'error')
      return
    }
    if (itemsElegibles.length === 0) {
      showToast(
        'No quedan items por cobrar en esta comanda — no aplica como perro muerto',
        'error',
      )
      return
    }
    setRegistrandoPerdida(true)
    try {
      const result = await registrarPerdidaApi({
        orden_id: comandaAPagar.id,
        motivo,
        autorizado_por: usuarioActual.id,
        autorizado_por_nombre: usuarioActual.nombre,
        tasa_impuesto: tasaImpuesto,
        impuesto_habilitado: impuestoHabilitado,
      })
      // Refleja localmente: la orden queda 'perdida'. La comanda
      // desaparece del listado de cobro y la mesa muestra el hint rojo.
      dispatch({
        type: 'UPDATE_COMANDA',
        payload: { ...comandaAPagar, estado: 'perdida' as any },
      })
      showToast(
        `Pérdida registrada: ${formatCurrency(result.monto_perdido)} (${result.cantidad_items} items)` +
          (result.responsable_nombre
            ? ` — responsable ${result.responsable_nombre}`
            : ''),
        'success',
      )
      setShowPerdidaDialog(false)
      setMotivoPerdida('')
      setSelectedComandaId(null)
      // Refrescamos el listado de pérdidas pendientes para que el admin
      // vea la nueva en la sección de "Cobro retroactivo".
      cargarPerdidas()
    } catch (error: any) {
      showToast(error?.message || 'Error al registrar la pérdida', 'error')
    } finally {
      setRegistrandoPerdida(false)
    }
  }

  // Cobro retroactivo: el cliente vuelve y paga lo que se había marcado
  // como perro muerto. Crea un pago normal vinculado a la pérdida.
  const abrirResolverPerdida = (perdida: any) => {
    setPerdidaSeleccionada(perdida)
    setMontoResolver(String(Number(perdida.monto_perdido) || 0))
    setMetodoResolver('efectivo')
    setShowResolverDialog(true)
  }

  const handleResolverPerdida = async () => {
    if (!perdidaSeleccionada || !usuarioActual) return
    if (!puedeCobrar) {
      showToast('Sólo cajero o administrador puede cobrar retroactivamente', 'error')
      return
    }
    const monto = parseFloat(montoResolver) || 0
    if (monto <= 0) {
      showToast('El monto debe ser mayor que 0', 'error')
      return
    }
    setResolviendoPerdida(true)
    try {
      const result = await resolverPerdidaApi({
        perdida_id: perdidaSeleccionada.id,
        monto,
        metodo: metodoResolver,
        resuelto_por_id: usuarioActual.id,
        resuelto_por_nombre: usuarioActual.nombre,
      })
      showToast(
        `Cobro retroactivo registrado: ${formatCurrency(result.monto)}`,
        'success',
      )
      setShowResolverDialog(false)
      setPerdidaSeleccionada(null)
      cargarPerdidas()
      recargarPagos()
    } catch (error: any) {
      showToast(error?.message || 'Error al registrar el cobro retroactivo', 'error')
    } finally {
      setResolviendoPerdida(false)
    }
  }

  const handleCerrarCaja = async () => {
    try {
      const pagosHoy = await recargarPagos('hoy')
      const totalVentas = pagosHoy.reduce((sum: number, p: any) => sum + Number(p.monto ?? 0), 0)
      const totalPropinas = pagosHoy.reduce((sum: number, p: any) => sum + Number(p.propina ?? 0), 0)
      showToast(
        `Caja cerrada: ${pagosHoy.length} pagos, ${formatCurrency(totalVentas)} en ventas, ${formatCurrency(totalPropinas)} en propinas`,
        'success'
      )
    } catch (error: any) {
      showToast(error?.message || 'Error al cerrar caja', 'error')
    }
  }

  // If no comanda selected, show list of pending comandas
  if (!comandaAPagar) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Pagos y Facturacion</h1>
          <Button onClick={handleCerrarCaja} variant="outline">
            <Calculator className="mr-2 h-4 w-4" />
            Cerrar Caja
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
            {/* Pending comandas */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Comandas Pendientes de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                {comandasPendientes.length === 0 ? (
                  <p className="text-center text-muted-foreground">No hay comandas pendientes</p>
                ) : (
                  <div className="space-y-3">
                    {comandasPendientes.map(comanda => {
                      const comandaTotal = comanda.items.reduce((sum, i) => sum + i.precio * i.cantidad, 0)
                      return (
                        <div
                          key={comanda.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                          onClick={() => handleSelectComanda(comanda.id)}
                        >
                          <div>
                            <p className="font-medium text-foreground">{comanda.mesaNombre}</p>
                            <p className="text-sm text-muted-foreground">
                              {comanda.items.length} items • {formatDate(comanda.creadoAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-amber-500">{formatCurrency(comandaTotal)}</p>
                            <Badge className={cn('text-white', getEstadoComandaColor(comanda.estado))}>
                              {getEstadoComandaLabel(comanda.estado)}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pérdidas pendientes (perros muertos sin cobrar). Cualquier
                cajero/admin puede marcarlas como cobradas retroactivamente
                cuando el cliente vuelve a pagar. */}
            {perdidasPendientes.length > 0 && (
              <Card className="border-rose-700/40 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-rose-700">
                    <AlertTriangle className="h-5 w-5" />
                    Pérdidas pendientes ({perdidasPendientes.length})
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Mesas que se fueron sin pagar. Si el cliente vuelve y
                    paga, márcalo como "Cobrar retroactivamente" para que
                    la pérdida se cierre.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {perdidasPendientes.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-lg border border-rose-700/40 bg-rose-700/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              {p.responsable_nombre
                                ? `Responsable: ${p.responsable_nombre}`
                                : 'Responsable: —'}
                              {p.responsable_rol && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({p.responsable_rol})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(
                                p.created_at ? new Date(p.created_at).getTime() : Date.now(),
                              )}
                              {' · '}
                              {p.cantidad_items || 0} items
                            </p>
                            {p.motivo && (
                              <p className="mt-1 text-xs italic text-muted-foreground">
                                "{p.motivo}"
                              </p>
                            )}
                            {p.autorizado_por_nombre && (
                              <p className="text-xs text-muted-foreground">
                                Autorizó: {p.autorizado_por_nombre}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-rose-700">
                              {formatCurrency(Number(p.monto_perdido) || 0)}
                            </p>
                            <Button
                              size="sm"
                              className="mt-2 bg-emerald-600 text-white hover:bg-emerald-500"
                              onClick={() => abrirResolverPerdida(p)}
                              disabled={!puedeCobrar}
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Cobrar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent payments */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Pagos Recientes</CardTitle>
              </CardHeader>
              <CardContent>
                {pagosRecientes.length === 0 ? (
                  <p className="text-center text-muted-foreground">No hay pagos registrados</p>
                ) : (
                  <div className="space-y-3">
                    {pagosRecientes.map(pago => {
                      const comanda = comandas.find(c => c.id === pago.comandaId)
                      const mesaNombre =
                        pago.mesa_nombre ||
                        comanda?.mesaNombre ||
                        (pago.mesa_id ? `Mesa ${pago.mesa_id}` : 'Mesa desconocida')
                      return (
                        <div
                          key={pago.id}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {mesaNombre}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(pago.fecha)} • {pago.metodo}
                            </p>
                          </div>
                          <p className="font-bold text-green-500">{formatCurrency(pago.monto)}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
        </div>

        {/* Dialog: cobrar retroactivamente un perro muerto. Crea un pago
            normal vinculado a la pérdida y la marca como resuelta. */}
        <Dialog open={showResolverDialog} onOpenChange={setShowResolverDialog}>
          <DialogContent className="border-border bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Check className="h-5 w-5 text-emerald-600" />
                Cobrar pérdida retroactivamente
              </DialogTitle>
              <DialogDescription>
                Registra el pago tardío del cliente. La pérdida queda saldada
                y deja de afectar al responsable.
              </DialogDescription>
            </DialogHeader>

            {perdidaSeleccionada && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Responsable</span>
                    <span className="font-semibold text-foreground">
                      {perdidaSeleccionada.responsable_nombre || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto original</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(Number(perdidaSeleccionada.monto_perdido) || 0)}
                    </span>
                  </div>
                  {perdidaSeleccionada.motivo && (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      "{perdidaSeleccionada.motivo}"
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    Monto recibido
                  </label>
                  <Input
                    type="number"
                    value={montoResolver}
                    onChange={(e) => setMontoResolver(e.target.value)}
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Si el cliente paga sólo una parte, podés ajustarlo. Por
                    defecto se cobra el total perdido.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    Método de pago
                  </label>
                  <Select
                    value={metodoResolver}
                    onValueChange={(v) => setMetodoResolver(v as MetodoPago)}
                  >
                    <SelectTrigger className="bg-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowResolverDialog(false)}
                disabled={resolviendoPerdida}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleResolverPerdida}
                disabled={resolviendoPerdida || !puedeCobrar}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {resolviendoPerdida ? 'Registrando…' : 'Confirmar cobro retroactivo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Payment view for selected comanda
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={() => setSelectedComandaId(null)}>
          Volver a lista
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
          {/* Order summary */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-foreground">
                <span>{comandaAPagar.mesaNombre}</span>
                <Badge className={cn('text-white', getEstadoComandaColor(comandaAPagar.estado))}>
                  {getEstadoComandaLabel(comandaAPagar.estado)}
                </Badge>
              </CardTitle>
              {modoPago === 'parcial' && (
                <p className="text-xs text-muted-foreground">
                  Selecciona los productos que está pagando este cliente. El resto
                  queda abierto para futuros pagos en la misma mesa.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <ul className="mb-4 space-y-2">
                {comandaAPagar.items.map((item) => {
                  const yaPagado = item.pagado === true
                  const seleccionado = itemsSeleccionados.has(item.id)
                  const checkboxDisabled = yaPagado || modoPago === 'completo'
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        'flex items-start justify-between gap-3 rounded-lg p-3 transition-colors',
                        yaPagado
                          ? 'bg-muted/30 opacity-60'
                          : !seleccionado && modoPago === 'parcial'
                            ? 'bg-muted/40'
                            : 'bg-muted',
                      )}
                    >
                      <div className="flex flex-1 items-start gap-3">
                        <Checkbox
                          checked={seleccionado}
                          disabled={checkboxDisabled}
                          onCheckedChange={(checked) => {
                            if (modoPago !== 'parcial' || yaPagado) return
                            // Cualquier ajuste manual descarta el plan de
                            // cobro parcial por persona (cobra líneas
                            // enteras según el checkbox).
                            setPendingPartialPay(null)
                            setItemsSeleccionados((prev) => {
                              const next = new Set(prev)
                              if (checked === true) next.add(item.id)
                              else next.delete(item.id)
                              return next
                            })
                          }}
                          className="mt-1"
                          aria-label={`Cobrar ${item.productoNombre}`}
                        />
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'font-medium text-foreground',
                              yaPagado && 'line-through',
                            )}
                          >
                            {item.cantidad}x {item.productoNombre}
                            {item.variante && (
                              <span className="text-sm text-muted-foreground">
                                {' '}({item.variante})
                              </span>
                            )}
                          </p>
                          {yaPagado && (
                            <Badge className="mt-1 bg-emerald-600 text-white">
                              ✓ Pagado
                            </Badge>
                          )}
                          {item.ingredientesEstandar.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              + {item.ingredientesEstandar.join(', ')}
                            </p>
                          )}
                          {item.ingredientesEspeciales.length > 0 && (
                            <p className="text-xs text-amber-500">
                              ⭐{' '}
                              {item.ingredientesEspeciales
                                .map((esp) =>
                                  esp.costoAdicional > 0
                                    ? `${esp.nombre} (+${formatCurrency(esp.costoAdicional)})`
                                    : esp.nombre,
                                )
                                .join(', ')}
                            </p>
                          )}
                          {item.notas && (
                            <p className="text-xs italic text-muted-foreground">{item.notas}</p>
                          )}
                          {item.notaEspecial && (
                            <p className="text-xs italic text-amber-500">📝 {item.notaEspecial}</p>
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          'whitespace-nowrap font-medium text-foreground',
                          yaPagado && 'line-through',
                        )}
                      >
                        {formatCurrency(item.precio * item.cantidad)}
                      </p>
                    </li>
                  )
                })}
              </ul>

              <div className="space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {descuentoMonto > 0 && (
                  <div className="flex justify-between text-green-500">
                    <span>Descuento</span>
                    <span>-{formatCurrency(descuentoMonto)}</span>
                  </div>
                )}
                {impuestoMonto > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>IVA ({tasaImpuesto}%)</span>
                    <span>+{formatCurrency(impuestoMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                  <span>Total (con IVA)</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Propina ({propinaTipo === 'porcentaje' ? `${propinaValor}%` : 'fijo'}, no afecta IVA)
                  </span>
                  <span>+{formatCurrency(propinaCalculada)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-xl font-bold text-amber-500">
                  <span>Total a pagar</span>
                  <span>{formatCurrency(totalAPagar)}</span>
                </div>
                {dividirCuenta && numPersonasInt > 0 && (
                  <div className="flex justify-between text-amber-500">
                    <span>Por persona ({numPersonasInt})</span>
                    <span>{formatCurrency(montoPorPersona)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment options */}
          <div className="space-y-6">
            {/* Propina */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Propina</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ajusta al monto que el cliente realmente pagó de propina (no es
                  obligatorio). La cuenta entregada al cliente la sugirió, pero el
                  cliente puede pagar 0%, otro %, o un monto fijo distinto.
                </p>
              </CardHeader>
              <CardContent>
                {!propinasHabilitadas && (
                  <p className="mb-3 rounded bg-muted p-2 text-sm text-muted-foreground">
                    Propinas deshabilitadas en configuración.
                  </p>
                )}
                <div className="mb-4 flex gap-2">
                  <Button
                    variant={propinaTipo === 'porcentaje' ? 'default' : 'outline'}
                    onClick={() => setPropinaTipo('porcentaje')}
                    disabled={!propinasHabilitadas}
                    className={propinaTipo === 'porcentaje' ? 'bg-amber-500 text-zinc-900' : ''}
                  >
                    Porcentaje
                  </Button>
                  <Button
                    variant={propinaTipo === 'monto' ? 'default' : 'outline'}
                    onClick={() => setPropinaTipo('monto')}
                    disabled={!propinasHabilitadas}
                    className={propinaTipo === 'monto' ? 'bg-amber-500 text-zinc-900' : ''}
                  >
                    Monto Fijo
                  </Button>
                </div>
                <div className="flex gap-2">
                  {propinaTipo === 'porcentaje' ? (
                    <>
                      {['0', '5', '10', '15', '20'].map(pct => (
                        <Button
                          key={pct}
                          variant={propinaValor === pct ? 'default' : 'outline'}
                          onClick={() => setPropinaValor(pct)}
                          disabled={!propinasHabilitadas}
                          className={propinaValor === pct ? 'bg-amber-500 text-zinc-900' : ''}
                        >
                          {pct}%
                        </Button>
                      ))}
                    </>
                  ) : (
                    <Input
                      type="number"
                      value={propinaValor}
                      onChange={e => setPropinaValor(e.target.value)}
                      disabled={!propinasHabilitadas}
                      placeholder="Monto"
                      className="border-border bg-muted"
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tipo de cobro: completo vs parcial por items */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Tipo de cobro</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Usa <strong>Pago parcial</strong> cuando un cliente paga sólo lo
                  que él consumió (por ejemplo, se va antes que el resto). La mesa
                  queda abierta hasta que se cobre todo lo demás.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={modoPago === 'completo' ? 'default' : 'outline'}
                    onClick={() => setModoPago('completo')}
                    className={modoPago === 'completo' ? 'bg-amber-500 text-zinc-900' : ''}
                  >
                    Cobrar todo lo pendiente
                  </Button>
                  <Button
                    variant={modoPago === 'parcial' ? 'default' : 'outline'}
                    onClick={() => setModoPago('parcial')}
                    className={modoPago === 'parcial' ? 'bg-amber-500 text-zinc-900' : ''}
                    disabled={itemsElegibles.length === 0}
                  >
                    Pago parcial (por items)
                  </Button>
                </div>
                {modoPago === 'parcial' && (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <div className="font-semibold text-foreground">
                      {itemsAPagar.length} de {itemsElegibles.length} items
                      seleccionados
                    </div>
                    <div className="text-muted-foreground">
                      Total parcial: {formatCurrency(totalAPagar)}
                    </div>
                    {pendingPartialPay && pendingPartialPay.length > 0 && (
                      <div className="mt-1 text-amber-700">
                        Incluye cobro parcial de líneas con cantidad múltiple:
                        {' '}
                        {pendingPartialPay
                          .map((p) => {
                            const original = itemsElegibles.find((i) => i.id === p.id)
                            const nombre = original?.productoNombre || 'item'
                            const totalLinea = original?.cantidad ?? 0
                            return `${p.cantidad}/${totalLinea}× ${nombre}`
                          })
                          .join(', ')}
                        . El resto queda abierto para otro cliente.
                      </div>
                    )}
                    {itemsAPagar.length === 0 && (
                      <div className="mt-1 text-amber-700">
                        Marca al menos un producto en la lista de arriba.
                      </div>
                    )}
                  </div>
                )}
                {itemsElegibles.length === 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No quedan items por cobrar — ya se pagó toda la comanda.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Split bill */}
            <Card className="border-border bg-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Users className="h-5 w-5" />
                    Dividir Cuenta
                  </CardTitle>
                  <Switch checked={dividirCuenta} onCheckedChange={setDividirCuenta} />
                </div>
              </CardHeader>
              {dividirCuenta && (
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Modo</span>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <Button
                        variant={modoDivision === 'equitativa' ? 'default' : 'outline'}
                        onClick={() => setModoDivision('equitativa')}
                        className={modoDivision === 'equitativa' ? 'bg-amber-500 text-zinc-900' : ''}
                      >
                        Equitativa
                      </Button>
                      <Button
                        variant={modoDivision === 'productos' ? 'default' : 'outline'}
                        onClick={() => setModoDivision('productos')}
                        className={modoDivision === 'productos' ? 'bg-amber-500 text-zinc-900' : ''}
                      >
                        Por productos
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {modoDivision === 'equitativa'
                        ? `Reparte el total en partes iguales (incluida la propina sugerida).${
                            numPersonasInt > 0
                              ? ` Actualmente ${numPersonasInt} personas en la mesa.`
                              : ''
                          }`
                        : 'Asigna cada producto a una persona o déjalo como compartido. Cada uno paga lo que consumió.'}
                    </p>
                  </div>

                  {modoDivision === 'equitativa' && (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Personas en la mesa ({numPersonasInt})
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleAgregarPersona}
                          disabled={creandoPersona || numPersonasInt >= 12}
                        >
                          + Agregar persona
                        </Button>
                      </div>
                      {numPersonasInt === 0 ? (
                        <p className="text-muted-foreground">
                          Agrega al menos una persona para repartir.
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Cada uno paga {formatCurrency(montoPorPersona)} (total ÷ {numPersonasInt}).
                        </p>
                      )}
                    </div>
                  )}

                  {modoDivision === 'productos' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          Personas ({numPersonasInt})
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleAgregarPersona}
                          disabled={creandoPersona || numPersonasInt >= 12}
                        >
                          + Agregar persona
                        </Button>
                      </div>
                      {numPersonasInt === 0 ? (
                        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                          Aún no hay personas en esta mesa. Agrega al menos
                          una para empezar a asignar productos.
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            className="w-full border-amber-500/60 text-amber-700 hover:bg-amber-500/10"
                            onClick={() => setShowAsignarDialog(true)}
                          >
                            Asignar productos por persona
                          </Button>
                          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                            <div className="mb-1 font-semibold text-foreground">Resumen rápido</div>
                            <ul className="space-y-0.5 text-muted-foreground">
                              {calculoPorPersona.personas.map((p) => {
                                const persona = personasOrden[p.idx]
                                return (
                                  <li
                                    key={p.idx}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <span>
                                      Persona {p.idx + 1} ({p.items.length} prod.)
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        {formatCurrency(p.totalAPagar)}
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() =>
                                          persona && handleCobrarPersonaAsignada(persona.id)
                                        }
                                        disabled={!persona || p.items.length === 0}
                                        title="Cobra sólo los productos asignados directamente a esta persona"
                                      >
                                        Cobrar {formatCurrency(p.totalDirectoAPagar)}
                                      </Button>
                                    </div>
                                  </li>
                                )
                              })}
                              {calculoPorPersona.totalCompartido > 0 && (
                                <li className="flex justify-between border-t border-border pt-1">
                                  <span>Compartido (÷{numPersonasInt})</span>
                                  <span className="font-medium text-foreground">
                                    {formatCurrency(calculoPorPersona.totalCompartido)}
                                  </span>
                                </li>
                              )}
                            </ul>
                            {calculoPorPersona.totalCompartido > 0 && (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                El botón Cobrar toma sólo productos asignados directo a esa persona;
                                lo compartido queda pendiente salvo que lo asignes a alguien.
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Payment method */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Método de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant={metodoPago === 'efectivo' ? 'default' : 'outline'}
                    onClick={() => setMetodoPago('efectivo')}
                    className={cn(
                      'flex h-20 flex-col gap-2',
                      metodoPago === 'efectivo' && 'bg-amber-500 text-zinc-900'
                    )}
                  >
                    <DollarSign className="h-6 w-6" />
                    Efectivo
                  </Button>
                  <Button
                    variant={metodoPago === 'tarjeta' ? 'default' : 'outline'}
                    onClick={() => setMetodoPago('tarjeta')}
                    className={cn(
                      'flex h-20 flex-col gap-2',
                      metodoPago === 'tarjeta' && 'bg-amber-500 text-zinc-900'
                    )}
                  >
                    <CreditCard className="h-6 w-6" />
                    Tarjeta
                  </Button>
                </div>

                {metodoPago === 'efectivo' && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-2 block text-sm text-muted-foreground">Efectivo recibido</label>
                      <Input
                        type="number"
                        value={efectivoRecibido}
                        onChange={e => setEfectivoRecibido(e.target.value)}
                        placeholder={formatCurrency(totalAPagar)}
                        className="border-border bg-muted"
                      />
                    </div>
                    {parseFloat(efectivoRecibido || '0') >= totalAPagar - 0.5 && (
                      <div className="rounded-lg bg-green-500/20 p-3 text-center">
                        <p className="text-sm text-muted-foreground">Vuelto</p>
                        <p className="text-2xl font-bold text-green-500">
                          {formatCurrency(Math.max(vuelto, 0))}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Imprimir cuenta para el cliente (antes de cobrar).
                En pago parcial sólo se imprime lo seleccionado; en cobro
                completo se imprime toda la cuenta restante. */}
            <Button
              variant="outline"
              className="w-full border-amber-500/60 py-5 text-base font-semibold text-amber-700 hover:bg-amber-500/10"
              onClick={() => setShowPrecuentaPrint(true)}
              disabled={!comandaAPagar || itemsAPagar.length === 0}
            >
              <FileText className="mr-2 h-5 w-5" />
              Imprimir cuenta para el cliente
            </Button>

            {/* Confirm button */}
            {!puedeCobrar && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
                Sólo el cajero o administrador puede confirmar el pago.
                Tu rol actual ({usuarioActual?.rol || 'desconocido'}) puede revisar la cuenta pero no cobrarla.
              </div>
            )}
            <Button
              className="w-full bg-green-600 py-6 text-lg font-bold text-white hover:bg-green-500"
              onClick={handleConfirmarPago}
              disabled={
                !puedeCobrar ||
                itemsAPagar.length === 0 ||
                // Tolerancia de medio peso para no quedar pegados por
                // redondeos al imprimir (ej. 13750 vs 13749.5).
                (metodoPago === 'efectivo' &&
                  parseFloat(efectivoRecibido || '0') < totalAPagar - 0.5)
              }
            >
              <Check className="mr-2 h-6 w-6" />
              {modoPago === 'parcial' ? 'Confirmar Pago Parcial' : 'Confirmar Pago'} -{' '}
              {formatCurrency(totalAPagar)}
            </Button>

            {/* "Perro muerto": el cliente se fue sin pagar. Sólo el admin
                puede autorizar esta operación. Deja registro en la tabla
                `perdidas_comanda` y cierra la orden como 'perdida'. */}
            {esAdmin && (
              <Button
                variant="outline"
                className="w-full border-rose-700/60 py-4 text-sm font-semibold text-rose-700 hover:bg-rose-700/10"
                onClick={() => {
                  setMotivoPerdida('')
                  setShowPerdidaDialog(true)
                }}
                disabled={itemsElegibles.length === 0}
              >
                <AlertTriangle className="mr-2 h-5 w-5" />
                Registrar perro muerto (se fueron sin pagar)
              </Button>
            )}
          </div>
        </div>

        {/* Boleta Dialog. Lee del snapshot que tomamos al confirmar el
            pago, así sigue mostrando exactamente lo que se cobró aunque
            después esos items queden marcados como `pagado=true` y salgan
            de `itemsAPagar`. */}
        <Dialog open={showBoletaDialog} onOpenChange={setShowBoletaDialog}>
          <DialogContent className="border-border bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Receipt className="h-5 w-5" />
                Boleta
              </DialogTitle>
            </DialogHeader>
            {boletaSnapshot && (
              <div className="rounded-lg bg-white p-4 font-mono text-xs text-zinc-900">
                <div className="text-center">
                  <p className="text-lg font-bold">{boletaSnapshot.nombre_negocio}</p>
                  <p className="text-muted-foreground">{state.configuracion.encabezadoTicket}</p>
                  <p className="mt-2 text-muted-foreground">{formatDate(boletaSnapshot.fecha)}</p>
                </div>
                <div className="my-4 border-t border-dashed border-border" />
                <p className="font-bold">{boletaSnapshot.mesa}</p>
                {boletaSnapshot.atendido_por && (
                  <p className="text-muted-foreground">
                    Atendido por: {boletaSnapshot.atendido_por}
                  </p>
                )}
                <div className="my-4 border-t border-dashed border-border" />
                {boletaSnapshot.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span>
                      {item.cantidad}x {item.nombre}
                      {item.variante && ` (${item.variante})`}
                    </span>
                    <span>{formatCurrency(item.precio_unitario * item.cantidad)}</span>
                  </div>
                ))}
                <div className="my-4 border-t border-dashed border-border" />
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(boletaSnapshot.totales.subtotal)}</span>
                </div>
                {(boletaSnapshot.totales.descuento ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{boletaSnapshot.totales.descuento_label || 'Descuento'}</span>
                    <span>-{formatCurrency(boletaSnapshot.totales.descuento || 0)}</span>
                  </div>
                )}
                {(boletaSnapshot.totales.impuesto ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>{boletaSnapshot.totales.impuesto_label || 'IVA'}</span>
                    <span>+{formatCurrency(boletaSnapshot.totales.impuesto || 0)}</span>
                  </div>
                )}
                <div className="my-1 border-t border-border" />
                <div className="flex justify-between font-semibold">
                  <span>Total (con IVA)</span>
                  <span>{formatCurrency(boletaSnapshot.totales.total)}</span>
                </div>
                {(boletaSnapshot.totales.propina ?? 0) > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>Propina (sin IVA)</span>
                    <span>+{formatCurrency(boletaSnapshot.totales.propina || 0)}</span>
                  </div>
                )}
                <div className="my-1 border-t border-border" />
                <div className="flex justify-between text-lg font-bold">
                  <span>TOTAL A PAGAR</span>
                  <span>
                    {formatCurrency(
                      boletaSnapshot.totales.total_a_pagar ?? boletaSnapshot.totales.total,
                    )}
                  </span>
                </div>
                <div className="my-4 border-t border-dashed border-border" />
                {boletaSnapshot.metodo_pago && (
                  <p className="text-center text-muted-foreground">
                    Método: {String(boletaSnapshot.metodo_pago).toUpperCase()}
                  </p>
                )}
                {boletaSnapshot.dividido_en && boletaSnapshot.dividido_en > 1 && boletaSnapshot.monto_por_persona && (
                  <p className="text-center text-muted-foreground">
                    Dividido entre {boletaSnapshot.dividido_en} personas:{' '}
                    {formatCurrency(boletaSnapshot.monto_por_persona)} c/u
                  </p>
                )}
                <div className="my-4 border-t border-dashed border-border" />
                <p className="text-center text-muted-foreground">{state.configuracion.pieTicket}</p>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBoletaDialog(false)
                  setBoletaSnapshot(null)
                  // Sólo soltamos la selección si la comanda ya quedó pagada
                  // (modo completo). En pago parcial nos quedamos para que
                  // el cajero pueda cobrar al siguiente cliente.
                  if (comandaAPagar?.estado === 'pagado') {
                    setSelectedComandaId(null)
                  }
                }}
              >
                Cerrar
              </Button>
              <Button onClick={() => setShowPrintDialog(true)} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                Imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PrintPreviewDialog
          open={showPrintDialog}
          onOpenChange={setShowPrintDialog}
          data={boletaSnapshot}
          config={printConfig}
        />

        {/* Vista previa de la cuenta para entregar al cliente.
            Si el cajero eligió "Por productos", se imprime una cuenta por
            persona en un único trabajo de impresión. */}
        <PrintPreviewDialog
          open={showPrecuentaPrint}
          onOpenChange={setShowPrecuentaPrint}
          data={
            dividirCuenta && modoDivision === 'productos' && ticketsPorPersona.length > 0
              ? null
              : ticketDataPrecuenta
          }
          tickets={
            dividirCuenta && modoDivision === 'productos' && ticketsPorPersona.length > 0
              ? ticketsPorPersona
              : null
          }
          config={printConfig}
          title={
            dividirCuenta && modoDivision === 'productos'
              ? `Cuenta dividida (${numPersonasInt} personas)`
              : 'Cuenta para el cliente'
          }
          closeLabel="Cerrar"
        />

        {/* Dialog: asignar productos por persona */}
        <Dialog open={showAsignarDialog} onOpenChange={setShowAsignarDialog}>
          <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-hidden border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Asignar productos por persona
              </DialogTitle>
              <DialogDescription>
                Indica quién pagará cada producto. Los que dejes en <strong>Compartido</strong> se
                reparten en partes iguales entre las {numPersonasInt} personas.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-[1fr_300px]">
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-2">
                {unidadesItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay productos para asignar.</p>
                ) : (
                  unidadesItems.map((u) => {
                    const asignado = asignaciones[u.unitId]
                    const value =
                      typeof asignado === 'string' && asignado !== 'compartido'
                        ? asignado
                        : 'compartido'
                    return (
                      <div
                        key={u.unitId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {u.productoNombre}
                            {u.variante ? ` — ${u.variante}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(u.precio)}
                            {u.notaEspecial ? ` · ${u.notaEspecial}` : ''}
                          </div>
                        </div>
                        <Select
                          value={value}
                          onValueChange={(v) => {
                            setAsignaciones((prev) => ({
                              ...prev,
                              [u.unitId]: v === 'compartido' ? 'compartido' : v,
                            }))
                          }}
                        >
                          <SelectTrigger className="w-40 border-border bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="compartido">Compartido</SelectItem>
                            {personasOrden.map((p, i) => (
                              <SelectItem key={p.id} value={p.id}>
                                Persona {i + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Personas ({numPersonasInt})
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAgregarPersona}
                    disabled={creandoPersona || numPersonasInt >= 12}
                  >
                    + Agregar
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="mb-2 text-sm font-semibold text-foreground">Resumen</div>
                  {calculoPorPersona.personas.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Agrega al menos una persona para repartir.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {calculoPorPersona.personas.map((p) => {
                        const persona = personasOrden[p.idx]
                        return (
                          <li key={p.idx} className="space-y-0.5">
                            <div className="flex justify-between">
                              <span className="text-foreground">
                                Persona {p.idx + 1}
                                {persona && p.items.length === 0 && numPersonasInt > 1 && (
                                  <button
                                    type="button"
                                    className="ml-2 text-[10px] text-rose-700 hover:underline"
                                    onClick={() => handleQuitarPersona(persona.id)}
                                    title="Eliminar esta persona de la mesa (sus productos quedan compartidos)"
                                  >
                                    quitar
                                  </button>
                                )}
                              </span>
                              <span className="font-semibold text-foreground">
                                {formatCurrency(p.totalAPagar)}
                              </span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>
                                {p.items.length} prod.{' '}
                                {p.subtotalCompartido > 0 ? '+ compartido' : ''}
                              </span>
                              <span>Sub {formatCurrency(p.subtotal)}</span>
                            </div>
                            {/* Aquí sólo guardamos + cerramos. El cobro real
                                se hace desde "Cobrar persona N" en el panel
                                principal (que usa el state ya rehidratado
                                con los nuevos IDs que generaron los splits
                                en BD). Evita closures sobre IDs viejos. */}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-1 h-7 w-full text-[11px]"
                              onClick={async () => {
                                if (!persona) return
                                const ok = await guardarAsignacionesEnBD()
                                if (!ok) return
                                showToast(
                                  `Asignaciones guardadas. Pulsa "Cobrar Persona ${p.idx + 1}" en el resumen para cobrarle.`,
                                  'success',
                                )
                                setShowAsignarDialog(false)
                              }}
                              disabled={
                                !persona ||
                                p.items.length === 0 ||
                                guardandoAsignaciones
                              }
                            >
                              Guardar y cobrar a Persona {p.idx + 1}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {calculoPorPersona.totalCompartido > 0 && (
                    <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                      Compartido total: {formatCurrency(calculoPorPersona.totalCompartido)} (÷{' '}
                      {numPersonasInt || 1})
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAsignaciones((prev) => {
                        const next = { ...prev }
                        for (const k of Object.keys(next)) next[k] = 'compartido'
                        return next
                      })
                    }}
                  >
                    Todo compartido
                  </Button>
                  <Button
                    variant="outline"
                    disabled={numPersonasInt === 0}
                    onClick={() => {
                      if (personasOrden.length === 0) return
                      // Reparto round-robin: 1ª unidad → Persona 1, 2ª → Persona 2, …
                      const next: Record<string, string> = {}
                      unidadesItems.forEach((u, i) => {
                        next[u.unitId] = personasOrden[i % personasOrden.length].id
                      })
                      setAsignaciones(next)
                    }}
                  >
                    Repartir 1 a 1
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAsignarDialog(false)}
                disabled={guardandoAsignaciones}
              >
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await guardarAsignacionesEnBD()
                  if (ok) {
                    showToast('Asignaciones guardadas', 'success')
                    setShowAsignarDialog(false)
                  }
                }}
                disabled={guardandoAsignaciones}
              >
                {guardandoAsignaciones ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button
                className="bg-amber-500 text-zinc-900 hover:bg-amber-600"
                onClick={async () => {
                  const ok = await guardarAsignacionesEnBD()
                  if (!ok) return
                  setShowAsignarDialog(false)
                  setShowPrecuentaPrint(true)
                }}
                disabled={guardandoAsignaciones}
              >
                <Printer className="mr-2 h-4 w-4" />
                Guardar e imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: registrar perro muerto (cliente que se fue sin pagar).
            Sólo admin lo abre. Pide motivo obligatorio. El servidor calcula
            el monto perdido (items que no estaban pagados todavía). */}
        <Dialog open={showPerdidaDialog} onOpenChange={setShowPerdidaDialog}>
          <DialogContent className="border-border bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
                Registrar perro muerto
              </DialogTitle>
              <DialogDescription>
                Confirma que el cliente se fue sin pagar. Esta operación es
                irreversible y queda registrada como pérdida con tu nombre
                como autorizador.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-lg border border-rose-700/40 bg-rose-700/10 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mesa</span>
                  <span className="font-semibold text-foreground">
                    {comandaAPagar?.mesaNombre}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Responsable (abrió la mesa)
                  </span>
                  <span className="font-semibold text-foreground">
                    {(() => {
                      const u = usuarios.find((x) => x.id === comandaAPagar?.usuarioId)
                      if (!u) return '—'
                      return `${u.nombre}${u.rol ? ` (${u.rol})` : ''}`
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items pendientes</span>
                  <span className="font-semibold text-foreground">
                    {itemsElegibles.length}
                  </span>
                </div>
                <div className="flex justify-between border-t border-rose-700/30 pt-2">
                  <span className="text-muted-foreground">
                    Monto perdido estimado
                  </span>
                  <span className="font-bold text-rose-700">
                    {formatCurrency(
                      itemsElegibles.reduce(
                        (s, it) => s + it.precio * it.cantidad,
                        0,
                      ) *
                        (impuestoHabilitado ? 1 + tasaImpuesto / 100 : 1),
                    )}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  El monto queda asociado al responsable de la mesa hasta que
                  la pérdida se resuelva (si el cliente vuelve a pagar después).
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Motivo / descripción <span className="text-rose-700">*</span>
                </label>
                <Textarea
                  value={motivoPerdida}
                  onChange={(e) => setMotivoPerdida(e.target.value)}
                  placeholder="Ej: cliente salió mientras el cajero atendía, mesero descuidó la mesa..."
                  rows={3}
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Queda en el historial de la comanda y en el reporte de pérdidas.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowPerdidaDialog(false)}
                disabled={registrandoPerdida}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleRegistrarPerdida}
                disabled={registrandoPerdida || motivoPerdida.trim().length < 3}
                className="bg-rose-700 text-white hover:bg-rose-800"
              >
                {registrandoPerdida ? 'Registrando…' : 'Registrar pérdida'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
