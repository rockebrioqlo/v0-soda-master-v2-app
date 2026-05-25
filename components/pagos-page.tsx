'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { CreditCard, DollarSign, Receipt, Calculator, Check, Users } from 'lucide-react'
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
    recargarPagos,
    updateOrden,
    updateMesa,
  } = useApp()
  const { comandas, mesas, pagos, usuarioActual, configuracion } = state
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
  const [numPersonas, setNumPersonas] = useState('2')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [showBoletaDialog, setShowBoletaDialog] = useState(false)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const printConfig = readPrintConfigFromState(configuracion)

  useEffect(() => {
    setPropinaValor(String(propinasHabilitadas ? Number(configuracion.propina_default) || 0 : 0))
  }, [configuracion.propina_default, propinasHabilitadas])

  // Calculate totals
  const subtotal = comandaAPagar?.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0) || 0
  const descuentoMonto = comandaAPagar?.tipoDescuento === 'porcentaje'
    ? subtotal * ((comandaAPagar?.descuento || 0) / 100)
    : (comandaAPagar?.descuento || 0)
  
  const baseImponible = Math.max(subtotal - descuentoMonto, 0)
  const impuestoMonto = impuestoHabilitado ? baseImponible * (tasaImpuesto / 100) : 0
  const propinaCalculada = propinaTipo === 'porcentaje'
    ? baseImponible * (parseFloat(propinaValor) / 100)
    : parseFloat(propinaValor) || 0
  
  const total = baseImponible + impuestoMonto + propinaCalculada
  const montoPorPersona = dividirCuenta ? total / (parseInt(numPersonas) || 1) : total
  const vuelto = parseFloat(efectivoRecibido) - total

  const ticketDataBoleta = useMemo<TicketData | null>(() => {
    if (!comandaAPagar) return null
    const efectivoNum = parseFloat(efectivoRecibido)
    return {
      tipo: 'boleta',
      nombre_negocio:
        configuracion.nombre_negocio || configuracion.nombreRestaurante || 'Soda Master',
      mesa: comandaAPagar.mesaNombre,
      atendido_por: comandaAPagar.usuarioNombre,
      fecha: Date.now(),
      metodo_pago: metodoPago,
      dividido_en: dividirCuenta ? parseInt(numPersonas) || 1 : 1,
      monto_por_persona: dividirCuenta ? montoPorPersona : null,
      items: comandaToTicketItems(comandaAPagar),
      totales: {
        subtotal,
        descuento: descuentoMonto,
        descuento_label:
          comandaAPagar.tipoDescuento === 'porcentaje'
            ? `Descuento (${comandaAPagar.descuento}%)`
            : 'Descuento',
        impuesto: impuestoMonto,
        impuesto_label: impuestoHabilitado ? `Impuesto (${tasaImpuesto}%)` : null,
        propina: propinaCalculada,
        total,
        pagado:
          metodoPago === 'efectivo' && Number.isFinite(efectivoNum) && efectivoNum >= total
            ? efectivoNum
            : null,
        vuelto:
          metodoPago === 'efectivo' && Number.isFinite(efectivoNum) && efectivoNum >= total
            ? vuelto
            : null,
      },
    }
  }, [
    comandaAPagar,
    configuracion,
    metodoPago,
    dividirCuenta,
    numPersonas,
    montoPorPersona,
    subtotal,
    descuentoMonto,
    impuestoMonto,
    impuestoHabilitado,
    tasaImpuesto,
    propinaCalculada,
    total,
    efectivoRecibido,
    vuelto,
  ])

  // Recent payments
  const pagosRecientes = pagos
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, 10)

  // Comandas pending payment
  const comandasPendientes = comandas.filter(c => 
    c.estado === 'listo' || c.estado === 'en_cocina' || c.estado === 'en_preparacion'
  )

  const handleSelectComanda = (comandaId: string) => {
    setSelectedComandaId(comandaId)
  }

  const handleConfirmarPago = async () => {
    if (!comandaAPagar || !usuarioActual) return

    try {
      const nuevoPago = await crearPagoApi({
        orden_id: comandaAPagar.id,
        metodo: metodoPago,
        monto: total,
        propina: propinaCalculada,
        descuento: descuentoMonto,
        dividido_en: dividirCuenta ? parseInt(numPersonas) : 1,
        vuelto: metodoPago === 'efectivo' && parseFloat(efectivoRecibido) >= total ? vuelto : null,
        referencia: null,
        aprobado: true,
      })
      dispatch({ type: 'ADD_PAGO', payload: nuevoPago })

      await updateOrden(comandaAPagar.id, { estado: 'pagado' })
      dispatch({
        type: 'UPDATE_COMANDA',
        payload: { ...comandaAPagar, estado: 'pagado' },
      })

      const mesa = mesas.find((m) => m.id === comandaAPagar.mesaId)
      if (mesa) {
        await updateMesa(mesa.id, { estado: 'libre' })
        dispatch({
          type: 'UPDATE_MESA',
          payload: { ...mesa, estado: 'libre' },
        })
      }

      showToast('Pago confirmado exitosamente', 'success')
      setShowBoletaDialog(true)
    } catch (error: any) {
      showToast(error?.message || 'Error al registrar pago', 'error')
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
                      return (
                        <div
                          key={pago.id}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {comanda?.mesaNombre || 'Mesa desconocida'}
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
            </CardHeader>
            <CardContent>
              <ul className="mb-4 space-y-2">
                {comandaAPagar.items.map(item => (
                  <li key={item.id} className="flex justify-between rounded-lg bg-muted p-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {item.cantidad}x {item.productoNombre}
                        {item.variante && <span className="text-sm text-muted-foreground"> ({item.variante})</span>}
                      </p>
                      {item.ingredientesEstandar.length > 0 && (
                        <p className="text-xs text-muted-foreground">+ {item.ingredientesEstandar.join(', ')}</p>
                      )}
                      {item.ingredientesEspeciales.length > 0 && (
                        <p className="text-xs text-amber-500">
                          ⭐ {item.ingredientesEspeciales
                            .map(esp =>
                              esp.costoAdicional > 0
                                ? `${esp.nombre} (+${formatCurrency(esp.costoAdicional)})`
                                : esp.nombre
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
                    <p className="font-medium text-foreground">{formatCurrency(item.precio * item.cantidad)}</p>
                  </li>
                ))}
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
                    <span>Impuesto ({tasaImpuesto}%)</span>
                    <span>+{formatCurrency(impuestoMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Propina ({propinaTipo === 'porcentaje' ? `${propinaValor}%` : 'fijo'})</span>
                  <span>+{formatCurrency(propinaCalculada)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-xl font-bold text-foreground">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                {dividirCuenta && (
                  <div className="flex justify-between text-amber-500">
                    <span>Por persona ({numPersonas})</span>
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
                <CardContent>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">Número de personas:</span>
                    <Select value={numPersonas} onValueChange={setNumPersonas}>
                      <SelectTrigger className="w-24 border-border bg-muted">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5, 6, 7, 8].map(n => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        placeholder={formatCurrency(total)}
                        className="border-border bg-muted"
                      />
                    </div>
                    {parseFloat(efectivoRecibido) >= total && (
                      <div className="rounded-lg bg-green-500/20 p-3 text-center">
                        <p className="text-sm text-muted-foreground">Vuelto</p>
                        <p className="text-2xl font-bold text-green-500">{formatCurrency(vuelto)}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confirm button */}
            <Button
              className="w-full bg-green-600 py-6 text-lg font-bold text-white hover:bg-green-500"
              onClick={handleConfirmarPago}
              disabled={metodoPago === 'efectivo' && parseFloat(efectivoRecibido) < total}
            >
              <Check className="mr-2 h-6 w-6" />
              Confirmar Pago - {formatCurrency(total)}
            </Button>
          </div>
        </div>

        {/* Boleta Dialog */}
        <Dialog open={showBoletaDialog} onOpenChange={setShowBoletaDialog}>
          <DialogContent className="border-border bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Receipt className="h-5 w-5" />
                Boleta
              </DialogTitle>
            </DialogHeader>
            <div className="rounded-lg bg-white p-4 font-mono text-xs text-zinc-900">
              <div className="text-center">
                <p className="text-lg font-bold">{state.configuracion.nombreRestaurante}</p>
                <p className="text-muted-foreground">{state.configuracion.encabezadoTicket}</p>
                <p className="mt-2 text-muted-foreground">{formatDate(Date.now())}</p>
              </div>
              <div className="my-4 border-t border-dashed border-border" />
              <p className="font-bold">{comandaAPagar.mesaNombre}</p>
              <p className="text-muted-foreground">Atendido por: {comandaAPagar.usuarioNombre}</p>
              <div className="my-4 border-t border-dashed border-border" />
              {comandaAPagar.items.map(item => (
                <div key={item.id} className="flex justify-between py-1">
                  <span>
                    {item.cantidad}x {item.productoNombre}
                    {item.variante && ` (${item.variante})`}
                  </span>
                  <span>{formatCurrency(item.precio * item.cantidad)}</span>
                </div>
              ))}
              <div className="my-4 border-t border-dashed border-border" />
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {descuentoMonto > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span>
                  <span>-{formatCurrency(descuentoMonto)}</span>
                </div>
              )}
              {impuestoMonto > 0 && (
                <div className="flex justify-between">
                  <span>Impuesto ({tasaImpuesto}%)</span>
                  <span>+{formatCurrency(impuestoMonto)}</span>
                </div>
              )}
              {propinaCalculada > 0 && (
                <div className="flex justify-between">
                  <span>Propina</span>
                  <span>+{formatCurrency(propinaCalculada)}</span>
                </div>
              )}
              <div className="my-2 border-t border-border" />
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="my-4 border-t border-dashed border-border" />
              <p className="text-center text-muted-foreground">Método: {metodoPago.toUpperCase()}</p>
              {dividirCuenta && (
                <p className="text-center text-muted-foreground">
                  Dividido entre {numPersonas} personas: {formatCurrency(montoPorPersona)} c/u
                </p>
              )}
              <div className="my-4 border-t border-dashed border-border" />
              <p className="text-center text-muted-foreground">{state.configuracion.pieTicket}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowBoletaDialog(false); setSelectedComandaId(null) }}>
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
          data={ticketDataBoleta}
          config={printConfig}
        />
    </div>
  )
}
