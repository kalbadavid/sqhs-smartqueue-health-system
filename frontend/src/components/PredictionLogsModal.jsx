import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardBody, CardTitle } from './Card';
import StationBadge from './StationBadge';
import { getPredictionLogs, STATION_META } from '../api/api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { X, Activity, TrendingDown, TrendingUp, Hash, BarChart3 } from 'lucide-react';

/* ── Colour coding helper ── */
function errorTone(absErr) {
  if (absErr <= 5) return { bg: 'bg-success-50/60', text: 'text-success-700', border: 'border-success-600/20', label: 'Accurate' };
  if (absErr <= 15) return { bg: 'bg-pharmacy-50/60', text: 'text-pharmacy-800', border: 'border-pharmacy-600/20', label: 'Moderate' };
  return { bg: 'bg-alert-50/60', text: 'text-alert-700', border: 'border-alert-600/20', label: 'High error' };
}

/* ── Mini KPI card inside the modal ── */
function MiniKpi({ icon: Icon, label, value, tone = 'text-ink-900' }) {
  return (
    <div className="rounded-lg border border-bone-200 bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="size-3.5 text-ink-700/55" strokeWidth={1.75} />
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-ink-700/60 font-medium">{label}</span>
      </div>
      <div className={`text-[22px] leading-none font-semibold tracking-tight tnum ${tone}`}>{value}</div>
    </div>
  );
}

