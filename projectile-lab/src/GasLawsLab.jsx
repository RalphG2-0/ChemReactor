import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot } from 'recharts';
import { Thermometer, FlaskConical } from 'lucide-react';
import { useQuestions } from './lib/useQuestions';

const R = 0.08206; // L·atm / (mol·K)
const VDW = { a: 3.592, b: 0.04267 }; // CO₂ approximation, L²·atm/mol², L/mol

const MODES = {
  boyle: {
    label: "Boyle's Law",
    law: 'P₁V₁ = P₂V₂',
    condition: '(constant T, n)',
    axisLabel: 'V (L)',
    yLabel: 'P (atm)',
    varLabel: 'Volume',
    varUnit: ' L',
    min: 5, max: 50, step: 1,
    defaults: { T: 300, n: 1 },
    constants: [
      { key: 'T', label: 'Temperature (held constant)', min: 150, max: 600, step: 5, unit: ' K' },
      { key: 'n', label: 'Moles (held constant)', min: 0.2, max: 5, step: 0.1, unit: ' mol', decimals: 1 },
    ],
  },
  charles: {
    label: "Charles's Law",
    law: 'V₁ / T₁ = V₂ / T₂',
    condition: '(constant P, n)',
    axisLabel: 'T (K)',
    yLabel: 'V (L)',
    varLabel: 'Temperature',
    varUnit: ' K',
    min: 150, max: 600, step: 5,
    defaults: { P: 1, n: 1 },
    constants: [
      { key: 'P', label: 'Pressure (held constant)', min: 0.2, max: 5, step: 0.1, unit: ' atm', decimals: 1 },
      { key: 'n', label: 'Moles (held constant)', min: 0.2, max: 5, step: 0.1, unit: ' mol', decimals: 1 },
    ],
  },
  gaylussac: {
    label: "Gay-Lussac's Law",
    law: 'P₁ / T₁ = P₂ / T₂',
    condition: '(constant V, n)',
    axisLabel: 'T (K)',
    yLabel: 'P (atm)',
    varLabel: 'Temperature',
    varUnit: ' K',
    min: 150, max: 600, step: 5,
    defaults: { V: 10, n: 1 },
    constants: [
      { key: 'V', label: 'Volume (held constant)', min: 5, max: 50, step: 1, unit: ' L' },
      { key: 'n', label: 'Moles (held constant)', min: 0.2, max: 5, step: 0.1, unit: ' mol', decimals: 1 },
    ],
  },
};

// Real-gas (Van der Waals) pressure — only valid when solving directly for P given n, V, T
function pressureOf(n, V, T, real) {
  if (!real) return (n * R * T) / V;
  const Vm = V - n * VDW.b;
  if (Vm <= 0) return Infinity;
  return (n * R * T) / Vm - VDW.a * (n * n) / (V * V);
}

