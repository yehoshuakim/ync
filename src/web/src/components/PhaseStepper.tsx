import type { Phase } from '../types';

const STEPS: { key: Exclude<Phase, 'error'>; label: string }[] = [
  { key: 'received', label: '접수' },
  { key: 'evaluating', label: '아바타 평가 중' },
  { key: 'verdict', label: '판정' },
  { key: 'briefing', label: '브리핑' },
  { key: 'done', label: '완료' },
];

export function PhaseStepper({ phase, elapsed }: { phase: Phase; elapsed: number }) {
  const currentIdx = STEPS.findIndex((s) => s.key === phase);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((s, i) => {
          const done = currentIdx > i || phase === 'done';
          const active = currentIdx === i && phase !== 'done';
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  active ? 'pulse-anim' : ''
                }`}
                style={{
                  borderColor:
                    active || done ? 'var(--color-accent)' : 'var(--color-border)',
                  color: active || done ? 'var(--color-accent)' : 'var(--color-muted)',
                }}
              >
                <span aria-hidden="true">{done ? '✓' : active ? '●' : '○'}</span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" style={{ color: 'var(--color-border)' }}>
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm tabular-nums" style={{ color: 'var(--color-muted)' }}>
        {elapsed}초 경과
      </p>
    </div>
  );
}
