import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Zap, ArrowRight } from 'lucide-react';

// Standard reduction potentials, E° (V) — oxidized form + n e⁻ → reduced form
const HALF_CELLS = [
  { key: 'li', label: 'Li⁺ / Li', oxidized: 'Li⁺', reduced: 'Li', n: 1, E: -3.04 },
  { key: 'mg', label: 'Mg²⁺ / Mg', oxidized: 'Mg²⁺', reduced: 'Mg', n: 2, E: -2.37 },
  { key: 'al', label: 'Al³⁺ / Al', oxidized: 'Al³⁺', reduced: 'Al', n: 3, E: -1.66 },
  { key: 'zn', label: 'Zn²⁺ / Zn', oxidized: 'Zn²⁺', reduced: 'Zn', n: 2, E: -0.76 },
  { key: 'fe2', label: 'Fe²⁺ / Fe', oxidized: 'Fe²⁺', reduced: 'Fe', n: 2, E: -0.44 },
  { key: 'pb', label: 'Pb²⁺ / Pb', oxidized: 'Pb²⁺', reduced: 'Pb', n: 2, E: -0.13 },
  { key: 'h', label: 'H⁺ / H₂', oxidized: 'H⁺', reduced: 'H₂', n: 2, E: 0.0 },
  { key: 'cu', label: 'Cu²⁺ / Cu', oxidized: 'Cu²⁺', reduced: 'Cu', n: 2, E: 0.34 },
  { key: 'fe3', label: 'Fe³⁺ / Fe²⁺', oxidized: 'Fe³⁺', reduced: 'Fe²⁺', n: 1, E: 0.77 },
  { key: 'ag', label: 'Ag⁺ / Ag', oxidized: 'Ag⁺', reduced: 'Ag', n: 1, E: 0.80 },
  { key: 'br', label: 'Br₂ / Br⁻', oxidized: 'Br₂', reduced: 'Br⁻', n: 2, E: 1.07 },
  { key: 'mno4', label: 'MnO₄⁻ / Mn²⁺', oxidized: 'MnO₄⁻', reduced: 'Mn²⁺', n: 5, E: 1.51 },
];

const F = 96485; // C/mol
const R_GAS = 8.314; // J / (mol·K)

// Molar mass (g/mol) — only for half-cells whose reduced form is a plateable solid metal.
// H₂, Br₂, and MnO₄⁻/Mn²⁺ are excluded since reduction there doesn't deposit a solid you'd "plate."
const MOLAR_MASS = {
  li: 6.94, mg: 24.31, al: 26.98, zn: 65.38, fe2: 55.85,
  pb: 207.2, cu: 63.55, fe3: 55.85, ag: 107.87,
};

function metalColor(key) {
  const colors = {
    li: '#C4C9CD', mg: '#DADFE3', al: '#B8C3CC', zn: '#7C8B93', fe2: '#8A6E58',
    pb: '#5C6A76', h: '#5EEAD4', cu: '#D97757', fe3: '#8A6E58', ag: '#DCE4EA',
    br: '#B5451B', mno4: '#7C4DFF',
  };
  return colors[key] || '#9AA7B2';
}

