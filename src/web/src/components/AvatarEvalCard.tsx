import type { AvatarResultGroup, FieldKey } from '../types';
import { FIELD_SHORT } from '../labels';
import { ProvenanceChip, VerdictChip } from './ui';

type Props = {
  name: string;
  role: string;
  top_priority: FieldKey;
  group?: AvatarResultGroup;
  candidateNames: Record<string, string>;
};

export function AvatarEvalCard({ name, role, top_priority, group, candidateNames }: Props) {
  const loading = !group;

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {name} <span style={{ color: 'var(--color-muted)' }}>· {role}</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            우선 관심: {FIELD_SHORT[top_priority]}
          </p>
        </div>
        {group && <ProvenanceChip kind={group.llm_fallback ? 'fallback' : 'ai'} />}
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {group.evals.map((ev) => (
            <li
              key={ev.candidate_id}
              className="rounded-lg border p-2"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">
                  {candidateNames[ev.candidate_id] ?? ev.candidate_id}
                </span>
                <VerdictChip verdict={ev.verdict} />
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                {ev.evidence}
              </p>
            </li>
          ))}
        </ul>
      )}

      {group?.llm_fallback && (
        <p className="mt-3 text-xs" style={{ color: 'var(--color-contested)' }}>
          ⚠ 모델 응답 지연으로 규칙 기반 평가로 대체됨
        </p>
      )}
    </div>
  );
}
