import { useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { InputPanel } from './components/InputPanel';
import { ResultPanel, type RunStatus } from './components/ResultPanel';
import { ApprovalDialog } from './components/ApprovalDialog';
import { runPreflight, RunHttpError } from './api';
import { downloadDecisionPackage } from './download';
import { makeSamplePreset } from './sample';
import type { AvatarResultGroup, Phase, RunRequest, RunResult } from './types';
import { fromRunRequest, toRunRequest, validate, type FormState } from './validation';

export default function App() {
  // Sample preset pre-filled on first paint (zero-click readiness).
  const [form, setForm] = useState<FormState>(() => fromRunRequest(makeSamplePreset()));
  const [showErrors, setShowErrors] = useState(false);

  const [status, setStatus] = useState<RunStatus>('idle');
  const [phase, setPhase] = useState<Phase>('received');
  const [elapsed, setElapsed] = useState(0);
  const [groups, setGroups] = useState<Record<string, AvatarResultGroup>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [request, setRequest] = useState<RunRequest>(() => makeSamplePreset());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [approved, setApproved] = useState(false);

  const agendaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { errors, valid } = useMemo(() => validate(form), [form]);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRun = (req: RunRequest) => {
    // Cancel any in-flight run.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRequest(req);
    setStatus('running');
    setPhase('received');
    setGroups({});
    setResult(null);
    setError(null);
    setApproved(false);
    setDialogOpen(false);

    const start = Date.now();
    setElapsed(0);
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    runPreflight(
      req,
      {
        onPhase: (p) => setPhase(p),
        onAvatarResult: (g) => setGroups((prev) => ({ ...prev, [g.avatar]: g })),
        onFinal: (res) => {
          setResult(res);
          setPhase('done');
          setStatus('done');
          stopTimer();
        },
        onError: (err) => {
          setError({ message: '평가에 실패했습니다. 잠시 후 다시 시도해 주세요.', code: `${err.code}: ${err.message}` });
          setStatus('error');
          stopTimer();
        },
      },
      controller.signal,
    ).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      let message = '평가에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      let code = 'UNKNOWN';
      if (e instanceof RunHttpError) {
        code = `HTTP_${e.status}`;
        if (e.status === 429) {
          message = '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
        }
      } else if (e instanceof Error) {
        code = e.message;
      }
      setError({ message, code });
      setStatus('error');
      stopTimer();
    });
  };

  const handleRun = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    startRun(toRunRequest(form));
  };

  // [샘플로 시작]: reload preset into all fields AND immediately run.
  const handleLoadSample = () => {
    const preset = makeSamplePreset();
    setForm(fromRunRequest(preset));
    setShowErrors(false);
    startRun(preset);
  };

  const handleApproveClick = () => {
    if (approved) {
      // Already approved — re-download directly.
      if (result) downloadDecisionPackage(result);
      return;
    }
    setDialogOpen(true);
  };

  const confirmApproval = () => {
    if (result) downloadDecisionPackage(result);
    setApproved(true);
    setDialogOpen(false);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr]">
          <div>
            <InputPanel
              form={form}
              setForm={setForm}
              errors={errors}
              showErrors={showErrors}
              running={status === 'running'}
              onRun={handleRun}
              onLoadSample={handleLoadSample}
              agendaRef={agendaRef}
            />
          </div>
          <div>
            <h2 className="sr-only">실행 &amp; 결과</h2>
            <ResultPanel
              status={status}
              phase={phase}
              elapsed={elapsed}
              request={request}
              groups={groups}
              result={result}
              error={error}
              approved={approved}
              onRun={handleRun}
              onApproveClick={handleApproveClick}
            />
          </div>
        </div>

        <footer
          className="mt-10 border-t pt-4 text-center text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
        >
          입력값은 서버에 저장되지 않습니다. 실행이 끝나면 메모리에서 사라집니다.
        </footer>
      </main>

      <ApprovalDialog
        open={dialogOpen}
        onConfirm={confirmApproval}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
