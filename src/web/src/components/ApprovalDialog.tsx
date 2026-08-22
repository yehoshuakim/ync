import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ApprovalDialog({ open, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        aria-describedby="approval-body"
        className="w-full max-w-md rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="approval-title" className="text-lg font-semibold">
          초안을 승인할까요?
        </h2>
        <p id="approval-body" className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
          승인하면 결정 기록과 회의 초대(.ics) 파일을 내려받습니다. AI가 만든 초안이므로 내용을
          확인한 뒤 사용하세요.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            취소
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-black"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            승인하고 내려받기
          </button>
        </div>
      </div>
    </div>
  );
}
