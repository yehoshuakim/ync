import type { RunResult } from './types';

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Build standin-decision.md + standin-meeting.ics client-side from the RunResult.
export function downloadDecisionPackage(result: RunResult): void {
  downloadBlob('standin-decision.md', result.decision_record_md, 'text/markdown;charset=utf-8');

  const ics = result.ics?.content;
  if (ics) {
    downloadBlob('standin-meeting.ics', ics, 'text/calendar;charset=utf-8');
  }
}