export default function RedoxLab() {
  const [keyA, setKeyA] = useState('zn');
  const [keyB, setKeyB] = useState('cu');
  const [predicted, setPredicted] = useState(null); // 'A' | 'B' — which the user thinks is the cathode
  const [revealed, setRevealed] = useState(false);

  // Nernst equation (non-standard conditions)
  const [useNernst, setUseNernst] = useState(false);
  const [logQ, setLogQ] = useState(0); // log₁₀(Q); Q=1 (logQ=0) recovers standard conditions
  const [temp, setTemp] = useState(298); // K

  // Electroplating / Faraday's law calculator
  const [current, setCurrent] = useState(1); // A
  const [platingMinutes, setPlatingMinutes] = useState(10);

  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const cellA = HALF_CELLS.find((c) => c.key === keyA);
  const cellB = HALF_CELLS.find((c) => c.key === keyB);

  const { cathode, anode } = useMemo(() => {
    if (cellA.E >= cellB.E) return { cathode: cellA, anode: cellB };
    return { cathode: cellB, anode: cellA };
  }, [cellA, cellB]);

  const Ecell = cathode.E - anode.E;
  const spontaneous = Ecell > 0;
  const nElectrons = Math.max(cathode.n, anode.n); // simplified — balanced electron count for display
  const deltaG = -nElectrons * F * Ecell / 1000; // kJ/mol
  const Keq = Math.exp((nElectrons * F * Ecell) / (R_GAS * 298)); // ΔG° = −RT ln K = −nFE° (at 298 K)

  // E = E° − (RT/nF) ln Q, expressed in log₁₀ form: E = E° − (0.0592 V / n) log Q at 298 K,
  // generalized here to the chosen temperature.
  const nernstEcell = Ecell - ((R_GAS * temp) / (nElectrons * F)) * Math.LN10 * logQ;
  const nernstSpontaneous = nernstEcell > 0;

  const displayEcell = useNernst ? nernstEcell : Ecell;
  const displaySpontaneous = useNernst ? nernstSpontaneous : spontaneous;

  // Electroplating: only meaningful when the cathode's reduced form is a solid metal deposit
  const platingMetal = MOLAR_MASS[cathode.key] ? cathode : null;
  const platingSeconds = platingMinutes * 60;
  const molesDeposited = platingMetal ? (current * platingSeconds) / (platingMetal.n * F) : null;
  const massDeposited = platingMetal ? molesDeposited * MOLAR_MASS[platingMetal.key] : null;

  useEffect(() => {
    setRevealed(false);
    setPredicted(null);
  }, [keyA, keyB]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0F1720';
      ctx.fillRect(0, 0, W, H);

      const cellW = 130, cellH = 150, gap = 60;
      const leftX = W / 2 - gap / 2 - cellW;
      const rightX = W / 2 + gap / 2;
      const topY = 60;

      // beakers
      [leftX, rightX].forEach((x) => {
        ctx.strokeStyle = '#3A4753';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, topY + cellH);
        ctx.lineTo(x + cellW, topY + cellH);
        ctx.lineTo(x + cellW, topY);
        ctx.stroke();
      });

      // electrolyte fill (subtle blue-teal)
      ctx.fillStyle = 'rgba(94,234,212,0.08)';
      ctx.fillRect(leftX + 2, topY + 30, cellW - 4, cellH - 32);
      ctx.fillRect(rightX + 2, topY + 30, cellW - 4, cellH - 32);

      const anodeIsLeft = keyA === anode.key;
      const anodeX = anodeIsLeft ? leftX : rightX;
      const cathodeX = anodeIsLeft ? rightX : leftX;

      // electrodes (metal strips)
      const drawElectrode = (x, half, isAnode) => {
        ctx.fillStyle = metalColor(half.key);
        ctx.fillRect(x + cellW / 2 - 6, topY + 15, 12, cellH - 20);
        ctx.fillStyle = '#0B0F14';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isAnode ? '−' : '+', x + cellW / 2, topY + 28);
        ctx.fillStyle = '#DCE4EA';
        ctx.font = '10px monospace';
        ctx.fillText(half.label, x + cellW / 2, topY + cellH + 16);
        ctx.fillText(isAnode ? '(anode, oxidation)' : '(cathode, reduction)', x + cellW / 2, topY + cellH + 30);
      };
      drawElectrode(anodeX, anode, true);
      drawElectrode(cathodeX, cathode, false);

      // salt bridge
      ctx.strokeStyle = '#5C6A76';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(leftX + cellW - 4, topY + 15);
      ctx.quadraticCurveTo(W / 2, topY - 25, rightX + 4, topY + 15);
      ctx.stroke();
      ctx.fillStyle = '#7B8894';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('salt bridge', W / 2, topY - 30);

      // wire + voltmeter across the top
      const wireY = topY - 55;
      ctx.strokeStyle = '#3A4753';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(anodeX + cellW / 2, topY + 10);
      ctx.lineTo(anodeX + cellW / 2, wireY);
      ctx.lineTo(cathodeX + cellW / 2, wireY);
      ctx.lineTo(cathodeX + cellW / 2, topY + 10);
      ctx.stroke();

      const vmx = W / 2, vmy = wireY;
      ctx.fillStyle = '#0F1720';
      ctx.strokeStyle = displaySpontaneous ? '#5EEAD4' : '#E5484D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vmx, vmy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = displaySpontaneous ? '#5EEAD4' : '#E5484D';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${displayEcell >= 0 ? '+' : ''}${displayEcell.toFixed(2)}V`, vmx, vmy + 4);

      // electron flow animation: anode -> external wire -> cathode (only if spontaneous)
      if (displaySpontaneous) {
        const t = (performance.now() / 900) % 1;
        const segments = [
          [anodeX + cellW / 2, topY + 10, anodeX + cellW / 2, wireY],
          [anodeX + cellW / 2, wireY, cathodeX + cellW / 2, wireY],
          [cathodeX + cellW / 2, wireY, cathodeX + cellW / 2, topY + 10],
        ];
        const totalLen = segments.reduce((s, [x0, y0, x1, y1]) => s + Math.hypot(x1 - x0, y1 - y0), 0);
        let d = t * totalLen;
        for (const [x0, y0, x1, y1] of segments) {
          const len = Math.hypot(x1 - x0, y1 - y0);
          if (d <= len) {
            const ex = x0 + (x1 - x0) * (d / len);
            const ey = y0 + (y1 - y0) * (d / len);
            ctx.fillStyle = '#F5A623';
            ctx.shadowColor = '#F5A623';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            break;
          }
          d -= len;
        }
        ctx.fillStyle = '#5C6A76';
        ctx.font = '9px monospace';
        ctx.fillText('e⁻ flow →', (anodeX + cathodeX + cellW) / 2, wireY - 10);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [keyA, keyB, anode, cathode, displayEcell, displaySpontaneous]);

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  return (
    <div style={{ background: '#0B0F14', minHeight: '100%', color: '#DCE4EA' }} className="w-full p-4 font-sans">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4">
          <div style={{ color: '#5EEAD4', letterSpacing: '0.12em' }} className="text-[10px] font-mono uppercase mb-1">
            Module 05 — Electrochemistry
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif' }} className="text-2xl font-bold text-white">
            Redox &amp; Galvanic Cells
          </h1>
          <p className="text-xs mt-1" style={{ color: '#7B8894' }}>
            Pair two half-cells and see which one gets oxidized, which gets reduced, and whether the cell runs on its own.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-96 md:flex-shrink-0 space-y-4">

            {/* Half-cell pickers */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Electrode A</div>
              <select
                value={keyA}
                onChange={(e) => setKeyA(e.target.value)}
                style={{ background: '#131C24', border: '1px solid #2A363F', color: '#DCE4EA' }}
                className="w-full px-2 py-1.5 rounded text-xs font-mono"
              >
                {HALF_CELLS.map((c) => (
                  <option key={c.key} value={c.key} disabled={c.key === keyB}>{c.label} (E° = {c.E >= 0 ? '+' : ''}{c.E} V)</option>
                ))}
              </select>
              <div className="text-xs mt-3 mb-2" style={{ color: '#9AA7B2' }}>Electrode B</div>
              <select
                value={keyB}
                onChange={(e) => setKeyB(e.target.value)}
                style={{ background: '#131C24', border: '1px solid #2A363F', color: '#DCE4EA' }}
                className="w-full px-2 py-1.5 rounded text-xs font-mono"
              >
                {HALF_CELLS.map((c) => (
                  <option key={c.key} value={c.key} disabled={c.key === keyA}>{c.label} (E° = {c.E >= 0 ? '+' : ''}{c.E} V)</option>
                ))}
              </select>
            </div>

            {/* Predict before reveal */}
            {!revealed && (
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>
                  Before revealing — which electrode do you think is the cathode (gets reduced)?
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPredicted('A')}
                    style={{
                      background: predicted === 'A' ? '#5EEAD4' : 'transparent',
                      color: predicted === 'A' ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="flex-1 py-1.5 rounded text-xs font-mono"
                  >
                    {cellA.label}
                  </button>
                  <button
                    onClick={() => setPredicted('B')}
                    style={{
                      background: predicted === 'B' ? '#5EEAD4' : 'transparent',
                      color: predicted === 'B' ? '#0B0F14' : '#9AA7B2',
                      border: '1px solid #2A363F',
                    }}
                    className="flex-1 py-1.5 rounded text-xs font-mono"
                  >
                    {cellB.label}
                  </button>
                </div>
                <button
                  onClick={() => setRevealed(true)}
                  disabled={predicted === null}
                  style={{ background: '#5EEAD4', color: '#0B0F14' }}
                  className="w-full mt-3 py-2 rounded font-semibold text-sm disabled:opacity-40"
                >
                  Reveal
                </button>
              </div>
            )}

            {revealed && (
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs" style={{ color: predicted === (cathode.key === keyA ? 'A' : 'B') ? '#5EEAD4' : '#E5484D' }}>
                  {predicted === (cathode.key === keyA ? 'A' : 'B')
                    ? '✓ Correct — that electrode has the higher (more positive) E°, so it gets reduced.'
                    : `Not quite — ${cathode.label} has the higher E° (${fmt(cathode.E)} V vs. ${fmt(anode.E)} V), so it's the cathode.`}
                </div>
              </div>
            )}

            {/* Cell notation & formulas */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3 font-mono text-xs space-y-2">
              <div style={{ color: '#9AA7B2' }} className="font-sans">Half-reactions</div>
              <div style={{ color: '#DCE4EA' }}>
                Oxidation (anode): {anode.reduced} → {anode.oxidized} + {anode.n}e⁻
              </div>
              <div style={{ color: '#DCE4EA' }}>
                Reduction (cathode): {cathode.oxidized} + {cathode.n}e⁻ → {cathode.reduced}
              </div>
              <div style={{ borderTop: '1px solid #1A232B', color: '#9AA7B2' }} className="pt-2">
                E°cell = E°cathode − E°anode = {fmt(cathode.E)} − ({fmt(anode.E)})
              </div>
              <div style={{ color: spontaneous ? '#5EEAD4' : '#E5484D' }} className="text-sm">
                = {Ecell >= 0 ? '+' : ''}{fmt(Ecell)} V
              </div>
              <div className="text-[10px]" style={{ color: '#5C6A76' }}>
                ΔG° = −nFE°cell = {fmt(deltaG, 1)} kJ/mol (n = {nElectrons} mol e⁻ transferred)
              </div>
              <div className="text-[10px]" style={{ color: '#5C6A76' }}>
                K = exp(nFE°cell / RT) ≈ {Keq > 1e6 || (Keq > 0 && Keq < 1e-6) ? Keq.toExponential(2) : Keq.toFixed(4)}
                {Keq > 1 ? ' — heavily favors products' : Keq < 1 ? ' — heavily favors reactants' : ''}
              </div>
            </div>

            {/* Nernst equation — non-standard conditions */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <button
                onClick={() => setUseNernst((v) => !v)}
                className="flex items-center gap-2 text-xs w-full"
                style={{ color: useNernst ? '#F5A623' : '#7B8894' }}
              >
                <Zap size={14} />
                Nernst equation — non-standard conditions {useNernst ? '(on)' : '(off)'}
              </button>
              {useNernst && (
                <div className="mt-3 space-y-3">
                  <div className="font-mono text-[10px]" style={{ color: '#9AA7B2' }}>
                    E = E° − (RT/nF)·ln Q
                  </div>
                  <Slider label="log₁₀(Q)  — reaction quotient" value={logQ} min={-6} max={6} step={0.1}
                    onChange={setLogQ} />
                  <div className="text-[10px]" style={{ color: '#5C6A76' }}>
                    Q &gt; 1 means more product-side ions relative to standard (1 M) — this is what happens as a real
                    battery discharges and ion concentrations shift toward products.
                  </div>
                  <Slider label="Temperature" value={temp} min={273} max={373} step={1} unit=" K" onChange={setTemp} />
                  <div style={{ borderTop: '1px solid #1A232B', color: nernstSpontaneous ? '#5EEAD4' : '#E5484D' }} className="pt-2 font-mono text-xs">
                    E = {nernstEcell >= 0 ? '+' : ''}{fmt(nernstEcell)} V
                  </div>
                </div>
              )}
            </div>

            {/* Electroplating / Faraday's law calculator */}
            {platingMetal && (
              <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
                <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>
                  Electroplating calculator — how much {platingMetal.reduced} deposits at the cathode?
                </div>
                <div className="font-mono text-[10px] mb-3" style={{ color: '#5C6A76' }}>
                  mass = (I × t × M) / (n × F)
                </div>
                <div className="space-y-3">
                  <Slider label="Current" value={current} min={0.1} max={10} step={0.1} decimals={1} unit=" A" onChange={setCurrent} />
                  <Slider label="Time" value={platingMinutes} min={1} max={120} step={1} unit=" min" onChange={setPlatingMinutes} />
                </div>
                <div style={{ borderTop: '1px solid #1A232B', color: '#5EEAD4' }} className="mt-3 pt-2 font-mono text-xs">
                  {molesDeposited.toExponential(3)} mol → {massDeposited < 0.01 ? massDeposited.toExponential(2) : massDeposited.toFixed(3)} g of {platingMetal.reduced}
                </div>
              </div>
            )}
          </div>

          <div className="w-full flex-1 space-y-4">

            {/* Cell diagram */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-2 flex justify-center">
              <canvas ref={canvasRef} width={420} height={260} className="rounded" />
            </div>

            {/* Spontaneity readout */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="flex items-center gap-2 text-sm" style={{ color: displaySpontaneous ? '#5EEAD4' : '#E5484D' }}>
                <Zap size={16} />
                {displaySpontaneous ? 'Spontaneous — this cell will generate current on its own' : 'Non-spontaneous — this pairing needs an external power source to run'}
              </div>
              <div className="flex items-center gap-2 text-xs mt-2" style={{ color: '#9AA7B2' }}>
                <span style={{ color: '#F5A623' }}>{anode.label}</span> is oxidized
                <ArrowRight size={12} />
                electrons flow through the wire
                <ArrowRight size={12} />
                <span style={{ color: '#5EEAD4' }}>{cathode.label}</span> is reduced
              </div>
              {useNernst && Ecell > 0 && !nernstSpontaneous && (
                <div className="text-[10px] mt-2" style={{ color: '#F5A623' }}>
                  Under standard conditions this pairing is spontaneous (E° = +{fmt(Ecell)} V) — but at the concentrations
                  you've set (Q = 10^{logQ}), the cell has effectively run down and stopped delivering useful current. This is exactly
                  what happens to a battery as it discharges.
                </div>
              )}
            </div>

            {/* Potentials ladder */}
            <div style={{ background: '#0F1720', border: '1px solid #1E2A35', borderRadius: 8 }} className="p-3">
              <div className="text-xs mb-2" style={{ color: '#9AA7B2' }}>Standard reduction potential ladder (E°, volts)</div>
              <div className="space-y-1">
                {[...HALF_CELLS].sort((a, b) => b.E - a.E).map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <div className="text-[10px] font-mono w-14 text-right" style={{ color: '#5C6A76' }}>{c.E >= 0 ? '+' : ''}{c.E.toFixed(2)}</div>
                    <div
                      style={{
                        background: c.key === anode.key ? 'rgba(245,166,35,0.15)' : c.key === cathode.key ? 'rgba(94,234,212,0.15)' : 'transparent',
                        border: `1px solid ${c.key === anode.key ? '#F5A623' : c.key === cathode.key ? '#5EEAD4' : '#1E2A35'}`,
                      }}
                      className="flex-1 px-2 py-1 rounded text-xs font-mono"
                    >
                      <span style={{ color: c.key === anode.key ? '#F5A623' : c.key === cathode.key ? '#5EEAD4' : '#9AA7B2' }}>
                        {c.label}
                        {c.key === anode.key && '  ← oxidized here'}
                        {c.key === cathode.key && '  ← reduced here'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-mono mt-2" style={{ color: '#5C6A76' }}>
                higher on the ladder = stronger oxidizing agent (more easily reduced)
              </div>
            </div>

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
    q: 'In a galvanic cell, oxidation always happens at the:',
    options: ['Cathode', 'Anode', 'Salt bridge', 'Voltmeter'],
    correct: 1,
    explain: 'By definition, the anode is where oxidation (loss of electrons) occurs — the cathode is where reduction happens, in both galvanic and electrolytic cells.',
  },
  {
    q: 'Electrons in the external wire of a galvanic cell flow from:',
    options: ['Cathode to anode', 'Anode to cathode', 'They don\'t flow through the wire', 'Cathode to salt bridge'],
    correct: 1,
    explain: 'Electrons are released at the anode (oxidation) and travel through the external circuit to the cathode, where they\'re consumed in reduction.',
  },
  {
    q: 'A cell built from two half-cells with E°cell < 0 will:',
    options: [
      'Still run spontaneously, just more slowly',
      'Not run spontaneously as written — it needs an external power source',
      'Run in reverse automatically to fix the sign',
      'Have no chemical meaning',
    ],
    correct: 1,
    explain: 'A negative E°cell means ΔG° > 0 (since ΔG° = −nFE°cell) — the reaction as written is non-spontaneous and needs electrolysis to force it forward.',
  },
  {
    q: 'The purpose of the salt bridge in a galvanic cell is to:',
    options: [
      'Carry electrons between the two half-cells',
      'Maintain charge balance by letting ions migrate, completing the circuit',
      'Speed up the reduction reaction',
      'Prevent any reaction from occurring',
    ],
    correct: 1,
    explain: 'Without the salt bridge, charge would build up in each beaker as ions form and current would stop — the salt bridge lets spectator ions flow to keep both solutions electrically neutral.',
  },
  {
    q: 'According to the Nernst equation, as a real battery discharges and Q increases toward K, the cell voltage:',
    options: [
      'Stays constant at E°',
      'Increases',
      'Decreases toward zero',
      'Becomes negative immediately',
    ],
    correct: 2,
    explain: 'E = E° − (RT/nF)ln Q — as Q grows (more products, fewer reactants), the subtracted term grows too, driving E down toward zero. That\'s exactly what "the battery is dead" means: Q has caught up to K, ΔG = 0, and there\'s no more driving force.',
  },
  {
    q: "In Faraday's law, mass deposited = (I × t × M) / (n × F), the \"n\" refers to:",
    options: [
      'The number of half-cells in the circuit',
      'Moles of electrons transferred per mole of the depositing ion',
      'The reaction order',
      'Avogadro\'s number',
    ],
    correct: 1,
    explain: 'n is the electrons per formula unit in that specific half-reaction (e.g. n=2 for Cu²⁺ + 2e⁻ → Cu) — more electrons needed per ion means less metal deposited for the same charge passed.',
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
