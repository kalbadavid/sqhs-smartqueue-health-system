import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody, CardTitle } from '../components/Card';
import PageHeader from '../components/PageHeader';
import StationBadge from '../components/StationBadge';
import { getTriageQueue, triagePatient } from '../api/api';
import { Stethoscope, AlertOctagon, AlertTriangle, Activity, ArrowRight, CheckCircle2 } from 'lucide-react';

const ACUITY_LEVELS = [
  {
    level: 1, label: 'Immediate',
    description: 'Life-threatening — bypasses all queues',
    icon: AlertOctagon,
    style: 'border-alert-600/35 bg-alert-50/60 text-alert-900',
    iconColor: 'text-alert-600',
  },
  {
    level: 2, label: 'Urgent',
    description: 'Symptomatic but stable — priority weighting',
    icon: AlertTriangle,
    style: 'border-pharmacy-600/30 bg-pharmacy-50/50 text-pharmacy-900',
    iconColor: 'text-pharmacy-600',
  },
  {
    level: 3, label: 'Routine',
    description: 'Stable, non-urgent — standard queue',
    icon: Activity,
    style: 'border-success-600/30 bg-success-50/50 text-ink-900',
    iconColor: 'text-success-600',
  },
];

export default function Triage() {
  const [queue, setQueue] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [acuity, setAcuity] = useState(null);
  const [complaint, setComplaint] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      setQueue(await getTriageQueue());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  useEffect(() => { refresh(); }, []);

  const choose = (p) => {
    setSelected(p); setAcuity(null); setComplaint(''); setResult(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selected || !acuity || !complaint) return;
    setSubmitting(true);
    try {
      const r = await triagePatient({ id: selected.id, acuity, complaint });
      setResult(r);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSelected(null); setAcuity(null); setComplaint(''); setResult(null);
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Nurse station"
        title="Triage and journey assignment"
        subtitle="Assign acuity level using a 3-tier scheme adapted from the Emergency Severity Index. The system routes the patient through the network based on acuity and chief complaint."
      />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2">
          <Card accent>
            <CardHeader className="border-b border-bone-200">
              <div className="flex items-center justify-between">
                <CardTitle>Triage queue</CardTitle>
                <span className="tnum text-[11px] text-ink-700/65">{queue.length} waiting</span>
              </div>
            </CardHeader>
            <CardBody className="pt-3 px-3 pb-3 space-y-1.5 max-h-[560px] overflow-y-auto">
              {loadError && (
                <div className="rounded-md border border-alert-600/30 bg-alert-50 px-3 py-2.5 mb-2">
                  <div className="text-[12.5px] font-semibold text-alert-900 mb-0.5">Cannot reach backend</div>
                  <div className="text-[11.5px] text-ink-700 leading-relaxed">{loadError}</div>
                </div>
              )}
              {!loadError && queue.length === 0 && (
                <div className="px-3 py-6 text-center text-[12.5px] text-ink-700/60">No patients waiting for triage.</div>
              )}
              {queue.map(p => {
                const isSelected = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => choose(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-md border select-none ${
                      isSelected
                        ? 'border-ink-900 bg-ink-900 text-bone-50'
                        : 'border-transparent bg-surface-sunken/60 hover:bg-bone-200/60 text-ink-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[13.5px] font-medium leading-tight">{p.name}</div>
                        <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-bone-200/85' : 'text-ink-700/65'}`}>
                          Position #{p.position} · waited {p.waitedMinutes} min
                        </div>
                      </div>
                      <div className={`font-mono text-[10.5px] ${isSelected ? 'text-bone-200/75' : 'text-ink-700/60'}`}>
                        {p.id.slice(0, 4)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardBody>
          </Card>
        </div>
        <div className="lg:col-span-3">
          {!selected && (
            <Card accent className="h-full grid place-items-center min-h-[400px]">
              <div className="text-center px-6">
                <div className="size-12 mx-auto rounded-full bg-surface-sunken grid place-items-center mb-3">
                  <Stethoscope className="size-5 text-ink-700/60" strokeWidth={1.75} />
                </div>
                <div className="text-[14px] font-medium text-ink-900">Select a patient to begin triage</div>
                <div className="text-[12.5px] text-ink-700/65 mt-1">Choose from the queue on the left.</div>
              </div>
            </Card>
          )}
          {selected && !result && (
            <Card accent>
              <CardHeader className="border-b border-bone-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg text-ink-900 tracking-tight leading-tight font-semibold">{selected.name}</div>
                    <div className="text-[11.5px] text-ink-700/65 mt-0.5 font-mono">{selected.id} · {selected.phone}</div>
                  </div>
                  <span className="text-[11px] tracking-[0.14em] uppercase text-ink-700/60 font-medium">Position #{selected.position}</span>
                </div>
              </CardHeader>
              <CardBody className="pt-5">
                <form onSubmit={submit} className="space-y-5">
                  <div>
                    <label className="block text-[11.5px] tracking-wide uppercase text-ink-700/70 font-medium mb-2">
                      Acuity level (ESI-adapted)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {ACUITY_LEVELS.map(a => {
                        const Icon = a.icon;
                        const active = acuity === a.level;
                        return (
                          <button
                            key={a.level}
                            type="button"
                            onClick={() => setAcuity(a.level)}
                            className={`px-3 py-3 rounded-md border text-left select-none ${
                              active ? `${a.style} ring-1 ring-current` : 'border-bone-300 bg-surface-raised text-ink-700 hover:border-ink-700/40'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <Icon className={`size-4 ${active ? a.iconColor : 'text-ink-700/55'}`} strokeWidth={1.85} />
                              <span className="font-mono text-[11px] opacity-70">L{a.level}</span>
                            </div>
                            <div className="text-[13px] font-semibold leading-tight">{a.label}</div>
                            <div className={`text-[11px] mt-0.5 ${active ? 'opacity-80' : 'text-ink-700/60'}`}>{a.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11.5px] tracking-wide uppercase text-ink-700/70 font-medium mb-1.5">Chief complaint</label>
                    <input
                      type="text"
                      value={complaint}
                      onChange={e => setComplaint(e.target.value)}
                      placeholder="e.g. persistent cough, blood test review, prescription refill"
                      className="w-full px-3.5 py-2.5 rounded-md border border-bone-300 bg-surface-raised text-[13.5px] text-ink-900 placeholder:text-ink-700/40 focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900/15"
                    />
                    <div className="text-[11px] text-ink-700/60 mt-1.5 italic">
                      Used by the journey-routing classifier to assign A/B/C/D path. Keywords like "test", "lab", "refill" affect routing.
                    </div>
                  </div>
                  <div className="pt-1 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submitting || !acuity || !complaint}
                      className="px-5 py-2.5 rounded-md text-[13.5px] bg-ink-900 text-bone-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink-700 inline-flex items-center gap-2 select-none"
                    >
                      {submitting ? 'Routing patient…' : (<>Assign journey <ArrowRight className="size-3.5" strokeWidth={2} /></>)}
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="px-3 py-2 rounded-md text-[12.5px] text-ink-700 hover:bg-bone-200/60 select-none"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}
          {result && (
            <Card accent>
              <CardHeader className="border-b border-bone-200">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-full bg-success-50 grid place-items-center">
                    <CheckCircle2 className="size-4 text-success-600" strokeWidth={1.85} />
                  </div>
                  <div>
                    <div className="text-[15.5px] text-ink-900 leading-tight tracking-tight font-semibold">Journey assigned</div>
                    <div className="text-[11.5px] text-ink-700/65">{result.patient.name} · {result.patient.journeyLabel}</div>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="pt-4">
                <div className="text-[11.5px] tracking-wide uppercase text-ink-700/65 font-medium mb-3">Predicted journey · finishes around {result.estimatedFinish}</div>
                <ol className="relative space-y-3 ml-2">
                  {result.stages.map((stage, i) => (
                    <li key={i} className="flex items-start gap-3.5">
                      <div className="flex flex-col items-center pt-0.5">
                        <span className={`size-2.5 rounded-full ${
                          stage.status === 'done' ? 'bg-success-600'
                          : stage.status === 'current' ? 'bg-ink-900 ring-2 ring-ink-900/20'
                          : 'bg-bone-300'
                        }`} />
                        {i < result.stages.length - 1 && <span className="w-px flex-1 bg-bone-300 mt-1" style={{ minHeight: 24 }} />}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2">
                          <StationBadge station={stage.station} />
                          {stage.status === 'done' && <span className="text-[11px] text-success-600 italic">done</span>}
                          {stage.status === 'current' && <span className="text-[11px] text-ink-900 font-medium uppercase tracking-wider">→ next</span>}
                        </div>
                        {stage.status !== 'done' && (
                          <div className="mt-1 flex items-center gap-3 text-[12px] text-ink-700">
                            {stage.position && <span>Position <span className="font-medium text-ink-900 tnum">#{stage.position}</span></span>}
                            <span className="tnum">est. {stage.estStart} – {stage.estEnd}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 pt-4 border-t border-bone-200 flex items-center justify-between">
                  <div className="text-[12px] text-ink-700/70 italic">Patient has been notified via SMS and may leave the premises.</div>
                  <button
                    onClick={reset}
                    className="px-3.5 py-1.5 rounded-md text-[12.5px] bg-surface-sunken text-ink-800 hover:bg-bone-200/70 font-medium select-none"
                  >
                    Triage next patient
                  </button>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
