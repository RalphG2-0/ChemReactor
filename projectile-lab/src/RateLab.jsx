import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts';
import { Play, RotateCcw, Thermometer } from 'lucide-react';
import { useQuestions } from './lib/useQuestions';

const R_GAS = 8.314; // J / (mol·K)

const ORDERS = {
  0: {
    label: 'Zero order',
    law: 'rate = k',
    integrated: '[A] = [A]₀ − kt',
    halfLifeFormula: 't₁/₂ = [A]₀ / 2k',
    kUnit: ' M/s',
    kMin: 0.002, kMax: 0.05, kStep: 0.001, kDefault: 0.01,
    conc: (A0, k, t) => Math.max(0, A0 - k * t),
    halfLife: (A0, k) => A0 / (2 * k),
    lifetime: (A0, k) => A0 / k, // time to reach ~0
  },
  1: {
    label: 'First order',
    law: 'rate = k[A]',
    integrated: '[A] = [A]₀ e^(−kt)',
    halfLifeFormula: 't₁/₂ = ln(2) / k',
    kUnit: ' s⁻¹',
    kMin: 0.005, kMax: 0.3, kStep: 0.005, kDefault: 0.05,
    conc: (A0, k, t) => A0 * Math.exp(-k * t),
    halfLife: (A0, k) => Math.log(2) / k,
    lifetime: (A0, k) => 6 / k, // ~6 half-lives to look "done"
  },
  2: {
    label: 'Second order',
    law: 'rate = k[A]²',
    integrated: '1/[A] = 1/[A]₀ + kt',
    halfLifeFormula: 't₁/₂ = 1 / (k[A]₀)',
    kUnit: ' M⁻¹s⁻¹',
    kMin: 0.002, kMax: 0.1, kStep: 0.002, kDefault: 0.02,
    conc: (A0, k, t) => A0 / (1 + A0 * k * t),
    halfLife: (A0, k) => 1 / (k * A0),
    lifetime: (A0, k) => 9 / (k * A0), // ~9 half-lives for 2nd order to look "done"
  },
};

// Reference reaction for the Arrhenius view: a generic first-order decomposition
const ARR_A0 = 0.1; // M

