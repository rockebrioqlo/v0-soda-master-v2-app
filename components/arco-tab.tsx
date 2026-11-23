'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Download, Plus, RefreshCw, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/components/toast'

/**
 * Derechos ARCOP (sesión 18, K1). Solo admin. Ingresar una solicitud (acceso, rectificación, supresión, oposición o
 * portabilidad), ver cuántos días le quedan (30 días corridos; una sola prórroga de 30 más), exportar los datos del titular,
 * prorrogar, resolver y anonimizar. La respuesta al titular es un BORRADOR para revisión legal que el administrador copia.
 * Nada de lo que se muestra se guarda como valor en la auditoría: solo nombres de campo.
 */

interface Solicitud {
  id: string
  tipo: string
  titular_tipo: 'usuario' | 'empleado' | 'proveedor'
  titular_id: string
  titular_nombre: string | null
  canal: string
  estado: 'pendiente' | 'resuelta' | 'rechazada'
  ingresada_en: string
  vence_en: string
  dias_restantes: number
  prorrogada: boolean
  motivo_prorroga: string | null
  resolucion: string | null
  resultado: { anonimizado?: string[]; conservado?: string[] } | null
  respuesta_sugerida?: string | null
}

const TIPOS: Array<{ valor: string; etiqueta: string }> = [
  { valor: 'acceso', etiqueta: 'Acceso' },
  { valor: 'rectificacion', etiqueta: 'Rectificación' },
  { valor: 'supresion', etiqueta: 'Supresión' },
  { valor: 'oposicion', etiqueta: 'Oposición' },
  { valor: 'portabilidad', etiqueta: 'Portabilidad' },
]
const TITULARES = [
  { valor: 'empleado', etiqueta: 'Empleado' },
  { valor: 'proveedor', etiqueta: 'Proveedor (persona natural)' },
  { valor: 'usuario', etiqueta: 'Usuario' },
]
const CANALES = [
  { valor: 'presencial', etiqueta: 'Presencial' },
  { valor: 'correo', etiqueta: 'Correo' },
  { valor: 'formulario', etiqueta: 'Formulario' },
  { valor: 'telefono', etiqueta: 'Teléfono' },
  { valor: 'otro', etiqueta: 'Otro' },
]
const TODOS = 'todos'

const etiquetaTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.etiqueta ?? t

/** AAAA-MM-DD (o fecha ISO) → dd-mm-aaaa. */
function fechaChile(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return a && m && d ? `${d}-${m}-${a}` : '—'
}

async function leerError(res: Response, defecto: string): Promise<string> {
  const data = await res.json().catch(() => null)
  return data?.error || defecto
}

function plazo(s: Solicitud) {
  if (s.estado !== 'pendiente') return { texto: '—', clase: 'text-muted-foreground' }
  if (s.dias_restantes < 0) return { texto: `Vencida hace ${-s.dias_restantes} d`, clase: 'font-medium text-destructive' }
  if (s.dias_restantes <= 5) return { texto: `${s.dias_restantes} d`, clase: 'font-medium text-amber-600' }
  return { texto: `${s.dias_restantes} d`, clase: '' }
}

