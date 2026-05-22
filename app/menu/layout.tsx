import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Menú — Soda Master',
  description: 'Consulta nuestro menú',
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-zinc-950 text-zinc-100">{children}</div>
}
