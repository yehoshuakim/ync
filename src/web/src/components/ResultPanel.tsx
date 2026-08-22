import type { AvatarEval, Phase, RunRequest, RunResult, AvatarResultGroup } from '../types';
import { AvatarEvalCard } from './AvatarEvalCard';
import { PhaseStepper } from './PhaseStepper';
import { VerdictMatrix } from './VerdictMatrix';
import { OUTCOME_META, ProvenanceChip, cardBase } from './ui';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

type Props = {
  status: RunStatus;
  phase: Phase;
  elapsed: number;
  request: RunRequest;
  groups: Record<string, AvatarResultGroup>;
  result: RunResult | null;
  error: { message: string; code: string } | null;
  approved: boolean;
  onRun: () => void;
  onApproveClick: () => void;
};

function SectionCard({
  title,
  provenance,
  children,
}: {
  title: string;
  provenance?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border p-4" style={cardBase}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2>{title}</h2>
        {provenance}
      </div>
      {children}
    </section>
  );
}

export function ResultPanel({
  status,
  phase,
  elapsed,
  request,
  groups,
  result,
  error,
  approved,
  onRun,
  onApproveClick,
}: Props) {
  const candidateNames: Record<string, string> = Object.fromEntries(
    request.candidates.map((c) => [c.id, c.name]),
  );

  // ---- Idle: empty state ----
  if (status === 'idle') {
    return (
      <div
        className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed p-8 text-center"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
      >
        <p>아직 실행하지 않았습니다. [샘플로 시작]을 누르면 30초 안에 결과가 나옵니다.</p>
      </div>
    );
  }

  // ---- Error state ----
  if (status === 'error' && error) {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--color-rejected)', backgroundColor: 'rgba(229,72,77,0.08)' }}
        role="alert"
      >
        <p className="font-medium" style={{ color: 'var(--color-rejected)' }}>
          {error.message}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onRun}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-black"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            다시 시도
          </button>
        </div>
        <details className="mt-3 text-xs" style={{ color: 'var(--color-muted)' }}>
          <summary className="cursor-pointer">자세히</summary>
          <code className="mt-1 block break-all">{error.code}</code>
        </details>
      </div>
    );
  }

  const avatarNames = request.avatars.map((a) => a.name);
  const getEval = (avatar: string, candidateId: string): AvatarEval | undefined =>
    groups[avatar]?.evals.find((e) => e.candidate_id === candidateId);

  const resolved = result?.outcomes.filter((o) => o.status === 'RESOLVED') ?? [];
  const contested = result?.outcomes.filter((o) => o.status === 'CONTESTED') ?? [];
  const rejected = result?.outcomes.filter((o) => o.status === 'REJECTED') ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Phase stepper (running + done) */}
      {(status === 'running' || status === 'done') && (
        <PhaseStepper phase={phase} elapsed={elapsed} />
      )}

      {/* Streaming avatar cards */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2>아바타 평가</h2>
          <ProvenanceChip kind="ai" />
        </div>
        <div className="flex flex-col gap-3">
          {request.avatars.map((a) => (
            <AvatarEvalCard
              key={a.name}
              name={a.name}
              role={a.role}
              top_priority={a.top_priority}
              group={groups[a.name]}
              candidateNames={candidateNames}
            />
          ))}
        </div>
      </section>

      {/* Result */}
      {status === 'done' && result && (
        <>
          {/* 판정 요약 */}
          <SectionCard title="판정 요약" provenance={<ProvenanceChip kind="code" />}>
            <div className="flex flex-wrap gap-2">
              <SummaryChip status="RESOLVED" count={resolved.length} />
              <SummaryChip status="CONTESTED" count={contested.length} />
              <SummaryChip status="REJECTED" count={rejected.length} />
            </div>
          </SectionCard>

          {/* 합의 초안 */}
          {resolved.map((o) => (
            <div
              key={o.candidate_id}
              className="rounded-xl border p-4"
              style={{ borderColor: 'var(--color-resolved)', backgroundColor: 'var(--color-surface)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 style={{ color: 'var(--color-resolved)' }}>
                  ✓ 합의 초안 — {o.name}
                </h2>
                <ProvenanceChip kind="code" />
              </div>
              {o.reasons[0] && <p className="mt-2 text-sm">{o.reasons[0]}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                  style={{ borderColor: 'var(--color-resolved)', color: 'var(--color-resolved)' }}
                >
                  전원 통과
                </span>
                {avatarNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-full border px-2 py-0.5 text-xs"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* 사람 회의 필요 */}
          {contested.map((o) => (
            <div
              key={o.candidate_id}
              className="rounded-xl border p-4"
              style={{ borderColor: 'var(--color-contested)', backgroundColor: 'var(--color-surface)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 style={{ color: 'var(--color-contested)' }}>
                  △ 사람 회의 필요 — {o.name}
                </h2>
                <ProvenanceChip kind="code" />
              </div>
              {o.reasons.map((r, i) => (
                <p key={i} className="mt-2 text-sm">
                  사유: {r}
                </p>
              ))}
              <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
                제안 일정: 내일 10:00 (30분)
              </p>
            </div>
          ))}

          {/* 폐기 (collapsed by default) */}
          {rejected.map((o) => (
            <details
              key={o.candidate_id}
              className="rounded-xl border p-4"
              style={{ borderColor: 'var(--color-rejected)', backgroundColor: 'var(--color-surface)' }}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-semibold" style={{ color: 'var(--color-rejected)' }}>
                  ✕ 폐기 — {o.name}
                </span>
                <ProvenanceChip kind="code" />
              </summary>
              <div className="mt-2">
                {o.reasons.map((r, i) => (
                  <p key={i} className="text-sm">
                    {r}
                  </p>
                ))}
              </div>
            </details>
          ))}

          {/* 판정 매트릭스 */}
          <SectionCard title="판정 매트릭스" provenance={<ProvenanceChip kind="mcp" />}>
            <VerdictMatrix
              candidates={request.candidates.map((c) => ({ id: c.id, name: c.name }))}
              avatarNames={avatarNames}
              getEval={getEval}
              outcomes={result.outcomes}
            />
          </SectionCard>

          {/* 브리핑 */}
          <SectionCard
            title="AI 생성 브리핑 — 사실은 입력값 인용만 합니다"
            provenance={<ProvenanceChip kind="ai" />}
          >
            <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
              {result.briefing_md}
            </div>
          </SectionCard>

          {/* 시간 영수증 */}
          <TimeReceipt request={request} result={result} contestedCount={contested.length} />

          {/* 승인 게이트 */}
          <div className="rounded-xl border p-4" style={cardBase}>
            <button
              type="button"
              onClick={onApproveClick}
              className="w-full rounded-xl px-4 py-3 text-base font-semibold text-black"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {approved ? '승인됨 ✓ 다시 내려받기' : '초안 승인'}
            </button>
            {!approved && (
              <p className="mt-2 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
                승인 전에는 파일을 내려받을 수 없습니다.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryChip({
  status,
  count,
}: {
  status: 'RESOLVED' | 'CONTESTED' | 'REJECTED';
  count: number;
}) {
  const m = OUTCOME_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold"
      style={{ borderColor: m.color, color: m.color }}
    >
      <span aria-hidden="true">{m.icon}</span>
      {m.label} {count}건
    </span>
  );
}

function TimeReceipt({
  request,
  result,
  contestedCount,
}: {
  request: RunRequest;
  result: RunResult;
  contestedCount: number;
}) {
  const r = result.receipt;
  const total = r.candidate_count * r.perspective_count;
  return (
    <SectionCard title="시간 영수증" provenance={<ProvenanceChip kind="code" />}>
      <ul className="flex flex-col gap-1 text-sm tabular-nums">
        <li>
          기준 회의 부담: {request.attendees}명 × {request.expected_minutes}분 ={' '}
          {r.expected_person_minutes} 인·분
        </li>
        <li>
          자동 사전검토: 후보 {r.candidate_count}개 × 관점 {r.perspective_count}개 = {total}건
        </li>
        <li>
          사람 논의 필요: {r.candidate_count}건 중 {contestedCount}건
        </li>
        <li>시스템 처리 시간: {r.measured_seconds}초</li>
      </ul>
      <p className="mt-2 text-[13px]" style={{ color: 'var(--color-muted)' }}>
        실제 절감 시간은 측정하지 않았으며, 검토 시간은 포함되지 않습니다.
      </p>
    </SectionCard>
  );
}
