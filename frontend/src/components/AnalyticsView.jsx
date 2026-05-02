import { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody, CardTitle } from './Card';
import { getAnalytics, STATION_META } from '../api/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Lightbulb, TrendingUp } from 'lucide-react';
import StationBadge from './StationBadge';

export default function AnalyticsView({ days = 7 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeStation, setActiveStation] = useState('triage');

  useEffect(() => {
    let active = true;
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const res = await getAnalytics(days);
        if (active) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchAnalytics();
    return () => { active = false; };
  }, [days]);

  if (loading) {
    return <div className="p-8 text-center text-ink-700/60 animate-pulse">Loading analytics...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-alert-600">Failed to load analytics: {error}</div>;
  }

  if (!data) return null;

  // Filter logs for active station
  const stationLogs = data.logs.filter(l => l.station === activeStation);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-bone-200 pb-4 overflow-x-auto no-scrollbar">
        {Object.keys(STATION_META).map(st => (
          <button
            key={st}
            onClick={() => setActiveStation(st)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              activeStation === st 
                ? 'bg-ink-900 text-bone-50' 
                : 'bg-bone-100 text-ink-700 hover:bg-bone-200'
            }`}
          >
            {STATION_META[st].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card accent>
          <CardHeader className="border-b border-bone-200">
            <CardTitle>Daily Patient Volume</CardTitle>
          </CardHeader>
          <CardBody className="pt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stationLogs} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                />
                <Bar dataKey="total_patients" name="Total Patients" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card accent>
          <CardHeader className="border-b border-bone-200">
            <CardTitle>Average Wait Times (min)</CardTitle>
          </CardHeader>
          <CardBody className="pt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stationLogs} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="avg_wait_minutes" name="Avg Wait" stroke="#10B981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="max_wait_minutes" name="Max Wait" stroke="#EF4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card accent>
        <CardHeader className="border-b border-bone-200">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-4 text-ink-700" />
            <CardTitle>Predictive Staffing Insights</CardTitle>
          </div>
        </CardHeader>
        <CardBody className="pt-5 pb-5 space-y-6 bg-surface-sunken/30">
          
          {/* Network-level insight as a prominent banner */}
          {data.insights.filter(i => i.station === 'Network').map((insight, idx) => (
            <div key={`net-${idx}`} className="flex gap-4 bg-alert-50/50 p-4 rounded-xl border border-alert-600/20 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1 bg-alert-600/80" />
              <TrendingUp className="size-6 mt-1 shrink-0 text-alert-600" strokeWidth={1.8} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[15px] font-semibold text-alert-900 tracking-tight">
                    {insight.day_of_week} Trend (Network)
                  </span>
                </div>
                <div className="text-[14px] text-alert-900/80 font-medium mb-1.5">
                  {insight.expected_surge}
                </div>
                <div className="text-[13px] text-alert-900/70 leading-relaxed max-w-3xl">
                  {insight.suggestion}
                </div>
              </div>
            </div>
          ))}

          {/* Station-level breakdowns in a grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.insights.filter(i => i.station !== 'Network').map((insight, idx) => (
              <div key={`st-${idx}`} className="flex gap-3 bg-surface-raised p-4 rounded-xl border border-bone-200 shadow-[var(--shadow-card)] hover-lift">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[13.5px] font-semibold text-ink-900 truncate">
                      {insight.day_of_week} Trend
                    </span>
                    <StationBadge station={insight.station} />
                  </div>
                  <div className="text-[13px] text-ink-800 font-medium mb-1.5">
                    {insight.expected_surge}
                  </div>
                  <div className="text-[12px] text-ink-700/80 leading-relaxed">
                    {insight.suggestion}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </CardBody>
      </Card>
    </div>
  );
}
