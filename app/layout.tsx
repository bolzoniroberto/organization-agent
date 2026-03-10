import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HR Platform · Sole 24 Ore',
  description: 'Gestione organizzativa del Gruppo Il Sole 24 Ore'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body>{children}</body>
    </html>
  )
}
