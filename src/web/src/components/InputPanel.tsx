import { useEffect, useState, type RefObject } from 'react';
import type { FieldKey, Op } from '../types';
import { FIELD_ORDER, FIELD_SHORT, FIELD_RANGE, OPS, OP_LABELS } from '../labels';
import type { ConstraintForm, FormErrors, FormState } from '../validation';
import { FieldError, NumberStepper } from './Field';
import { cardBase } from './ui';

// Candidate stepper labels per §6.2 (with range hints).
const CANDIDATE_FIELD_LABELS: Record<FieldKey, string> = {
  dev_days: '개발일수(dev_days)',
  revenue_impact: '매출 임팩트 1–5',
  ux_impact: 'UX 임팩트 1–5',
  tech_debt: '기술부채 1–5 (낮을수록 좋음)',
};

type Props = {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  errors: FormErrors;
  showErrors: boolean;
  running: boolean;
  onRun: () => void;
  onLoadSample: () => void;
  agendaRef: RefObject<HTMLTextAreaElement | null>;
};

const inputStyle = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
} as const;

function candidateHasError(errors: FormErrors, index: number) {
  const candidate = errors.candidates[index];
  return Boolean(candidate?.name || FIELD_ORDER.some((field) => candidate?.fields[field]));
}

function avatarHasError(errors: FormErrors, index: number) {
  const avatar = errors.avatars[index];
  return Boolean(avatar?.name || avatar?.constraints.some(Boolean));
}

