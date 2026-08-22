import type { CSSProperties } from 'react';

// ---- Provenance chips (PRD §6.4) ----
export type Provenance = 'ai' | 'mcp' | 'code' | 'fallback';

const PROVENANCE_TEXT: Record<Provenance, string> = {
  ai: 'AI 평가',
  mcp: 'MCP 검증',
  code: '앱 코드 판정',
  fallback: '규칙 기반 대체',
};

export function ProvenanceChip({ kind }: { kind: Provenance }) {
  const isFallback = kind === 'fallback';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{
        borderColor: isFallback ? 'var(--color-contested)' : 'var(--color-border)',
        color: isFallback ? 'var(--color-contested)' : 'var(--color-muted)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      {isFallback ? '⚠' : '●'} {PROVENANCE_TEXT[kind]}
    </span>
  );
}

// ---- Avatar per-candidate verdict chip: text + icon (not color alone) ----
type VerdictKind = 'ACCEPT' | 'ACCEPT_WITH_CONCERNS' | 'REJECT';
const VERDICT_META: Record<VerdictKind, { label: string; icon: string; color: string }> = {
  ACCEPT: { label: '통과', icon: '✓', color: 'var(--color-resolved)' },
  ACCEPT_WITH_CONCERNS: { label: '조건부 통과', icon: '△', color: 'var(--color-contested)' },
  REJECT: { label: '거부', icon: '✕', color: 'var(--color-rejected)' },
};

export function VerdictChip({ verdict }: { verdict: VerdictKind }) {
  const m = VERDICT_META[verdict];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ borderColor: m.color, color: m.color }}
    >
      <span aria-hidden="true">{m.icon}</span> {m.label}
    </span>
  );
}

// ---- Matrix cell chip (short form) ----
export function MatrixVerdictChip({ verdict }: { verdict: VerdictKind }) {
  const short: Record<VerdictKind, string> = {
    ACCEPT: '통과',
    ACCEPT_WITH_CONCERNS: '조건부',
    REJECT: '거부',
  };
  const m = VERDICT_META[verdict];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ borderColor: m.color, color: m.color }}
    >
      <span aria-hidden="true">{m.icon}</span> {short[verdict]}
    </span>
  );
}

// ---- Outcome status meta (RESOLVED / CONTESTED / REJECTED) ----
export type OutcomeStatus = 'RESOLVED' | 'CONTESTED' | 'REJECTED';
export const OUTCOME_META: Record<
  OutcomeStatus,
  { label: string; icon: string; color: string }
> = {
  RESOLVED: { label: '합의', icon: '✓', color: 'var(--color-resolved)' },
  CONTESTED: { label: '사람 회의', icon: '△', color: 'var(--color-contested)' },
  REJECTED: { label: '폐기', icon: '✕', color: 'var(--color-rejected)' },
};

export const cardBase: CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  borderColor: 'var(--color-border)',
  borderRadius: 'var(--radius-card)',
};
