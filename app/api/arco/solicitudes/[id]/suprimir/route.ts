import { db } from '@/lib/db'
import { actorDe, requireAcceso } from '@/lib/sesion'
import { SuprimirSchema, conRespuestaSugerida, respuestaErrorArco } from '@/lib/arco-http'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'

/**
 * Atiende una solicitud de supresión anonimizando al titular (solo admin), en UNA operación atómica (`lib/arco-sql.ts`):
 * si una guarda da 409 (uno mismo, último admin, ya anonimizado, ya resuelta) no cambia nada. Lo que debe conservarse por
 * obligación (tributaria a 6 años, sueldo y fechas laborales) NO se borra: la respuesta lo dice con su fundamento y avisa que
 * los respaldos de Neon conservan el dato dentro de su ventana. Un proveedor exige `es_persona_natural: true`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const parsed = await leerBody(request, SuprimirSchema, 'Supresión')
    if (!parsed.ok) return parsed.respuesta
    const r = await db.suprimirTitularArco(p.datos.id, actorDe(s.usuario), { esPersonaNatural: parsed.datos.es_persona_natural })
    const solicitud = conRespuestaSugerida(r.solicitud)
    return Response.json({ solicitud, resultado: r.resultado, respuesta_sugerida: solicitud.respuesta_sugerida })
  } catch (error) {
    const resp = respuestaErrorArco(error)
    if (resp) return resp
    console.error('POST arco/solicitudes/[id]/suprimir error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
