'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { showToast } from '@/components/toast'

/**
 * Auditoría de accesos y cambios (sesión 17, K1). Solo admin: lee `GET /api/auditoria`. Los accesos a datos
 * personales traen únicamente nombres de campo (los que cambiaron) y cantidades en `detalles`, nunca valores.
 */

interface Entrada {
  id: string
  usuario_nombre: string | null
  usuario_rol: string | null
  accion: string
  entidad: string
  entidad_nombre: string | null
  detalles: unknown
  created_at: string
}

const TODOS = 'todos'

const ACCIONES: Array<{ valor: string; etiqueta: string }> = [
  { valor: 'ver_datos_personales', etiqueta: 'Ver datos personales' },
  { valor: 'crear', etiqueta: 'Crear' },
  { valor: 'modificar', etiqueta: 'Modificar' },
  { valor: 'desactivar', etiqueta: 'Desactivar' },
  { valor: 'eliminar', etiqueta: 'Eliminar' },
]

const ENTIDADES: Array<{ valor: string; etiqueta: string }> = [
  { valor: 'empleado', etiqueta: 'Empleado' },
  { valor: 'proveedor', etiqueta: 'Proveedor' },
  { valor: 'usuario', etiqueta: 'Usuario' },
]

function fechaHora(valor: string): string {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d
    .toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '')
}

function resumenDetalles(d: unknown): string {
  if (d === null || d === undefined) return '—'
  if (typeof d !== 'object' || Array.isArray(d)) return String(d).slice(0, 120)
  const o = d as Record<string, unknown>
  const partes: string[] = []
  if (Array.isArray(o.campos)) partes.push(`Campos: ${o.campos.join(', ') || '—'}`)
  if (typeof o.filas === 'number') partes.push(`${o.filas} fila${o.filas === 1 ? '' : 's'}`)
  if (o.vista === 'detalle' && partes.length === 0) partes.push('Detalle abierto')
  if (partes.length > 0) return partes.join(' · ')
  // Entradas anteriores (órdenes, pérdidas, productos…): ids, montos y motivos, sin datos personales.
  const texto = JSON.stringify(d)
  return texto.length > 120 ? `${texto.slice(0, 117)}…` : texto
}

export function AuditoriaTab() {
  const [items, setItems] = useState<Entrada[]>([])
  const [loading, setLoading] = useState(false)
  const [entidad, setEntidad] = useState(TODOS)
  const [accion, setAccion] = useState(TODOS)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (entidad !== TODOS) qs.set('entidad', entidad)
      if (accion !== TODOS) qs.set('accion', accion)
      if (desde) qs.set('desde', desde)
      if (hasta) qs.set('hasta', hasta)
      qs.set('limite', '200')
      const res = await fetch(`/api/auditoria?${qs.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        showToast(data?.error || 'Error al cargar la auditoría', 'error')
        return
      }
      setItems(await res.json())
    } catch {
      showToast('Error al cargar la auditoría', 'error')
    } finally {
      setLoading(false)
    }
  }, [entidad, accion, desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoría de accesos y cambios</CardTitle>
        <CardDescription>
          Quién vio o cambió datos de empleados, proveedores y usuarios. Solo se guardan los nombres de los campos que
          cambiaron, nunca sus valores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label>Entidad</Label>
            <Select value={entidad} onValueChange={setEntidad}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {ENTIDADES.map((e) => (
                  <SelectItem key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Acción</Label>
            <Select value={accion} onValueChange={setAccion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {ACCIONES.map((a) => (
                  <SelectItem key={a.valor} value={a.valor}>
                    {a.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="aud-desde">Desde</Label>
            <Input id="aud-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="aud-hasta">Hasta</Label>
            <Input id="aud-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={cargar} disabled={loading} className="w-full border-border">
              <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
              Actualizar
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    {loading ? 'Cargando…' : 'Sin entradas para este filtro'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">{fechaHora(e.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {e.usuario_nombre || '—'}
                      {e.usuario_rol ? <span className="text-muted-foreground"> ({e.usuario_rol})</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ACCIONES.find((a) => a.valor === e.accion)?.etiqueta ?? e.accion}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.entidad}
                      {e.entidad_nombre ? <span className="text-muted-foreground"> · {e.entidad_nombre}</span> : null}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={resumenDetalles(e.detalles)}>
                      {resumenDetalles(e.detalles)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Se muestran las últimas {items.length} entradas (máximo 200).</p>
      </CardContent>
    </Card>
  )
}