export function InputPanel({
  form,
  setForm,
  errors,
  showErrors,
  running,
  onRun,
  onLoadSample,
  agendaRef,
}: Props) {
  const [candidateOpen, setCandidateOpen] = useState<Record<string, boolean>>({});
  const [avatarOpen, setAvatarOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCandidateOpen((prev) =>
      Object.fromEntries(form.candidates.map((candidate) => [candidate.id, prev[candidate.id] ?? false])),
    );
  }, [form.candidates]);

  useEffect(() => {
    setAvatarOpen((prev) =>
      Object.fromEntries(
        form.avatars.map((_, index) => {
          const key = `avatar-${index}`;
          return [key, prev[key] ?? false];
        }),
      ),
    );
  }, [form.avatars.length]);

  useEffect(() => {
    if (!showErrors) return;
    setCandidateOpen((prev) =>
      Object.fromEntries(
        form.candidates.map((candidate, index) => [
          candidate.id,
          prev[candidate.id] || candidateHasError(errors, index),
        ]),
      ),
    );
    setAvatarOpen((prev) =>
      Object.fromEntries(
        form.avatars.map((_, index) => {
          const key = `avatar-${index}`;
          return [key, prev[key] || avatarHasError(errors, index)];
        }),
      ),
    );
  }, [errors, form.avatars, form.candidates, showErrors]);

  const updateCandidate = (i: number, patch: Partial<FormState['candidates'][number]>) =>
    setForm((prev) => {
      const candidates = prev.candidates.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
      return { ...prev, candidates };
    });

  const updateCandidateField = (i: number, f: FieldKey, v: string) =>
    setForm((prev) => {
      const candidates = prev.candidates.map((c, idx) =>
        idx === i ? { ...c, fields: { ...c.fields, [f]: v } } : c,
      );
      return { ...prev, candidates };
    });

  const updateAvatar = (i: number, patch: Partial<FormState['avatars'][number]>) =>
    setForm((prev) => {
      const avatars = prev.avatars.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
      return { ...prev, avatars };
    });

  const updateConstraint = (ai: number, ci: number, patch: Partial<ConstraintForm>) =>
    setForm((prev) => {
      const avatars = prev.avatars.map((a, idx) => {
        if (idx !== ai) return a;
        const hard_constraints = a.hard_constraints.map((h, hi) =>
          hi === ci ? { ...h, ...patch } : h,
        );
        return { ...a, hard_constraints };
      });
      return { ...prev, avatars };
    });

  const addConstraint = (ai: number) =>
    setForm((prev) => {
      const avatars = prev.avatars.map((a, idx) => {
        if (idx !== ai || a.hard_constraints.length >= 2) return a;
        return {
          ...a,
          hard_constraints: [
            ...a.hard_constraints,
            { field: 'dev_days' as FieldKey, op: '<=' as Op, value: '' },
          ],
        };
      });
      return { ...prev, avatars };
    });

  const removeConstraint = (ai: number, ci: number) =>
    setForm((prev) => {
      const avatars = prev.avatars.map((a, idx) => {
        if (idx !== ai) return a;
        return { ...a, hard_constraints: a.hard_constraints.filter((_, hi) => hi !== ci) };
      });
      return { ...prev, avatars };
    });

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section>
        <h1>당신의 아바타가 먼저 회의합니다</h1>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--color-muted)' }}>
          조율형 안건을 아바타 3인이 각자 평가하고, 전원 통과한 안만 합의 초안이 됩니다. 충돌한
          안건만 사람이 만납니다.
        </p>
      </section>

      {/* Primary CTA */}
      <div>
        <button
          type="button"
          onClick={onLoadSample}
          disabled={running}
          className="w-full rounded-xl px-4 py-3 text-base font-semibold text-black disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          샘플로 시작
        </button>
        <button
          type="button"
          onClick={() => agendaRef.current?.focus()}
          className="mt-2 w-full text-sm underline-offset-4 hover:underline"
          style={{ color: 'var(--color-muted)' }}
        >
          직접 입력하기
        </button>
      </div>

      {/* 안건 */}
      <section className="rounded-xl border p-4" style={cardBase}>
        <label htmlFor="agenda" className="mb-1 block text-sm font-medium">
          안건
        </label>
        <textarea
          id="agenda"
          ref={agendaRef}
          value={form.agenda}
          maxLength={500}
          rows={3}
          aria-invalid={showErrors && errors.agenda ? true : undefined}
          aria-describedby={showErrors && errors.agenda ? 'agenda-err' : undefined}
          onChange={(e) => setForm((p) => ({ ...p, agenda: e.target.value }))}
          placeholder="예) 9월 스프린트: 다음 2주 동안 무엇을 먼저 만들까?"
          className="w-full resize-y rounded-lg border p-2 text-[15px]"
          style={inputStyle}
        />
        <div className="mt-1 flex items-center justify-between">
          <FieldError id="agenda-err" message={showErrors ? errors.agenda : undefined} />
          <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {form.agenda.length}/500
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="expected-min"
              className="mb-1 block text-xs"
              style={{ color: 'var(--color-muted)' }}
            >
              예상 회의 시간(분)
            </label>
            <input
              id="expected-min"
              type="number"
              inputMode="numeric"
              value={form.expected_minutes}
              min={5}
              max={240}
              aria-invalid={showErrors && errors.expected_minutes ? true : undefined}
              aria-describedby={showErrors && errors.expected_minutes ? 'expected-min-err' : undefined}
              onChange={(e) => setForm((p) => ({ ...p, expected_minutes: e.target.value }))}
              className="w-full rounded-lg border px-2 py-2"
              style={inputStyle}
            />
            <FieldError
              id="expected-min-err"
              message={showErrors ? errors.expected_minutes : undefined}
            />
          </div>
          <div>
            <label
              htmlFor="attendees"
              className="mb-1 block text-xs"
              style={{ color: 'var(--color-muted)' }}
            >
              참석 인원
            </label>
            <input
              id="attendees"
              type="number"
              inputMode="numeric"
              value={form.attendees}
              min={1}
              max={20}
              aria-invalid={showErrors && errors.attendees ? true : undefined}
              aria-describedby={showErrors && errors.attendees ? 'attendees-err' : undefined}
              onChange={(e) => setForm((p) => ({ ...p, attendees: e.target.value }))}
              className="w-full rounded-lg border px-2 py-2"
              style={inputStyle}
            />
            <FieldError id="attendees-err" message={showErrors ? errors.attendees : undefined} />
          </div>
        </div>
      </section>

      {/* 후보안 3장 */}
      <section>
        <h2 className="mb-2">후보안</h2>
        <div className="flex flex-col gap-3">
          {form.candidates.map((c, i) => (
            <details
              key={c.id}
              open={candidateOpen[c.id] ?? false}
              onToggle={(event) =>
                setCandidateOpen((prev) => ({ ...prev, [c.id]: event.currentTarget.open }))
              }
              className="rounded-xl border"
              style={cardBase}
            >
              <summary className="cursor-pointer list-none rounded-xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                    style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  >
                    {c.id}
                  </span>
                  <span className="min-w-0 text-sm font-medium">
                    {`${c.id} · ${c.name || '후보안 이름'} — 개발 ${c.fields.dev_days || '0'}일 · 매출 ${c.fields.revenue_impact || '0'} · UX ${c.fields.ux_impact || '0'} · 부채 ${c.fields.tech_debt || '0'}`}
                  </span>
                </div>
              </summary>
              <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                    style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  >
                    {c.id}
                  </span>
                  <div className="w-full">
                    <label htmlFor={`cand-name-${c.id}`} className="sr-only">
                      후보안 {c.id} 이름
                    </label>
                    <input
                      id={`cand-name-${c.id}`}
                      type="text"
                      value={c.name}
                      maxLength={60}
                      aria-invalid={showErrors && errors.candidates[i]?.name ? true : undefined}
                      aria-describedby={
                        showErrors && errors.candidates[i]?.name ? `cand-name-${c.id}-err` : undefined
                      }
                      onChange={(e) => updateCandidate(i, { name: e.target.value })}
                      placeholder="후보안 이름"
                      className="w-full rounded-lg border px-2 py-2 font-medium"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <FieldError
                  id={`cand-name-${c.id}-err`}
                  message={showErrors ? errors.candidates[i]?.name : undefined}
                />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {FIELD_ORDER.map((f) => (
                    <NumberStepper
                      key={f}
                      id={`cand-${c.id}-${f}`}
                      label={CANDIDATE_FIELD_LABELS[f]}
                      value={c.fields[f]}
                      min={FIELD_RANGE[f].min}
                      max={FIELD_RANGE[f].max}
                      error={showErrors ? errors.candidates[i]?.fields[f] : undefined}
                      onChange={(v) => updateCandidateField(i, f, v)}
                    />
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* 아바타 카드 3장 */}
      <section>
        <h2 className="mb-1">아바타</h2>
        <p className="mb-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          레드라인은 절대 조건입니다. 하나라도 위반하면 그 후보안은 폐기됩니다.
        </p>
        <div className="flex flex-col gap-3">
          {form.avatars.map((a, ai) => {
            const avatarKey = `avatar-${ai}`;
            return (
            <details
              key={ai}
              open={avatarOpen[avatarKey] ?? false}
              onToggle={(event) =>
                setAvatarOpen((prev) => ({ ...prev, [avatarKey]: event.currentTarget.open }))
              }
              className="rounded-xl border"
              style={cardBase}
            >
              <summary className="cursor-pointer list-none rounded-xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
                <span className="text-sm font-medium">
                  {`${a.name || '아바타'} · ${a.role || '역할'} — 우선 관심: ${FIELD_SHORT[a.top_priority]} · 레드라인 ${a.hard_constraints.length}개`}
                </span>
              </summary>
              <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`av-name-${ai}`}
                      className="mb-1 block text-xs"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      이름
                    </label>
                    <input
                      id={`av-name-${ai}`}
                      type="text"
                      value={a.name}
                      maxLength={20}
                      aria-invalid={showErrors && errors.avatars[ai]?.name ? true : undefined}
                      aria-describedby={
                        showErrors && errors.avatars[ai]?.name ? `av-name-${ai}-err` : undefined
                      }
                      onChange={(e) => updateAvatar(ai, { name: e.target.value })}
                      className="w-full rounded-lg border px-2 py-2 font-medium"
                      style={inputStyle}
                    />
                    <FieldError
                      id={`av-name-${ai}-err`}
                      message={showErrors ? errors.avatars[ai]?.name : undefined}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`av-role-${ai}`}
                      className="mb-1 block text-xs"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      역할
                    </label>
                    <input
                      id={`av-role-${ai}`}
                      type="text"
                      value={a.role}
                      maxLength={30}
                      onChange={(e) => updateAvatar(ai, { role: e.target.value })}
                      className="w-full rounded-lg border px-2 py-2"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label
                    htmlFor={`av-top-${ai}`}
                    className="mb-1 block text-xs"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    우선 관심(top priority)
                  </label>
                  <select
                    id={`av-top-${ai}`}
                    value={a.top_priority}
                    onChange={(e) => updateAvatar(ai, { top_priority: e.target.value as FieldKey })}
                    className="w-full rounded-lg border px-2 py-2"
                    style={inputStyle}
                  >
                    {FIELD_ORDER.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_SHORT[f]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <span className="mb-1 block text-xs" style={{ color: 'var(--color-muted)' }}>
                    레드라인
                  </span>
                  <div className="flex flex-col gap-2">
                    {a.hard_constraints.map((h, ci) => {
                      const cErr = showErrors ? errors.avatars[ai]?.constraints[ci] : undefined;
                      return (
                        <div key={ci}>
                          <div className="flex items-center gap-2">
                            <label htmlFor={`av-${ai}-c-${ci}-field`} className="sr-only">
                              레드라인 필드
                            </label>
                            <select
                              id={`av-${ai}-c-${ci}-field`}
                              value={h.field}
                              onChange={(e) =>
                                updateConstraint(ai, ci, { field: e.target.value as FieldKey })
                              }
                              className="min-w-0 flex-1 rounded-lg border px-2 py-2"
                              style={inputStyle}
                            >
                              {FIELD_ORDER.map((f) => (
                                <option key={f} value={f}>
                                  {FIELD_SHORT[f]}
                                </option>
                              ))}
                            </select>
                            <label htmlFor={`av-${ai}-c-${ci}-op`} className="sr-only">
                              연산자
                            </label>
                            <select
                              id={`av-${ai}-c-${ci}-op`}
                              value={h.op}
                              onChange={(e) => updateConstraint(ai, ci, { op: e.target.value as Op })}
                              className="w-16 shrink-0 rounded-lg border px-2 py-2 text-center"
                              style={inputStyle}
                            >
                              {OPS.map((op) => (
                                <option key={op} value={op}>
                                  {OP_LABELS[op]}
                                </option>
                              ))}
                            </select>
                            <label htmlFor={`av-${ai}-c-${ci}-val`} className="sr-only">
                              레드라인 값
                            </label>
                            <input
                              id={`av-${ai}-c-${ci}-val`}
                              type="number"
                              inputMode="numeric"
                              value={h.value}
                              min={0}
                              max={60}
                              aria-invalid={cErr ? true : undefined}
                              aria-describedby={cErr ? `av-${ai}-c-${ci}-err` : undefined}
                              onChange={(e) => updateConstraint(ai, ci, { value: e.target.value })}
                              className="w-20 shrink-0 rounded-lg border px-2 py-2 text-center"
                              style={inputStyle}
                            />
                            <button
                              type="button"
                              aria-label="레드라인 삭제"
                              onClick={() => removeConstraint(ai, ci)}
                              className="w-11 shrink-0 rounded-lg border text-sm"
                              style={{ borderColor: 'var(--color-border)' }}
                            >
                              삭제
                            </button>
                          </div>
                          <FieldError id={`av-${ai}-c-${ci}-err`} message={cErr} />
                        </div>
                      );
                    })}
                  </div>
                  {a.hard_constraints.length < 2 && (
                    <button
                      type="button"
                      onClick={() => addConstraint(ai)}
                      className="mt-2 text-sm"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      + 레드라인 추가
                    </button>
                  )}
                </div>
              </div>
            </details>
            );
          })}
        </div>
      </section>

      {/* Run button — sticky at bottom on mobile */}
      <div className="sticky bottom-0 z-10 -mx-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] md:static md:mx-0 md:pb-0">
        <div
          className="rounded-xl p-1"
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className="w-full rounded-xl px-4 py-3 text-base font-semibold text-black disabled:opacity-70"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {running ? '평가 중…' : '프리플라이트 실행'}
          </button>
        </div>
      </div>
    </div>
  );
}
