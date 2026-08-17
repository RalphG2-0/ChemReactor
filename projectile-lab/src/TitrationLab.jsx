import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot, ReferenceLine } from 'recharts';
import { Play, RotateCcw } from 'lucide-react';
import { useTheme, hexToRgba } from './theme.jsx';

const Kw = 1e-14;

// `protons` = number of acidic H (acids) or hydroxide/basic sites (bases) per formula unit.
// This sets the equivalence-point stoichiometry correctly for polyprotic species. The pH curve
// itself still uses a single averaged Ka/Kb (see computePH note below) — a simplification that
// gets the overall shape and endpoint right but smooths over the separate buffer regions a
// real multi-step titration of e.g. H₃PO₄ would show.
const ACIDS = [
  { key: 'hcl', label: 'HCl (strong)', strong: true, Ka: null, protons: 1 },
  { key: 'h2so4', label: 'H₂SO₄ (strong)', strong: true, Ka: null, protons: 2 },
  { key: 'hno3', label: 'HNO₃ (strong)', strong: true, Ka: null, protons: 1 },
  { key: 'h2co3', label: 'H₂CO₃ (weak)', strong: false, Ka: 4.3e-7, protons: 2 },
  { key: 'h3po4', label: 'H₃PO₄ (weak)', strong: false, Ka: 7.1e-3, protons: 3 },
  { key: 'hcn', label: 'HCN (weak)', strong: false, Ka: 6.2e-10, protons: 1 },
  { key: 'acetic', label: 'Acetic acid', strong: false, Ka: 1.8e-5, protons: 1 },
  { key: 'benzoic', label: 'Benzoic acid', strong: false, Ka: 6.5e-5, protons: 1 },
  { key: 'hf', label: 'Hydrofluoric acid', strong: false, Ka: 6.6e-4, protons: 1 },
  { key: 'hocl', label: 'Hypochlorous acid', strong: false, Ka: 3.0e-8, protons: 1 },
];

const BASES = [
  { key: 'naoh', label: 'NaOH (strong)', strong: true, Kb: null, protons: 1 },
  { key: 'koh', label: 'KOH (strong)', strong: true, Kb: null, protons: 1 },
  { key: 'lioh', label: 'LiOH (strong)', strong: true, Kb: null, protons: 1 },
  { key: 'baoh2', label: 'Ba(OH)₂ (strong)', strong: true, Kb: null, protons: 2 },
  { key: 'caoh2', label: 'Ca(OH)₂ (strong)', strong: true, Kb: null, protons: 2 },
  { key: 'caco3', label: 'Calcium carbonate', strong: false, Kb: 4.8e-11, protons: 2 },
  { key: 'na2co3', label: 'Sodium carbonate', strong: false, Kb: 2.1e-4, protons: 2 },
  { key: 'nahco3', label: 'Sodium bicarbonate', strong: false, Kb: 2.3e-8, protons: 1 },
  { key: 'ammonia', label: 'Ammonia (NH₃)', strong: false, Kb: 1.8e-5, protons: 1 },
  { key: 'methylamine', label: 'Methylamine', strong: false, Kb: 4.4e-4, protons: 1 },
  { key: 'pyridine', label: 'Pyridine', strong: false, Kb: 1.7e-9, protons: 1 },
];

const INDICATORS = [
  { key: 'phenolphthalein', label: 'Phenolphthalein', low: 8.2, high: 10.0, lowColor: [229, 231, 220], highColor: [244, 114, 182] },
  { key: 'bromothymolblue', label: 'Bromothymol Blue', low: 6.0, high: 7.6, lowColor: [214, 178, 54], highColor: [62, 142, 208] },
  { key: 'methylred', label: 'Methyl Red', low: 4.4, high: 6.2, lowColor: [214, 69, 54], highColor: [233, 196, 86] },
  { key: 'methylorange', label: 'Methyl Orange', low: 3.1, high: 4.4, lowColor: [214, 69, 54], highColor: [247, 197, 72] },
  { key: 'thymolblue', label: 'Thymol Blue', low: 1.2, high: 2.8, lowColor: [214, 69, 54], highColor: [62, 142, 208] },
  {key: 'litmus', label: 'Litmus', low: 4.5, high: 8.3, lowColor: [214, 69, 54], highColor: [62, 142, 208] },
  {key: 'universal', label: 'Universal indicator', low: 4.0, high: 10.0, lowColor: [214, 69, 54], highColor: [62, 142, 208] },
];

