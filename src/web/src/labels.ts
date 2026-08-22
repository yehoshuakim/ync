import type { FieldKey, Op } from './types';

// Korean labels for the 4 fixed fields.
export const FIELD_LABELS: Record<FieldKey, string> = {
  dev_days: '개발일수(dev_days)',
  revenue_impact: '매출 임팩트',
  ux_impact: 'UX 임팩트',
  tech_debt: '기술부채',
};

// Short labels used in tight spaces (matrix tooltip, avatar header).
export const FIELD_SHORT: Record<FieldKey, string> = {
  dev_days: '개발일수',
  revenue_impact: '매출 임팩트',
  ux_impact: 'UX 임팩트',
  tech_debt: '기술부채',
};

export const FIELD_ORDER: FieldKey[] = ['dev_days', 'revenue_impact', 'ux_impact', 'tech_debt'];

// Numeric range per field (used by steppers + validation).
export const FIELD_RANGE: Record<FieldKey, { min: number; max: number }> = {
  dev_days: { min: 0, max: 60 },
  revenue_impact: { min: 1, max: 5 },
  ux_impact: { min: 1, max: 5 },
  tech_debt: { min: 1, max: 5 },
};

export const OP_LABELS: Record<Op, string> = {
  '<=': '≤',
  '>=': '≥',
  '=': '=',
};

export const OPS: Op[] = ['<=', '>=', '='];