export default function GasLawsLab() {
  const [mode, setMode] = useState('boyle');
  const [val, setVal] = useState({ boyle: 25, charles: 300, gaylussac: 300 });
  const [modeConstants, setModeConstants] = useState({
    boyle: { T: 300, n: 1 },
    charles: { P: 1, n: 1 },
    gaylussac: { V: 10, n: 1 },
  });
  const [realGas, setRealGas] = useState(false);
  const [nFree, setNFree] = useState(1.5);
  const [freeV, setFreeV] = useState(20);
  const [freeT, setFreeT] = useState(300);
  const [combined, setCombined] = useState(false);

  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const paramsRef = useRef({ T: 300, V: 25, n: 1 });
  const rafRef = useRef(null);

  const cfg = MODES[mode];
  const realGasApplies = combined || mode === 'boyle' || mode === 'gaylussac';

  // --- derive current physical state ---
  const state = useMemo(() => {
    if (combined) {
      const P = pressureOf(nFree, freeV, freeT, realGas);
      return { T: freeT, V: freeV, n: nFree, P };
    }
    const v = val[mode];
    const f = modeConstants[mode];
    if (mode === 'boyle') {
      const V = v, T = f.T;
      const P = pressureOf(f.n, V, T, realGas);
      return { T, V, n: f.n, P };
    }
    if (mode === 'charles') {
      // solving V from P,T,n directly requires a cubic under Van der Waals — ideal approx used here
      const T = v, P = f.P;
      const V = (f.n * R * T) / P;
      return { T, V, n: f.n, P };
    }
    // gaylussac
    const T = v, V = f.V;
    const P = pressureOf(f.n, V, T, realGas);
    return { T, V, n: f.n, P };
  }, [mode, val, modeConstants, combined, nFree, freeV, freeT, realGas]);

  // --- theoretical curve for the active law ---
  const curve = useMemo(() => {
    if (combined) return [];
    const f = modeConstants[mode];
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = cfg.min + ((cfg.max - cfg.min) * i) / 40;
      let y;
      if (mode === 'boyle') y = pressureOf(f.n, x, f.T, realGas);
      else if (mode === 'charles') y = (f.n * R * x) / f.P;
      else y = pressureOf(f.n, f.V, x, realGas);
      pts.push({ x, y });
    }
    return pts;
  }, [mode, cfg, modeConstants, combined, realGas]);

  const activeVal = combined ? null : val[mode];

  // keep paramsRef in sync for the animation loop (no re-mounting the loop)
  useEffect(() => {
    paramsRef.current = { T: state.T, V: state.V, n: state.n };
  }, [state]);

  // init particles once
  useEffect(() => {
    particlesRef.current = Array.from({ length: 40 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
      flash: 0,
    }));
  }, []);

  // continuous particle-box animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const loop = () => {
      const { T, V, n: nCount } = paramsRef.current;
      const speed = Math.sqrt(T / 300) * 0.014;
      const activeCount = Math.max(6, Math.min(40, Math.round(nCount * 14)));
      const boxFrac = Math.min(1, Math.max(0.25, V / 50));
      const boxW = W * boxFrac * 0.85;
      const boxH = H * 0.8;
      const boxX = (W - boxW) / 2;
      const boxY = (H - boxH) / 2;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0F1720';
      ctx.fillRect(0, 0, W, H);

      const parts = particlesRef.current;
      for (let i = 0; i < activeCount; i++) {
        const p = parts[i];
        const dirLen = Math.hypot(p.vx, p.vy) || 1;
        p.x += (p.vx / dirLen) * speed;
        p.y += (p.vy / dirLen) * speed;
        if (p.x <= 0 || p.x >= 1) { p.vx *= -1; p.x = Math.min(1, Math.max(0, p.x)); p.flash = 1; }
        if (p.y <= 0 || p.y >= 1) { p.vy *= -1; p.y = Math.min(1, Math.max(0, p.y)); p.flash = 1; }
        if (p.flash > 0) p.flash -= 0.05;
      }

      // box
      ctx.strokeStyle = '#3A4753';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // particles
      for (let i = 0; i < activeCount; i++) {
        const p = parts[i];
        const px = boxX + p.x * boxW;
        const py = boxY + p.y * boxH;
        const glow = Math.max(0, p.flash);
        ctx.fillStyle = glow > 0 ? `rgba(245, 166, 35, ${0.5 + glow * 0.5})` : '#5EEAD4';
        ctx.beginPath();
        ctx.arc(px, py, 3.5 + glow * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  return (
    <div style={{ background: '#0B0F14', minHeight: '100%', color: '#DCE4EA' }} className="w-full p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4">
          <div style={{ color: '#5EEAD4', letterSpacing: '0.12em' }} className="text-[10px] font-mono uppercase mb-1">
            Module 02 — Gas Laws
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="text-2xl font-bold text-white">
            PV = nRT Lab
          </h1>
          <p className="text-xs mt-1" style={{ color: '#7B8894' }}>
            Explore how pressure, volume, and temperature relate — one variable at a time, or all at once.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

            {/* Mode selector */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Explore</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(MODES).map(([key, m]) => (
                  <button
                    key={key}
                    onClick={() => { setMode(key); setCombined(false); }}
                    style={{
                      background: !combined && mode === key ? '#5EEAD4' : 'transparent',
                      color: !combined && mode === key ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="py-1.5 rounded text-xs font-mono"
                  >
                    {m.label}
                  </button>
                ))}
                <button
                  onClick={() => setCombined(true)}
                  style={{
                    background: combined ? '#5EEAD4' : 'transparent',
                    color: combined ? '#0B0F14' : '#9AA7B2',
                    border: '1px solid #2A363F',
                  }}
                  className="py-1.5 rounded text-xs font-mono col-span-2"
                >
                  Combined (free explore)
                </button>
              </div>
            </div>

            {/* Formula panel */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 font-mono text-xs">
              {!combined ? (
                <>
                  <div style={{ color: '#DCE4EA' }} className="text-sm">{cfg.law}</div>
                  <div style={{ color: '#5C6A76' }} className="text-[10px] mt-1">{cfg.condition}</div>
                  <div style={{ borderTop: '1px solid #1A232B', color: '#9AA7B2' }} className="mt-2 pt-2">
                    fixed: {cfg.constants.map((c) => `${c.key} = ${modeConstants[mode][c.key]}${c.unit}`).join(', ')}
                  </div>
                  <div style={{ color: '#5EEAD4' }} className="mt-2">
                    P = {realGas && realGasApplies ? 'nRT/(V−nb) − a(n/V)²' : 'nRT / V'} = {fmt(state.P)} atm
                  </div>
                  {realGas && mode === 'charles' && (
                    <div className="text-[10px] mt-1" style={{ color: '#5C6A76' }}>note: V here uses the ideal approximation — solving V exactly under Van der Waals needs a cubic equation</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ color: '#DCE4EA' }} className="text-sm">{realGas ? 'P = nRT/(V−nb) − a(n/V)²' : 'P = nRT / V'}</div>
                  <div style={{ color: '#5C6A76' }} className="text-[10px] mt-1">all three variables free{realGas ? ' · real gas (CO₂ approx.)' : ''}</div>
                  <div style={{ color: '#5EEAD4' }} className="mt-2">
                    = {fmt(state.P)} atm
                  </div>
                </>
              )}
            </div>

            {/* Real gas toggle */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <button
                onClick={() => setRealGas((r) => !r)}
                className="flex items-center gap-2 text-xs"
                style={{ color: realGas ? '#F5A623' : '#7B8894' }}
              >
                <FlaskConical size={14} />
                {realGas ? 'Real gas (Van der Waals, CO₂ approx.)' : 'Ideal gas'}
              </button>
              {realGas && !realGasApplies && (
                <div className="text-[10px] mt-1.5" style={{ color: '#5C6A76' }}>
                  Charles's Law solves for V, which the ideal approximation still handles here
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-4 space-y-4">
              {!combined ? (
                <>
                  <Slider label={cfg.varLabel} value={val[mode]} min={cfg.min} max={cfg.max} step={cfg.step} unit={cfg.varUnit}
                    onChange={(v) => setVal((s) => ({ ...s, [mode]: v }))} />
                  <div style={{ borderTop: '1px solid #1A232B' }} className="pt-3 space-y-3">
                    {cfg.constants.map((c) => (
                      <Slider key={c.key} label={c.label} value={modeConstants[mode][c.key]}
                        min={c.min} max={c.max} step={c.step} unit={c.unit} decimals={c.decimals || 0}
                        onChange={(v) => setModeConstants((s) => ({ ...s, [mode]: { ...s[mode], [c.key]: v } }))} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Slider label="Moles (n)" value={nFree} min={0.2} max={5} step={0.1} unit=" mol" decimals={1} onChange={setNFree} />
                  <Slider label="Volume (V)" value={freeV} min={5} max={50} step={1} unit=" L" onChange={setFreeV} />
                  <Slider label="Temperature (T)" value={freeT} min={150} max={600} step={5} unit=" K" onChange={setFreeT} />
                </>
              )}
              <div className="text-[10px] font-mono flex items-center gap-1.5" style={{ color: '#5C6A76' }}>
                <Thermometer size={12} />
                Drag {combined ? 'the sliders' : 'the slider'} to trace the relationship on the chart →
              </div>
            </div>
          </div>

          <div className="w-full flex-1 space-y-4">

            {/* Particle box */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2">
              <canvas ref={canvasRef} width={800} height={320} className="w-full h-auto rounded" />
              <div className="text-[10px] font-mono mt-1 px-1" style={{ color: '#5C6A76' }}>
                particle speed ∝ √T · box width ∝ V · particle count ∝ n — hotter/smaller/denser = more wall collisions = higher pressure
              </div>
            </div>

            {/* Readout */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 grid grid-cols-4 gap-2 font-mono text-center">
              {[
                ['n', state.n, 'mol'],
                ['V', state.V, 'L'],
                ['T', state.T, 'K'],
                ['P', state.P, 'atm'],
              ].map(([label, v, unit]) => (
                <div key={label}>
                  <div className="text-[10px]" style={{ color: '#5C6A76' }}>{label}</div>
                  <div className="text-sm" style={{ color: '#5EEAD4' }}>{fmt(v, label === 'n' ? 2 : 1)}</div>
                  <div className="text-[9px]" style={{ color: '#5C6A76' }}>{unit}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            {!combined && (
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>{cfg.yLabel} vs. {cfg.axisLabel}</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={curve}>
                    <CartesianGrid stroke="#1E2A35" />
                    <XAxis dataKey="x" type="number" domain={[cfg.min, cfg.max]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                    <YAxis dataKey="y" type="number" tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                    <Line dataKey="y" stroke="#F5A623" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <ReferenceDot x={activeVal} y={mode === 'charles' ? state.V : state.P} r={5} fill="#5EEAD4" stroke="none" isFront />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <Quiz />
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit = '', decimals = 0, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#9AA7B2' }}>{label}</span>
        <span className="font-mono" style={{ color: '#5EEAD4' }}>{value.toFixed(decimals)}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: '#5EEAD4' }}
      />
    </div>
  );
}

const FALLBACK_QUESTIONS = [
  {
    q: "At constant temperature, if you compress a gas to half its volume, pressure will:",
    options: ['Halve', 'Double', 'Stay the same', 'Quadruple'],
    correct: 1,
    explain: 'Boyle\'s Law: P and V are inversely proportional at constant T, n — halving V doubles P.',
  },
  {
    q: 'Why must temperature be in Kelvin, not Celsius, in these gas law equations?',
    options: [
      'Kelvin is just the SI-preferred unit, either works with the same result',
      'Celsius can be negative, which would make volume/pressure negative or undefined at 0°C',
      'Kelvin starts at absolute zero, so V and T stay directly, not just linearly, proportional',
      'The equations only work above 0°C',
    ],
    correct: 2,
    explain: 'V/T = k assumes V→0 as T→0. Only Kelvin has its zero point at absolute zero, so the ratio stays valid — Celsius has an arbitrary zero offset that breaks the proportionality.',
  },
  {
    q: 'You add more gas molecules to a rigid, sealed container at constant T. What happens to P?',
    options: ['Decreases', 'Increases', 'No change', 'Depends on the gas type'],
    correct: 1,
    explain: 'More moles at fixed V and T means more frequent particle collisions with the walls — pressure rises proportionally with n.',
  },
];

function Quiz() {
  const [answers, setAnswers] = useState({});
  const { questions } = useQuestions('gas-laws', FALLBACK_QUESTIONS);
  return (
    <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
      <div className="text-xs mb-3" style={{ color: '#9AA7B2' }}>Check your understanding</div>
      <div className="space-y-4">
        {questions.map((item, qi) => {
          const chosen = answers[qi];
          return (
            <div key={qi}>
              <div className="text-xs mb-2" style={{ color: '#DCE4EA' }}>{qi + 1}. {item.q}</div>
              <div className="flex flex-col gap-1.5">
                {item.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = oi === item.correct;
                  let border = '#2A363F', color = '#9AA7B2';
                  if (chosen !== undefined) {
                    if (isCorrect) { border = '#5EEAD4'; color = '#5EEAD4'; }
                    else if (isChosen) { border = '#E5484D'; color = '#E5484D'; }
                  }
                  return (
                    <button
                      key={oi}
                      onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                      disabled={chosen !== undefined}
                      style={{ border: `1px solid ${border}`, color }}
                      className="text-left text-xs px-2.5 py-1.5 rounded font-mono disabled:opacity-100"
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {chosen !== undefined && (
                <div className="text-[10px] mt-1.5" style={{ color: '#7B8894' }}>{item.explain}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}