/* ── Per-station MAE bar ── */
function StationMaeBar({ detail, maxMae }) {
  const pct = maxMae > 0 ? Math.round((detail.mae / maxMae) * 100) : 0;
  const barTones = {
    triage: 'bg-triage-600',
    doctor: 'bg-doctor-600',
    lab: 'bg-lab-600',
    pharmacy: 'bg-pharmacy-600',
    emergency: 'bg-alert-600',
  };
  const fill = barTones[detail.station] || 'bg-ink-600';
  const biasDir = detail.avg_error > 0 ? 'over-predicts' : 'under-predicts';

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0">
        <StationBadge station={detail.station} />
      </div>
      <div className="flex-1 h-2.5 rounded-full bg-bone-200/70 relative overflow-hidden">
        <div className={`absolute inset-y-0 left-0 rounded-full ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 shrink-0 text-right">
        <span className="text-[13px] font-semibold tnum text-ink-900">{detail.mae} min</span>
        <span className="text-[11px] text-ink-700/60 ml-1.5">({detail.count})</span>
      </div>
      <div className="w-28 shrink-0 text-right hidden lg:block">
        <span className={`text-[11px] ${detail.avg_error > 0 ? 'text-pharmacy-700' : 'text-doctor-700'}`}>
          {detail.avg_error > 0 ? '+' : ''}{detail.avg_error} min · {biasDir}
        </span>
      </div>
    </div>
  );
}

/* ── Main modal ── */
export default function PredictionLogsModal({ onClose }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPredictionLogs(days);
        if (active) setData(res);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [days]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const a = data?.analytics;
  const bestStation = a?.per_station?.length
    ? [...a.per_station].sort((x, y) => x.mae - y.mae)[0]
    : null;
  const worstStation = a?.per_station?.length
    ? [...a.per_station].sort((x, y) => y.mae - x.mae)[0]
    : null;
  const maxMae = a?.per_station?.length
    ? Math.max(...a.per_station.map(s => s.mae))
    : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-md animate-in fade-in cursor-pointer"
        style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', animationDuration: '600ms' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative mx-auto mt-8 mb-8 w-full max-w-5xl max-h-[calc(100vh-4rem)] flex flex-col bg-surface rounded-2xl border border-bone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-6"
        style={{ animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', animationDuration: '500ms' }}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-bone-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 tracking-tight">Prediction Logs</h2>
            <p className="text-[12.5px] text-ink-700/65 mt-0.5">Model accuracy breakdown — predicted vs. actual wait times</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Time range pills */}
            <div className="flex bg-bone-200/50 p-0.5 rounded-lg border border-bone-200">
              {[7, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-md text-[12.5px] font-medium transition-colors ${
                    days === d
                      ? 'bg-surface-raised shadow-sm text-ink-900 border border-bone-200'
                      : 'text-ink-700/60 hover:text-ink-900'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bone-100 text-ink-700/60 hover:text-ink-900 transition-colors">
              <X className="size-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="py-16 text-center text-ink-700/50 animate-pulse text-sm">Loading prediction data…</div>
          )}

          {error && (
            <div className="py-8 text-center text-alert-600 text-sm">{error}</div>
          )}

          {!loading && !error && data && (
            <>
              {/* ── KPI summary row ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MiniKpi
                  icon={Hash}
                  label="Total predictions"
                  value={a.total_predictions}
                />
                <MiniKpi
                  icon={Activity}
                  label="Network MAE"
                  value={a.overall_mae != null ? `${a.overall_mae} min` : '—'}
                  tone={a.overall_mae != null && a.overall_mae <= 10 ? 'text-success-600' : 'text-pharmacy-800'}
                />
                <MiniKpi
                  icon={TrendingDown}
                  label="Best station"
                  value={bestStation ? `${bestStation.station}` : '—'}
                  tone="text-success-600"
                />
                <MiniKpi
                  icon={TrendingUp}
                  label="Worst station"
                  value={worstStation ? `${worstStation.station}` : '—'}
                  tone="text-alert-600"
                />
              </div>

              {/* ── Per-station MAE breakdown ── */}
              {a.per_station.length > 0 && (
                <Card accent>
                  <CardHeader className="border-b border-bone-200">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="size-4 text-ink-700/60" strokeWidth={1.75} />
                      <CardTitle>MAE by station</CardTitle>
                    </div>
                  </CardHeader>
                  <CardBody className="pt-4 space-y-3">
                    {a.per_station
                      .sort((x, y) => y.mae - x.mae)
                      .map(d => (
                        <StationMaeBar key={d.station} detail={d} maxMae={maxMae} />
                      ))
                    }
                  </CardBody>
                </Card>
              )}

              {/* ── Daily MAE trend ── */}
              {a.daily_trend.length > 1 && (
                <Card accent>
                  <CardHeader className="border-b border-bone-200">
                    <CardTitle>Daily MAE trend ({days}d)</CardTitle>
                  </CardHeader>
                  <CardBody className="pt-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={a.daily_trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(val) => {
                            const d = new Date(val);
                            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#6B7280' }}
                          dy={8}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#6B7280' }}
                          unit=" min"
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                          labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                          formatter={(value) => [`${value} min`, 'MAE']}
                        />
                        <Line
                          type="monotone"
                          dataKey="mae"
                          name="MAE"
                          stroke="#10B981"
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 2 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              {/* ── Raw logs table ── */}
              <Card accent>
                <CardHeader className="border-b border-bone-200">
                  <div className="flex items-center justify-between">
                    <CardTitle>Raw prediction logs</CardTitle>
                    <span className="text-[11px] text-ink-700/55">{data.logs.length} rows (max 200)</span>
                  </div>
                </CardHeader>
                <CardBody className="p-0">
                  {data.logs.length === 0 ? (
                    <div className="py-12 text-center text-ink-700/50 text-sm">
                      No completed predictions in the last {days} days.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="border-b border-bone-200 bg-bone-50/50">
                            <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">Time</th>
                            <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">Patient</th>
                            <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">Station</th>
                            <th className="text-right px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">P50</th>
                            <th className="text-right px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">P90</th>
                            <th className="text-right px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">Actual</th>
                            <th className="text-right px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">Error</th>
                            <th className="text-center px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-ink-700/60 font-semibold">Pos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.logs.map(row => {
                            const tone = errorTone(row.abs_error);
                            return (
                              <tr key={row.id} className={`border-b border-bone-100 last:border-b-0 ${tone.bg} transition-colors hover:brightness-[0.97]`}>
                                <td className="px-4 py-2 text-ink-700/80 tnum whitespace-nowrap">{row.completed_at}</td>
                                <td className="px-4 py-2 font-medium text-ink-900 tnum">{row.patient_id}</td>
                                <td className="px-4 py-2"><StationBadge station={row.station} /></td>
                                <td className="px-4 py-2 text-right tnum text-ink-700">{row.predicted_p50} min</td>
                                <td className="px-4 py-2 text-right tnum text-ink-700/60">{row.predicted_p90} min</td>
                                <td className="px-4 py-2 text-right tnum font-medium text-ink-900">{row.actual_wait_min} min</td>
                                <td className={`px-4 py-2 text-right tnum font-semibold ${tone.text}`}>
                                  {row.error > 0 ? '+' : ''}{row.error} min
                                </td>
                                <td className="px-4 py-2 text-center tnum text-ink-700/60">#{row.position_at_prediction}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
