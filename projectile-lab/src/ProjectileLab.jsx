import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { Play, RotateCcw, Wind } from 'lucide-react';
import { useQuestions } from './lib/useQuestions';

const PLANETS = {
  Earth: 9.81,
  Moon: 1.62,
  Mars: 3.71,
};

export default function ProjectileLab() {
  const [angle, setAngle] = useState(45);
  const [speed, setSpeed] = useState(25);
  const [planet, setPlanet] = useState('Earth');
  const [drag, setDrag] = useState(false);
  const [dragK, setDragK] = useState(0.02);
  const [mass, setMass] = useState(1);
  const [launchHeight, setLaunchHeight] = useState(0);
  const [wind, setWind] = useState(0);
  const [running, setRunning] = useState(false);
  const [landed, setLanded] = useState(false);

  const [simTrail, setSimTrail] = useState([]);
  const [theoryTrail, setTheoryTrail] = useState([]);
  const [readout, setReadout] = useState({ t: 0, x: 0, y: 0, v: 0 });
  const [summary, setSummary] = useState(null);

  const [predictRange, setPredictRange] = useState('');
  const [predictHeight, setPredictHeight] = useState('');
  const [quizAnswers, setQuizAnswers] = useState({});

  const rafRef = useRef(null);
  const stateRef = useRef(null);
  const canvasRef = useRef(null);
  const scaleRef = useRef({ maxX: 60, maxY: 30 });

  const g = PLANETS[planet];
  const rad = (angle * Math.PI) / 180;
  const vy0 = speed * Math.sin(rad);
  const liveTime = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * launchHeight)) / g;
  const liveRange = speed * Math.cos(rad) * liveTime;
  const liveHeight = launchHeight + (vy0 * vy0) / (2 * g);

  const theoreticalCurve = useCallback((v0, theta, gVal, y0) => {
    const rad = (theta * Math.PI) / 180;
    const vy = v0 * Math.sin(rad);
    const T = (vy + Math.sqrt(vy * vy + 2 * gVal * y0)) / gVal;
    const pts = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = (T * i) / steps;
      const x = v0 * Math.cos(rad) * t;
      const y = y0 + v0 * Math.sin(rad) * t - 0.5 * gVal * t * t;
      pts.push({ x, y: Math.max(0, y) });
    }
    return { pts, T, range: v0 * Math.cos(rad) * T, maxH: y0 + (vy * vy) / (2 * gVal) };
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setLanded(false);
    setSimTrail([]);
    setSummary(null);
    setPredictRange('');
    setPredictHeight('');
    const theory = theoreticalCurve(speed, angle, g, launchHeight);
    setTheoryTrail(theory.pts);
    const maxX = Math.max(theory.range * 1.15, 10);
    const maxY = Math.max(theory.maxH * 1.3, launchHeight + 5, 5);
    scaleRef.current = { maxX, maxY };
    setReadout({ t: 0, x: 0, y: launchHeight, v: speed });
  }, [speed, angle, g, launchHeight, theoreticalCurve]);

  useEffect(() => { reset(); }, [speed, angle, g, launchHeight, reset]);

  const launch = () => {
    cancelAnimationFrame(rafRef.current);
    const rad = (angle * Math.PI) / 180;
    stateRef.current = {
      t: 0,
      x: 0,
      y: launchHeight,
      vx: speed * Math.cos(rad),
      vy: speed * Math.sin(rad),
      trail: [],
      last: performance.now(),
    };
    setSimTrail([]);
    setSummary(null);
    setLanded(false);
    setRunning(true);
    rafRef.current = requestAnimationFrame(step);
  };

  const step = (now) => {
    const st = stateRef.current;
    const dt = Math.min((now - st.last) / 1000, 0.032);
    st.last = now;

    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const v = Math.hypot(st.vx, st.vy);
      const dragAx = drag ? -(dragK / mass) * v * st.vx : 0;
      const dragAy = drag ? -(dragK / mass) * v * st.vy : 0;
      const ax = dragAx + wind;
      const ay = -g + dragAy;
      st.vx += ax * h;
      st.vy += ay * h;
      st.x += st.vx * h;
      st.y += st.vy * h;
      st.t += h;
      if (st.y <= 0 && st.t > 0.05) {
        st.y = 0;
        break;
      }
    }

    st.trail.push({ x: st.x, y: Math.max(0, st.y) });
    setSimTrail([...st.trail]);
    setReadout({ t: st.t, x: st.x, y: Math.max(0, st.y), v: Math.hypot(st.vx, st.vy) });

    if (st.y <= 0 && st.trail.length > 2) {
      setRunning(false);
      setLanded(true);
      const theory = theoreticalCurve(speed, angle, g, launchHeight);
      const simMaxH = Math.max(...st.trail.map((p) => p.y));
      setSummary({
        simRange: st.x,
        simTime: st.t,
        simMaxH,
        theoryRange: theory.range,
        theoryTime: theory.T,
        theoryMaxH: theory.maxH,
      });
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ---- Canvas drawing ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const { maxX, maxY } = scaleRef.current;
    const pad = 24;

    const toPx = (x, y) => {
      const px = pad + (x / maxX) * (W - pad * 2);
      const py = H - pad - (y / maxY) * (H - pad * 2);
      return [px, py];
    };

    ctx.clearRect(0, 0, W, H);

    // background
    ctx.fillStyle = '#0F1720';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = '#1E2A35';
    ctx.lineWidth = 1;
    const gridStepX = maxX / 8;
    const gridStepY = maxY / 5;
    for (let gx = 0; gx <= maxX + 0.001; gx += gridStepX) {
      const [px] = toPx(gx, 0);
      ctx.beginPath();
      ctx.moveTo(px, pad);
      ctx.lineTo(px, H - pad);
      ctx.stroke();
    }
    for (let gy = 0; gy <= maxY + 0.001; gy += gridStepY) {
      const [, py] = toPx(0, gy);
      ctx.beginPath();
      ctx.moveTo(pad, py);
      ctx.lineTo(W - pad, py);
      ctx.stroke();
    }

    // ground
    ctx.strokeStyle = '#3A4753';
    ctx.lineWidth = 2;
    const [gx0, gy0] = toPx(0, 0);
    const [gx1] = toPx(maxX, 0);
    ctx.beginPath();
    ctx.moveTo(gx0, gy0);
    ctx.lineTo(gx1, gy0);
    ctx.stroke();

    // theory curve (amber, dashed)
    ctx.strokeStyle = '#F5A623';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    theoryTrail.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // simulated trail (teal, phosphor trail with fade)
    if (simTrail.length > 1) {
      for (let i = 1; i < simTrail.length; i++) {
        const alpha = 0.15 + 0.85 * (i / simTrail.length);
        ctx.strokeStyle = `rgba(94, 234, 212, ${alpha})`;
        ctx.lineWidth = 2;
        const [px0, py0] = toPx(simTrail[i - 1].x, simTrail[i - 1].y);
        const [px1, py1] = toPx(simTrail[i].x, simTrail[i].y);
        ctx.beginPath();
        ctx.moveTo(px0, py0);
        ctx.lineTo(px1, py1);
        ctx.stroke();
      }
      // ball
      const tip = simTrail[simTrail.length - 1];
      const [bx, by] = toPx(tip.x, tip.y);
      ctx.fillStyle = '#5EEAD4';
      ctx.shadowColor = '#5EEAD4';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [simTrail, theoryTrail]);

  const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

  return (
    <div style={{ background: '#0B0F14', minHeight: '100%', color: '#DCE4EA' }} className="w-full p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4">
          <div style={{ color: '#5EEAD4', letterSpacing: '0.12em' }} className="text-[10px] font-mono uppercase mb-1">
            Module 01 — Kinematics
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="text-2xl font-bold text-white">
            Projectile Motion Lab
          </h1>
          <p className="text-xs mt-1" style={{ color: '#7B8894' }}>
            Set launch conditions, fire, and compare the measured trajectory against ideal theory.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

        {/* Formula panel */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 space-y-2 font-mono text-xs">
          <div style={{ color: '#9AA7B2' }} className="font-sans mb-1">Governing equations (ideal, no drag)</div>
          <FormulaRow symbol="T = [v₀sinθ + √((v₀sinθ)² + 2gy₀)] / g" sub={`launch height y₀ = ${launchHeight} m`} result={`${liveTime.toFixed(2)} s`} />
          <FormulaRow symbol="R = v₀cosθ × T" sub={`= ${speed}×cos${angle}° × ${liveTime.toFixed(2)}s`} result={`${liveRange.toFixed(1)} m`} />
          <FormulaRow symbol="H = y₀ + (v₀sinθ)² / 2g" sub={`= ${launchHeight} + (${speed}×sin${angle}°)² / (2×${g})`} result={`${liveHeight.toFixed(1)} m`} />
        </div>

        {/* Predict-before-launch */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
          <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>
            Before you launch — predict the outcome (with drag, if enabled, real values will differ from the ideal formulas above)
          </div>
          <div className="flex gap-3">
            <label className="flex-1">
              <div className="text-[10px] mb-1" style={{ color: '#5C6A76' }}>Your predicted range (m)</div>
              <input
                type="number"
                value={predictRange}
                disabled={running || landed}
                onChange={(e) => setPredictRange(e.target.value)}
                style={{ background: '#131C24', border: '1px solid #2A363F', color: '#DCE4EA' }}
                className="w-full px-2 py-1.5 rounded text-sm font-mono disabled:opacity-50"
                placeholder="—"
              />
            </label>
            <label className="flex-1">
              <div className="text-[10px] mb-1" style={{ color: '#5C6A76' }}>Your predicted max height (m)</div>
              <input
                type="number"
                value={predictHeight}
                disabled={running || landed}
                onChange={(e) => setPredictHeight(e.target.value)}
                style={{ background: '#131C24', border: '1px solid #2A363F', color: '#DCE4EA' }}
                className="w-full px-2 py-1.5 rounded text-sm font-mono disabled:opacity-50"
                placeholder="—"
              />
            </label>
          </div>
        </div>

        {/* Controls */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-4 space-y-4">
          <Slider label="Launch angle" value={angle} min={10} max={80} step={1} unit="°"
            onChange={setAngle} disabled={running} />
          <Slider label="Initial speed" value={speed} min={5} max={50} step={1} unit=" m/s"
            onChange={setSpeed} disabled={running} />
          <Slider label="Launch height" value={launchHeight} min={0} max={30} step={1} unit=" m"
            onChange={setLaunchHeight} disabled={running} />
          <Slider label="Mass" value={mass} min={0.1} max={10} step={0.1} unit=" kg" decimals={1}
            onChange={setMass} disabled={running} />
          <div className="text-[10px] font-mono -mt-2" style={{ color: '#5C6A76' }}>
            mass only changes the trajectory when air resistance is on — heavier objects resist drag more
          </div>
          <Slider label="Wind (+ tailwind / − headwind)" value={wind} min={-5} max={5} step={0.5} unit=" m/s²" decimals={1}
            onChange={setWind} disabled={running} />

          <div>
            <div className="text-xs mb-1.5" style={{ color: '#9AA7B2' }}>Gravity</div>
            <div className="flex gap-2">
              {Object.keys(PLANETS).map((p) => (
                <button
                  key={p}
                  disabled={running}
                  onClick={() => setPlanet(p)}
                  style={{
                    background: planet === p ? '#5EEAD4' : 'transparent',
                    color: planet === p ? '#0B0F14' : '#9AA7B2',
                    border: '1px solid #2A363F',
                  }}
                  className="flex-1 py-1.5 rounded text-xs font-mono disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="text-[10px] font-mono mt-1" style={{ color: '#5C6A76' }}>g = {g} m/s²</div>
          </div>

          <div>
            <button
              onClick={() => setDrag((d) => !d)}
              disabled={running}
              className="flex items-center gap-2 text-xs disabled:opacity-50"
              style={{ color: drag ? '#F5A623' : '#7B8894' }}
            >
              <Wind size={14} />
              Air resistance {drag ? 'on' : 'off'}
            </button>
            {drag && (
              <div className="mt-2">
                <Slider label="Drag coefficient k" value={dragK} min={0.005} max={0.08} step={0.005} decimals={3}
                  onChange={setDragK} disabled={running} />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={launch}
              disabled={running}
              style={{ background: '#5EEAD4', color: '#0B0F14' }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded font-semibold text-sm disabled:opacity-50"
            >
              <Play size={14} fill="#0B0F14" /> Launch
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
        {/* ===== Right column: visualization + results ===== */}
        <div className="w-full flex-1 space-y-4">

        {/* Canvas */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2">
          <canvas ref={canvasRef} width={800} height={420} className="w-full h-auto rounded" />
          <div className="flex justify-between text-[10px] font-mono mt-1 px-1" style={{ color: '#5C6A76' }}>
            <span><span style={{ color: '#F5A623' }}>┄┄</span> theory (no drag)</span>
            <span><span style={{ color: '#5EEAD4' }}>━━</span> measured</span>
          </div>
        </div>

        {/* Readout */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 grid grid-cols-4 gap-2 font-mono text-center">
          {[
            ['t', readout.t, 's'],
            ['x', readout.x, 'm'],
            ['y', readout.y, 'm'],
            ['v', readout.v, 'm/s'],
          ].map(([label, val, unit]) => (
            <div key={label}>
              <div className="text-[10px]" style={{ color: '#5C6A76' }}>{label}</div>
              <div className="text-sm" style={{ color: '#5EEAD4' }}>{fmt(val)}</div>
              <div className="text-[9px]" style={{ color: '#5C6A76' }}>{unit}</div>
            </div>
          ))}
        </div>

        {/* Trajectory chart */}
        <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
          <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Height vs. distance</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart>
              <CartesianGrid stroke="#1E2A35" />
              <XAxis dataKey="x" type="number" domain={[0, scaleRef.current.maxX]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
              <YAxis dataKey="y" type="number" domain={[0, scaleRef.current.maxY]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line data={theoryTrail} dataKey="y" name="Theory" stroke="#F5A623" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line data={simTrail} dataKey="y" name="Measured" stroke="#5EEAD4" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Summary */}
        {summary && (
          <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
            <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Landing summary</div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr style={{ color: '#5C6A76' }}>
                  <td className="py-1">metric</td>
                  {(predictRange !== '' || predictHeight !== '') && (
                    <td className="py-1 text-right" style={{ color: '#9AA7B2' }}>your guess</td>
                  )}
                  <td className="py-1 text-right" style={{ color: '#5EEAD4' }}>measured</td>
                  <td className="py-1 text-right" style={{ color: '#F5A623' }}>theory</td>
                </tr>
              </thead>
              <tbody style={{ color: '#DCE4EA' }}>
                <tr>
                  <td className="py-0.5">range (m)</td>
                  {(predictRange !== '' || predictHeight !== '') && (
                    <td className="text-right" style={{ color: '#9AA7B2' }}>{predictRange !== '' ? predictRange : '—'}</td>
                  )}
                  <td className="text-right">{fmt(summary.simRange)}</td>
                  <td className="text-right">{fmt(summary.theoryRange)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">max height (m)</td>
                  {(predictRange !== '' || predictHeight !== '') && (
                    <td className="text-right" style={{ color: '#9AA7B2' }}>{predictHeight !== '' ? predictHeight : '—'}</td>
                  )}
                  <td className="text-right">{fmt(summary.simMaxH)}</td>
                  <td className="text-right">{fmt(summary.theoryMaxH)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">flight time (s)</td>
                  {(predictRange !== '' || predictHeight !== '') && <td />}
                  <td className="text-right">{fmt(summary.simTime)}</td>
                  <td className="text-right">{fmt(summary.theoryTime)}</td>
                </tr>
              </tbody>
            </table>
            {predictRange !== '' && (
              <div className="text-[10px] font-mono mt-2" style={{ color: '#5C6A76' }}>
                Your range guess was off by {fmt(Math.abs(parseFloat(predictRange) - summary.simRange) / summary.simRange * 100)}%
                {drag && ' — drag pulls the real trajectory short of the no-drag formula, which is why theory alone won\'t predict it exactly.'}
              </div>
            )}
          </div>
        )}

        {/* Quiz */}
        <Quiz answers={quizAnswers} setAnswers={setQuizAnswers} />

        </div>
        </div>
      </div>
    </div>
  );
}

function FormulaRow({ symbol, sub, result }) {
  return (
    <div style={{ borderTop: '1px solid #1A232B' }} className="pt-2 first:border-0 first:pt-0">
      <div style={{ color: '#DCE4EA' }}>{symbol}</div>
      <div style={{ color: '#5C6A76' }} className="text-[10px] mt-0.5">{sub}</div>
      <div style={{ color: '#5EEAD4' }} className="text-sm mt-0.5">= {result}</div>
    </div>
  );
}

const FALLBACK_QUIZ_QUESTIONS = [
  {
    q: 'With no air resistance, which launch angle maximizes range?',
    options: ['30°', '45°', '60°', '90°'],
    correct: 1,
    explain: 'Range ∝ sin(2θ), which peaks when 2θ = 90°, i.e. θ = 45°.',
  },
  {
    q: 'Two angles that are equidistant from 45° (e.g. 30° and 60°) give the same:',
    options: ['Max height', 'Flight time', 'Range', 'Landing speed'],
    correct: 2,
    explain: 'sin(2θ) is symmetric about θ=45°, so complementary-to-45° pairs share the same range — but not the same height or time.',
  },
  {
    q: 'Adding air resistance to a real projectile mainly does what to the ideal trajectory?',
    options: ['Increases range and height', 'Shortens range and height, and skews the peak earlier', 'Has no effect at typical speeds', 'Only affects flight time, not distance'],
    correct: 1,
    explain: 'Drag removes energy throughout the flight, so the real path falls short of the ideal parabola and the peak shifts earlier.',
  },
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Quiz({ answers, setAnswers }) {
  const [checked, setChecked] = useState({});
  const { questions } = useQuestions('projectile', FALLBACK_QUIZ_QUESTIONS);
  const [quizSet, setQuizSet] = useState(() => shuffled(questions));
  useEffect(() => {
    setQuizSet(shuffled(questions));
  }, [questions]);
  function newQuiz() {
    setQuizSet(shuffled(questions));
    setAnswers({});
    setChecked({});
  }
  return (
    <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs" style={{ color: '#9AA7B2' }}>Check your understanding</div>
        <button
          onClick={newQuiz}
          className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded"
          style={{ border: '1px solid #2A363F', color: '#9AA7B2' }}
        >
          <RotateCcw size={12} /> New questions
        </button>
      </div>
      <div className="space-y-4">
        {quizSet.map((item, qi) => {
          const chosen = answers[qi];
          const isChecked = checked[qi];
          return (
            <div key={qi}>
              <div className="text-xs mb-2" style={{ color: '#DCE4EA' }}>{qi + 1}. {item.q}</div>
              <div className="flex flex-col gap-1.5">
                {item.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = oi === item.correct;
                  let border = '#2A363F';
                  let color = '#9AA7B2';
                  if (isChecked) {
                    if (isCorrect) { border = '#5EEAD4'; color = '#5EEAD4'; }
                    else if (isChosen) { border = '#E5484D'; color = '#E5484D'; }
                  } else if (isChosen) {
                    border = '#5EEAD4'; color = '#DCE4EA';
                  }
                  return (
                    <button
                      key={oi}
                      onClick={() => !isChecked && setAnswers((a) => ({ ...a, [qi]: oi }))}
                      disabled={isChecked}
                      style={{ border: `1px solid ${border}`, color }}
                      className="text-left text-xs px-2.5 py-1.5 rounded font-mono disabled:opacity-100"
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setChecked((c) => ({ ...c, [qi]: true }))}
                  disabled={chosen === undefined || isChecked}
                  style={{
                    background: chosen !== undefined && !isChecked ? '#5EEAD4' : '#1E2A35',
                    color: chosen !== undefined && !isChecked ? '#0B0F14' : '#5C6A76',
                  }}
                  className="text-xs font-mono font-semibold px-2.5 py-1 rounded transition-colors"
                >
                  Check answer
                </button>
                {isChecked && (
                  <span className="text-xs font-mono" style={{ color: chosen === item.correct ? '#5EEAD4' : '#E5484D' }}>
                    {chosen === item.correct ? 'Correct' : 'Not quite'}
                  </span>
                )}
              </div>
              {isChecked && (
                <div className="text-[10px] mt-1.5" style={{ color: '#7B8894' }}>{item.explain}</div>
              )}
            </div>
          );
        })}
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
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: '#5EEAD4' }}
      />
    </div>
  );
}