// General equilibrium (charge-balance) titration model — works for any combination of
// strong/weak acid analyte and strong/weak base titrant, solved numerically via bisection
// on the monotonic charge-balance function f(pH) = [H+] + posBase([H+]) − [OH-] − negAcid([H+]).
function computePH(vb, Ca, Va, Cb, acid, base) {
  const Vtot = Va + vb;
  if (Vtot <= 0) return 7;
  const nA = acid.protons || 1;
  const nB = base.protons || 1;
  // Total acidic-proton / basic-site concentration, scaled by stoichiometry — this is what
  // fixes polyprotic species (H₂SO₄, H₃PO₄, Ba(OH)₂, Na₂CO₃, ...) previously being treated as 1:1.
  const CaTot = (Ca * nA * Va) / Vtot;
  const CbTot = (Cb * nB * vb) / Vtot;
  const KaConjBase = base.strong ? null : Kw / base.Kb;

  const f = (pH) => {
    const H = Math.pow(10, -pH);
    const OH = Kw / H;
    const negAcid = acid.strong ? CaTot : CaTot * (acid.Ka / (acid.Ka + H));
    const posBase = base.strong ? CbTot : CbTot * (H / (H + KaConjBase));
    return H + posBase - OH - negAcid;
  };

  let lo = -1, hi = 15;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export default function TitrationLab() {
  const [acidKey, setAcidKey] = useState('hcl');
  const [baseKey, setBaseKey] = useState('naoh');
  const [indicatorKey, setIndicatorKey] = useState('phenolphthalein');
  const [Ca, setCa] = useState(0.1);
  const [Va, setVa] = useState(25);
  const [Cb, setCb] = useState(0.1);

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [live, setLive] = useState({ vb: 0, ph: 7 });

  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);

  const acid = ACIDS.find((a) => a.key === acidKey);
  const base = BASES.find((b) => b.key === baseKey);
  const isWeakAcid = !acid.strong;
  const isWeakBase = !base.strong;
  const Ka = acid.Ka || 1.8e-5;
  const pKa = -Math.log10(Ka);
  const Kb = base.Kb || 1.8e-5;
  const pKb = -Math.log10(Kb);
  const indicator = INDICATORS.find((i) => i.key === indicatorKey);

  const Veq = (Ca * acid.protons * Va) / (Cb * base.protons);
  const Vmax = Veq * 2;
  const eqPH = computePH(Veq, Ca, Va, Cb, acid, base);
  const indicatorMismatch = indicator.low > eqPH + 1 || indicator.high < eqPH - 1;

  const theoreticalCurve = useMemo(() => {
    const pts = [];
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const vb = (Vmax * i) / steps;
      pts.push({ vb, ph: computePH(vb, Ca, Va, Cb, acid, base) });
    }
    return pts;
  }, [Ca, Va, Cb, acid, base, Vmax]);

  // portion of the curve "revealed" so far, whether by animation or manual scrub
  const tracedCurve = useMemo(
    () => theoreticalCurve.filter((p) => p.vb <= live.vb + 1e-9),
    [theoreticalCurve, live.vb]
  );

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setFinished(false);
    setLive({ vb: 0, ph: computePH(0, Ca, Va, Cb, acid, base) });
  }, [Ca, Va, Cb, acid, base]);

  useEffect(() => { reset(); }, [Ca, Va, Cb, acid, base, reset]);

  const start = () => {
    cancelAnimationFrame(rafRef.current);
    stateRef.current = { vb: 0, last: performance.now() };
    setFinished(false);
    setRunning(true);
    rafRef.current = requestAnimationFrame(step);
  };

  const rate = Vmax / 6; // mL per second, ~6s full run

  const step = (now) => {
    const st = stateRef.current;
    const dt = Math.min((now - st.last) / 1000, 0.05);
    st.last = now;
    st.vb = Math.min(Vmax, st.vb + rate * dt);
    setLive({ vb: st.vb, ph: computePH(st.vb, Ca, Va, Cb, acid, base) });

    if (st.vb >= Vmax) {
      setRunning(false);
      setFinished(true);
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const scrubTo = (vb) => {
    if (running) return;
    setLive({ vb, ph: computePH(vb, Ca, Va, Cb, acid, base) });
    setFinished(vb >= Vmax - 1e-6);
  };

  // --- flask / burette drawing ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0F1720';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;

    const frac0to1 = Math.max(0, Math.min(1, (live.ph - indicator.low) / (indicator.high - indicator.low)));
    const [lr, lg, lb] = indicator.lowColor;
    const [hr, hg, hb] = indicator.highColor;
    const mr = lr + (hr - lr) * frac0to1;
    const mg = lg + (hg - lg) * frac0to1;
    const mb = lb + (hb - lb) * frac0to1;
    const liquidColor = `rgba(${mr.toFixed(0)},${mg.toFixed(0)},${mb.toFixed(0)},${0.3 + frac0to1 * 0.4})`;
    const pastEndpoint = live.ph >= indicator.high;

    // burette
    const burX = cx - 14, burY = 18, burW = 28, burH = 130;
    ctx.strokeStyle = '#3A4753';
    ctx.lineWidth = 2;
    ctx.strokeRect(burX, burY, burW, burH);
    const frac = Math.max(0, 1 - live.vb / Vmax);
    ctx.fillStyle = 'rgba(94,234,212,0.35)';
    ctx.fillRect(burX + 1, burY + 1 + burH * (1 - frac), burW - 2, Math.max(0, burH * frac - 2));

    ctx.strokeStyle = '#3A4753';
    ctx.beginPath();
    ctx.moveTo(cx, burY + burH);
    ctx.lineTo(cx, burY + burH + 14);
    ctx.stroke();
    if (running) {
      const dripY = burY + burH + 20 + ((performance.now() / 6) % 40);
      ctx.fillStyle = '#5EEAD4';
      ctx.beginPath();
      ctx.arc(cx, dripY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // flask
    const flaskTopY = burY + burH + 60;
    const neckW = 14, baseW = 90, flaskH = 100;
    ctx.strokeStyle = '#3A4753';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - neckW / 2, flaskTopY);
    ctx.lineTo(cx - neckW / 2, flaskTopY + 20);
    ctx.lineTo(cx - baseW / 2, flaskTopY + flaskH);
    ctx.lineTo(cx + baseW / 2, flaskTopY + flaskH);
    ctx.lineTo(cx + neckW / 2, flaskTopY + 20);
    ctx.lineTo(cx + neckW / 2, flaskTopY);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - neckW / 2, flaskTopY);
    ctx.lineTo(cx - neckW / 2, flaskTopY + 20);
    ctx.lineTo(cx - baseW / 2, flaskTopY + flaskH);
    ctx.lineTo(cx + baseW / 2, flaskTopY + flaskH);
    ctx.lineTo(cx + neckW / 2, flaskTopY + 20);
    ctx.lineTo(cx + neckW / 2, flaskTopY);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = liquidColor;
    ctx.fillRect(cx - baseW / 2, flaskTopY + 35, baseW, flaskH);
    ctx.restore();

    ctx.fillStyle = '#5C6A76';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`titrant (${base.label.split(' ')[0]})`, cx, burY - 6);
    ctx.fillText(pastEndpoint ? 'endpoint reached' : 'flask', cx, flaskTopY + flaskH + 16);
  }, [live, running, Vmax, indicator, base]);

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const region = live.vb < Veq - 0.05 * Veq ? (isWeakAcid && live.vb > 0 ? 'buffer region' : 'excess acid')
    : Math.abs(live.vb - Veq) < 0.05 * Veq ? 'near equivalence'
    : (isWeakBase ? 'excess weak base' : 'excess base');

  const regionFormula = (() => {
    if (Math.abs(live.vb - Veq) < 0.05 * Veq) {
      return 'At equivalence — pH set by hydrolysis of the remaining conjugate species (solved numerically)';
    }
    if (live.vb < Veq) {
      if (live.vb <= 1e-9) return isWeakAcid ? 'Ka = [H⁺][A⁻] / [HA]' : '[H⁺] ≈ Ca (fully dissociated)';
      return isWeakAcid
        ? 'Henderson–Hasselbalch (acid buffer): pH = pKa + log([A⁻]/[HA])'
        : '[H⁺] = (n_acid − n_base reacted) / V_total';
    }
    return isWeakBase
      ? 'Excess weak base ⇌ conjugate acid — solved numerically from Kb'
      : '[OH⁻] = (n_base − n_acid) / V_total';
  })();

  return (
    <div style={{ background: '#0B0F14', minHeight: '100%', color: '#DCE4EA' }} className="w-full p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4">
          <div style={{ color: '#5EEAD4', letterSpacing: '0.12em' }} className="text-[10px] font-mono uppercase mb-1">
            Module 03 — Acid-Base Chemistry
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="text-2xl font-bold text-white">
            Titration Lab
          </h1>
          <p className="text-xs mt-1" style={{ color: '#7B8894' }}>
            Add titrant drop by drop — or scrub directly — and watch the pH curve build toward the equivalence point.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

            {/* Acid choice */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Acid being titrated</div>
              <div className="grid grid-cols-1 gap-1.5">
                {ACIDS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setAcidKey(a.key)}
                    disabled={running}
                    style={{
                      background: acidKey === a.key ? '#5EEAD4' : 'transparent',
                      color: acidKey === a.key ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="flex justify-between items-center px-2.5 py-1.5 rounded text-xs font-mono disabled:opacity-50"
                  >
                    <span>{a.label}</span>
                    <span style={{ opacity: 0.8 }}>{a.strong ? '' : `pKa ${(-Math.log10(a.Ka)).toFixed(2)}`}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Base choice */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Titrant base</div>
              <div className="grid grid-cols-1 gap-1.5">
                {BASES.map((b) => (
                  <button
                    key={b.key}
                    onClick={() => setBaseKey(b.key)}
                    disabled={running}
                    style={{
                      background: baseKey === b.key ? '#5EEAD4' : 'transparent',
                      color: baseKey === b.key ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="flex justify-between items-center px-2.5 py-1.5 rounded text-xs font-mono disabled:opacity-50"
                  >
                    <span>{b.label}</span>
                    <span style={{ opacity: 0.8 }}>{b.strong ? '' : `pKb ${(-Math.log10(b.Kb)).toFixed(2)}`}</span>
                  </button>
                ))}
              </div>
              {isWeakBase && (
                <div className="text-[10px] font-mono mt-1.5" style={{ color: '#5C6A76' }}>
                  weak base titrant — the reaction with the acid is not fully complete at every point, so the curve past
                  equivalence sits closer to neutral than a strong base like NaOH would give
                </div>
              )}
            </div>

            {/* Indicator choice */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Indicator</div>
              <div className="grid grid-cols-2 gap-1.5">
                {INDICATORS.map((i) => (
                  <button
                    key={i.key}
                    onClick={() => setIndicatorKey(i.key)}
                    style={{
                      background: indicatorKey === i.key ? '#5EEAD4' : 'transparent',
                      color: indicatorKey === i.key ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="px-2 py-1.5 rounded text-[10px] font-mono"
                  >
                    {i.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] font-mono mt-1.5" style={{ color: indicatorMismatch ? '#F5A623' : '#5C6A76' }}>
                color changes over pH {indicator.low}–{indicator.high}
                {indicatorMismatch && ' — poor match for this equivalence point (pH ' + fmt(eqPH) + ')'}
              </div>
            </div>

            {/* Formula panel */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 font-mono text-xs space-y-1">
              <div style={{ color: '#9AA7B2' }} className="font-sans mb-1">Current region: <span style={{ color: '#5EEAD4' }}>{region}</span></div>
              <div style={{ color: '#DCE4EA' }}>{regionFormula}</div>
              <div style={{ color: '#5EEAD4' }} className="text-sm pt-1">pH = {fmt(live.ph)}</div>
              {(acid.protons > 1 || base.protons > 1) && (
                <div className="text-[10px] font-sans pt-1" style={{ color: '#5C6A76', borderTop: '1px solid #1A232B', marginTop: 4 }}>
                  {acid.protons > 1 ? acid.label.split(' ')[0] : base.label.split(' ')[0]} has {Math.max(acid.protons, base.protons)} acidic/basic sites —
                  the equivalence volume above correctly accounts for all of them, but a real titration would show {Math.max(acid.protons, base.protons)} separate
                  buffer regions and equivalence points rather than the single smoothed curve shown here.
                </div>
              )}
            </div>

            {/* Setup controls */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-4 space-y-4">
              <Slider label="Acid concentration (Ca)" value={Ca} min={0.05} max={0.5} step={0.01} unit=" M" decimals={2} onChange={setCa} disabled={running} />
              <Slider label="Acid volume (Va)" value={Va} min={10} max={50} step={1} unit=" mL" onChange={setVa} disabled={running} />
              <Slider label={`Titrant conc. (Cb, ${base.label.split(' ')[0]})`} value={Cb} min={0.05} max={0.5} step={0.01} unit=" M" decimals={2} onChange={setCb} disabled={running} />
              <div className="text-[10px] font-mono" style={{ color: '#5C6A76' }}>
                Equivalence volume V_eq = {fmt(Veq, 1)} mL
              </div>

              <div style={{ borderTop: '1px solid #1A232B' }} className="pt-3">
                <Slider label="Scrub titrant volume manually" value={live.vb} min={0} max={Vmax} step={Vmax / 200} unit=" mL"
                  onChange={scrubTo} disabled={running} />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={start}
                  disabled={running}
                  style={{ background: '#5EEAD4', color: '#0B0F14' }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded font-semibold text-sm disabled:opacity-50"
                >
                  <Play size={14} fill="#0B0F14" /> Animate titration
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

            {/* Burette / flask visual */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2 flex justify-center">
              <canvas ref={canvasRef} width={260} height={340} className="rounded" />
            </div>

            {/* Readout */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 grid grid-cols-3 gap-2 font-mono text-center">
              {[
                ['V added', live.vb, 'mL'],
                ['pH', live.ph, ''],
                ['V eq', Veq, 'mL'],
              ].map(([label, v, unit]) => (
                <div key={label}>
                  <div className="text-[10px]" style={{ color: '#5C6A76' }}>{label}</div>
                  <div className="text-sm" style={{ color: '#5EEAD4' }}>{fmt(v, 1)}</div>
                  <div className="text-[9px]" style={{ color: '#5C6A76' }}>{unit}</div>
                </div>
              ))}
            </div>

            {/* pH curve */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>pH vs. volume of titrant added</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart>
                  <CartesianGrid stroke="#1E2A35" />
                  <XAxis dataKey="vb" type="number" domain={[0, Vmax]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                  <YAxis dataKey="ph" type="number" domain={[0, 14]} tick={{ fontSize: 9, fill: '#5C6A76' }} stroke="#2A363F" />
                  <ReferenceLine x={Veq} stroke="#5C6A76" strokeDasharray="3 3" />
                  <ReferenceLine y={indicator.low} stroke="#F5A623" strokeOpacity={0.3} />
                  <ReferenceLine y={indicator.high} stroke="#F5A623" strokeOpacity={0.3} />
                  <Line data={theoreticalCurve} dataKey="ph" stroke="#F5A623" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line data={tracedCurve} dataKey="ph" stroke="#5EEAD4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceDot x={live.vb} y={live.ph} r={4} fill="#5EEAD4" stroke="none" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-[10px] font-mono mt-1 px-1" style={{ color: '#5C6A76' }}>
                <span><span style={{ color: '#F5A623' }}>┄┄</span> theory</span>
                <span><span style={{ color: '#5EEAD4' }}>━━</span> titrated so far</span>
                <span>┊ equivalence · amber bands = indicator range</span>
              </div>
            </div>

            {finished && (
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Titration complete</div>
                <div className="text-xs font-mono space-y-1" style={{ color: '#DCE4EA' }}>
                  <div>Equivalence point: {fmt(Veq, 1)} mL, pH {fmt(eqPH)}</div>
                  {isWeakAcid && <div>Half-equivalence ({fmt(Veq / 2, 1)} mL): pH ≈ pKa = {pKa.toFixed(2)}</div>}
                  {isWeakBase && <div>Titrant pKb = {pKb.toFixed(2)} — a weaker base (higher pKb) pushes the equivalence-point pH further below 7</div>}
                </div>
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
    q: 'At the equivalence point of a strong acid–strong base titration, the pH is:',
    options: ['Always below 7', 'Exactly 7', 'Always above 7', 'Equal to the pKa'],
    correct: 1,
    explain: 'Strong acid + strong base neutralize completely into a neutral salt and water, so pH = 7 exactly.',
  },
  {
    q: 'For a weak acid titrated with a strong base, the pH at the equivalence point is:',
    options: ['Below 7', 'Exactly 7', 'Above 7', 'Undefined'],
    correct: 2,
    explain: 'At equivalence, only the conjugate base (A⁻) remains — it reacts with water (hydrolysis) to produce OH⁻, pushing pH above 7.',
  },
  {
    q: 'At the half-equivalence point of a weak acid titration, pH equals:',
    options: ['7', 'pKa', '0', 'The equivalence-point pH'],
    correct: 1,
    explain: 'At half-equivalence, [HA] = [A⁻], so by Henderson–Hasselbalch, pH = pKa + log(1) = pKa.',
  },
  {
    q: 'Why does the choice of indicator matter for getting an accurate endpoint?',
    options: [
      'It doesn\'t — any indicator works for any titration',
      'The indicator\'s color-change range should bracket the equivalence-point pH, or the visual endpoint will miss the true equivalence point',
      'Indicators only work for strong acid titrations',
      'Indicators change the actual pH of the solution',
    ],
    correct: 1,
    explain: 'An indicator only signals visually near its own transition range — if that range doesn\'t overlap the actual equivalence-point pH, the color change happens too early or too late.',
  },
  {
    q: 'A strong acid titrated with a weak base like ammonia will have an equivalence-point pH that is:',
    options: ['Exactly 7', 'Above 7', 'Below 7', 'Impossible to reach'],
    correct: 2,
    explain: 'At equivalence, only the conjugate acid (e.g. NH₄⁺) remains — it hydrolyzes to release H⁺, pulling pH below 7, the mirror image of a weak-acid/strong-base titration.',
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