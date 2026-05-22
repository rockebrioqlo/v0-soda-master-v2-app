'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatNumber } from '@/lib/helpers'
import {
  ShoppingCart,
  DollarSign,
  Users,
  TrendingUp,
  AlertTriangle,
  Package,
} from 'lucide-react'
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

interface VentasResumen {
  total: number
  ordenes: number
  ticket_promedio: number
}

interface VentasSemanaItem {
  fecha: string
  total: number
  ordenes: number
}

interface TopProducto {
  producto_id: string
  nombre: string
  categoria: string
  cantidad_vendida: number
  total_generado: number
}

interface OrdenReciente {
  id: string
  mesa_id: string | null
  estado: string
  total: number | string
  created_at: string
}

const DIAS_ABREV = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '0.5rem',
  color: '#f9fafb',
}
const TOOLTIP_LABEL_STYLE = { color: '#f9fafb', fontWeight: 600 }
const TOOLTIP_ITEM_STYLE = { color: '#f59e0b' }

async function safeJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch (err) {
    console.error('Dashboard fetch error', url, err)
    return fallback
  }
}

export function DashboardPage() {
  const { state } = useApp()
  const { mesas, productos } = state

  const [resumen, setResumen] = useState<VentasResumen | null>(null)
  const [topProductos, setTopProductos] = useState<TopProducto[] | null>(null)
  const [ventasSemana, setVentasSemana] = useState<VentasSemanaItem[] | null>(null)
  const [ordenesRecientes, setOrdenesRecientes] = useState<OrdenReciente[] | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCargando(true)
      const [resumenData, topData, semanaData, ordenesData] = await Promise.all([
        safeJson<VentasResumen>('/api/reportes/ventas?desde=hoy&hasta=hoy', {
          total: 0,
          ordenes: 0,
          ticket_promedio: 0,
        }),
        safeJson<TopProducto[]>(
          '/api/reportes/top-productos?desde=hoy&hasta=hoy&limite=5',
          []
        ),
        safeJson<VentasSemanaItem[]>('/api/reportes/ventas-semana', []),
        safeJson<OrdenReciente[]>('/api/ordenes?limite=5&orden=desc', []),
      ])
      if (cancelado) return
      setResumen(resumenData)
      setTopProductos(topData)
      setVentasSemana(semanaData)
      setOrdenesRecientes(ordenesData)
      setCargando(false)
    })()
    return () => {
      cancelado = true
    }
  }, [])

  const ventasHoy = resumen?.total ?? 0
  const ordenesHoy = resumen?.ordenes ?? 0
  const ticketPromedio = resumen?.ticket_promedio ?? 0

  const mesasOcupadas = mesas.filter((m) => m.estado === 'ocupada').length
  const productosStockBajo = productos.filter(
    (p) =>
      p.stock !== undefined &&
      p.stockMinimo !== undefined &&
      p.stock <= p.stockMinimo &&
      p.stock > 0
  )

  const ventasSemanaData = useMemo(() => {
    if (!ventasSemana) return []
    return ventasSemana.map((v) => {
      const [y, m, d] = v.fecha.split('-').map(Number)
      const date = new Date(y, (m || 1) - 1, d || 1)
      return {
        dia: DIAS_ABREV[date.getDay()] ?? v.fecha,
        fecha: v.fecha,
        ventas: v.total,
      }
    })
  }, [ventasSemana])

  const estadoMesas = useMemo(
    () => [
      {
        name: 'Libres',
        value: mesas.filter((m) => m.estado === 'libre').length,
        color: '#22c55e',
      },
      {
        name: 'Ocupadas',
        value: mesas.filter((m) => m.estado === 'ocupada').length,
        color: '#ef4444',
      },
      {
        name: 'Reservadas',
        value: mesas.filter((m) => m.estado === 'reservada').length,
        color: '#eab308',
      },
    ],
    [mesas]
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="h-6 w-6 text-amber-500" />}
          tone="bg-amber-500/20"
          label="Ventas Hoy"
          value={cargando ? null : formatCurrency(ventasHoy)}
        />
        <KpiCard
          icon={<ShoppingCart className="h-6 w-6 text-blue-500" />}
          tone="bg-blue-500/20"
          label="Órdenes Hoy"
          value={cargando ? null : String(ordenesHoy)}
        />
        <KpiCard
          icon={<TrendingUp className="h-6 w-6 text-green-500" />}
          tone="bg-green-500/20"
          label="Ticket Promedio"
          value={cargando ? null : formatCurrency(ticketPromedio)}
        />
        <KpiCard
          icon={<Users className="h-6 w-6 text-purple-500" />}
          tone="bg-purple-500/20"
          label="Mesas Ocupadas"
          value={`${mesasOcupadas} / ${mesas.length}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Ventas de la Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {cargando ? (
                <SkeletonChart />
              ) : ventasSemanaData.length === 0 ? (
                <EmptyState mensaje="Sin datos de ventas" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventasSemanaData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="dia" stroke="#9ca3af" />
                    <YAxis
                      stroke="#9ca3af"
                      tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      formatter={(value: number) => [formatCurrency(value), 'Ventas']}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as { fecha?: string } | undefined
                        return p?.fecha ?? ''
                      }}
                    />
                    <Bar dataKey="ventas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Top 5 Productos (Hoy)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="min-h-[16rem]">
              {cargando ? (
                <SkeletonList />
              ) : !topProductos || topProductos.length === 0 ? (
                <EmptyState mensaje="Sin ventas hoy" />
              ) : (
                <ul className="space-y-2">
                  {topProductos.map((p, idx) => (
                    <li
                      key={p.producto_id}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-sm font-semibold text-amber-500">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {p.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">{p.categoria}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {p.cantidad_vendida} u.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(p.total_generado)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Estado de Mesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {mesas.length === 0 ? (
                <EmptyState mensaje="Sin mesas registradas" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={estadoMesas}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, value, x, y, textAnchor }) => (
                        <text
                          x={x}
                          y={y}
                          fill="#4b5563"
                          fontSize={12}
                          textAnchor={textAnchor}
                          dominantBaseline="central"
                        >
                          {`${name}: ${value}`}
                        </text>
                      )}
                    >
                      {estadoMesas.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            <CardTitle className="text-foreground">Stock Bajo</CardTitle>
          </CardHeader>
          <CardContent>
            {productosStockBajo.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay productos con stock bajo</p>
            ) : (
              <ul className="space-y-2">
                {productosStockBajo.slice(0, 5).map((producto) => (
                  <li
                    key={producto.id}
                    className="flex items-center justify-between rounded-lg bg-orange-500/10 p-2"
                  >
                    <span className="text-sm text-foreground">{producto.nombre}</span>
                    <span className="text-sm font-medium text-orange-500">
                      {formatNumber(producto.stock)} / {formatNumber(producto.stockMinimo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-foreground">Órdenes Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <SkeletonList small />
            ) : !ordenesRecientes || ordenesRecientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin órdenes recientes</p>
            ) : (
              <ul className="space-y-2">
                {ordenesRecientes.map((o) => {
                  const mesa = mesas.find((m) => m.id === o.mesa_id)
                  const total = Number(o.total) || 0
                  return (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {mesa?.nombre || 'Mesa —'}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{o.estado}</p>
                      </div>
                      <span className="text-sm font-semibold text-amber-500">
                        {formatCurrency(total)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode
  tone: string
  label: string
  value: string | null
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-lg ${tone} p-3 shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          {value === null ? (
            <div className="h-7 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-xl lg:text-2xl font-bold text-foreground truncate">{value}</p>
          )}
        </div>
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

function SkeletonList({ small = false }: { small?: boolean }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: small ? 3 : 5 }).map((_, i) => (
        <li key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </ul>
  )
}
