import { useEffect, useState } from 'react';

export default function LiveIndicator({ lastUpdated }) {
  const [age, setAge] = useState(0);

  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => setAge(Math.floor((Date.now() - lastUpdated) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  return (
    <div className="flex items-center gap-2 text-[11.5px] text-ink-700/70">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-40 breathe motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-success-600" />
      </span>
      <span className="tracking-wide uppercase font-medium">Live</span>
      <span className="text-ink-700/50">·</span>
      <span className="tnum">updated {age}s ago</span>
    </div>
  );
}
