import type { AvatarEval, CandidateOutcome } from '../types';
import { MatrixVerdictChip, OUTCOME_META } from './ui';

type Props = {
  candidates: { id: string; name: string }[];
  avatarNames: string[];
  getEval: (avatar: string, candidateId: string) => AvatarEval | undefined;
  outcomes: CandidateOutcome[];
};

const stickyBg = 'var(--color-surface)';

export function VerdictMatrix({ candidates, avatarNames, getEval, outcomes }: Props) {
  const outcomeById = new Map(outcomes.map((o) => [o.candidate_id, o]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">후보안별 아바타 판정 매트릭스</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border p-2 text-left"
              style={{ backgroundColor: stickyBg, borderColor: 'var(--color-border)' }}
            >
              후보안
            </th>
            {avatarNames.map((av) => (
              <th
                key={av}
                scope="col"
                className="border p-2 text-left whitespace-nowrap"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {av}
              </th>
            ))}
            <th
              scope="col"
              className="border p-2 text-left whitespace-nowrap"
              style={{ borderColor: 'var(--color-border)' }}
            >
              최종 판정
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const outcome = outcomeById.get(c.id);
            return (
              <tr key={c.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border p-2 text-left font-medium whitespace-nowrap"
                  style={{ backgroundColor: stickyBg, borderColor: 'var(--color-border)' }}
                >
                  {c.id}. {c.name}
                </th>
                {avatarNames.map((av) => {
                  const ev = getEval(av, c.id);
                  return (
                    <td
                      key={av}
                      className="border p-2"
                      style={{ borderColor: 'var(--color-border)' }}
                      title={ev?.cited_constraint ?? ev?.evidence ?? undefined}
                    >
                      {ev ? <MatrixVerdictChip verdict={ev.verdict} /> : '—'}
                    </td>
                  );
                })}
                <td className="border p-2" style={{ borderColor: 'var(--color-border)' }}>
                  {outcome ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap"
                      style={{
                        borderColor: OUTCOME_META[outcome.status].color,
                        color: OUTCOME_META[outcome.status].color,
                      }}
                    >
                      <span aria-hidden="true">{OUTCOME_META[outcome.status].icon}</span>
                      {OUTCOME_META[outcome.status].label}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
