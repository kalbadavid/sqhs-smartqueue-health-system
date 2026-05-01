import { STATION_META } from '../api/api';

const TONE = {
  triage:   'bg-triage-50 text-triage-900 ring-triage-600/15',
  doctor:   'bg-doctor-50 text-doctor-900 ring-doctor-600/15',
  lab:      'bg-lab-50 text-lab-900 ring-lab-600/15',
  pharmacy: 'bg-pharmacy-50 text-pharmacy-900 ring-pharmacy-600/15',
  emergency: 'bg-alert-50 text-alert-900 ring-alert-600/15',
};

export default function StationBadge({ station, size = 'sm' }) {
  const meta = STATION_META[station] ?? { label: station, tone: 'doctor' };
  const sz = size === 'lg' ? 'text-xs px-2.5 py-1' : 'text-[10.5px] px-2 py-0.5';
  return (
    <span className={`inline-flex items-center font-medium rounded ring-1 tracking-tight ${TONE[meta.tone]} ${sz}`}>
      {meta.label}
    </span>
  );
}
