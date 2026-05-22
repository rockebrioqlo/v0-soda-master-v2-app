'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  format,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  endOfMonth,
} from 'date-fns'
import { Download, DollarSign, FileText, TrendingUp, Receipt, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/helpers'

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

type PresetRango = 'hoy' | 'semana' | 'mes' | 'personalizado'

interface VentasResumen {
  total: number
  ordenes: number
  ticket_promedio: number
}
interface TopProducto {
  producto_id: string
  nombre: string
  categoria: string
  cantidad_vendida: number
  total_generado: number
}
interface VentaCategoria {
  categoria: string
  cantidad: number
  total: number
}
interface MetodoPago {
  metodo: string
  cantidad_transacciones: number
  total: number
}
interface PagoDetalle {
  id: string
  orden_id: string
  metodo: string
  monto: number | string
  propina: number | string
  descuento?: number | string | null
  fecha: number | string
  created_at?: string
}

interface MermasResumen {
  total: { descuento: number; perdida_estimada: number; registros: number }
  por_tipo: Array<{
    tipo: string
    cantidad_registros: number
    unidades: number
    monto_descuento: number
    perdida_estimada: number
  }>
  top_productos: Array<{
    producto_id: string
    producto_nombre: string | null
    unidades: number
    perdida_estimada: number
  }>
  comandas_no_pagadas: Array<{
    id: string
    orden_id: string
    motivo: string
    monto: number
    mesa_numero: number | null
    registrado_por_nombre: string | null
    created_at: string
  }>
}

interface DescuentoRow {
  id: string
  orden_id: string
  tipo: string
  valor: number
  motivo: string
  created_at: string
  aplicado_por: string | null
  aplicado_por_nombre: string | null
  aplicado_por_rol: string | null
  autorizado_por: string | null
  autorizado_por_nombre: string | null
  orden_total: number | null
  mesa_numero: number | null
}

const DESCUENTO_TIPO_LABEL: Record<string, string> = {
  porcentaje: 'Porcentaje',
  monto_fijo: 'Monto fijo',
  cortesia_parcial: 'Cortesía parcial',
  cortesia_total: 'Cortesía total',
}

const MERMA_TIPOS_LABEL: Record<string, string> = {
  accidente: 'Accidente / Daño físico',
  vencido: 'Producto vencido',
  perdida_sin_explicacion: 'Pérdida sin explicación',
  consumo_interno: 'Consumo interno',
  comanda_no_pagada: 'Comanda no pagada',
  error_preparacion: 'Error de preparación',
  robo: 'Robo',
}

const MOTIVOS_CNP_LABEL: Record<string, string> = {
  cliente_se_fue: 'Cliente se retiró sin pagar',
  error_mesero: 'Error del mesero',
  cortesia: 'Cortesía autorizada',
}

const ETIQUETAS_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
}

