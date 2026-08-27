/** Inline SVG so nothing depends on an icon font or an emoji rendering. */
type P = { className?: string }

export const Sparkle = ({ className = 'w-4 h-4' }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.9 5.9L20 10l-6.1 2.1L12 18l-1.9-5.9L4 10l6.1-2.1z" />
    <path d="M18.5 14.5l.9 2.7 2.6.9-2.6.9-.9 2.7-.9-2.7-2.6-.9 2.6-.9z" opacity=".6" />
  </svg>
)

export const Arrow = ({ className = 'w-4 h-4' }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Check = ({ className = 'w-4 h-4' }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Upload = ({ className = 'w-8 h-8' }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M14 3v4a1 1 0 001 1h4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 8v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h7z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 17v-6M9.5 13.5L12 11l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Spinner = ({ className = 'w-4 h-4' }: P) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

export const Warning = ({ className = 'w-4 h-4' }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    <path d="M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinejoin="round" />
  </svg>
)

export const Database = ({ className = 'w-4 h-4' }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
)
