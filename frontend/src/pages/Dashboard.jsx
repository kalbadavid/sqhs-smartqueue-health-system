import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardBody, CardTitle } from '../components/Card';
import PageHeader from '../components/PageHeader';
import StationBadge from '../components/StationBadge';
import { getQueueSummary, getRecommendations, STATION_META } from '../api/api';
import { AlertTriangle, AlertCircle, CheckCircle2, Users, Clock, Gauge, Target, ChevronDown } from 'lucide-react';
import LiveIndicator from '../components/LiveIndicator';
import useChangeFlash from '../hooks/useChangeFlash';
import AnimatedNumber from '../components/AnimatedNumber';
import StationPatientList from '../components/StationPatientList';

const REC_STYLES = {
  critical: { wrap: 'border-alert-600/30 bg-alert-50/60', icon: AlertCircle, iconColor: 'text-alert-600', title: 'text-alert-900' },
  warning: { wrap: 'border-pharmacy-600/30 bg-pharmacy-50/60', icon: AlertTriangle, iconColor: 'text-pharmacy-600', title: 'text-pharmacy-900' },
  ok: { wrap: 'border-success-600/25 bg-success-50/50', icon: CheckCircle2, iconColor: 'text-success-600', title: 'text-ink-900' },
};

function Kpi({ icon: Icon, label, value, suffix, footnote, tone }) {
  const flashing = useChangeFlash(value);
  return (
    <Card accent className={`px-5 py-4 hover-lift transition-colors duration-700 ${flashing ? 'bg-success-50/40 motion-reduce:bg-transparent' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="text-[11px] tracking-[0.16em] uppercase text-ink-700/65 font-medium">{label}</div>
        <Icon className="size-4 text-ink-700/50" strokeWidth={1.75} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5 min-w-0">
        <div className={`text-[34px] leading-none tracking-tight font-semibold tnum truncate ${tone ?? 'text-ink-900'}`}>{value}</div>
        {suffix && <div className="text-sm text-ink-700/70 font-medium shrink-0">{suffix}</div>}
      </div>
      {footnote && <div className="mt-2 text-[11.5px] text-ink-700/65">{footnote}</div>}
    </Card>
  );
}

function StationCard({ s, expanded, onToggle, onPatientChange }) {
  const meta = STATION_META[s.station];
  const isHot = s.waitP50 >= 35;
  const accentBars = {
    triage: { bg: 'bg-triage-200/60', fill: 'bg-triage-600' },
    doctor: { bg: 'bg-doctor-200/55', fill: 'bg-doctor-600' },
    lab: { bg: 'bg-lab-200/55', fill: 'bg-lab-600' },
    pharmacy: { bg: 'bg-pharmacy-200/60', fill: 'bg-pharmacy-600' },
    emergency: { bg: 'bg-alert-200/60', fill: 'bg-alert-600' },
  }[meta.tone];
  const headerBg = {
    triage: 'bg-triage-50/80 border-triage-600/15',
    doctor: 'bg-doctor-50/80 border-doctor-600/15',
    lab: 'bg-lab-50/80 border-lab-600/15',
    pharmacy: 'bg-pharmacy-50/80 border-pharmacy-600/15',
    emergency: 'bg-alert-50/80 border-alert-600/15',
  }[meta.tone];
  const flashing = useChangeFlash(s.inQueue);

  return (
    <Card 
      className={`overflow-hidden transition-colors duration-700 ${expanded ? '' : 'hover-lift cursor-pointer'} ${isHot ? 'ring-2 ring-alert-600/40' : ''} ${flashing ? 'bg-success-50/30 motion-reduce:bg-transparent' : ''}`} 
      accent
      onClick={!expanded ? onToggle : undefined}
    >
      <button
        onClick={expanded ? onToggle : undefined}
        className={`w-full px-4 py-2.5 border-b ${headerBg} text-left transition-colors hover:brightness-95 ${!expanded ? 'pointer-events-none' : ''}`}
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[15.5px] font-semibold text-ink-900 tracking-tight">{meta.label}</h3>
            {isHot && <span className="size-1.5 rounded-full bg-alert-600 breathe" />}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-700/55 italic hidden sm:inline">{meta.source}</span>
            <div className="flex items-center gap-1 text-ink-700/60">
              <span className="text-[10px] font-medium uppercase tracking-widest">{expanded ? 'Collapse' : 'Expand'}</span>
              <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={2} />
            </div>
          </div>
        </div>
      </button>
      <div className="px-4 py-3.5 space-y-2.5">
        <Row label="In queue" value={
          <span className={`tnum text-[26px] leading-none font-semibold ${isHot ? 'text-alert-600' : 'text-ink-900'}`}>
            <AnimatedNumber value={s.inQueue} />
          </span>
        } />
        <Row label="Avg wait (P50)" value={
          <span className={`tnum text-[13.5px] font-medium ${isHot ? 'text-alert-600' : 'text-ink-900'}`}>
            <AnimatedNumber value={s.waitP50} /> min
          </span>
        } />
        <Row label="P90 wait" value={
          <span className="tnum text-[13.5px] text-ink-700">
            <AnimatedNumber value={s.waitP90} /> min
          </span>
        } />
        <Row label={`${meta.role} on duty`} value={<span className={`tnum text-[13.5px] ${isHot ? 'text-alert-600 font-medium' : 'text-ink-700'}`}>{s.servers}</span>} />
        <div className={`mt-2 h-1 rounded-full ${accentBars.bg} relative overflow-hidden`}>
          <div className={`absolute inset-y-0 left-0 ${accentBars.fill} rounded-full bar-fill`} style={{ width: `${Math.round(s.utilization * 100)}%` }} />
        </div>
      </div>
      {expanded && <StationPatientList station={s.station} onChange={onPatientChange} />}
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-ink-700/75">{label}</span>
      {value}
    </div>
  );
}

/* ── Skeleton loader — uses theme-aware surface tokens ────────── */
function DashboardSkeleton() {
  return (
    <div className="page-enter">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="skeleton h-3 w-24 mb-2" />
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-4 w-96" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-bone-200 bg-surface px-5 py-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton size-4 rounded" />
            </div>
            <div className="skeleton h-9 w-16 mt-3" />
            <div className="skeleton h-3 w-20 mt-2" />
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-bone-200 bg-surface overflow-hidden shadow-[var(--shadow-card)]">
            <div className="px-4 py-2.5 border-b border-bone-200 bg-bone-100/40">
              <div className="skeleton h-4 w-28" />
            </div>
            <div className="px-4 py-3.5 space-y-3">
              <div className="skeleton h-7 w-12" />
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-1 w-full mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [recs, setRecs] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [expandedStation, setExpandedStation] = useState(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [s, r] = await Promise.all([getQueueSummary(), getRecommendations()]);
        if (live) {
          setSummary(s);
          setRecs(r);
          setLastUpdated(Date.now());
          setLoadError(null);
        }
      } catch (err) {
        if (live) setLoadError(err.message);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (loadError) {
    return (
      <div className="page-enter">
        <div className="rounded-lg border border-alert-600/30 bg-alert-50 p-5 max-w-2xl">
          <div className="font-semibold text-alert-900 mb-1">Cannot reach backend</div>
          <div className="text-[13px] text-ink-700 leading-relaxed">{loadError}</div>
          <div className="text-[12px] text-ink-700/70 mt-2">
            Make sure the FastAPI backend is running at {import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}.
          </div>
        </div>
      </div>
    );
  }
  if (!summary) return <DashboardSkeleton />;
  const bottleneck = STATION_META[summary.bottleneck.station];

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Live · 5 stations" title="Network operations" subtitle="Real-time view of patient flow across the outpatient department, modelled as an Open Jackson queueing network." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi 
          icon={Users} 
          label="Patients in network" 
          value={<AnimatedNumber value={summary.totalPatients} />} 
          footnote="across 5 stations" 
        />
        <Kpi 
          icon={Clock} 
          label="Avg total visit" 
          value={<AnimatedNumber value={summary.avgVisitMinutes} format={(v) => `${Math.floor(v / 60)}h ${Math.round(v) % 60}m`} />} 
          footnote="vs. 1h 58m baseline" 
          tone="text-pharmacy-900" 
        />
        <Kpi 
          icon={Target} 
          label="Bottleneck" 
          value={bottleneck.label.split(' ')[0]} 
          suffix={<><AnimatedNumber value={summary.bottleneck.waitP50} /> min</>} 
          footnote={`${bottleneck.label} is binding`} 
          tone="text-alert-600" 
        />
        <Kpi 
          icon={Gauge} 
          label="Model accuracy (24h MAE)" 
          value={<AnimatedNumber value={summary.modelMaeMinutes} format={(v) => v.toFixed(1)} />} 
          suffix="min" 
          footnote="across 5 station models" 
          tone="text-success-600" 
        />
      </div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg text-ink-900 tracking-tight font-semibold">Live queue — by station</h2>
        <LiveIndicator lastUpdated={lastUpdated} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-7">
        {summary.stations.map(s => (
          <StationCard
            key={s.station}
            s={s}
            expanded={false}
            onToggle={() => setExpandedStation(s.station)}
            onPatientChange={() => {}}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card accent>
            <CardHeader className="border-b border-bone-200">
              <div className="flex items-center justify-between">
                <CardTitle>Recommended actions</CardTitle>
                <span className="text-[10.5px] tracking-wider uppercase text-ink-700/55">SHAP-driven</span>
              </div>
            </CardHeader>
            <CardBody className="space-y-2.5 pt-4">
              {recs.map((r, i) => {
                const s = REC_STYLES[r.level];
                const Icon = s.icon;
                return (
                  <div key={i} className={`rounded-lg border ${s.wrap} px-3.5 py-3 flex gap-3`}>
                    <Icon className={`size-[18px] mt-0.5 shrink-0 ${s.iconColor}`} strokeWidth={1.85} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[13.5px] font-semibold ${s.title}`}>{r.title}</span>
                        <StationBadge station={r.station} />
                      </div>
                      <div className="text-[12.5px] text-ink-700 leading-relaxed">{r.detail}</div>
                      <div className="text-[11.5px] text-ink-700/70 italic mt-1">{r.impact}</div>
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>
        <Card accent>
          <CardHeader className="border-b border-bone-200">
            <CardTitle>Outgoing patient SMS</CardTitle>
          </CardHeader>
          <CardBody className="pt-4">
            <div className="text-[11px] text-ink-700/65 mb-2">Patient #4471 · +234 803 ••• 2840</div>
            <div className="rounded-lg bg-doctor-50/60 ring-1 ring-doctor-600/15 px-3.5 py-3 text-[12.5px] leading-relaxed">
              <div className="font-semibold text-doctor-900 mb-2">Hello Adaeze, your visit summary:</div>
              <div className="text-success-600 font-medium">✓ Triage — done (8 min)</div>
              <div className="text-ink-900 font-medium mt-1.5">→ Dr. Okoro — Position #4</div>
              <div className="text-doctor-900/85 text-[11.5px]">est. 10:55 — 11:15</div>
              <div className="text-ink-800 mt-1.5">· Lab — Position #6 in queue</div>
              <div className="text-doctor-900/85 text-[11.5px]">est. 11:30 — 12:00</div>
              <div className="text-ink-800 mt-1.5">· Pharmacy — Position #14 in queue</div>
              <div className="text-doctor-900/85 text-[11.5px]">est. 12:20 — 13:05</div>
              <div className="border-t border-doctor-600/15 mt-2.5 pt-2 text-[11.5px] italic text-doctor-900/85">You may leave the premises. We will text you 15 min before each step.</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Modal Overlay */}
      {expandedStation && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-md animate-in fade-in cursor-pointer" 
            style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', animationDuration: '600ms' }}
            onClick={() => setExpandedStation(null)} 
          />
          
          {/* Modal Content */}
          <div 
            className="relative w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl rounded-2xl animate-in fade-in zoom-in-90 slide-in-from-bottom-8"
            style={{ animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', animationDuration: '600ms' }}
          >
            <StationCard 
              s={summary.stations.find(s => s.station === expandedStation)}
              expanded={true}
              onToggle={() => setExpandedStation(null)}
              onPatientChange={async () => {
                const [s2, r2] = await Promise.all([getQueueSummary(), getRecommendations()]);
                setSummary(s2);
                setRecs(r2);
                setLastUpdated(Date.now());
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
