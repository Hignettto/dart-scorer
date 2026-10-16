// Small shared pieces of screen layout.

export function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="header">
      {onBack && (
        <button className="back" onClick={onBack} aria-label="Back">
          ‹
        </button>
      )}
      <h1>{title}</h1>
    </header>
  )
}
