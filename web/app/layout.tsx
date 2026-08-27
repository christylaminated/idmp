import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IDMP — From a sentence to a live, queryable database',
  description:
    'IDMP turns a natural-language description or a CSV file into a validated schema and a deployed, queryable database, with no manual step in between.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
