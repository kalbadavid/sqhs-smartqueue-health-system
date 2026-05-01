import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UserPlus, Stethoscope, Activity, Sun, Moon } from 'lucide-react';
import useTheme from '../hooks/useTheme';

const NAV = [
  { to: '/',          label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/register',  label: 'Registration', icon: UserPlus },
  { to: '/triage',    label: 'Triage',       icon: Stethoscope },
];

export default function Sidebar() {
  const [theme, toggleTheme] = useTheme();

  return (
    <aside className="w-60 shrink-0 border-r border-bone-200 bg-surface-sunken/60 backdrop-blur-sm flex flex-col">
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-ink-900 grid place-items-center">
            <Activity className="size-4 text-bone-50" strokeWidth={2.25} />
          </div>
          <div>
            <div className="text-[17px] leading-none font-bold tracking-tight text-ink-900">SmartQueue</div>
            <div className="text-[10.5px] tracking-[0.16em] uppercase text-ink-700/65 mt-1 font-medium">Health system</div>
          </div>
        </div>
      </div>

      <nav className="px-3 flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-[13.5px] select-none ${
                isActive
                  ? 'bg-ink-900 text-bone-50 font-medium shadow-[var(--shadow-nav-active)]'
                  : 'text-ink-700 hover:bg-bone-200/70'
              }`
            }
          >
            <Icon className="size-[17px]" strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-3 pb-4">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-ink-700 hover:bg-bone-200/70 select-none"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark'
            ? <><Sun className="size-[16px]" strokeWidth={1.75} /> Light mode</>
            : <><Moon className="size-[16px]" strokeWidth={1.75} /> Dark mode</>}
        </button>
        <div className="mt-3 pt-3 border-t border-bone-200 px-2 text-[11px] text-ink-700/60">
          <div className="font-medium tracking-wide uppercase mb-1">Mocked backend</div>
          <p className="leading-relaxed">All data is generated in memory. The contract maps 1:1 to the planned FastAPI endpoints.</p>
        </div>
      </div>
    </aside>
  );
}
