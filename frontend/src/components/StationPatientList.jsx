import { useEffect, useState, useRef } from 'react';
import { getStationQueue, advancePatient, skipPatient, enterPatient, getPendingLabResults, collectLabSample } from '../api/api';
import { CheckCircle, Loader2, AlertOctagon, AlertTriangle, Activity, ArrowRight, SkipForward, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const ACUITY_STYLES = {
  1: { label: 'L1 Immediate',  cls: 'bg-alert-50 text-alert-900 ring-alert-600/30',          icon: AlertOctagon },
  2: { label: 'L2 Urgent',     cls: 'bg-pharmacy-50 text-pharmacy-900 ring-pharmacy-600/30', icon: AlertTriangle },
  3: { label: 'L3 Routine',    cls: 'bg-success-50 text-ink-900 ring-success-600/25',         icon: Activity },
};

const SKIP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Given a calledAt ISO string, return remaining ms until timeout (can be negative). */
function remainingMs(calledAt) {
  if (!calledAt) return null;
  const called = new Date(calledAt + 'Z'); // backend sends UTC without 'Z'
  return SKIP_TIMEOUT_MS - (Date.now() - called.getTime());
}

/** Format remaining ms as "M:SS" countdown string. */
function fmtCountdown(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function StationPatientList({ station, onChange }) {
  const [rows, setRows] = useState([]);
  const [pendingRows, setPendingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState(null);
  const [skippingId, setSkippingId] = useState(null);
  const [enteringId, setEnteringId] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0); // drives re-render for countdown

  const refresh = async () => {
    try {
      const data = await getStationQueue(station);
      setRows(data);
      if (station === 'lab') {
        const pendingData = await getPendingLabResults();
        setPendingRows(pendingData);
      } else {
        setPendingRows([]);
      }
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

  // Tick every second so countdowns update live
  useEffect(() => {
    const hasCalledPatients = rows.some(p => p.calledAt);
    if (!hasCalledPatients) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [rows]);

  const handleComplete = async (patientId, nextJourney = null) => {
    setAdvancingId(patientId);
    try {
      await advancePatient(patientId, nextJourney);
      await refresh();
      onChange?.();   // tell Dashboard to refresh its summary too
    } catch (err) {
      setError(err.message);
    } finally {
      setAdvancingId(null);
    }
  };

  const handleSkip = async (patientId) => {
    setSkippingId(patientId);
    try {
      await skipPatient(patientId);
      await refresh();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSkippingId(null);
    }
  };

  const handleEnter = async (patientId) => {
    setEnteringId(patientId);
    try {
      await enterPatient(patientId);
      await refresh();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnteringId(null);
    }
  };

  const handleCollect = async (patientId) => {
    setAdvancingId(patientId);
    try {
      await collectLabSample(patientId);
      await refresh();
      onChange?.();
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
  if (rows.length === 0 && pendingRows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12.5px] text-ink-700/60">
        No patients currently in this queue.
      </div>
    );
  }

  return (
    <div className="border-t border-bone-200 max-h-[420px] overflow-y-auto">
      {rows.length > 0 ? (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] tracking-wider uppercase text-ink-700/65 bg-bone-100/40">
            <th className="text-left px-4 py-2 font-medium w-10">#</th>
            <th className="text-left px-2 py-2 font-medium">Patient</th>
            <th className="text-left px-2 py-2 font-medium">Acuity</th>
            <th className="text-left px-2 py-2 font-medium hidden md:table-cell">Complaint</th>
            <th className="text-right px-2 py-2 font-medium tnum">Waited</th>
            <th className="text-center px-2 py-2 font-medium w-20">Timer</th>
            <th className="text-right px-4 py-2 font-medium w-36"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const acuity = ACUITY_STYLES[p.acuity] ?? null;
            const Icon = acuity?.icon;
            const isAdvancing = advancingId === p.id;
            const isSkipping = skippingId === p.id;
            const remaining = remainingMs(p.calledAt);
            const isExpired = remaining !== null && remaining <= 0;
            const isCalled = remaining !== null;
            const isEntered = !!p.enteredAt;
            const isEntering = enteringId === p.id;

            return (
              <tr key={p.id} className={`border-t border-bone-200/60 hover:bg-bone-100/40 transition-colors ${isExpired ? 'bg-alert-50/30' : ''}`}>
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
                {/* Countdown timer column */}
                <td className="px-2 py-2.5 text-center">
                  {isEntered ? (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-success-700">
                      <CheckCircle className="size-3" strokeWidth={2} />
                      ENTERED
                    </span>
                  ) : isCalled ? (
                    isExpired ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-alert-600 animate-pulse">
                        <Clock className="size-3" strokeWidth={2} />
                        OVERDUE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 tnum text-[11px] font-medium text-pharmacy-700">
                        <Clock className="size-3" strokeWidth={1.5} />
                        {fmtCountdown(remaining)}
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] text-ink-700/35">—</span>
                  )}
                </td>
                {/* Action buttons column */}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {/* Enter button - visible when called but not entered */}
                  {isCalled && !isEntered && (
                    <button
                      onClick={() => handleEnter(p.id)}
                      disabled={isEntering}
                      className="inline-flex items-center gap-1 px-2.5 py-1 mr-1.5 rounded text-[11.5px] font-medium bg-success-600 text-bone-50 hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isEntering ? (
                        <><Loader2 className="size-3 animate-spin" /> Entering</>
                      ) : (
                        <><ArrowRight className="size-3" /> Entered</>
                      )}
                    </button>
                  )}

                  {/* Skip button — only visible when timeout has expired and not entered */}
                  {isExpired && !isEntered && (
                    <button
                      onClick={() => handleSkip(p.id)}
                      disabled={isSkipping}
                      className="inline-flex items-center gap-1 px-2.5 py-1 mr-1.5 rounded text-[11.5px] font-medium bg-alert-600 text-bone-50 hover:bg-alert-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSkipping ? (
                        <><Loader2 className="size-3 animate-spin" /> Skipping</>
                      ) : (
                        <><SkipForward className="size-3" /> Skip</>
                      )}
                    </button>
                  )}

                  {station === 'triage' && (
                    <select
                      className="mr-2 px-2.5 py-1 border border-bone-300 rounded text-[11.5px] font-medium bg-bone-50 text-ink-900 hover:bg-bone-100 outline-none focus:ring-1 focus:ring-ink-900 focus:border-ink-900 transition-colors cursor-pointer"
                      onChange={(e) => {
                        p._nextStep = e.target.value;
                        setRows([...rows]); // force re-render
                      }}
                      defaultValue=""
                    >
                      <option value="">Standard Triage</option>
                      <option value="D">To Pharmacy (Refill)</option>
                    </select>
                  )}
                  {station === 'doctor' && (
                    <select
                      className="mr-2 px-2.5 py-1 border border-bone-300 rounded text-[11.5px] font-medium bg-bone-50 text-ink-900 hover:bg-bone-100 outline-none focus:ring-1 focus:ring-ink-900 focus:border-ink-900 transition-colors cursor-pointer"
                      onChange={(e) => p._nextStep = e.target.value}
                      defaultValue="A"
                    >
                      <option value="A">To Pharmacy</option>
                      <option value="B">To Lab (Return to me)</option>
                      <option value="E">To Lab (No return)</option>
                      <option value="F">To Lab → Pharmacy</option>
                      <option value="DONE">Discharge</option>
                    </select>
                  )}
                  
                  {station === 'triage' && (!p._nextStep || p._nextStep === '') ? (
                    isEntered ? (
                      <Link
                        to="/triage"
                        state={{ selectedPatientId: p.id }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium bg-triage-600 text-bone-50 hover:bg-triage-700 transition-colors"
                      >
                        Open Triage Desk <ArrowRight className="size-3" />
                      </Link>
                    ) : (
                      <button
                        disabled
                        title="Patient must be marked as 'Entered' first"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium bg-triage-600 text-bone-50 opacity-50 cursor-not-allowed transition-colors"
                      >
                        Open Triage Desk <ArrowRight className="size-3" />
                      </button>
                    )
                  ) : station === 'lab' ? (
                    <button
                      onClick={() => handleCollect(p.id)}
                      disabled={isAdvancing || !isEntered}
                      title={!isEntered ? "Patient must be marked as 'Entered' first" : undefined}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium bg-bone-200/60 hover:bg-ink-900 hover:text-bone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAdvancing ? (
                        <><Loader2 className="size-3 animate-spin" /> Collecting</>
                      ) : (
                        <><CheckCircle className="size-3" /> Collect Sample</>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleComplete(p.id, station === 'doctor' ? (p._nextStep || 'A') : (station === 'triage' ? p._nextStep : null))}
                      disabled={isAdvancing || !isEntered}
                      title={!isEntered ? "Patient must be marked as 'Entered' first" : undefined}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium bg-bone-200/60 hover:bg-ink-900 hover:text-bone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAdvancing ? (
                        <><Loader2 className="size-3 animate-spin" /> Advancing</>
                      ) : (
                        <><CheckCircle className="size-3" /> {station === 'emergency' ? 'Discharge' : (station === 'triage' && p._nextStep === 'D' ? 'Send to Pharmacy' : 'Mark complete')}</>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      ) : (
        <div className="px-4 py-6 text-center text-[12.5px] text-ink-700/60 border-b border-bone-200/60">
          No patients waiting for sample collection.
        </div>
      )}
      
      {/* Pending Results Section (Lab Only) */}
      {station === 'lab' && pendingRows.length > 0 && (
        <div className="mt-6 border-t border-bone-200 pt-4">
          <h3 className="px-4 text-[11px] font-bold text-ink-900 uppercase tracking-wider mb-2">Pending Results ({pendingRows.length})</h3>
          <table className="w-full text-[12.5px]">
            <tbody>
              {pendingRows.map(p => {
                const isAdvancing = advancingId === p.id;
                return (
                  <tr key={p.id} className="border-t border-bone-200/60 hover:bg-bone-100/40 transition-colors bg-bone-50/50">
                    <td className="px-4 py-2.5 tnum text-ink-700 w-10">—</td>
                    <td className="px-2 py-2.5">
                      <div className="font-medium text-ink-900 leading-tight">{p.name}</div>
                      <div className="text-[10.5px] font-mono text-ink-700/55">{p.id}</div>
                    </td>
                    <td className="px-2 py-2.5 text-right tnum text-ink-700">
                      Sample taken: {p.waitedMinutes} min ago
                    </td>
                    <td className="px-4 py-2.5 text-right w-48">
                      <button
                        onClick={() => handleComplete(p.id, null)} // Advances them to next step
                        disabled={isAdvancing}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11.5px] font-medium bg-doctor-600 text-bone-50 hover:bg-doctor-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isAdvancing ? (
                          <><Loader2 className="size-3 animate-spin" /> Sending</>
                        ) : (
                          <><ArrowRight className="size-3" /> Send Result</>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
