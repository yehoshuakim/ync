export type FieldKey = 'dev_days' | 'revenue_impact' | 'ux_impact' | 'tech_debt';
export type Fields = Record<FieldKey, number>;
export type Candidate = { id: 'A' | 'B' | 'C'; name: string; fields: Fields };
export type Op = '<=' | '>=' | '=';
export type Constraint = { field: FieldKey; op: Op; value: number };
export type Avatar = {
  name: string;
  role: string;
  top_priority: FieldKey;
  hard_constraints: Constraint[];
};

export type AvatarEval = {
  avatar: string;
  candidate_id: string;
  verdict: 'ACCEPT' | 'ACCEPT_WITH_CONCERNS' | 'REJECT';
  evidence: string;
  cited_constraint?: string | null;
  llm_fallback: boolean;
};

// streamed once per avatar, carrying that avatar's evals for all 3 candidates
export type AvatarResultGroup = {
  avatar: string;
  role: string;
  top_priority: FieldKey;
  llm_fallback: boolean;
  evals: AvatarEval[];
};

export type MatrixCell = { avatar: string; constraint: string; pass: boolean };
export type CandidateOutcome = {
  candidate_id: string;
  name: string;
  status: 'RESOLVED' | 'CONTESTED' | 'REJECTED';
  reasons: string[];
  matrix: MatrixCell[];
  needs_review: boolean;
};
export type RunResult = {
  outcomes: CandidateOutcome[];
  briefing_md: string;
  decision_record_md: string;
  ics?: { filename: string; content: string } | null;
  receipt: {
    expected_person_minutes: number;
    measured_seconds: number;
    candidate_count: number;
    perspective_count: number;
    contested_count: number;
    note: string;
  };
};

// ---- Request payload (matches POST /agent/run body) ----
export type RunRequest = {
  agenda: string;
  expected_minutes: number;
  attendees: number;
  candidates: Candidate[];
  avatars: Avatar[];
};

// ---- SSE phases ----
export type Phase = 'received' | 'evaluating' | 'verdict' | 'briefing' | 'done' | 'error';
