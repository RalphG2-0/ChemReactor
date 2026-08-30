import React, { useState, useEffect, useRef } from 'react';
import { Beaker, Rocket, Wind, Timer, Zap, Thermometer, Scale, Circle, EyeIcon, ChevronDown, Phone, PhoneIcon } from 'lucide-react';
import ProjectileLab from './ProjectileLab.jsx';
import GasLawsLab from './GasLawsLab.jsx';
import TitrationLab from './TitrationLab.jsx';
import RateLab from './RateLab.jsx';
import RedoxLab from './RedoxLab.jsx';
import PendulumLab from './PendulumLab.jsx';
import CalorimetryLab from './CalorimetryLab.jsx';
import OpticsLab from './OpticsLab.jsx';
import CircuitsLab from './CircuitsLab.jsx';
import EquilibriumLab from './EquilibriumLab.jsx';
import ContactForm from './ContactForm.jsx';

const GROUPS = [
  {
    key: 'physics',
    label: 'Physics',
    modules: [
      { key: 'projectile', label: 'Projectile Motion', icon: Rocket, Component: ProjectileLab },
      { key: 'pendulum', label: 'Pendulum Motion', icon: Wind, Component: PendulumLab },
      { key: 'optics', label: 'Optics', icon: EyeIcon, Component: OpticsLab },
      { key: 'circuits', label: 'Circuits', icon: Circle, Component: CircuitsLab },
    ],
  },
  {
    key: 'chemistry',
    label: 'Chemistry',
    modules: [
      { key: 'gaslaws', label: 'Gas Laws', icon: Wind, Component: GasLawsLab },
      { key: 'titration', label: 'Titration', icon: Beaker, Component: TitrationLab },
      { key: 'calorimetry', label: 'Calorimetry', icon: Thermometer, Component: CalorimetryLab },
      { key: 'rate', label: 'Rate of Reaction', icon: Timer, Component: RateLab },
      { key: 'redox', label: 'Redox', icon: Zap, Component: RedoxLab },
      { key: 'equilibrium', label: 'Equilibrium', icon: Scale, Component: EquilibriumLab },
    ],
  },
  {
    key: 'contact',
    label: 'Contact',
    modules: [
      { key: 'contact', label: 'Contact me', icon: PhoneIcon, Component: ContactForm },
    ],
  }
];

const MODULES = GROUPS.flatMap((g) => g.modules);

export default function App() {
  const [active, setActive] = useState('projectile');
  const [openGroup, setOpenGroup] = useState(null);
  const navRef = useRef(null);
  const closeTimer = useRef(null);
  const ActiveComponent = MODULES.find((m) => m.key === active).Component;

  // Close the dropdown on any click/tap outside the nav — needed for touch
  // devices (Android/iOS via Capacitor) where there's no real "hover out".
  useEffect(() => {
    function handleOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function openOnHover(key) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenGroup(key);
  }
  function closeOnLeave() {
    // small delay so moving the mouse from trigger -> dropdown doesn't flicker-close
    closeTimer.current = setTimeout(() => setOpenGroup(null), 120);
  }

  return (
    <div style={{ background: '#0B0F14', minHeight: '100vh' }}>
      {/* Tab bar */}
      <div style={{ background: '#0F1720', borderBottom: '1px solid #1E2A35' }} className="sticky top-0 z-20">
        <div ref={navRef} className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-1 px-4">
          {GROUPS.map((group, gi) => {
            const activeModule = group.modules.find((m) => m.key === active);
            const isOpen = openGroup === group.key;
            return (
              <React.Fragment key={group.key}>
                {gi > 0 && (
                  <div
                    aria-hidden="true"
                    style={{ background: '#1E2A35' }}
                    className="hidden sm:block w-px self-stretch my-2 mx-1"
                  />
                )}
                <div
                  className="relative"
                  onMouseEnter={() => openOnHover(group.key)}
                  onMouseLeave={closeOnLeave}
                >
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : group.key)}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    style={{
                      color: activeModule ? '#5EEAD4' : '#7B8894',
                      borderBottom: activeModule ? '2px solid #5EEAD4' : '2px solid transparent',
                    }}
                    className="flex items-center gap-1.5 px-3 py-3 text-xs font-mono transition-colors whitespace-nowrap"
                  >
                    <span
                      style={{ color: '#3A4753', letterSpacing: '0.1em' }}
                      className="hidden sm:inline text-[9px] uppercase mr-1"
                    >
                      {group.label}
                    </span>
                    {activeModule && (
                      <span className="flex items-center gap-1.5">
                        <activeModule.icon size={14} />
                        {activeModule.label}
                      </span>
                    )}
                    <ChevronDown
                      size={12}
                      style={{
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease',
                        opacity: 0.7,
                      }}
                    />
                  </button>

                  {isOpen && (
                    <div
                      role="menu"
                      style={{ background: '#0F1720', border: '1px solid #1E2A35' }}
                      className="absolute left-0 top-full min-w-[210px] rounded-b-md shadow-lg z-30 py-1 overflow-hidden"
                    >
                      {group.modules.map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          role="menuitem"
                          onClick={() => {
                            setActive(key);
                            setOpenGroup(null);
                          }}
                          style={{ color: active === key ? '#5EEAD4' : '#B8C2CC' }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-mono text-left hover:bg-white/5 transition-colors"
                        >
                          <Icon size={14} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

    <ActiveComponent />
      {/* Footer */}
    <footer
      style={{ background: '#0e0e0f', borderTop: '1px solid #1E2A35', color: '#7B8894' }}
      className="mt-8 px-4 py-6 text-xs font-mono text-center"
    >
      © {new Date().getFullYear()} ChemReactor — built by Raphaël
    </footer>
    </div>
    
  );
}