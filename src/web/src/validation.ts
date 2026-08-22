import type { Avatar, Candidate, FieldKey, Op, RunRequest } from './types';
import { FIELD_ORDER, FIELD_RANGE } from './labels';

// Form state keeps numeric fields as strings so we can validate empty / non-numeric input.
export type CandidateForm = {
  id: 'A' | 'B' | 'C';
  name: string;
  fields: Record<FieldKey, string>;
};
export type ConstraintForm = { field: FieldKey; op: Op; value: string };
export type AvatarForm = {
  name: string;
  role: string;
  top_priority: FieldKey;
  hard_constraints: ConstraintForm[];
};
export type FormState = {
  agenda: string;
  expected_minutes: string;
  attendees: string;
  candidates: CandidateForm[];
  avatars: AvatarForm[];
};

export type FormErrors = {
  agenda?: string;
  expected_minutes?: string;
  attendees?: string;
  candidates: { name?: string; fields: Partial<Record<FieldKey, string>> }[];
  avatars: { name?: string; constraints: (string | undefined)[] }[];
};

const RANGE_MSG = (min: number, max: number) => `${min}~${max} 사이의 값을 입력해 주세요.`;
const NUMERIC_MSG = '숫자만 입력할 수 있습니다.';

function parseIntStrict(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^-?\d+$/.test(s)) return NaN as unknown as number; // sentinel: non-numeric
  return parseInt(s, 10);
}

export function fromRunRequest(req: RunRequest): FormState {
  return {
    agenda: req.agenda,
    expected_minutes: String(req.expected_minutes),
    attendees: String(req.attendees),
    candidates: req.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      fields: {
        dev_days: String(c.fields.dev_days),
        revenue_impact: String(c.fields.revenue_impact),
        ux_impact: String(c.fields.ux_impact),
        tech_debt: String(c.fields.tech_debt),
      },
    })),
    avatars: req.avatars.map((a) => ({
      name: a.name,
      role: a.role,
      top_priority: a.top_priority,
      hard_constraints: a.hard_constraints.map((h) => ({
        field: h.field,
        op: h.op,
        value: String(h.value),
      })),
    })),
  };
}

export function validate(form: FormState): { errors: FormErrors; valid: boolean } {
  let valid = true;
  const errors: FormErrors = { candidates: [], avatars: [] };

  // Agenda
  if (form.agenda.trim() === '') {
    errors.agenda = '안건을 입력해 주세요.';
    valid = false;
  } else if (form.agenda.length > 500) {
    errors.agenda = '안건은 500자 이내로 입력해 주세요.';
    valid = false;
  }

  // expected_minutes 5-240
  {
    const n = parseIntStrict(form.expected_minutes);
    if (n === null || Number.isNaN(n)) {
      errors.expected_minutes = n === null ? RANGE_MSG(5, 240) : NUMERIC_MSG;
      valid = false;
    } else if (n < 5 || n > 240) {
      errors.expected_minutes = RANGE_MSG(5, 240);
      valid = false;
    }
  }

  // attendees 1-20
  {
    const n = parseIntStrict(form.attendees);
    if (n === null || Number.isNaN(n)) {
      errors.attendees = n === null ? RANGE_MSG(1, 20) : NUMERIC_MSG;
      valid = false;
    } else if (n < 1 || n > 20) {
      errors.attendees = RANGE_MSG(1, 20);
      valid = false;
    }
  }

  // Candidates
  for (const c of form.candidates) {
    const cErr: { name?: string; fields: Partial<Record<FieldKey, string>> } = { fields: {} };
    if (c.name.trim() === '') {
      cErr.name = '후보안 이름을 입력해 주세요.';
      valid = false;
    }
    for (const f of FIELD_ORDER) {
      const { min, max } = FIELD_RANGE[f];
      const n = parseIntStrict(c.fields[f]);
      if (n === null) {
        cErr.fields[f] = RANGE_MSG(min, max);
        valid = false;
      } else if (Number.isNaN(n)) {
        cErr.fields[f] = NUMERIC_MSG;
        valid = false;
      } else if (n < min || n > max) {
        cErr.fields[f] = RANGE_MSG(min, max);
        valid = false;
      }
    }
    errors.candidates.push(cErr);
  }

  // Avatars
  for (const a of form.avatars) {
    const aErr: { name?: string; constraints: (string | undefined)[] } = { constraints: [] };
    if (a.name.trim() === '') {
      aErr.name = '아바타 이름을 입력해 주세요.';
      valid = false;
    }
    for (const h of a.hard_constraints) {
      const s = h.value.trim();
      let msg: string | undefined;
      if (s === '') {
        msg = '레드라인 값을 입력해 주세요.';
      } else if (!/^-?\d+$/.test(s)) {
        msg = NUMERIC_MSG;
      } else {
        const n = parseInt(s, 10);
        if (n < 0 || n > 60) msg = RANGE_MSG(0, 60);
      }
      if (msg) valid = false;
      aErr.constraints.push(msg);
    }
    errors.avatars.push(aErr);
  }

  return { errors, valid };
}

export function toRunRequest(form: FormState): RunRequest {
  const candidates: Candidate[] = form.candidates.map((c) => ({
    id: c.id,
    name: c.name.trim(),
    fields: {
      dev_days: parseInt(c.fields.dev_days, 10),
      revenue_impact: parseInt(c.fields.revenue_impact, 10),
      ux_impact: parseInt(c.fields.ux_impact, 10),
      tech_debt: parseInt(c.fields.tech_debt, 10),
    },
  }));
  const avatars: Avatar[] = form.avatars.map((a) => ({
    name: a.name.trim(),
    role: a.role.trim(),
    top_priority: a.top_priority,
    hard_constraints: a.hard_constraints.map((h) => ({
      field: h.field,
      op: h.op,
      value: parseInt(h.value, 10),
    })),
  }));
  return {
    agenda: form.agenda.trim(),
    expected_minutes: parseInt(form.expected_minutes, 10),
    attendees: parseInt(form.attendees, 10),
    candidates,
    avatars,
  };
}
