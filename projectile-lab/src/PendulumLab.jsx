import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot } from 'recharts';
import { Play, RotateCcw } from 'lucide-react';

const PLANETS = {
  Earth: 9.81,
  Moon: 1.62,
  Mars: 3.71,
};

// One RK4 step for θ'' + 2γθ' + ω0²·(sinθ or θ) = 0 — `nonlinear` picks the exact
// pendulum equation (sinθ) vs the linearized small-angle theory (θ).
function rk4Step(theta, omega, dt, omega0Sq, gamma, nonlinear) {
  const f = (th, om) => [om, -2 * gamma * om - omega0Sq * (nonlinear ? Math.sin(th) : th)];
  const k1 = f(theta, omega);
  const k2 = f(theta + (k1[0] * dt) / 2, omega + (k1[1] * dt) / 2);
  const k3 = f(theta + (k2[0] * dt) / 2, omega + (k2[1] * dt) / 2);
  const k4 = f(theta + k3[0] * dt, omega + k3[1] * dt);
  return [
    theta + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    omega + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
  ];
}

export default function PendulumLab() {
  const [planet, setPlanet] = useState('Earth');
  const [length, setLength] = useState(1.0); // m
  const [mass, setMass] = useState(0.5); // kg
  const [theta0deg, setTheta0deg] = useState(30); // degrees
  const [gamma, setGamma] = useState(0); // damping rate, s⁻¹

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [predictT, setPredictT] = useState('');
  const [live, setLive] = useState({ t: 0, thetaE: 0, omegaE: 0, thetaS: 0 });

  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);

  const g = PLANETS[planet];
  const theta0 = (theta0deg * Math.PI) / 180;
  const omega0 = Math.sqrt(g / length);
  const T0 = (2 * Math.PI) / omega0; // small-angle, undamped period
  const dampingRatio = gamma / omega0;
  const dampingRegime = dampingRatio < 0.999 ? 'underdamped' : dampingRatio < 1.001 ? 'critically damped' : 'overdamped';

  // classic small-angle correction series (radians), for cross-checking the numeric period
  const seriesT = T0 * (1 + (theta0 ** 2) / 16 + (11 * theta0 ** 4) / 3072);

  const tMax = 6 * T0;

  // Build both trajectories (exact nonlinear + linearized small-angle theory) once per parameter change.
  const { curve, measuredPeriod, energyMax } = useMemo(() => {
    const steps = 900;
    const dt = tMax / steps;
    let thE = theta0, omE = 0;
    let thS = theta0, omS = 0;
    const pts = [];
    const crossings = [];
    let eMax = 0;
    for (let i = 0; i <= steps; i++) {
      const KE = 0.5 * mass * length * length * omE * omE;
      const PE = mass * g * length * (1 - Math.cos(thE));
      eMax = Math.max(eMax, KE + PE);
      pts.push({ t: i * dt, thetaE: thE, thetaS: thS, omegaE: omE, KE, PE, total: KE + PE });
      if (i === steps) break;
      const prevOmE = omE;
      [thE, omE] = rk4Step(thE, omE, dt, omega0 * omega0, gamma, true);
      [thS, omS] = rk4Step(thS, omS, dt, omega0 * omega0, gamma, false);
      if (prevOmE > 0 && omE <= 0) crossings.push((i + 1) * dt);
    }
    const period = crossings.length >= 2 ? crossings[1] - crossings[0] : null;
    return { curve: pts, measuredPeriod: period, energyMax: eMax || 1 };
  }, [theta0, length, mass, g, gamma, omega0, tMax]);

  const tracedCurve = useMemo(() => curve.filter((p) => p.t <= live.t + 1e-9), [curve, live.t]);

  const sampleAt = useCallback(
    (t) => {
      const idx = Math.min(curve.length - 1, Math.max(0, Math.round((t / tMax) * (curve.length - 1))));
      return curve[idx];
    },
    [curve, tMax]
  );

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setFinished(false);
    const p0 = sampleAt(0);
    setLive({ t: 0, thetaE: p0.thetaE, omegaE: p0.omegaE, thetaS: p0.thetaS });
    setPredictT('');
  }, [sampleAt]);

  useEffect(() => { reset(); }, [theta0, length, mass, g, gamma, reset]);

  const start = () => {
    cancelAnimationFrame(rafRef.current);
    stateRef.current = { t: 0, last: performance.now() };
    setFinished(false);
    setRunning(true);
    rafRef.current = requestAnimationFrame(step);
  };

  const rate = tMax / 8; // simulated seconds per real second, ~8s to show the full window

  const step = (now) => {
    const st = stateRef.current;
    const dt = Math.min((now - st.last) / 1000, 0.05);
    st.last = now;
    st.t = Math.min(tMax, st.t + rate * dt);
    const p = sampleAt(st.t);
    setLive({ t: st.t, thetaE: p.thetaE, omegaE: p.omegaE, thetaS: p.thetaS });
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
    const p = sampleAt(t);
    setLive({ t, thetaE: p.thetaE, omegaE: p.omegaE, thetaS: p.thetaS });
    setFinished(t >= tMax - 1e-6);
  };

  // --- pendulum canvas: exact bob (solid) + small-angle "ghost" bob (dashed rod) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0F1720';
    ctx.fillRect(0, 0, W, H);

    const pivotX = W / 2, pivotY = 30;
    const rodLen = 150;
    const bobR = 8 + mass * 6;

    // pivot mount
    ctx.fillStyle = '#3A4753';
    ctx.fillRect(pivotX - 20, pivotY - 6, 40, 6);
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
    ctx.fill();

    // small-angle ghost pendulum (dashed, amber)
    const ghostX = pivotX + rodLen * Math.sin(live.thetaS);
    const ghostY = pivotY + rodLen * Math.cos(live.thetaS);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(245,166,35,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(ghostX, ghostY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, bobR * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = '#F5A623';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // exact pendulum (solid, teal)
    const exactX = pivotX + rodLen * Math.sin(live.thetaE);
    const exactY = pivotY + rodLen * Math.cos(live.thetaE);
    ctx.strokeStyle = '#3A4753';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(exactX, exactY);
    ctx.stroke();
    ctx.fillStyle = '#5EEAD4';
    ctx.beginPath();
    ctx.arc(exactX, exactY, bobR, 0, Math.PI * 2);
    ctx.fill();

    // vertical reference line
    ctx.strokeStyle = '#1A232B';
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + rodLen + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#5C6A76';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`θ = ${((live.thetaE * 180) / Math.PI).toFixed(1)}°`, pivotX, pivotY + rodLen + 40);
    ctx.fillStyle = '#F5A623';
    ctx.fillText('┄ small-angle theory', pivotX, 16);
  }, [live, mass]);

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  return (
    <div style={{ background: '#0B0F14', minHeight: '100%', color: '#DCE4EA' }} className="w-full p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4">
          <div style={{ color: '#5EEAD4', letterSpacing: '0.12em' }} className="text-[10px] font-mono uppercase mb-1">
            Module 06 — Oscillatory Motion
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="text-2xl font-bold text-white">
            Pendulum &amp; Simple Harmonic Motion
          </h1>
          <p className="text-xs mt-1" style={{ color: '#7B8894' }}>
            Swing a real (large-angle, damped) pendulum next to its small-angle SHM approximation and watch them drift apart.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

            {/* Planet */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Gravity</div>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.keys(PLANETS).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlanet(p)}
                    disabled={running}
                    style={{
                      background: planet === p ? '#5EEAD4' : 'transparent',
                      color: planet === p ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="py-1.5 rounded text-xs font-mono disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="text-[10px] font-mono mt-1" style={{ color: '#5C6A76' }}>g = {g} m/s²</div>
            </div>

            {/* Formula panel */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 font-mono text-xs space-y-1">
              <div style={{ color: '#DCE4EA' }} className="text-sm">T₀ = 2π√(L/g) = {fmt(T0)} s</div>
              <div style={{ color: '#5C6A76' }} className="text-[10px]">small-angle, undamped — the SHM approximation</div>
              <div style={{ borderTop: '1px solid #1A232B', color: '#9AA7B2' }} className="pt-2">
                series correction: T ≈ T₀(1 + θ₀²/16 + …) = {fmt(seriesT)} s
              </div>
              <div style={{ color: '#5EEAD4' }}>
                measured period (exact, numeric): {measuredPeriod !== null ? `${fmt(measuredPeriod)} s` : 'no oscillation'}
              </div>
              {gamma > 0 && (
                <div className="text-[10px]" style={{ color: '#5C6A76' }}>
                  damping ratio ζ = γ/ω₀ = {fmt(dampingRatio)} — {dampingRegime}
                </div>
              )}
            </div>

            {/* Predict */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>
                Before you run it — predict the true (large-angle) period
              </div>
              <input
                type="number"
                value={predictT}
                disabled={running || finished}
                onChange={(e) => setPredictT(e.target.value)}
                style={{ background: '#131C24', border: '1px solid #2A363F', color: '#DCE4EA' }}
                className="w-full px-2 py-1.5 rounded text-sm font-mono disabled:opacity-50"
                placeholder="seconds"
              />
            </div>

            {/* Controls */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-4 space-y-4">
              <Slider label="Length L" value={length} min={0.2} max={2.5} step={0.05} unit=" m" decimals={2} onChange={setLength} disabled={running} />
              <Slider label="Bob mass m" value={mass} min={0.1} max={2} step={0.05} unit=" kg" decimals={2} onChange={setMass} disabled={running} />
              <Slider label="Initial angle θ₀" value={theta0deg} min={5} max={170} step={1} unit="°" onChange={setTheta0deg} disabled={running} />
              <Slider label="Damping rate γ" value={gamma} min={0} max={2.5} step={0.05} unit=" s⁻¹" decimals={2} onChange={setGamma} disabled={running} />
              <div className="text-[10px] font-mono -mt-2" style={{ color: '#5C6A76' }}>
                γ already accounts for the pendulum's inertia, so it doesn't depend on mass
              </div>

              <div style={{ borderTop: '1px solid #1A232B' }} className="pt-3">
                <Slider label="Scrub time manually" value={live.t} min={0} max={tMax} step={tMax / 300} unit=" s" onChange={scrubTo} disabled={running} />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={start}
                  disabled={running}
                  style={{ background: '#5EEAD4', color: '#0B0F14' }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded font-semibold text-sm disabled:opacity-50"
                >
                  <Play size={14} fill="#0B0F14" /> Swing pendulum
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

            {/* Pendulum visual */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2 flex justify-center">
              <canvas ref={canvasRef} width={320} height={260} className="rounded" />
            </div>

            {/* Readout */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 grid grid-cols-4 gap-2 font-mono text-center">
              {[
                ['t', live.t, 's'],
                ['θ (exact)', (live.thetaE * 180) / Math.PI, '°'],
                ['ω', live.omegaE, 'rad/s'],
                ['T₀', T0, 's'],
              ].map(([label, v, unit]) => (
                <div key={label}>
                  <div className="text-[10px]" style={{ color: '#5C6A76' }}>{label}</div>
                  <div className="text-sm" style={{ color: '#5EEAD4' }}>{fmt(v, 2)}</div>
                  <div className="text-[9px]" style={{ color: '#5C6A76' }}>{unit}</div>
                </div>
              ))}
            </div>

            {/* Angle vs time chart */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Angle vs. time — exact (large-angle) vs. small-angle theory</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart>
                  <CartesianGrid stroke="#1E2A35" />
                  <XAxis dataKey="t" type="number" domain={[0, tMax]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                  <YAxis tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                  <Line data={curve} dataKey="thetaS" stroke="#F5A623" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line data={tracedCurve} dataKey="thetaE" stroke="#5EEAD4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceDot x={live.t} y={live.thetaE} r={4} fill="#5EEAD4" stroke="none" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-[10px] font-mono mt-1 px-1" style={{ color: '#5C6A76' }}>
                <span><span style={{ color: '#F5A623' }}>┄┄</span> small-angle theory</span>
                <span><span style={{ color: '#5EEAD4' }}>━━</span> exact, so far</span>
              </div>
            </div>

            {/* Energy chart */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Energy vs. time (exact solution)</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart>
                  <CartesianGrid stroke="#1E2A35" />
                  <XAxis dataKey="t" type="number" domain={[0, tMax]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                  <YAxis domain={[0, energyMax * 1.1]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                  <Line data={tracedCurve} dataKey="KE" stroke="#F5A623" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line data={tracedCurve} dataKey="PE" stroke="#E5484D" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line data={tracedCurve} dataKey="total" stroke="#5EEAD4" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-[10px] font-mono mt-1 px-1 flex-wrap" style={{ color: '#5C6A76' }}>
                <span style={{ color: '#F5A623' }}>KE</span>
                <span style={{ color: '#E5484D' }}>PE</span>
                <span style={{ color: '#5EEAD4' }}>Total</span>
                <span>{gamma > 0 ? 'total should decay — damping removes energy' : 'total should stay flat — energy is conserved'}</span>
              </div>
            </div>

            {finished && predictT !== '' && (
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-1" style={{ color: '#9AA7B2' }}>How close was your guess?</div>
                {measuredPeriod !== null ? (
                  <div className="text-xs font-mono" style={{ color: '#DCE4EA' }}>
                    Measured period = {fmt(measuredPeriod)} s — your guess was off by {fmt(Math.abs(parseFloat(predictT) - measuredPeriod) / measuredPeriod * 100, 1)}%
                    {theta0deg > 60 && ' — notice how far this sits from the small-angle T₀, since the formula only holds for small swings'}
                  </div>
                ) : (
                  <div className="text-xs font-mono" style={{ color: '#5C6A76' }}>
                    This pendulum is overdamped — it settles back to rest without oscillating, so there's no period to measure.
                  </div>
                )}
              </div>
            )}

            <Quiz />
          </div>
        </div>
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

const QUESTIONS = [
  {
    q: 'The formula T = 2π√(L/g) accurately predicts a pendulum\'s period:',
    options: ['Always, for any angle', 'Only for small initial angles', 'Only when there is no gravity', 'Only when the mass is large'],
    correct: 1,
    explain: 'The formula comes from linearizing sinθ ≈ θ, which only holds well for small angles — at large angles the real period is noticeably longer.',
  },
  {
    q: 'Doubling the bob\'s mass (keeping length and angle fixed) changes the period:',
    options: ['Doubles it', 'Halves it', 'Not at all', 'Depends on gravity'],
    correct: 2,
    explain: 'For an ideal pendulum, mass cancels out of the equation of motion entirely — only length and gravity set the period.',
  },
  {
    q: 'For an undamped pendulum, as it swings, the total mechanical energy (KE + PE):',
    options: ['Steadily decreases', 'Steadily increases', 'Stays constant', 'Oscillates between positive and negative'],
    correct: 2,
    explain: 'With no damping, energy just trades between kinetic (fastest at the bottom) and potential (highest at the extremes) — the total stays flat.',
  },
  {
    q: 'A pendulum released from 150° will have a true period that is:',
    options: ['Shorter than 2π√(L/g)', 'Equal to 2π√(L/g)', 'Longer than 2π√(L/g)', 'Undefined'],
    correct: 2,
    explain: 'At large angles the restoring force (∝ sinθ) is weaker relative to θ itself than the small-angle approximation assumes, so the pendulum takes longer to swing back — the true period grows with amplitude.',
  },
  {
    q: 'An overdamped pendulum (very high damping rate) released from some angle will:',
    options: [
      'Oscillate forever with shrinking amplitude',
      'Oscillate a few times then stop',
      'Return toward equilibrium without ever oscillating',
      'Swing faster than an undamped one',
    ],
    correct: 2,
    explain: 'When the damping rate exceeds the natural frequency (ζ > 1), the system is overdamped: it relaxes back toward θ = 0 monotonically, with no oscillation at all.',
  },
];

function Quiz() {
  const [answers, setAnswers] = useState({});
  return (
    <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
      <div className="text-xs mb-3" style={{ color: '#9AA7B2' }}>Check your understanding</div>
      <div className="space-y-4">
        {QUESTIONS.map((item, qi) => {
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
