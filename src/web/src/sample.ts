import type { RunRequest } from './types';

// §4 sample preset — canonical fixture. Must match PRD §4 / Step 4 exactly.
export function makeSamplePreset(): RunRequest {
  return {
    agenda: '9월 스프린트: 다음 2주 동안 무엇을 먼저 만들까?',
    expected_minutes: 30,
    attendees: 3,
    candidates: [
      {
        id: 'A',
        name: '간편 온보딩 개선',
        fields: { dev_days: 6, revenue_impact: 3, ux_impact: 5, tech_debt: 2 },
      },
      {
        id: 'B',
        name: '결제 연동 (토스페이먼츠)',
        fields: { dev_days: 9, revenue_impact: 5, ux_impact: 2, tech_debt: 3 },
      },
      {
        id: 'C',
        name: '관리자 대시보드',
        fields: { dev_days: 12, revenue_impact: 2, ux_impact: 2, tech_debt: 4 },
      },
    ],
    avatars: [
      {
        name: 'Yehoshua',
        role: 'COO',
        top_priority: 'revenue_impact',
        hard_constraints: [{ field: 'dev_days', op: '<=', value: 10 }],
      },
      {
        name: 'Caleb',
        role: 'Lead Developer',
        top_priority: 'tech_debt',
        hard_constraints: [
          { field: 'dev_days', op: '<=', value: 10 },
          { field: 'tech_debt', op: '<=', value: 3 },
        ],
      },
      {
        name: 'Samuel',
        role: 'Product Designer',
        top_priority: 'ux_impact',
        hard_constraints: [{ field: 'ux_impact', op: '>=', value: 2 }],
      },
    ],
  };
}
