export type Fields = {
  dev_days: number
  revenue_impact: number
  ux_impact: number
  tech_debt: number
}

export type Candidate = { id: 'A' | 'B' | 'C'; name: string; fields: Fields }
export type Constraint = { field: keyof Fields; op: '<=' | '>=' | '='; value: number }
export type Avatar = {
  name: string
  role: string
  top_priority: keyof Fields
  hard_constraints: Constraint[]
}

export type RunRequest = {
  agenda: string
  expected_minutes: number
  attendees: number
  candidates: Candidate[]
  avatars: Avatar[]
}

export type AvatarEval = {
  avatar: string
  candidate_id: string
  verdict: 'ACCEPT' | 'ACCEPT_WITH_CONCERNS' | 'REJECT'
  evidence: string
  cited_constraint?: string
  llm_fallback: boolean
}

export type CandidateOutcome = {
  candidate_id: string
  status: 'RESOLVED' | 'CONTESTED' | 'REJECTED'
  reasons: string[]
  matrix: { avatar: string; constraint: string; pass: boolean }[]
  needs_review: boolean
}

export type RunResult = {
  outcomes: CandidateOutcome[]
  briefing_md: string
  decision_record_md: string
  ics?: { filename: string; content: string }
  receipt: { expected_person_minutes: number; measured_seconds: number; note: string }
}
