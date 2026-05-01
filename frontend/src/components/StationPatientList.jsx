import { useEffect, useState } from 'react';
import { getStationQueue, advancePatient } from '../api/api';
import { CheckCircle, Loader2, AlertOctagon, AlertTriangle, Activity } from 'lucide-react';

const ACUITY_STYLES = {
  1: { label: 'L1 Immediate',  cls: 'bg-alert-50 text-alert-900 ring-alert-600/30',          icon: AlertOctagon },
  2: { label: 'L2 Urgent',     cls: 'bg-pharmacy-50 text-pharmacy-900 ring-pharmacy-600/30', icon: AlertTriangle },
  3: { label: 'L3 Routine',    cls: 'bg-success-50 text-ink-900 ring-success-600/25',         icon: Activity },
};

export default function StationPatientList({ station, onChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState(null);
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const data = await getStationQueue(station);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // No internal polling — Dashboard already polls every 5s and re-renders us.
  }, [station]);

  const handleComplete = async (patientId) => {
    setAdvancingId(patientId);
    try {
      await advancePatient(patientId);
      await refresh();
      onChange?.();   // tell Dashboard to refresh its summary too
    } catch (err) {
      setError(err.message);
    } finally {
      setAdvancingId(null);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-6 text-center text-[12.5px] text-ink-700/60">
        <Loader2 className="size-4 animate-spin inline-block mr-1.5 -mt-0.5" />
        Loading queue…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-4 text-[12.5px] text-alert-900">
        Couldn't load patient list: {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12.5px] text-ink-700/60">
        No patients currently in this queue.
      </div>
    );
  }

  return (
    <div className="border-t border-bone-200 max-h-[420px] overflow-y-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] tracking-wider uppercase text-ink-700/65 bg-bone-100/40">
            <th className="text-left px-4 py-2 font-medium w-10">#</th>
            <th className="text-left px-2 py-2 font-medium">Patient</th>
            <th className="text-left px-2 py-2 font-medium">Acuity</th>
            <th className="text-left px-2 py-2 font-medium hidden md:table-cell">Complaint</th>
            <th className="text-right px-2 py-2 font-medium tnum">Waited</th>
            <th className="text-right px-4 py-2 font-medium w-32"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const acuity = ACUITY_STYLES[p.acuity] ?? null;
            const Icon = acuity?.icon;
            const isAdvancing = advancingId === p.id;
            return (
              <tr key={p.id} className="border-t border-bone-200/60 hover:bg-bone-100/40 transition-colors">
                <td className="px-4 py-2.5 tnum text-ink-700">{p.position}</td>
                <td className="px-2 py-2.5">
                  <div className="font-medium text-ink-900 leading-tight">{p.name}</div>
                  <div className="text-[10.5px] font-mono text-ink-700/55">{p.id}</div>
                </td>
                <td className="px-2 py-2.5">
                  {acuity ? (
                    <span className={`inline-flex items-center gap-1 ring-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium ${acuity.cls}`}>
                      <Icon className="size-3" strokeWidth={2} />
                      {acuity.label}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-700/50">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-ink-700 hidden md:table-cell truncate max-w-[200px]">
                  {p.complaint || <span className="text-ink-700/45">—</span>}
                </td>
                <td className="px-2 py-2.5 text-right tnum text-ink-700">
                  {p.waitedMinutes} min
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => handleComplete(p.id)}
                    disabled={isAdvancing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium bg-bone-200/60 hover:bg-ink-900 hover:text-bone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAdvancing ? (
                      <><Loader2 className="size-3 animate-spin" /> Advancing</>
                    ) : (
                      <><CheckCircle className="size-3" /> Mark complete</>
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
