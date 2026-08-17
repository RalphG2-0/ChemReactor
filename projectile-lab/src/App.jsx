import React, { useState } from 'react';
import { Beaker, Rocket, Wind, Timer, Zap, Sun, Moon } from 'lucide-react';
import { useTheme } from './theme.jsx';
import ProjectileLab from './ProjectileLab.jsx';
import GasLawsLab from './GasLawsLab.jsx';
import TitrationLab from './TitrationLab.jsx';
import RateLab from './RateLab.jsx';
import RedoxLab from './RedoxLab.jsx';

const GROUPS = [
  {
    key: 'physics',
    label: 'Physics',
    modules: [
      { key: 'projectile', label: 'Projectile Motion', icon: Rocket, Component: ProjectileLab },
    ],
  },
  {
    key: 'chemistry',
    label: 'Chemistry',
    modules: [
      { key: 'gaslaws', label: 'Gas Laws', icon: Wind, Component: GasLawsLab },
      { key: 'titration', label: 'Titration', icon: Beaker, Component: TitrationLab },
      { key: 'rate', label: 'Rate of Reaction', icon: Timer, Component: RateLab },
      { key: 'redox', label: 'Redox', icon: Zap, Component: RedoxLab },
    ],
  },
];

const MODULES = GROUPS.flatMap((g) => g.modules);

export default function App() {
  const [active, setActive] = useState('projectile');
  const { theme, colors: clr, toggleTheme } = useTheme();
  const ActiveComponent = MODULES.find((m) => m.key === active).Component;

  return (
    <div style={{ background: clr.bgPage, minHeight: '100vh' }}>
      {/* Tab bar */}
      <div style={{ background: clr.bgCard, borderBottom: `1px solid ${clr.border}` }} className="sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-1 gap-y-0 px-4">
          {GROUPS.map((group, gi) => (
            <React.Fragment key={group.key}>
              {gi > 0 && (
                <div
                  aria-hidden="true"
                  style={{ background: clr.border }}
                  className="hidden sm:block w-px self-stretch my-2 mx-1"
                />
              )}
              <span
                style={{ color: clr.borderMid, letterSpacing: '0.1em' }}
                className="hidden sm:block text-[9px] font-mono uppercase mr-1"
              >
                {group.label}
              </span>
              {group.modules.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  style={{
                    color: active === key ? clr.accent : clr.textDim,
                    borderBottom: active === key ? `2px solid ${clr.accent}` : '2px solid transparent',
                  }}
                  className="flex items-center gap-1.5 px-3 py-3 text-xs font-mono transition-colors whitespace-nowrap"
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </React.Fragment>
          ))}

          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label="Toggle color theme"
            style={{ color: clr.textDim, border: `1px solid ${clr.borderStrong}` }}
            className="ml-auto my-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      <ActiveComponent />
    </div>
  );
}