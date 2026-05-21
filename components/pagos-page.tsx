'use client'

import { useState } from 'react'
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
import { CreditCard, DollarSign, QrCode, Receipt, Calculator, Check, Users } from 'lucide-react'
import { showToast } from '@/components/toast'
import { useSearchParams, useRouter } from 'next/navigation'
import { Comanda, MetodoPago, Pago } from '@/lib/types'
import { generateId } from '@/lib/helpers'

export function PagosPage() {
  const { state, dispatch } = useApp()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { comandas, mesas, pagos, usuarioActual } = state

  const comandaIdParam = searchParams.get('comanda')

  // Get comanda to pay
  const comandaAPagar = comandaIdParam 
    ? comandas.find(c => c.id === comandaIdParam)
    : null

  // State for payment
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [propinaTipo, setPropinaTipo] = useState<'porcentaje' | 'monto'>('porcentaje')
  const [propinaValor, setPropinaValor] = useState('10')
  const [dividirCuenta, setDividirCuenta] = useState(false)
  const [numPersonas, setNumPersonas] = useState('2')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [showQRDialog, setShowQRDialog] = useState(false)
  const [showBoletaDialog, setShowBoletaDialog] = useState(false)

  // Calculate totals
  const subtotal = comandaAPagar?.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0) || 0
  const descuentoMonto = comandaAPagar?.tipoDescuento === 'porcentaje'
    ? subtotal * ((comandaAPagar?.descuento || 0) / 100)
    : (comandaAPagar?.descuento || 0)
  
  const propinaCalculada = propinaTipo === 'porcentaje'
    ? (subtotal - descuentoMonto) * (parseFloat(propinaValor) / 100)
    : parseFloat(propinaValor) || 0
  
  const total = subtotal - descuentoMonto + propinaCalculada
  const montoPorPersona = dividirCuenta ? total / (parseInt(numPersonas) || 1) : total
  const vuelto = parseFloat(efectivoRecibido) - total

  // Recent payments
  const pagosRecientes = pagos
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, 10)

  // Comandas pending payment
  const comandasPendientes = comandas.filter(c => 
    c.estado === 'lista' || c.estado === 'en_cocina'
  )

  const handleSelectComanda = (comandaId: string) => {
    router.push(`/pagos?comanda=${comandaId}`)
  }

  const handleConfirmarPago = () => {
    if (!comandaAPagar || !usuarioActual) return

    // Create payment record
    const nuevoPago: Pago = {
      id: generateId(),
      comandaId: comandaAPagar.id,
      metodo: metodoPago,
      total: total,
      propina: propinaCalculada,
      descuento: descuentoMonto,
      divididoEn: dividirCuenta ? parseInt(numPersonas) : 1,
      fecha: Date.now()
    }

    dispatch({ type: 'ADD_PAGO', payload: nuevoPago })

    // Update comanda status to paid
    dispatch({
      type: 'UPDATE_COMANDA',
      payload: { ...comandaAPagar, estado: 'pagada' }
    })

    // Free the table
    const mesa = mesas.find(m => m.id === comandaAPagar.mesaId)
    if (mesa) {
      dispatch({
        type: 'UPDATE_MESA',
        payload: { ...mesa, estado: 'libre' }
      })
    }

    showToast('Pago confirmado exitosamente', 'success')
    setShowBoletaDialog(true)
  }

  const handleCerrarCaja = () => {
    const hoy = new Date()
    const pagosHoy = pagos.filter(p => {
      const pagoDate = new Date(p.fecha)
      return pagoDate.toDateString() === hoy.toDateString()
    })

    const totalVentas = pagosHoy.reduce((sum, p) => sum + p.total, 0)
    const totalPropinas = pagosHoy.reduce((sum, p) => sum + p.propina, 0)
    const totalDescuentos = pagosHoy.reduce((sum, p) => sum + p.descuento, 0)

    showToast(
      `Caja cerrada: ${pagosHoy.length} pagos, ${formatCurrency(totalVentas)} en ventas`,
      'success'
    )
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
            <Card className="border-zinc-700 bg-zinc-800/50">
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
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 p-4 transition-colors hover:bg-zinc-700/50"
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
            <Card className="border-zinc-700 bg-zinc-800/50">
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
                          className="flex items-center justify-between rounded-lg border border-zinc-700 p-3"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {comanda?.mesaNombre || 'Mesa desconocida'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(pago.fecha)} • {pago.metodo}
                            </p>
                          </div>
                          <p className="font-bold text-green-500">{formatCurrency(pago.total)}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Payment view for selected comanda
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={() => router.push('/pagos')}>
          Volver a lista
        </Button>
      </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order summary */}
          <Card className="border-zinc-700 bg-zinc-800/50">
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
                  <li key={item.id} className="flex justify-between rounded-lg bg-zinc-700/50 p-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {item.cantidad}x {item.productoNombre}
                        {item.variante && <span className="text-sm text-muted-foreground"> ({item.variante})</span>}
                      </p>
                      {item.ingredientesEstandar.length > 0 && (
                        <p className="text-xs text-muted-foreground">+ {item.ingredientesEstandar.join(', ')}</p>
                      )}
                      {item.ingredientesEspeciales.length > 0 && (
                        <p className="text-xs text-amber-500">⭐ {item.ingredientesEspeciales.join(', ')}</p>
                      )}
                      {item.notas && (
                        <p className="text-xs italic text-muted-foreground">{item.notas}</p>
                      )}
                    </div>
                    <p className="font-medium text-foreground">{formatCurrency(item.precio * item.cantidad)}</p>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 border-t border-zinc-700 pt-4 text-sm">
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
                <div className="flex justify-between text-muted-foreground">
                  <span>Propina ({propinaTipo === 'porcentaje' ? `${propinaValor}%` : 'fijo'})</span>
                  <span>+{formatCurrency(propinaCalculada)}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-700 pt-2 text-xl font-bold text-foreground">
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
            <Card className="border-zinc-700 bg-zinc-800/50">
              <CardHeader>
                <CardTitle className="text-foreground">Propina</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-2">
                  <Button
                    variant={propinaTipo === 'porcentaje' ? 'default' : 'outline'}
                    onClick={() => setPropinaTipo('porcentaje')}
                    className={propinaTipo === 'porcentaje' ? 'bg-amber-500 text-zinc-900' : ''}
                  >
                    Porcentaje
                  </Button>
                  <Button
                    variant={propinaTipo === 'monto' ? 'default' : 'outline'}
                    onClick={() => setPropinaTipo('monto')}
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
                      placeholder="Monto"
                      className="border-zinc-600 bg-zinc-700/50"
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Split bill */}
            <Card className="border-zinc-700 bg-zinc-800/50">
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
                      <SelectTrigger className="w-24 border-zinc-600 bg-zinc-700/50">
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
            <Card className="border-zinc-700 bg-zinc-800/50">
              <CardHeader>
                <CardTitle className="text-foreground">Método de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
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
                  <Button
                    variant={metodoPago === 'qr' ? 'default' : 'outline'}
                    onClick={() => { setMetodoPago('qr'); setShowQRDialog(true) }}
                    className={cn(
                      'flex h-20 flex-col gap-2',
                      metodoPago === 'qr' && 'bg-amber-500 text-zinc-900'
                    )}
                  >
                    <QrCode className="h-6 w-6" />
                    QR
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
                        className="border-zinc-600 bg-zinc-700/50"
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

        {/* QR Dialog */}
        <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
          <DialogContent className="border-zinc-700 bg-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-foreground">Pago con QR</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center py-8">
              <div className="mb-4 flex h-48 w-48 items-center justify-center rounded-lg bg-white">
                <QrCode className="h-32 w-32 text-zinc-900" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Escanea el código QR con tu aplicación de pago
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-500">{formatCurrency(total)}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowQRDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setShowQRDialog(false)} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                Pago Confirmado
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Boleta Dialog */}
        <Dialog open={showBoletaDialog} onOpenChange={setShowBoletaDialog}>
          <DialogContent className="border-zinc-700 bg-zinc-800 sm:max-w-md">
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
              <div className="my-4 border-t border-dashed border-zinc-300" />
              <p className="font-bold">{comandaAPagar.mesaNombre}</p>
              <p className="text-muted-foreground">Atendido por: {comandaAPagar.usuarioNombre}</p>
              <div className="my-4 border-t border-dashed border-zinc-300" />
              {comandaAPagar.items.map(item => (
                <div key={item.id} className="flex justify-between py-1">
                  <span>
                    {item.cantidad}x {item.productoNombre}
                    {item.variante && ` (${item.variante})`}
                  </span>
                  <span>{formatCurrency(item.precio * item.cantidad)}</span>
                </div>
              ))}
              <div className="my-4 border-t border-dashed border-zinc-300" />
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
              {propinaCalculada > 0 && (
                <div className="flex justify-between">
                  <span>Propina</span>
                  <span>+{formatCurrency(propinaCalculada)}</span>
                </div>
              )}
              <div className="my-2 border-t border-zinc-300" />
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="my-4 border-t border-dashed border-zinc-300" />
              <p className="text-center text-muted-foreground">Método: {metodoPago.toUpperCase()}</p>
              {dividirCuenta && (
                <p className="text-center text-muted-foreground">
                  Dividido entre {numPersonas} personas: {formatCurrency(montoPorPersona)} c/u
                </p>
              )}
              <div className="my-4 border-t border-dashed border-zinc-300" />
              <p className="text-center text-muted-foreground">{state.configuracion.pieTicket}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowBoletaDialog(false); router.push('/pagos') }}>
                Cerrar
              </Button>
              <Button onClick={() => window.print()} className="bg-amber-500 text-zinc-900 hover:bg-amber-400">
                Imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
