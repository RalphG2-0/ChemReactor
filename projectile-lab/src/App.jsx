import React, { useState } from 'react';
import { Beaker, Rocket, Wind, Timer, Zap } from 'lucide-react';
import ProjectileLab from './ProjectileLab.jsx';
import GasLawsLab from './GasLawsLab.jsx';
import TitrationLab from './TitrationLab.jsx';
import RateLab from './RateLab.jsx';
import RedoxLab from './RedoxLab.jsx';
import PendulumLab from './PendulumLab.jsx';

const GROUPS = [
  {
    key: 'physics',
    label: 'Physics',
    modules: [
      { key: 'projectile', label: 'Projectile Motion', icon: Rocket, Component: ProjectileLab },
      { key: 'pendulum', label: 'Pendulum Motion', icon: Wind, Component: PendulumLab },
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
  const ActiveComponent = MODULES.find((m) => m.key === active).Component;

  return (
    <div style={{ background: '#0B0F14', minHeight: '100vh' }}>
      {/* Tab bar */}
      <div style={{ background: '#0F1720', borderBottom: '1px solid #1E2A35' }} className="sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-1 gap-y-0 px-4">
          {GROUPS.map((group, gi) => (
            <React.Fragment key={group.key}>
              {gi > 0 && (
                <div
                  aria-hidden="true"
                  style={{ background: '#1E2A35' }}
                  className="hidden sm:block w-px self-stretch my-2 mx-1"
                />
              )}
              <span
                style={{ color: '#3A4753', letterSpacing: '0.1em' }}
                className="hidden sm:block text-[9px] font-mono uppercase mr-1"
              >
                {group.label}
              </span>
              {group.modules.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  style={{
                    color: active === key ? '#5EEAD4' : '#7B8894',
                    borderBottom: active === key ? '2px solid #5EEAD4' : '2px solid transparent',
                  }}
                  className="flex items-center gap-1.5 px-3 py-3 text-xs font-mono transition-colors whitespace-nowrap"
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      <ActiveComponent />
    </div>
  );
}
