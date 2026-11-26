export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M11 6h6L9 26H3z" fill="#7B79E8" />
      <path d="M22 6h7l-9 20h-7z" fill="#4B48C9" />
    </svg>
  );
}

export function WindowsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <rect x="1" y="1" width="8.5" height="8.5" rx="1" fill="#1f6fd1" />
      <rect x="10.5" y="1" width="8.5" height="8.5" rx="1" fill="#1f6fd1" />
      <rect x="1" y="10.5" width="8.5" height="8.5" rx="1" fill="#1f6fd1" />
      <rect x="10.5" y="10.5" width="8.5" height="8.5" rx="1" fill="#1f6fd1" />
    </svg>
  );
}