function rangoDesdePreset(preset: PresetRango): { desde: string; hasta: string } {
  const hoy = new Date()
  if (preset === 'semana') {
    return {
      desde: format(startOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      hasta: format(endOfWeek(hoy, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    }
  }
  if (preset === 'mes') {
    return {
      desde: format(startOfMonth(hoy), 'yyyy-MM-dd'),
      hasta: format(endOfMonth(hoy), 'yyyy-MM-dd'),
    }
  }
  const hoyIso = format(hoy, 'yyyy-MM-dd')
  return { desde: hoyIso, hasta: hoyIso }
}

async function safeJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch (err) {
    console.error('Reportes fetch error', url, err)
    return fallback
  }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function ReportesPage() {
  const [preset, setPreset] = useState<PresetRango>('hoy')
  const inicial = rangoDesdePreset('hoy')
  const [desde, setDesde] = useState<string>(inicial.desde)
  const [hasta, setHasta] = useState<string>(inicial.hasta)

  const [resumen, setResumen] = useState<VentasResumen | null>(null)
  const [topProductos, setTopProductos] = useState<TopProducto[] | null>(null)
  const [ventasCategoria, setVentasCategoria] = useState<VentaCategoria[] | null>(null)
  const [metodosPago, setMetodosPago] = useState<MetodoPago[] | null>(null)
  const [pagos, setPagos] = useState<PagoDetalle[] | null>(null)
  const [mermasResumen, setMermasResumen] = useState<MermasResumen | null>(null)
  const [descuentos, setDescuentos] = useState<DescuentoRow[] | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCargando(true)
      const qs = `desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
      const [r, top, cat, met, pag, mermas, descs] = await Promise.all([
        safeJson<VentasResumen>(`/api/reportes/ventas?${qs}`, {
          total: 0,
          ordenes: 0,
          ticket_promedio: 0,
        }),
        safeJson<TopProducto[]>(`/api/reportes/top-productos?${qs}&limite=10`, []),
        safeJson<VentaCategoria[]>(`/api/reportes/ventas-categoria?${qs}`, []),
        safeJson<MetodoPago[]>(`/api/reportes/metodos-pago?${qs}`, []),
        safeJson<PagoDetalle[]>(
          desde === hasta && desde === format(new Date(), 'yyyy-MM-dd')
            ? '/api/pagos?fecha=hoy'
            : '/api/pagos',
          []
        ),
        safeJson<MermasResumen>(`/api/mermas/resumen?${qs}`, {
          total: { descuento: 0, perdida_estimada: 0, registros: 0 },
          por_tipo: [],
          top_productos: [],
          comandas_no_pagadas: [],
        }),
        safeJson<DescuentoRow[]>(`/api/descuentos?${qs}`, []),
      ])
      if (cancelado) return
      setResumen(r)
      setTopProductos(top)
      setVentasCategoria(cat)
      setMetodosPago(met)
      setPagos(pag)
      setMermasResumen(mermas)
      setDescuentos(descs)
      setCargando(false)
    })()
    return () => {
      cancelado = true
    }
  }, [desde, hasta])

  const cambiarPreset = (nuevo: PresetRango) => {
    setPreset(nuevo)
    if (nuevo === 'personalizado') return
    const rango = rangoDesdePreset(nuevo)
    setDesde(rango.desde)
    setHasta(rango.hasta)
  }

  const totalVentas = resumen?.total ?? 0
  const totalOrdenes = resumen?.ordenes ?? 0
  const ticketPromedio = resumen?.ticket_promedio ?? 0

  const metodosCompletos = useMemo<MetodoPago[]>(() => {
    const map = new Map<string, MetodoPago>()
    for (const m of metodosPago ?? []) map.set(m.metodo, m)
    return ['efectivo', 'tarjeta'].map(
      (m) => map.get(m) ?? { metodo: m, cantidad_transacciones: 0, total: 0 }
    )
  }, [metodosPago])

  const categoriaData = useMemo(
    () =>
      (ventasCategoria ?? []).map((c) => ({
        ...c,
        nombre: c.categoria
          .replace(/_/g, ' ')
          .replace(/(^|\s)\S/g, (t) => t.toUpperCase()),
      })),
    [ventasCategoria]
  )

  const exportarCSV = () => {
    if (!pagos || pagos.length === 0) return
    const filas: string[] = []
    filas.push(
      [
        'fecha',
        'orden_id',
        'pago_id',
        'productos',
        'metodo_pago',
        'total',
        'propina',
        'descuento',
      ]
        .map(csvEscape)
        .join(',')
    )

    const pagosFiltrados = pagos.filter((p) => {
      const fechaIso =
        typeof p.created_at === 'string'
          ? p.created_at.slice(0, 10)
          : typeof p.fecha === 'number'
            ? new Date(p.fecha).toISOString().slice(0, 10)
            : ''
      return fechaIso >= desde && fechaIso <= hasta
    })

    // Productos agregados por orden a partir del top-productos no aplica aquí;
    // como no tenemos endpoint por-orden, dejamos el campo "productos" vacío.
    for (const p of pagosFiltrados) {
      const fechaIso =
        typeof p.created_at === 'string'
          ? p.created_at
          : typeof p.fecha === 'number'
            ? new Date(p.fecha).toISOString()
            : ''
      filas.push(
        [
          fechaIso,
          p.orden_id,
          p.id,
          '',
          p.metodo,
          Number(p.monto) || 0,
          Number(p.propina) || 0,
          Number(p.descuento ?? 0) || 0,
        ]
          .map(csvEscape)
          .join(',')
      )
    }

    const blob = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `reporte_${desde}_${hasta}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const sinDatos = !cargando && totalVentas === 0 && totalOrdenes === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reportes y Estadísticas</h1>
        <Button onClick={exportarCSV} variant="outline" disabled={!pagos || pagos.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={preset} onValueChange={(v) => cambiarPreset(v as PresetRango)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoy">Hoy</SelectItem>
                  <SelectItem value="semana">Esta semana</SelectItem>
                  <SelectItem value="mes">Este mes</SelectItem>
                  <SelectItem value="personalizado">Rango personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input
                type="date"
                value={desde}
                onChange={(e) => {
                  setPreset('personalizado')
                  setDesde(e.target.value)
                }}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setPreset('personalizado')
                  setHasta(e.target.value)
                }}
                className="w-[180px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-amber-500" />}
          label="Ventas Totales"
          value={cargando ? null : formatCurrency(totalVentas)}
          sub="En el período seleccionado"
        />
        <KpiCard
          icon={<FileText className="h-5 w-5 text-blue-500" />}
          label="Órdenes Cobradas"
          value={cargando ? null : String(totalOrdenes)}
          sub="Pagos registrados"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
          label="Ticket Promedio"
          value={cargando ? null : formatCurrency(ticketPromedio)}
          sub="Por pago"
        />
      </div>

      {sinDatos && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Sin ventas en este período
          </CardContent>
        </Card>
      )}

      {!sinDatos && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top productos</CardTitle>
            </CardHeader>
            <CardContent>
              {cargando ? (
                <SkeletonList />
              ) : !topProductos || topProductos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin ventas en este período
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProductos.map((p, idx) => (
                      <TableRow key={p.producto_id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell className="capitalize">{p.categoria.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-right">{p.cantidad_vendida}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.total_generado)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                {cargando ? (
                  <SkeletonChart />
                ) : categoriaData.length === 0 ? (
                  <EmptyState mensaje="Sin ventas en este período" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoriaData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        type="number"
                        stroke="#9ca3af"
                        tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                      />
                      <YAxis dataKey="nombre" type="category" stroke="#9ca3af" width={120} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                        formatter={(value: number) => [formatCurrency(value), 'Total']}
                      />
                      <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                        {categoriaData.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Receipt className="h-5 w-5 text-amber-500" />
            <CardTitle>Métodos de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Transacciones</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metodosCompletos.map((m) => (
                  <TableRow key={m.metodo}>
                    <TableCell className="font-medium">
                      {ETIQUETAS_METODO[m.metodo] ?? m.metodo}
                    </TableCell>
                    <TableCell className="text-right">{m.cantidad_transacciones}</TableCell>
                    <TableCell className="text-right">{formatCurrency(m.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución por método</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {cargando ? (
                <SkeletonChart />
              ) : metodosCompletos.every((m) => m.total === 0) ? (
                <EmptyState mensaje="Sin pagos en este período" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metodosCompletos.filter((m) => m.total > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ metodo, percent }) =>
                        `${ETIQUETAS_METODO[metodo] ?? metodo} (${Math.round((percent || 0) * 100)}%)`
                      }
                      outerRadius={110}
                      dataKey="total"
                      nameKey="metodo"
                    >
                      {metodosCompletos
                        .filter((m) => m.total > 0)
                        .map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <CardTitle>Mermas y Pérdidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Pérdida estimada</p>
              {cargando ? (
                <div className="mt-1 h-7 w-32 animate-pulse rounded bg-muted" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(mermasResumen?.total.perdida_estimada ?? 0)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Cantidad x precio del producto</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Descuentos aplicados</p>
              {cargando ? (
                <div className="mt-1 h-7 w-32 animate-pulse rounded bg-muted" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(mermasResumen?.total.descuento ?? 0)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">A liquidaciones del personal</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Registros</p>
              {cargando ? (
                <div className="mt-1 h-7 w-32 animate-pulse rounded bg-muted" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  {mermasResumen?.total.registros ?? 0}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Mermas en el período</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Por tipo</h3>
              {!mermasResumen || mermasResumen.por_tipo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin mermas en este período</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Registros</TableHead>
                      <TableHead className="text-right">Pérdida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mermasResumen.por_tipo.map((t) => (
                      <TableRow key={t.tipo}>
                        <TableCell>{MERMA_TIPOS_LABEL[t.tipo] ?? t.tipo}</TableCell>
                        <TableCell className="text-right">{t.cantidad_registros}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(t.perdida_estimada)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                Top 5 productos más afectados
              </h3>
              {!mermasResumen || mermasResumen.top_productos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin productos afectados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Pérdida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mermasResumen.top_productos.map((p) => (
                      <TableRow key={p.producto_id}>
                        <TableCell>{p.producto_nombre || '—'}</TableCell>
                        <TableCell className="text-right">{p.unidades}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.perdida_estimada)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              Comandas no pagadas
            </h3>
            {!mermasResumen || mermasResumen.comandas_no_pagadas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin comandas no pagadas en el período</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mesa</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Registrado por</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mermasResumen.comandas_no_pagadas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.mesa_numero ? `Mesa ${c.mesa_numero}` : '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.monto)}</TableCell>
                      <TableCell>{c.registrado_por_nombre || '—'}</TableCell>
                      <TableCell>{MOTIVOS_CNP_LABEL[c.motivo] ?? c.motivo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descuentos aplicados</CardTitle>
          <CardDescription>
            Historial de descuentos del período {desde} → {hasta}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(() => {
            const list = descuentos ?? []
            const calcularMonto = (d: DescuentoRow): number => {
              switch (d.tipo) {
                case 'porcentaje':
                  return ((d.orden_total ?? 0) * (Number(d.valor) || 0)) / 100
                case 'monto_fijo':
                case 'cortesia_parcial':
                  return Number(d.valor) || 0
                case 'cortesia_total':
                  return Number(d.orden_total) || 0
                default:
                  return Number(d.valor) || 0
              }
            }
            const totalDescontado = list.reduce((s, d) => s + calcularMonto(d), 0)
            const ranking = new Map<string, { nombre: string; cantidad: number; monto: number }>()
            for (const d of list) {
              const nombre = d.aplicado_por_nombre || 'Desconocido'
              const cur = ranking.get(nombre) || { nombre, cantidad: 0, monto: 0 }
              cur.cantidad += 1
              cur.monto += calcularMonto(d)
              ranking.set(nombre, cur)
            }
            const rankingArr = Array.from(ranking.values()).sort((a, b) => b.monto - a.monto)

            return (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Total descontado</div>
                    <div className="mt-1 text-2xl font-bold text-foreground">
                      {formatCurrency(totalDescontado)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Descuentos aplicados</div>
                    <div className="mt-1 text-2xl font-bold text-foreground">{list.length}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Promedio por descuento</div>
                    <div className="mt-1 text-2xl font-bold text-foreground">
                      {formatCurrency(list.length > 0 ? totalDescontado / list.length : 0)}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                    Historial de descuentos
                  </h3>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin descuentos aplicados en el período
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Mesa</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead>Aplicado por</TableHead>
                          <TableHead>Autorizado por</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>
                              {d.created_at ? format(new Date(d.created_at), 'dd/MM HH:mm') : '—'}
                            </TableCell>
                            <TableCell>{d.mesa_numero ? `Mesa ${d.mesa_numero}` : '—'}</TableCell>
                            <TableCell>{DESCUENTO_TIPO_LABEL[d.tipo] ?? d.tipo}</TableCell>
                            <TableCell className="text-right">
                              {d.tipo === 'porcentaje'
                                ? `${Number(d.valor).toFixed(0)}%`
                                : d.tipo === 'cortesia_total'
                                  ? '100%'
                                  : formatCurrency(Number(d.valor) || 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              -{formatCurrency(calcularMonto(d))}
                            </TableCell>
                            <TableCell>{d.aplicado_por_nombre || '—'}</TableCell>
                            <TableCell>{d.autorizado_por_nombre || '—'}</TableCell>
                            <TableCell className="max-w-xs truncate" title={d.motivo}>
                              {d.motivo || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                    Ranking de quien aplica más descuentos
                  </h3>
                  {rankingArr.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos en el período</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Usuario</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Total descontado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankingArr.map((r, i) => (
                          <TableRow key={r.nombre}>
                            <TableCell className="font-mono">{i + 1}</TableCell>
                            <TableCell>{r.nombre}</TableCell>
                            <TableCell className="text-right">{r.cantidad}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.monto)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  sub: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {value === null ? (
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{mensaje}</p>
    </div>
  )
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </ul>
  )
}

function SkeletonChart() {
  return (
    <div className="flex h-full items-end gap-2 px-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t bg-muted"
          style={{ height: `${30 + ((i * 13) % 50)}%` }}
        />
      ))}
    </div>
  )
}
