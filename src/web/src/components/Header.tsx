export function Header() {
  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold tracking-tight">Standin</span>
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            아바타가 먼저 회의합니다
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
        >
          <span aria-hidden="true">✦</span> AI 생성 결과 — 검토 후 사용하세요
        </span>
      </div>
    </header>
  );
}
