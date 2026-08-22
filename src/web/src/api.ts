import type { AvatarResultGroup, Phase, RunRequest, RunResult } from './types';

export type RunCallbacks = {
  onPhase?: (phase: Phase) => void;
  onAvatarResult?: (group: AvatarResultGroup) => void;
  onFinal?: (result: RunResult) => void;
  onError?: (err: { code: string; message: string }) => void;
};

export class RunHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'RunHttpError';
  }
}

type SseFrame = { event: string; data: string };

// Parse a raw SSE frame block (already split on \n\n) into event/data.
function parseFrame(block: string): SseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith(':')) continue; // comment
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * POST /agent/run and consume the SSE stream.
 * Uses fetch + ReadableStream because EventSource cannot POST.
 * Handles frames that straddle chunk boundaries by buffering until \n\n.
 */
export async function runPreflight(
  body: RunRequest,
  callbacks: RunCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/agent/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new RunHttpError(res.status, `HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new RunHttpError(0, 'No response body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame: SseFrame) => {
    let parsed: unknown;
    try {
      parsed = frame.data ? JSON.parse(frame.data) : {};
    } catch {
      return; // ignore unparsable frame
    }
    switch (frame.event) {
      case 'phase':
        callbacks.onPhase?.((parsed as { phase: Phase }).phase);
        break;
      case 'avatar_result':
        callbacks.onAvatarResult?.(parsed as AvatarResultGroup);
        break;
      case 'final':
        callbacks.onFinal?.(parsed as RunResult);
        break;
      case 'error':
        callbacks.onError?.(parsed as { code: string; message: string });
        break;
      case 'heartbeat':
      case 'avatar_delta':
      case 'tool_call':
      default:
        break; // ignored in UI
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const frame = parseFrame(block);
      if (frame) dispatch(frame);
    }
  }

  // Flush any trailing frame without a terminating blank line.
  const tail = buffer.trim();
  if (tail) {
    const frame = parseFrame(tail);
    if (frame) dispatch(frame);
  }
}
