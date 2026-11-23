'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AVISO_ESTADO,
  AVISO_FECHA,
  AVISO_MENU_CL,
  AVISO_VERSION,
  avisoPara,
  etiquetaVersion,
  type AvisoPrivacidad as TextoAviso,
  type PaisAviso,
  type SeccionAviso,
} from '@/lib/aviso-privacidad'

/**
 * Aviso de privacidad (sesión 19, K1): un enlace con la versión y la fecha que abre el texto en un diálogo.
 * Todo el texto vive en `lib/aviso-privacidad.ts`; aquí solo se dibuja.
 *
 * - `variante="login"`: frase corta y el enlace, para ponerlo bajo la tarjeta del login.
 * - `variante="menu"`: solo el enlace (para el pie de /menu) y la versión corta del aviso (ahí no se pide ningún dato).
 * - `pais`: hoy solo "CL" se muestra; México queda en el módulo para la sesión 27 (país por local).
 */
export function AvisoPrivacidad({
  variante = 'login',
  pais = 'CL',
  className = '',
}: {
  variante?: 'login' | 'menu'
  pais?: PaisAviso
  className?: string
}) {
  const texto: TextoAviso = variante === 'menu' && pais === 'CL' ? AVISO_MENU_CL : avisoPara(pais)

  return (
    <div className={className} data-testid="aviso-privacidad" data-aviso-version={AVISO_VERSION} data-aviso-fecha={AVISO_FECHA}>
      {variante === 'login' && <p className="mb-1">Tratamos tus datos según nuestro aviso de privacidad.</p>}
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            data-testid="aviso-privacidad-enlace"
            className="rounded-sm underline underline-offset-2 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Aviso de privacidad · {etiquetaVersion()}
          </button>
        </DialogTrigger>
        <DialogContent
          data-testid="aviso-privacidad-dialogo"
          className="border-zinc-700 bg-zinc-900 text-zinc-100 md:max-h-[85vh] md:max-w-2xl md:overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="pr-6 text-amber-500">{texto.titulo}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Versión {AVISO_VERSION} · {AVISO_FECHA} · {AVISO_ESTADO}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm leading-relaxed text-zinc-300">
            <p className="text-xs text-zinc-400">
              {texto.ley}. Autoridad: {texto.autoridad}.
            </p>
            {texto.secciones.map((s) => (
              <Seccion key={s.id} seccion={s} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Seccion({ seccion }: { seccion: SeccionAviso }) {
  return (
    <section data-seccion={seccion.id} className="space-y-2">
      <h3 className="text-base font-semibold text-zinc-50">{seccion.titulo}</h3>
      {seccion.items && (
        <ul className="list-disc space-y-1 pl-5">
          {seccion.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}
      {seccion.tabla && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-1 pr-3 font-medium">{seccion.tabla.cabecera[0]}</th>
                <th className="py-1 font-medium">{seccion.tabla.cabecera[1]}</th>
              </tr>
            </thead>
            <tbody>
              {seccion.tabla.filas.map(([a, b]) => (
                <tr key={a} className="border-b border-zinc-800 align-top">
                  <td className="py-1.5 pr-3">{a}</td>
                  <td className="py-1.5">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {seccion.parrafos?.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </section>
  )
}
