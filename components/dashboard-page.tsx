'use client'

import { useApp } from '@/lib/app-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatNumber } from '@/lib/helpers'
import {
  ShoppingCart,
  DollarSign,
  Users,
  TrendingUp,
  AlertTriangle,
  Package
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
  Cell
} from 'recharts'

export function DashboardPage() {
  const { state } = useApp()
  const { comandas, pagos, mesas, productos, mermas } = state

  // Calculate metrics
  const comandasHoy = comandas.filter(c => {
    const today = new Date()
    const comandaDate = new Date(c.creadoAt)
    return comandaDate.toDateString() === today.toDateString()
  })

  const ventasHoy = pagos.filter(p => {
    const today = new Date()
    const pagoDate = new Date(p.fecha)
    return pagoDate.toDateString() === today.toDateString()
  }).reduce((sum, p) => sum + p.total, 0)

  const mesasOcupadas = mesas.filter(m => m.estado === 'ocupada').length
  const productosStockBajo = productos.filter(p => p.stock <= p.stockMinimo && p.stock > 0)
  const ticketPromedio = comandasHoy.length > 0 ? ventasHoy / comandasHoy.length : 0
  const mermasHoy = mermas.filter(m => {
    const today = new Date()
    const mermaDate = new Date(m.fecha)
    return mermaDate.toDateString() === today.toDateString()
  }).length

  // Chart data - Sales by category
  const ventasPorCategoria = [
    { name: 'Burgers', ventas: 45000 },
    { name: 'Entradas', ventas: 22000 },
    { name: 'Bebidas', ventas: 18000 },
    { name: 'Postres', ventas: 12000 },
    { name: 'Acomp.', ventas: 8000 },
  ]

  // Pie chart data - Mesa status
  const estadoMesas = [
    { name: 'Libres', value: mesas.filter(m => m.estado === 'libre' || m.estado === 'disponible').length, color: '#22c55e' },
    { name: 'Ocupadas', value: mesas.filter(m => m.estado === 'ocupada').length, color: '#ef4444' },
    { name: 'Reservadas', value: mesas.filter(m => m.estado === 'reservada').length, color: '#eab308' },
  ]

  // Weekly sales mock data
  const ventasSemana = [
    { dia: 'Lun', ventas: 120000 },
    { dia: 'Mar', ventas: 98000 },
    { dia: 'Mie', ventas: 145000 },
    { dia: 'Jue', ventas: 132000 },
    { dia: 'Vie', ventas: 189000 },
    { dia: 'Sab', ventas: 245000 },
    { dia: 'Dom', ventas: 198000 },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-amber-500/20 p-3 shrink-0">
              <DollarSign className="h-6 w-6 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Ventas Hoy</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground truncate">{formatCurrency(ventasHoy || 150000)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-blue-500/20 p-3 shrink-0">
              <ShoppingCart className="h-6 w-6 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Comandas Hoy</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground">{comandasHoy.length || 24}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-green-500/20 p-3 shrink-0">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Ticket Promedio</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground truncate">{formatCurrency(ticketPromedio || 6250)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-lg bg-purple-500/20 p-3 shrink-0">
              <Users className="h-6 w-6 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Mesas Ocupadas</p>
              <p className="text-xl lg:text-2xl font-bold text-foreground">{mesasOcupadas} / {mesas.length || 20}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly Sales Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Ventas de la Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ventasSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="dia" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                    formatter={(value: number) => [formatCurrency(value), 'Ventas']}
                  />
                  <Bar dataKey="ventas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Sales by Category */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Ventas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ventasPorCategoria} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" tickFormatter={(v) => `$${v/1000}k`} />
                  <YAxis dataKey="name" type="category" stroke="#9ca3af" width={70} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                    formatter={(value: number) => [formatCurrency(value), 'Ventas']}
                  />
                  <Bar dataKey="ventas" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Mesa Status */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Estado de Mesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={estadoMesas}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {estadoMesas.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
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
                  <li key={producto.id} className="flex items-center justify-between rounded-lg bg-orange-500/10 p-2">
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

        {/* Recent Activity */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-foreground">Alertas Hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">{mermasHoy} mermas registradas</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">{productosStockBajo.length} productos con stock bajo</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">{comandasHoy.filter(c => c.estado === 'pagada').length || 18} comandas pagadas</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
