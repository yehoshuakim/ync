export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-rejected)' }}>
      {message}
    </p>
  );
}

type StepperProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  error?: string;
  id: string;
};

// Labeled numeric stepper with - / + buttons (touch targets >=44px).
export function NumberStepper({ label, value, onChange, min, max, error, id }: StepperProps) {
  const errId = `${id}-err`;
  const parsed = parseInt(value, 10);

  const step = (delta: number) => {
    const base = Number.isNaN(parsed) ? min : parsed;
    const next = Math.min(max, Math.max(min, base + delta));
    onChange(String(next));
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs" style={{ color: 'var(--color-muted)' }}>
        {label}
      </label>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`${label} 감소`}
          onClick={() => step(-1)}
          className="w-11 shrink-0 rounded-l-lg border text-lg font-medium"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 border-y px-2 text-center"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        />
        <button
          type="button"
          aria-label={`${label} 증가`}
          onClick={() => step(1)}
          className="w-11 shrink-0 rounded-r-lg border text-lg font-medium"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          +
        </button>
      </div>
      <FieldError id={errId} message={error} />
    </div>
  );
}