export default function RateLab() {
  const [view, setView] = useState('order'); // 'order' | 'arrhenius'

  // --- order-comparison view state ---
  const [order, setOrder] = useState(1);
  const [A0, setA0] = useState(0.1);
  const [k, setK] = useState(ORDERS[1].kDefault);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [live, setLive] = useState({ t: 0, A: 0.1 });
  const [predictHalfLife, setPredictHalfLife] = useState('');

  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);

  const cfg = ORDERS[order];
  const tMax = cfg.lifetime(A0, k);
  const halfLife = cfg.halfLife(A0, k);

  const curve = useMemo(() => {
    const pts = [];
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const t = (tMax * i) / steps;
      pts.push({ t, A: cfg.conc(A0, k, t) });
    }
    return pts;
  }, [cfg, A0, k, tMax]);

  const tracedCurve = useMemo(
    () => curve.filter((p) => p.t <= live.t + 1e-9),
    [curve, live.t]
  );

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setFinished(false);
    setLive({ t: 0, A: A0 });
    setPredictHalfLife('');
  }, [A0]);

  useEffect(() => { reset(); }, [order, A0, k, reset]);

  const start = () => {
    cancelAnimationFrame(rafRef.current);
    stateRef.current = { t: 0, last: performance.now() };
    setFinished(false);
    setRunning(true);
    rafRef.current = requestAnimationFrame(step);
  };

  const rate = tMax / 6; // simulated seconds per real second, ~6s full run

  const step = (now) => {
    const st = stateRef.current;
    const dt = Math.min((now - st.last) / 1000, 0.05);
    st.last = now;
    st.t = Math.min(tMax, st.t + rate * dt);
    setLive({ t: st.t, A: cfg.conc(A0, k, st.t) });
    if (st.t >= tMax) {
      setRunning(false);
      setFinished(true);
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const scrubTo = (t) => {
    if (running) return;
    setLive({ t, A: cfg.conc(A0, k, t) });
    setFinished(t >= tMax - 1e-6);
  };

  // --- Arrhenius view state ---
  const [Ea, setEa] = useState(50); // kJ/mol
  const [Apre, setApre] = useState(1e8); // pre-exponential factor, s⁻¹
  const [temp, setTemp] = useState(298);

  const kFromT = useCallback((T) => Apre * Math.exp(-(Ea * 1000) / (R_GAS * T)), [Apre, Ea]);
  const arrK = kFromT(temp);

  const arrheniusCurve = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const invT = (1 / 380) + (((1 / 250) - (1 / 380)) * i) / 40;
      const T = 1 / invT;
      const kk = kFromT(T);
      pts.push({ invT: invT * 1000, lnK: Math.log(kk) });
    }
    return pts;
  }, [kFromT]);

  const kAtRoomTemp = kFromT(298);
  const rateRatio = arrK / kFromT(298);

  // --- beaker color / bubble canvas (shared visual language with TitrationLab) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0F1720';
    ctx.fillRect(0, 0, W, H);

    const A0v = view === 'order' ? A0 : ARR_A0;
    const Av = view === 'order' ? live.A : ARR_A0;
    const frac = Math.max(0, Math.min(1, Av / A0v));

    // beaker outline
    const bx = W / 2 - 55, by = 30, bw = 110, bh = 150;
    ctx.strokeStyle = '#3A4753';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by);
    ctx.stroke();

    // liquid: color intensity ∝ remaining [A] (reactant fades from amber to clear)
    const r = 245, g = 166 + (255 - 166) * (1 - frac), b = 35 + (255 - 35) * (1 - frac);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = `rgba(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)},${0.15 + frac * 0.55})`;
    ctx.fillRect(bx, by + 10, bw, bh - 10);
    ctx.restore();

    // fizz / bubbles, more active when concentration (and thus rate) is high
    const bubbleActivity = frac;
    ctx.fillStyle = 'rgba(94,234,212,0.5)';
    const seed = Math.floor(performance.now() / 90);
    for (let i = 0; i < Math.round(bubbleActivity * 10); i++) {
      const bxi = bx + 10 + ((seed * 13 + i * 37) % (bw - 20));
      const byi = by + bh - ((seed * 7 + i * 53) % (bh - 20));
      ctx.beginPath();
      ctx.arc(bxi, byi, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#5C6A76';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`[A] = ${(Av).toFixed(3)} M`, W / 2, by + bh + 20);
  }, [view, A0, live, kAtRoomTemp]);

  const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  return (
    <div style={{ background: '#0B0F14', minHeight: '100%', color: '#DCE4EA' }} className="w-full p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4">
          <div style={{ color: '#5EEAD4', letterSpacing: '0.12em' }} className="text-[10px] font-mono uppercase mb-1">
            Module 04 — Chemical Kinetics
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="text-2xl font-bold text-white">
            Rate of Reaction Lab
          </h1>
          <p className="text-xs mt-1" style={{ color: '#7B8894' }}>
            Watch a reactant disappear over time, and see how order and temperature each control how fast.
          </p>
        </div>

        {/* View selector */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setView('order')}
              style={{
                background: view === 'order' ? '#5EEAD4' : 'transparent',
                color: view === 'order' ? '#0B0F14' : '#9AA7B2',
                border: '1px solid #2A363F',
              }}
              className="py-1.5 rounded text-xs font-mono"
            >
              Reaction order
            </button>
            <button
              onClick={() => setView('arrhenius')}
              style={{
                background: view === 'arrhenius' ? '#5EEAD4' : 'transparent',
                color: view === 'arrhenius' ? '#0B0F14' : '#9AA7B2',
                border: '1px solid #2A363F',
              }}
              className="py-1.5 rounded text-xs font-mono"
            >
              Temperature (Arrhenius)
            </button>
          </div>
        </div>

        {view === 'order' ? (
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

              {/* Order choice */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Reaction order in [A]</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[0, 1, 2].map((o) => (
                    <button
                      key={o}
                      onClick={() => { setOrder(o); setK(ORDERS[o].kDefault); }}
                      disabled={running}
                      style={{
                        background: order === o ? '#5EEAD4' : 'transparent',
                        color: order === o ? '#0B0F14' : '#9AA7B2',
                        border: '1px solid #2A363F',
                      }}
                      className="py-1.5 rounded text-xs font-mono disabled:opacity-50"
                    >
                      {ORDERS[o].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formula panel */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 font-mono text-xs space-y-1">
                <div style={{ color: '#DCE4EA' }} className="text-sm">{cfg.law}</div>
                <div style={{ color: '#5C6A76' }} className="text-[10px]">{cfg.integrated}</div>
                <div style={{ borderTop: '1px solid #1A232B', color: '#9AA7B2' }} className="mt-2 pt-2">
                  {cfg.halfLifeFormula}
                </div>
                <div style={{ color: '#5EEAD4' }} className="mt-1">
                  t₁/₂ = {fmt(halfLife, 2)} s
                </div>
                {order !== 1 && (
                  <div className="text-[10px] mt-1" style={{ color: '#5C6A76' }}>
                    note: unlike first order, this half-life depends on [A]₀ — it changes as the reaction proceeds
                  </div>
                )}
              </div>

              {/* Predict half-life */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>
                  Before you run it — predict the first half-life (time for [A] to drop to [A]₀/2)
                </div>
                <label>
                  <div className="text-[10px] mb-1" style={{ color: '#5C6A76' }}>Your guess (s)</div>
                  <input
                    type="number"
                    value={predictHalfLife}
                    disabled={running || finished}
                    onChange={(e) => setPredictHalfLife(e.target.value)}
                    style={{ background: '#131C24', border: '1px solid #2A363F', color: '#DCE4EA' }}
                    className="w-full px-2 py-1.5 rounded text-sm font-mono disabled:opacity-50"
                    placeholder="—"
                  />
                </label>
              </div>

              {/* Controls */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-4 space-y-4">
                <Slider label="Initial concentration [A]₀" value={A0} min={0.02} max={0.3} step={0.01} unit=" M" decimals={2}
                  onChange={setA0} disabled={running} />
                <Slider label="Rate constant k" value={k} min={cfg.kMin} max={cfg.kMax} step={cfg.kStep} unit={cfg.kUnit} decimals={3}
                  onChange={setK} disabled={running} />

                <div style={{ borderTop: '1px solid #1A232B' }} className="pt-3">
                  <Slider label="Scrub time manually" value={live.t} min={0} max={tMax} step={tMax / 200} unit=" s"
                    onChange={scrubTo} disabled={running} />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={start}
                    disabled={running}
                    style={{ background: '#5EEAD4', color: '#0B0F14' }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded font-semibold text-sm disabled:opacity-50"
                  >
                    <Play size={14} fill="#0B0F14" /> Run reaction
                  </button>
                  <button
                    onClick={reset}
                    style={{ border: '1px solid #2A363F', color: '#9AA7B2' }}
                    className="px-3 py-2 rounded text-sm"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full flex-1 space-y-4">

              {/* Beaker visual */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2 flex justify-center">
                <canvas ref={canvasRef} width={260} height={220} className="rounded" />
              </div>

              {/* Readout */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 grid grid-cols-3 gap-2 font-mono text-center">
                {[
                  ['t', live.t, 's'],
                  ['[A]', live.A, 'M'],
                  ['t₁/₂', halfLife, 's'],
                ].map(([label, v, unit]) => (
                  <div key={label}>
                    <div className="text-[10px]" style={{ color: '#5C6A76' }}>{label}</div>
                    <div className="text-sm" style={{ color: '#5EEAD4' }}>{fmt(v, 2)}</div>
                    <div className="text-[9px]" style={{ color: '#5C6A76' }}>{unit}</div>
                  </div>
                ))}
              </div>

              {/* Concentration chart */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>[A] vs. time</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart>
                    <CartesianGrid stroke="#1E2A35" />
                    <XAxis dataKey="t" type="number" domain={[0, tMax]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                    <YAxis dataKey="A" type="number" domain={[0, A0]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                    <ReferenceLine y={A0 / 2} stroke="#F5A623" strokeOpacity={0.3} strokeDasharray="3 3" />
                    <Line data={curve} dataKey="A" stroke="#F5A623" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    <Line data={tracedCurve} dataKey="A" stroke="#5EEAD4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <ReferenceDot x={live.t} y={live.A} r={4} fill="#5EEAD4" stroke="none" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-[10px] font-mono mt-1 px-1" style={{ color: '#5C6A76' }}>
                  <span><span style={{ color: '#F5A623' }}>┄┄</span> theory</span>
                  <span><span style={{ color: '#5EEAD4' }}>━━</span> reacted so far</span>
                  <span>┄ [A]₀/2</span>
                </div>
              </div>

              {finished && predictHalfLife !== '' && (
                <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                  <div className="text-xs mb-1" style={{ color: '#9AA7B2' }}>How close was your guess?</div>
                  <div className="text-xs font-mono" style={{ color: '#DCE4EA' }}>
                    Actual t₁/₂ = {fmt(halfLife, 2)} s — your guess was off by {fmt(Math.abs(parseFloat(predictHalfLife) - halfLife) / halfLife * 100, 1)}%
                  </div>
                </div>
              )}

              <Quiz labId="rate-order" fallbackQuestions={FALLBACK_ORDER_QUESTIONS} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

              {/* Formula panel */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 font-mono text-xs space-y-1">
                <div style={{ color: '#9AA7B2' }} className="font-sans mb-1">Arrhenius equation</div>
                <div style={{ color: '#DCE4EA' }} className="text-sm">k = A·e^(−Eₐ / RT)</div>
                <div style={{ borderTop: '1px solid #1A232B', color: '#9AA7B2' }} className="mt-2 pt-2">
                  A = {Apre.toExponential(1)} s⁻¹, Eₐ = {Ea} kJ/mol, T = {temp} K
                </div>
                <div style={{ color: '#5EEAD4' }} className="mt-1">
                  k = {arrK.toExponential(3)} s⁻¹
                </div>
                <div className="text-[10px] mt-1" style={{ color: '#5C6A76' }}>
                  {rateRatio.toFixed(2)}× the rate constant at 298 K (room temperature)
                </div>
              </div>

              {/* Controls */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-4 space-y-4">
                <Slider label="Temperature" value={temp} min={250} max={380} step={1} unit=" K" onChange={setTemp} />
                <Slider label="Activation energy Eₐ" value={Ea} min={20} max={120} step={1} unit=" kJ/mol" onChange={setEa} />
                <div className="text-[10px] font-mono -mt-2" style={{ color: '#5C6A76' }}>
                  higher Eₐ = more temperature-sensitive rate — that's why the line on the Arrhenius plot is steeper
                </div>
                <Slider label="Pre-exponential factor A (×10⁸)" value={Apre / 1e8} min={0.5} max={20} step={0.5} decimals={1}
                  onChange={(v) => setApre(v * 1e8)} unit=" s⁻¹" />
              </div>

              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="flex items-center gap-2 text-xs mb-1" style={{ color: '#F5A623' }}>
                  <Thermometer size={14} /> Rule of thumb
                </div>
                <div className="text-[10px]" style={{ color: '#5C6A76' }}>
                  Near room temperature, many everyday reactions roughly double their rate for every 10 K rise — but the real relationship
                  is exponential in 1/T, not linear, which is exactly what the Arrhenius plot below shows.
                </div>
              </div>
            </div>

            <div className="w-full flex-1 space-y-4">

              {/* Beaker visual reused, driven by k at current T over a fixed reference reaction */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2 flex justify-center">
                <canvas ref={canvasRef} width={260} height={220} className="rounded" />
              </div>
              <div className="text-[10px] font-mono text-center -mt-2" style={{ color: '#5C6A76' }}>
                reference reactant fading at the rate k(T) computed above
              </div>

              {/* k vs T chart */}
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Arrhenius plot — ln(k) vs. 1/T</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={arrheniusCurve}>
                    <CartesianGrid stroke="#1E2A35" />
                    <XAxis dataKey="invT" type="number" tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F"
                      label={{ value: '1000/T (K⁻¹)', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#5C6A76' }} />
                    <YAxis dataKey="lnK" type="number" tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                    <Line dataKey="lnK" stroke="#5EEAD4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <ReferenceDot x={1000 / temp} y={Math.log(arrK)} r={4} fill="#F5A623" stroke="none" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="text-[10px] font-mono mt-1 px-1" style={{ color: '#5C6A76' }}>
                  slope = −Eₐ/R — a straight line here confirms Arrhenius behavior; the dot marks your current T
                </div>
              </div>

              <Quiz labId="rate-arrhenius" fallbackQuestions={FALLBACK_ARRHENIUS_QUESTIONS} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit = '', decimals = 0, onChange, disabled }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#9AA7B2' }}>{label}</span>
        <span className="font-mono" style={{ color: '#5EEAD4' }}>{value.toFixed(decimals)}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: '#5EEAD4' }}
      />
    </div>
  );
}

const FALLBACK_ORDER_QUESTIONS = [
  {
    q: 'For a first-order reaction, the half-life:',
    options: ['Depends on [A]₀', 'Is constant, independent of [A]₀', 'Increases as the reaction proceeds', 'Only applies at high temperature'],
    correct: 1,
    explain: 't₁/₂ = ln(2)/k for first order — k alone sets the half-life, so it stays the same no matter how much [A] remains.',
  },
  {
    q: 'Doubling [A]₀ for a zero-order reaction does what to the half-life?',
    options: ['Halves it', 'Doubles it', 'No change', 'Quadruples it'],
    correct: 1,
    explain: 't₁/₂ = [A]₀/2k is directly proportional to [A]₀ for zero order, so doubling [A]₀ doubles the half-life.',
  },
  {
    q: 'Which best describes how rate depends on concentration for a second-order reaction?',
    options: ['Rate is independent of [A]', 'Rate ∝ [A]', 'Rate ∝ [A]²', 'Rate ∝ 1/[A]'],
    correct: 2,
    explain: 'rate = k[A]² — doubling concentration quadruples the rate for a reaction that is second order in A.',
  },
];

const FALLBACK_ARRHENIUS_QUESTIONS = [
  {
    q: 'Raising the temperature increases reaction rate mainly because:',
    options: [
      'Molecules become lighter',
      'A larger fraction of collisions have enough energy to exceed the activation energy',
      'The activation energy itself decreases',
      'Concentration increases',
    ],
    correct: 1,
    explain: 'The Boltzmann distribution of molecular energies shifts with T, so a larger fraction of collisions clear the Eₐ barrier — Eₐ itself does not change.',
  },
  {
    q: 'A reaction with a high activation energy Eₐ will be:',
    options: [
      'Barely affected by temperature changes',
      'Very sensitive to temperature changes',
      'Independent of temperature',
      'Faster at all temperatures than a low-Eₐ reaction',
    ],
    correct: 1,
    explain: 'Eₐ sits in the exponent of the Arrhenius equation — a larger Eₐ makes k (and thus rate) change much more steeply with T.',
  },
  {
    q: 'On a plot of ln(k) vs. 1/T, the slope of the line equals:',
    options: ['A', '−Eₐ/R', 'Eₐ·R', '−R/Eₐ'],
    correct: 1,
    explain: 'Taking ln of k = A·e^(−Eₐ/RT) gives ln(k) = ln(A) − (Eₐ/R)(1/T), a line with slope −Eₐ/R.',
  },
];

function Quiz({ labId, fallbackQuestions }) {
  const [answers, setAnswers] = useState({});
  const { questions } = useQuestions(labId, fallbackQuestions);
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