export function ArcoTab() {
  const [items, setItems] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(false)
  const [estado, setEstado] = useState(TODOS)
  const [nueva, setNueva] = useState(false)
  const [abierta, setAbierta] = useState<Solicitud | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (estado !== TODOS) qs.set('estado', estado)
      qs.set('limite', '200')
      const res = await fetch(`/api/arco/solicitudes?${qs.toString()}`)
      if (!res.ok) {
        showToast(await leerError(res, 'Error al cargar las solicitudes'), 'error')
        return
      }
      setItems(await res.json())
    } catch {
      showToast('Error al cargar las solicitudes', 'error')
    } finally {
      setLoading(false)
    }
  }, [estado])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrir = async (id: string) => {
    const res = await fetch(`/api/arco/solicitudes/${id}`)
    if (!res.ok) {
      showToast(await leerError(res, 'No se pudo abrir la solicitud'), 'error')
      return
    }
    setAbierta(await res.json())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Derechos ARCOP</CardTitle>
        <CardDescription>
          Solicitudes de acceso, rectificación, supresión, oposición y portabilidad de datos personales. Plazo de respuesta: 30 días
          corridos desde el ingreso, prorrogables una sola vez por 30 más con motivo. Los textos de respuesta son borradores para
          revisión legal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="arco-estado">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger id="arco-estado" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="resuelta">Resueltas</SelectItem>
                <SelectItem value="rechazada">Rechazadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={cargar} disabled={loading} className="border-border">
            <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Actualizar
          </Button>
          <Button onClick={() => setNueva(true)} className="ml-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nueva solicitud
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingreso</TableHead>
                <TableHead>Derecho</TableHead>
                <TableHead>Titular</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Plazo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    {loading ? 'Cargando…' : 'Sin solicitudes'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((s) => {
                  const p = plazo(s)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap text-sm">{fechaChile(s.ingresada_en)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{etiquetaTipo(s.tipo)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{s.titular_tipo} · </span>
                        {s.titular_nombre ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.estado === 'pendiente' ? 'default' : 'secondary'}>{s.estado}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fechaChile(s.vence_en)}
                        {s.prorrogada ? <span className="text-xs text-muted-foreground"> (prorrogada)</span> : null}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap text-sm ${p.clase}`}>{p.texto}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="border-border" onClick={() => abrir(s.id)}>
                          {s.estado === 'pendiente' ? 'Gestionar' : 'Ver'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <NuevaSolicitud abierto={nueva} onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); void cargar() }} />
      {abierta && (
        <GestionSolicitud
          solicitud={abierta}
          onCerrar={() => setAbierta(null)}
          onCambio={async (id) => {
            await cargar()
            await abrir(id)
          }}
        />
      )}
    </Card>
  )
}

// ───────────────────────── nueva solicitud ─────────────────────────

function NuevaSolicitud({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: () => void }) {
  const [tipo, setTipo] = useState('acceso')
  const [titularTipo, setTitularTipo] = useState('empleado')
  const [titularId, setTitularId] = useState('')
  const [canal, setCanal] = useState('presencial')
  const [opciones, setOpciones] = useState<Array<{ id: string; nombre: string }>>([])
  const [enviando, setEnviando] = useState(false)

  // el titular se elige de la lista que el sistema ya tiene (vista básica: solo id y nombre)
  useEffect(() => {
    if (!abierto) return
    let vivo = true
    setTitularId('')
    setOpciones([])
    const url =
      titularTipo === 'usuario'
        ? '/api/usuarios'
        : titularTipo === 'empleado'
          ? '/api/empleados?vista=basica&incluir_inactivos=true'
          : '/api/proveedores?vista=basica&incluir_inactivos=true'
    void fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((filas: Array<{ id: string; nombre: string }>) => {
        if (vivo) setOpciones(filas.map((f) => ({ id: f.id, nombre: f.nombre })))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [abierto, titularTipo])

  const enviar = async () => {
    if (!titularId) {
      showToast('Elige el titular', 'error')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/arco/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, titular_tipo: titularTipo, titular_id: titularId, canal }),
      })
      if (!res.ok) {
        showToast(await leerError(res, 'No se pudo ingresar la solicitud'), 'error')
        return
      }
      showToast('Solicitud ingresada', 'success')
      onCreada()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva solicitud ARCOP</DialogTitle>
          <DialogDescription>El plazo (30 días corridos) y quién la ingresó los fija el sistema.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="arco-derecho">Derecho</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger id="arco-derecho"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="arco-tipo-de-titular">Tipo de titular</Label>
            <Select value={titularTipo} onValueChange={setTitularTipo}>
              <SelectTrigger id="arco-tipo-de-titular"><SelectValue /></SelectTrigger>
              <SelectContent>{TITULARES.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="arco-titular">Titular</Label>
            <Select value={titularId} onValueChange={setTitularId}>
              <SelectTrigger id="arco-titular"><SelectValue placeholder="Elige a la persona" /></SelectTrigger>
              <SelectContent>
                {opciones.map((o) => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="arco-canal-por-el-que">Canal por el que llegó</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger id="arco-canal-por-el-que"><SelectValue /></SelectTrigger>
              <SelectContent>{CANALES.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.etiqueta}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} className="border-border">Cancelar</Button>
          <Button onClick={enviar} disabled={enviando}>Ingresar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────── gestionar una solicitud ─────────────────────────

function GestionSolicitud({ solicitud, onCerrar, onCambio }: { solicitud: Solicitud; onCerrar: () => void; onCambio: (id: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [personaNatural, setPersonaNatural] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const pendiente = solicitud.estado === 'pendiente'
  const exportable = solicitud.tipo === 'acceso' || solicitud.tipo === 'portabilidad'
  const vencida = solicitud.dias_restantes < 0
  const textoSugerido = useMemo(() => solicitud.respuesta_sugerida ?? '', [solicitud.respuesta_sugerida])

  const llamar = async (url: string, metodo: 'POST', cuerpo: unknown, ok: string) => {
    setOcupado(true)
    try {
      const res = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      if (!res.ok) {
        showToast(await leerError(res, 'No se pudo completar la acción'), 'error')
        return false
      }
      showToast(ok, 'success')
      await onCambio(solicitud.id)
      return true
    } finally {
      setOcupado(false)
    }
  }

  const exportar = async () => {
    setOcupado(true)
    try {
      const res = await fetch(`/api/arco/solicitudes/${solicitud.id}/exportar`)
      if (!res.ok) {
        showToast(await leerError(res, 'No se pudo exportar'), 'error')
        return
      }
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `solicitud-${solicitud.tipo}-${solicitud.id.slice(0, 8)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('Exportación descargada (queda registrada en la auditoría)', 'success')
    } finally {
      setOcupado(false)
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoSugerido)
      showToast('Texto copiado', 'success')
    } catch {
      showToast('No se pudo copiar', 'error')
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onCerrar()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {etiquetaTipo(solicitud.tipo)} · {solicitud.titular_nombre ?? '—'}
            </DialogTitle>
            <DialogDescription>
              {solicitud.titular_tipo} · ingresada el {fechaChile(solicitud.ingresada_en)} por {solicitud.canal} · vence el{' '}
              {fechaChile(solicitud.vence_en)}
              {solicitud.prorrogada ? ' (prorrogada una vez)' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={pendiente ? 'default' : 'secondary'}>{solicitud.estado}</Badge>
              {pendiente && vencida && <Badge variant="destructive">Vencida</Badge>}
            </div>

            {solicitud.prorrogada && solicitud.motivo_prorroga && (
              <p className="text-muted-foreground">Motivo de la prórroga: {solicitud.motivo_prorroga}</p>
            )}

            {solicitud.resultado && (
              <div className="space-y-1 rounded-md border border-border p-3">
                <p className="font-medium">Resultado</p>
                {solicitud.resultado.anonimizado && solicitud.resultado.anonimizado.length > 0 && (
                  <p>Anonimizado: {solicitud.resultado.anonimizado.join(', ')}</p>
                )}
                {solicitud.resultado.conservado && solicitud.resultado.conservado.length > 0 ? (
                  <p>Conservado por obligación: {solicitud.resultado.conservado.join(', ')}</p>
                ) : (
                  <p>No quedan datos que deban conservarse por obligación legal.</p>
                )}
              </div>
            )}

            {solicitud.resolucion && (
              <div className="space-y-1">
                <p className="font-medium">Respuesta registrada</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{solicitud.resolucion}</p>
              </div>
            )}

            {textoSugerido && (
              <div className="space-y-2">
                <p className="font-medium">Texto sugerido para el titular (borrador, revisión legal)</p>
                <Textarea aria-label="Texto sugerido para el titular" readOnly value={textoSugerido} rows={7} />
                <Button size="sm" variant="outline" className="border-border" onClick={copiar}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />
                  Copiar
                </Button>
              </div>
            )}

            {pendiente && (
              <div className="space-y-4 border-t border-border pt-4">
                {exportable && (
                  <div>
                    <Button variant="outline" className="border-border" onClick={exportar} disabled={ocupado}>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar datos del titular (JSON)
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {solicitud.tipo === 'portabilidad'
                        ? 'Portabilidad: solo la ficha que el titular entregó.'
                        : 'Acceso: la ficha y los registros donde figura.'}{' '}
                      Los nombres de comensales de las cuentas por persona no se pueden asociar con certeza a una persona. Cada
                      exportación queda en la auditoría.
                    </p>
                  </div>
                )}

                {!solicitud.prorrogada && !vencida && (
                  <div className="space-y-2">
                    <Label htmlFor="arco-motivo">Prórroga única de 30 días (motivo, mínimo 10 caracteres)</Label>
                    <Textarea id="arco-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                    <Button
                      variant="outline"
                      className="border-border"
                      disabled={ocupado || motivo.trim().length < 10}
                      onClick={async () => {
                        if (await llamar(`/api/arco/solicitudes/${solicitud.id}/prorroga`, 'POST', { motivo }, 'Solicitud prorrogada')) setMotivo('')
                      }}
                    >
                      Prorrogar 30 días
                    </Button>
                  </div>
                )}

                {solicitud.tipo === 'supresion' && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="flex items-center gap-2 font-medium">
                      <ShieldAlert className="h-4 w-4" />
                      Anonimizar al titular
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Se anonimiza su ficha, su nombre copiado en pagos, caja, pérdidas, permisos y auditoría, y su nombre dentro de
                      notas conocidas, todo en una sola operación. Lo que debe conservarse por obligación (respaldo tributario de 6
                      años; sueldo y fechas laborales hasta que el contador confirme) no se borra y la respuesta lo dice. Las
                      copias de seguridad de Neon conservan el dato dentro de su ventana.
                    </p>
                    {solicitud.titular_tipo === 'proveedor' && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={personaNatural} onCheckedChange={(v) => setPersonaNatural(v === true)} />
                        El proveedor es una persona natural (una empresa no es titular de datos personales)
                      </label>
                    )}
                    <Button
                      variant="destructive"
                      disabled={ocupado || (solicitud.titular_tipo === 'proveedor' && !personaNatural)}
                      onClick={() => setConfirmar(true)}
                    >
                      Anonimizar
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="arco-respuesta">
                    {solicitud.tipo === 'supresion' ? 'Rechazar la solicitud (motivo para el titular)' : 'Respuesta al titular (mínimo 10 caracteres)'}
                  </Label>
                  <Textarea id="arco-respuesta" rows={3} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {solicitud.tipo !== 'supresion' && (
                      <Button
                        disabled={ocupado || respuesta.trim().length < 10}
                        onClick={() => llamar(`/api/arco/solicitudes/${solicitud.id}/resolver`, 'POST', { resultado: 'atendida', respuesta }, 'Solicitud resuelta')}
                      >
                        Dar por atendida
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="border-border"
                      disabled={ocupado || respuesta.trim().length < 10}
                      onClick={() => llamar(`/api/arco/solicitudes/${solicitud.id}/resolver`, 'POST', { resultado: 'rechazada', respuesta }, 'Solicitud rechazada')}
                    >
                      Rechazar
                    </Button>
                  </div>
                  {solicitud.tipo === 'rectificacion' && (
                    <p className="text-xs text-muted-foreground">
                      Para rectificar, edite al empleado o proveedor (vaciar un campo ya funciona) y luego dé por atendida la solicitud.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Anonimizar a {solicitud.titular_nombre ?? 'este titular'}?</DialogTitle>
            <DialogDescription>
              No se puede deshacer desde el sistema. Se conserva lo que deba guardarse por obligación legal. Esta acción queda en la
              auditoría (sin valores).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={ocupado}
              onClick={async () => {
                setConfirmar(false)
                await llamar(
                  `/api/arco/solicitudes/${solicitud.id}/suprimir`,
                  'POST',
                  solicitud.titular_tipo === 'proveedor' ? { es_persona_natural: personaNatural } : {},
                  'Titular anonimizado',
                )
              }}
            >
              Anonimizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
