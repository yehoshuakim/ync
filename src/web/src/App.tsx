import { useMemo, useRef, useState } from 'react'
import type { AvatarEval, RunRequest, RunResult } from './types'
import { preset } from './preset'

const phases = ['접수', '아바타 평가 중', '판정', '브리핑', '완료']

type Phase = 'received' | 'evaluating' | 'verdict' | 'briefing' | 'done' | 'error'

const phaseIndex = (p: Phase) => ['received', 'evaluating', 'verdict', 'briefing', 'done', 'error'].indexOf(p)

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [form, setForm] = useState<RunRequest>(preset)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase>('received')
  const [elapsed, setElapsed] = useState(0)
  const [evals, setEvals] = useState<AvatarEval[]>([])
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string>('')
  const [approved, setApproved] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const agendaRef = useRef<HTMLTextAreaElement>(null)

  const grouped = useMemo(() => {
    const m: Record<string, AvatarEval[]> = {}
    for (const e of evals) {
      m[e.avatar] = m[e.avatar] || []
      m[e.avatar].push(e)
    }
    return m
  }, [evals])

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.agenda.trim()) e.agenda = '안건을 입력해 주세요.'
    if (form.agenda.length > 500) e.agenda = '안건은 500자 이내로 입력해 주세요.'
    form.candidates.forEach((c, ci) => {
      if (!c.name.trim()) e[`candidate-${ci}-name`] = '후보안 이름을 입력해 주세요.'
      ;(['dev_days', 'revenue_impact', 'ux_impact', 'tech_debt'] as const).forEach((f) => {
        const v = c.fields[f]
        if (Number.isNaN(v)) e[`candidate-${ci}-${f}`] = '숫자만 입력할 수 있습니다.'
      })
    })
    form.avatars.forEach((a, ai) => {
      if (!a.name.trim()) e[`avatar-${ai}-name`] = '아바타 이름을 입력해 주세요.'
      a.hard_constraints.forEach((h, hi) => {
        if (h.value === null || h.value === undefined || Number.isNaN(h.value)) e[`avatar-${ai}-h-${hi}`] = '레드라인 값을 입력해 주세요.'
      })
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const run = async (payload: RunRequest) => {
    if (!validate()) return
    setRunning(true)
    setResult(null)
    setError('')
    setEvals([])
    setApproved(false)
    setPhase('received')
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500)
    try {
      const res = await fetch('/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok || !res.body) {
        const txt = await res.text()
        throw new Error(txt || '요청 실패')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const chunks = buf.split('\n\n')
        buf = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const eventMatch = chunk.match(/^event: (.+)$/m)
          const dataMatch = chunk.match(/^data: (.+)$/m)
          if (!eventMatch || !dataMatch) continue
          const event = eventMatch[1]
          const data = JSON.parse(dataMatch[1])
          if (event === 'phase') setPhase(data.phase)
          if (event === 'avatar_result') setEvals((prev) => [...prev, data])
          if (event === 'final') setResult(data)
          if (event === 'error') setError(data.detail || '오류')
        }
      }
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      clearInterval(timer)
      setRunning(false)
    }
  }

  const setCandidateField = (idx: number, key: string, value: string) => {
    setForm((prev) => {
      const n = structuredClone(prev)
      if (key === 'name') n.candidates[idx].name = value
      else n.candidates[idx].fields[key as keyof typeof n.candidates[number]['fields']] = Number(value)
      return n
    })
  }

  const setAvatarField = (idx: number, key: string, value: string) => {
    setForm((prev) => {
      const n = structuredClone(prev)
      ;(n.avatars[idx] as any)[key] = value
      return n
    })
  }

  return (
    <main className="min-h-screen bg-[#0B0F17] text-[#E6EDF7]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-2xl font-bold">Standin</p>
          <p className="text-sm text-[#8FA3BF]">아바타가 먼저 회의합니다</p>
        </div>
        <p className="rounded border border-[#243044] px-3 py-2 text-xs">AI 생성 결과 — 검토 후 사용하세요</p>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 pb-20 lg:grid-cols-[5fr_7fr]">
        <section className="space-y-3 rounded-xl border border-[#243044] bg-[#141A24] p-4">
          <h1 className="text-3xl font-bold">당신의 아바타가 먼저 회의합니다</h1>
          <p className="text-sm text-[#8FA3BF]">조율형 안건을 아바타 3인이 각자 평가하고, 전원 통과한 안만 합의 초안이 됩니다. 충돌한 안건만 사람이 만납니다.</p>
          <button className="h-11 w-full rounded bg-[#4F8CFF] font-semibold" onClick={() => { setForm(preset); void run(preset) }}>샘플로 시작</button>
          <button className="text-sm text-[#8FA3BF] underline" onClick={() => agendaRef.current?.focus()}>직접 입력하기</button>

          <label className="block text-sm">안건</label>
          <textarea ref={agendaRef} className="h-24 w-full rounded border border-[#243044] bg-[#0B0F17] p-2" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} maxLength={500} aria-invalid={!!errors.agenda} />
          <p className="text-xs text-[#8FA3BF]">{form.agenda.length}/500</p>
          {errors.agenda && <p className="text-sm text-[#E5484D]">{errors.agenda}</p>}

          <div className="grid grid-cols-2 gap-2">
            <input className="rounded border border-[#243044] bg-[#0B0F17] p-2" type="number" min={5} max={240} value={form.expected_minutes} onChange={(e) => setForm({ ...form, expected_minutes: Number(e.target.value) })} aria-label="예상 회의 시간(분)" />
            <input className="rounded border border-[#243044] bg-[#0B0F17] p-2" type="number" min={1} max={20} value={form.attendees} onChange={(e) => setForm({ ...form, attendees: Number(e.target.value) })} aria-label="참석 인원" />
          </div>

          {form.candidates.map((c, ci) => (
            <div key={c.id} className="rounded border border-[#243044] p-3">
              <p className="mb-2 font-semibold">후보안 {c.id}</p>
              <input className="mb-2 w-full rounded border border-[#243044] bg-[#0B0F17] p-2" value={c.name} maxLength={60} onChange={(e) => setCandidateField(ci, 'name', e.target.value)} aria-invalid={!!errors[`candidate-${ci}-name`]} />
              {errors[`candidate-${ci}-name`] && <p className="text-sm text-[#E5484D]">{errors[`candidate-${ci}-name`]}</p>}
              {(['dev_days', 'revenue_impact', 'ux_impact', 'tech_debt'] as const).map((f) => (
                <input key={f} className="mt-2 w-full rounded border border-[#243044] bg-[#0B0F17] p-2" type="number" value={c.fields[f]} onChange={(e) => setCandidateField(ci, f, e.target.value)} aria-label={f} />
              ))}
            </div>
          ))}

          {form.avatars.map((a, ai) => (
            <div key={ai} className="rounded border border-[#243044] p-3">
              <p className="mb-2 font-semibold">아바타 {ai + 1}</p>
              <input className="mb-2 w-full rounded border border-[#243044] bg-[#0B0F17] p-2" value={a.name} maxLength={20} onChange={(e) => setAvatarField(ai, 'name', e.target.value)} aria-invalid={!!errors[`avatar-${ai}-name`]} />
              {errors[`avatar-${ai}-name`] && <p className="text-sm text-[#E5484D]">{errors[`avatar-${ai}-name`]}</p>}
              <input className="mb-2 w-full rounded border border-[#243044] bg-[#0B0F17] p-2" value={a.role} maxLength={30} onChange={(e) => setAvatarField(ai, 'role', e.target.value)} />
              <select className="mb-2 w-full rounded border border-[#243044] bg-[#0B0F17] p-2" value={a.top_priority} onChange={(e) => setAvatarField(ai, 'top_priority', e.target.value)}>
                <option value="dev_days">개발일수</option>
                <option value="revenue_impact">매출 임팩트</option>
                <option value="ux_impact">UX 임팩트</option>
                <option value="tech_debt">기술부채</option>
              </select>
              {a.hard_constraints.map((h, hi) => (
                <div key={hi} className="mt-2 grid grid-cols-3 gap-2">
                  <select className="rounded border border-[#243044] bg-[#0B0F17] p-2" value={h.field} onChange={(e) => setForm((prev) => { const n = structuredClone(prev); n.avatars[ai].hard_constraints[hi].field = e.target.value as any; return n })}>
                    <option value="dev_days">dev_days</option>
                    <option value="revenue_impact">revenue_impact</option>
                    <option value="ux_impact">ux_impact</option>
                    <option value="tech_debt">tech_debt</option>
                  </select>
                  <select className="rounded border border-[#243044] bg-[#0B0F17] p-2" value={h.op} onChange={(e) => setForm((prev) => { const n = structuredClone(prev); n.avatars[ai].hard_constraints[hi].op = e.target.value as any; return n })}>
                    <option value="<=">≤</option>
                    <option value=">=">≥</option>
                    <option value="=">=</option>
                  </select>
                  <input className="rounded border border-[#243044] bg-[#0B0F17] p-2" type="number" value={h.value} onChange={(e) => setForm((prev) => { const n = structuredClone(prev); n.avatars[ai].hard_constraints[hi].value = Number(e.target.value); return n })} />
                </div>
              ))}
              <p className="mt-2 text-xs text-[#8FA3BF]">레드라인은 절대 조건입니다. 하나라도 위반하면 그 후보안은 폐기됩니다.</p>
              {a.hard_constraints.length < 2 && <button className="mt-2 text-sm underline" onClick={() => setForm((prev) => { const n = structuredClone(prev); n.avatars[ai].hard_constraints.push({ field: 'dev_days', op: '<=', value: 10 }); return n })}>+ 레드라인 추가</button>}
            </div>
          ))}

          <button className="sticky bottom-2 h-11 w-full rounded bg-[#4F8CFF] font-semibold disabled:opacity-60" onClick={() => void run(form)} disabled={running}>{running ? '평가 중…' : '프리플라이트 실행'}</button>
        </section>

        <section className="space-y-3 rounded-xl border border-[#243044] bg-[#141A24] p-4">
          {!result && !running && !error && <div className="rounded border border-dashed border-[#243044] p-8 text-center text-[#8FA3BF]">아직 실행하지 않았습니다. [샘플로 시작]을 누르면 30초 안에 결과가 나옵니다.</div>}
          {(running || result) && (
            <>
              <div role="status" aria-live="polite" className="rounded border border-[#243044] p-3">
                <p className="text-sm text-[#8FA3BF]">{elapsed}초 경과</p>
                <ol className="mt-2 grid grid-cols-5 gap-2 text-xs">
                  {phases.map((p, i) => <li key={p} className={i <= phaseIndex(phase) ? 'text-[#4F8CFF]' : 'text-[#8FA3BF]'}>{p}</li>)}
                </ol>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                {form.avatars.map((a) => (
                  <div key={a.name} className="rounded border border-[#243044] p-2">
                    <p className="font-semibold">{a.name} · {a.role}</p>
                    <p className="text-xs text-[#8FA3BF]">우선 관심: {a.top_priority}</p>
                    {(grouped[a.name] || []).map((ev) => <p key={`${ev.avatar}-${ev.candidate_id}`} className="mt-1 text-sm">{ev.candidate_id} · {ev.verdict === 'ACCEPT' ? '통과' : ev.verdict === 'ACCEPT_WITH_CONCERNS' ? '조건부 통과' : '거부'} · {ev.evidence}</p>)}
                    {(grouped[a.name] || []).some((x) => x.llm_fallback) && <p className="mt-2 text-xs text-[#F2B441]">⚠ 모델 응답 지연으로 규칙 기반 평가로 대체됨</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {result && (
            <>
              <div className="flex gap-2">
                <span className="rounded bg-[#2FBF71] px-2 py-1 text-xs">합의 {result.outcomes.filter((o) => o.status === 'RESOLVED').length}건</span>
                <span className="rounded bg-[#F2B441] px-2 py-1 text-xs">사람 회의 {result.outcomes.filter((o) => o.status === 'CONTESTED').length}건</span>
                <span className="rounded bg-[#E5484D] px-2 py-1 text-xs">폐기 {result.outcomes.filter((o) => o.status === 'REJECTED').length}건</span>
              </div>
              <div className="rounded border border-[#2FBF71] p-3">AI 생성 — 검토 후 사용<br />합의 초안: {result.outcomes.find((o) => o.status === 'RESOLVED')?.candidate_id}</div>
              {result.outcomes.filter((o) => o.status === 'CONTESTED').map((o) => (
                <div key={o.candidate_id} className="rounded border border-[#F2B441] p-3">사람 회의 필요: {o.candidate_id} · 사유: {o.reasons.join(' / ')} · 제안 일정: 내일 10:00 (30분)</div>
              ))}
              <div className="rounded border border-[#E5484D] p-3">
                <button className="underline" onClick={() => setShowRejected((v) => !v)}>폐기 보기</button>
                {showRejected && result.outcomes.filter((o) => o.status === 'REJECTED').map((o) => <p key={o.candidate_id} className="text-sm">{o.reasons.join(' / ')}</p>)}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead><tr><th scope="col" className="border border-[#243044] p-2">후보안</th>{form.avatars.map((a) => <th scope="col" key={a.name} className="border border-[#243044] p-2">{a.name}</th>)}<th scope="col" className="border border-[#243044] p-2">최종 판정</th></tr></thead>
                  <tbody>
                    {result.outcomes.map((o) => (
                      <tr key={o.candidate_id}>
                        <th scope="row" className="border border-[#243044] p-2">{o.candidate_id}</th>
                        {form.avatars.map((a) => {
                          const row = evals.find((e) => e.avatar === a.name && e.candidate_id === o.candidate_id)
                          const text = !row ? '-' : row.verdict === 'REJECT' ? '거부' : row.verdict === 'ACCEPT_WITH_CONCERNS' ? '조건부' : '통과'
                          return <td key={a.name} className="border border-[#243044] p-2">{text}</td>
                        })}
                        <td className="border border-[#243044] p-2">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded border border-[#243044] p-3">
                <p className="mb-1 font-semibold">AI 생성 브리핑 — 사실은 입력값 인용만 합니다</p>
                <pre className="whitespace-pre-wrap text-sm">{result.briefing_md}</pre>
              </div>
              <p>예상 {result.receipt.expected_person_minutes} 인·분 → 실측 {result.receipt.measured_seconds}초</p>
              <p className="text-xs text-[#8FA3BF]">잠재 절감 추정치이며 검토 비용은 포함하지 않습니다.</p>
              <button className="h-11 rounded bg-[#4F8CFF] px-4" onClick={() => {
                if (!confirm('초안을 승인할까요?\n승인하면 결정 기록과 회의 초대(.ics) 파일을 내려받습니다. AI가 만든 초안이므로 내용을 확인한 뒤 사용하세요.')) return
                setApproved(true)
                download('standin-decision.md', result.decision_record_md)
                if (result.ics) download(result.ics.filename, result.ics.content)
              }}>{approved ? '승인됨 ✓ 다시 내려받기' : '초안 승인'}</button>
            </>
          )}

          {error && <div className="rounded border border-[#E5484D] bg-[#2a1315] p-3">평가에 실패했습니다. 잠시 후 다시 시도해 주세요. <button className="underline" onClick={() => void run(form)}>다시 시도</button><details><summary>자세히</summary><pre>{error}</pre></details></div>}
        </section>
      </div>
    </main>
  )
}
