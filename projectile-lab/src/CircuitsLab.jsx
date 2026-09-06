import React, { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  CircuitBoard, Layers, Timer, Route, Scale, Zap, CheckCircle2, XCircle, Info,
  ChevronDown, ChevronUp, RotateCcw,
} from "lucide-react";
import { useQuestions } from './lib/useQuestions';

/* ------------------------------------------------------------------ */
/*  Fixed dark palette — matches the rest of Virtual Lab, no theming   */
/*  infrastructure, hardcoded colors only.                             */
/* ------------------------------------------------------------------ */
const theme = {
  bg: "#0C1118", panel: "#151C27", panelAlt: "#111722", border: "#25303E",
  text: "#EAEDF2", muted: "#8B96A5", grid: "#20293580", wire: "#5B6B84",
};
const ACCENT = { primary: "#F59E0B", secondary: "#3B82F6" };

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  Shared small UI                                                    */
/* ------------------------------------------------------------------ */
function Field({ label, unit, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold tracking-wide uppercase mb-1" style={{ color: theme.muted }}>
        {label} {unit ? <span className="normal-case font-normal">({unit})</span> : null}
      </label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, step = 1, min, max }) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none border"
      style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
    />
  );
}

function Slider({ value, onChange, min, max, step }) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-amber-500"
    />
  );
}

function Panel({ children, style }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: theme.panel, borderColor: theme.border, ...style }}>
      {children}
    </div>
  );
}


function ResistorH({ x, y, color = theme.wire }) {
  const d = `M${x},${y} L${x + 8},${y} L${x + 14},${y - 8} L${x + 22},${y + 8} L${x + 30},${y - 8} L${x + 38},${y + 8} L${x + 46},${y - 8} L${x + 52},${y} L${x + 60},${y}`;
  return <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />;
}
function ResistorV({ x, y, color = theme.wire }) {
  const d = `M${x},${y} L${x},${y + 8} L${x - 8},${y + 14} L${x + 8},${y + 22} L${x - 8},${y + 30} L${x + 8},${y + 38} L${x - 8},${y + 46} L${x},${y + 52} L${x},${y + 60}`;
  return <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />;
}
function BatteryV({ x, y }) {
  // long plate (+) above, short plate (−) below
  return (
    <g>
      <line x1={x - 14} y1={y} x2={x + 14} y2={y} stroke={theme.text} strokeWidth="3" />
      <line x1={x - 7} y1={y + 10} x2={x + 7} y2={y + 10} stroke={theme.text} strokeWidth="1.5" />
      <text x={x + 20} y={y + 4} fontSize="11" fill={theme.text}>+</text>
      <text x={x + 20} y={y + 14} fontSize="11" fill={theme.muted}>−</text>
    </g>
  );
}
function CapacitorV({ x, y }) {
  return (
    <g>
      <line x1={x - 14} y1={y} x2={x + 14} y2={y} stroke={ACCENT.secondary} strokeWidth="3" />
      <line x1={x - 14} y1={y + 8} x2={x + 14} y2={y + 8} stroke={ACCENT.secondary} strokeWidth="3" />
    </g>
  );
}
function Node({ x, y }) {
  return <circle cx={x} cy={y} r="3.5" fill={theme.text} />;
}
function Galvanometer({ x, y }) {
  return (
    <g>
      <circle cx={x} cy={y} r="16" fill={theme.panelAlt} stroke={theme.text} strokeWidth="2" />
      <text x={x} y={y + 4} fontSize="12" fill={theme.text} textAnchor="middle">G</text>
    </g>
  );
}

const flowKeyframes = `
  @keyframes flow-fwd { to { stroke-dashoffset: -24; } }
  @keyframes flow-rev { to { stroke-dashoffset: 24; } }
`;
function CurrentFlow({ d, magnitude, reverse, color = ACCENT.primary }) {
  const clamped = Math.max(Math.min(Math.abs(magnitude), 3), 0.05);
  const duration = Math.max(0.25, 1.6 / clamped);
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeDasharray="5 7"
      strokeLinecap="round"
      style={{ animation: `${reverse ? "flow-rev" : "flow-fwd"} ${duration}s linear infinite`, opacity: 0.9 }}
    />
  );
}

/*  1. Series / Parallel resistor networks                              */

function SeriesParallelLab() {
  const [arrangement, setArrangement] = useState("series"); // series | parallel
  const [voltage, setVoltage] = useState(12);
  const [r1, setR1] = useState(100);
  const [r2, setR2] = useState(220);
  const [r3, setR3] = useState(330);

  const calc = useMemo(() => {
    if (arrangement === "series") {
      const req = r1 + r2 + r3;
      const i = voltage / req;
      const branches = [r1, r2, r3].map((r) => ({ r, i, v: i * r, p: i * i * r }));
      return { req, iTotal: i, branches, p: voltage * i };
    } else {
      const req = 1 / (1 / r1 + 1 / r2 + 1 / r3);
      const branches = [r1, r2, r3].map((r) => ({ r, i: voltage / r, v: voltage, p: (voltage * voltage) / r }));
      const iTotal = branches.reduce((s, b) => s + b.i, 0);
      return { req, iTotal, branches, p: voltage * iTotal };
    }
  }, [arrangement, voltage, r1, r2, r3]);

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <div className="inline-flex rounded-lg p-1 mb-4 border w-full" style={{ background: theme.panelAlt, borderColor: theme.border }}>
            {["series", "parallel"].map((a) => (
              <button
                key={a}
                onClick={() => setArrangement(a)}
                className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors"
                style={{ background: arrangement === a ? theme.panel : "transparent", color: arrangement === a ? theme.text : theme.muted }}
              >
                {a}
              </button>
            ))}
          </div>
          <Field label="Source voltage" unit="V">
            <NumberInput value={voltage} onChange={setVoltage} step={0.5} min={0.5} />
          </Field>
          <Field label="R₁" unit="Ω"><NumberInput value={r1} onChange={setR1} step={10} min={1} /></Field>
          <Field label="R₂" unit="Ω"><NumberInput value={r2} onChange={setR2} step={10} min={1} /></Field>
          <Field label="R₃" unit="Ω"><NumberInput value={r3} onChange={setR3} step={10} min={1} /></Field>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            {arrangement === "series"
              ? "Same current flows through every resistor; voltage divides according to each resistance."
              : "Same voltage appears across every branch; current divides inversely with each resistance."}
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.primary, 0.12)}, ${hexToRgba(ACCENT.secondary, 0.06)})` }}>
          <div className="cal-display text-3xl font-bold mb-1">
            R_eq = {calc.req.toFixed(1)} <span className="text-lg font-medium">Ω</span>
          </div>
          <p className="text-xs mb-3" style={{ color: theme.muted }}>
            I_total = {(calc.iTotal * 1000).toFixed(1)} mA · P_total = {calc.p.toFixed(2)} W
          </p>
          <div className="cal-mono text-xs" style={{ color: theme.muted }}>
            {arrangement === "series"
              ? `R_eq = R₁ + R₂ + R₃ = ${r1} + ${r2} + ${r3} = ${calc.req.toFixed(1)} Ω`
              : `1/R_eq = 1/R₁ + 1/R₂ + 1/R₃ → R_eq = ${calc.req.toFixed(1)} Ω`}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs cal-mono">
            {calc.branches.map((b, i) => (
              <div key={i} className="rounded-md p-2" style={{ background: theme.panelAlt }}>
                <div className="font-semibold" style={{ color: theme.text }}>R{i + 1} = {b.r} Ω</div>
                <div style={{ color: theme.muted }}>I = {(b.i * 1000).toFixed(1)} mA</div>
                <div style={{ color: theme.muted }}>V = {b.v.toFixed(2)} V</div>
                <div style={{ color: theme.muted }}>P = {(b.p * 1000).toFixed(1)} mW</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Circuit diagram</h3>
          <style>{flowKeyframes}</style>
          {arrangement === "series" ? (
            <svg viewBox="0 0 340 100" className="w-full h-32">
              <path d="M40,50 L60,50 M120,50 L160,50 M220,50 L260,50 M320,50 L40,50" fill="none" stroke={theme.wire} strokeWidth="2" opacity="0" />
              <line x1="40" y1="20" x2="40" y2="80" stroke={theme.wire} strokeWidth="2" />
              <line x1="40" y1="20" x2="60" y2="20" stroke={theme.wire} strokeWidth="2" />
              <line x1="40" y1="80" x2="60" y2="80" stroke={theme.wire} strokeWidth="2" />
              <BatteryV x={30} y={50} />
              <line x1="60" y1="20" x2="120" y2="20" stroke={theme.wire} strokeWidth="2" />
              <ResistorH x={120} y={20} />
              <line x1="180" y1="20" x2="320" y2="20" stroke={theme.wire} strokeWidth="2" />
              <ResistorH x={220} y={20} />
              <line x1="320" y1="20" x2="320" y2="80" stroke={theme.wire} strokeWidth="2" />
              <line x1="60" y1="80" x2="320" y2="80" stroke={theme.wire} strokeWidth="2" />
              <ResistorH x={165} y={80} />
              <text x="150" y="14" fontSize="10" fill={theme.muted}>R₁</text>
              <text x="250" y="14" fontSize="10" fill={theme.muted}>R₂</text>
              <text x="195" y="96" fontSize="10" fill={theme.muted}>R₃</text>
              <CurrentFlow d="M60,20 L320,20 L320,80 L60,80" magnitude={calc.iTotal} reverse={false} />
            </svg>
          ) : (
            <svg viewBox="0 0 300 140" className="w-full h-40">
              <line x1="30" y1="20" x2="30" y2="120" stroke={theme.wire} strokeWidth="2" />
              <line x1="270" y1="20" x2="270" y2="120" stroke={theme.wire} strokeWidth="2" />
              <line x1="10" y1="70" x2="30" y2="70" stroke={theme.wire} strokeWidth="2" />
              <BatteryV x={10} y={70} />
              {[30, 70, 110].map((yy, i) => (
                <g key={i}>
                  <line x1="30" y1={yy - 20} x2="105" y2={yy - 20} stroke={theme.wire} strokeWidth="2" />
                  <ResistorH x={105} y={yy - 20} />
                  <line x1="165" y1={yy - 20} x2="270" y2={yy - 20} stroke={theme.wire} strokeWidth="2" />
                  <text x="135" y={yy - 26} fontSize="10" fill={theme.muted} textAnchor="middle">R{i + 1}</text>
                  <CurrentFlow d={`M30,${yy - 20} L270,${yy - 20}`} magnitude={calc.branches[i].i} reverse={false} />
                </g>
              ))}
              <Node x={30} y={20} /><Node x={30} y={70} /><Node x={30} y={110} />
              <Node x={270} y={20} /><Node x={270} y={70} /><Node x={270} y={110} />
            </svg>
          )}
        </Panel>
      </div>
    </div>
  );
}

/*  2. RC Circuit — charging / discharging                              */

function RCLab() {
  const [resistance, setResistance] = useState(10000); // ohms
  const [capacitance, setCapacitance] = useState(100); // microfarads
  const [voltage, setVoltage] = useState(9);
  const [phase, setPhase] = useState("charging"); // charging | discharging

  const tau = useMemo(() => (resistance * capacitance) / 1e6, [resistance, capacitance]); // seconds

  const data = useMemo(() => {
    const domain = tau * 5;
    const pts = [];
    for (let t = 0; t <= domain; t += domain / 120) {
      const frac = phase === "charging" ? 1 - Math.exp(-t / tau) : Math.exp(-t / tau);
      const vC = phase === "charging" ? voltage * frac : voltage * frac;
      const i = phase === "charging" ? (voltage / resistance) * Math.exp(-t / tau) : (voltage / resistance) * Math.exp(-t / tau);
      pts.push({ t: Number(t.toFixed(3)), vC: Number(vC.toFixed(3)), iMa: Number((i * 1000).toFixed(3)) });
    }
    return pts;
  }, [tau, voltage, resistance, phase]);

  const milestones = [1, 2, 3, 5].map((n) => ({
    n,
    t: n * tau,
    pct: phase === "charging" ? (1 - Math.exp(-n)) * 100 : Math.exp(-n) * 100,
  }));

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <div className="inline-flex rounded-lg p-1 mb-4 border w-full" style={{ background: theme.panelAlt, borderColor: theme.border }}>
            {["charging", "discharging"].map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium capitalize"
                style={{ background: phase === p ? theme.panel : "transparent", color: phase === p ? theme.text : theme.muted }}
              >
                {p}
              </button>
            ))}
          </div>
          <Field label="Resistance" unit="Ω"><NumberInput value={resistance} onChange={setResistance} step={100} min={10} /></Field>
          <Field label="Capacitance" unit="μF"><NumberInput value={capacitance} onChange={setCapacitance} step={5} min={1} /></Field>
          <Field label="Source voltage" unit="V"><NumberInput value={voltage} onChange={setVoltage} step={0.5} min={0.5} /></Field>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            τ = RC is the time to reach 63.2% of the way toward the final voltage — not the time to fully charge.
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.secondary, 0.12)}, ${hexToRgba(ACCENT.primary, 0.06)})` }}>
          <div className="cal-display text-3xl font-bold mb-1">
            τ = {tau.toFixed(2)} <span className="text-lg font-medium">s</span>
          </div>
          <p className="text-xs mb-2" style={{ color: theme.muted }}>τ = R × C = {resistance} Ω × {(capacitance / 1e6).toExponential(1)} F</p>
          <div className="grid grid-cols-4 gap-2 text-xs cal-mono mt-2">
            {milestones.map((m) => (
              <div key={m.n} className="rounded-md p-2 text-center" style={{ background: theme.panelAlt }}>
                <div style={{ color: theme.text }}>{m.n}τ</div>
                <div style={{ color: theme.muted }}>{m.pct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Capacitor voltage & current vs. time</h3>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={data} margin={{ top: 5, right: 15, bottom: 5, left: -10 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke={theme.muted} tick={{ fontSize: 11 }} label={{ value: "Time (s)", position: "insideBottom", offset: -3, fontSize: 11, fill: theme.muted }} />
              <YAxis stroke={theme.muted} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: theme.panel, borderColor: theme.border, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine x={Number(tau.toFixed(3))} stroke={theme.muted} strokeDasharray="4 3" label={{ value: "1τ", fontSize: 10, fill: theme.muted }} />
              <Line type="monotone" dataKey="vC" name="V_C (V)" stroke={ACCENT.secondary} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="iMa" name="I (mA)" stroke={ACCENT.primary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}

/*  3. Kirchhoff's Laws — two-loop circuit            */

function KirchhoffLab() {
  const [v1, setV1] = useState(10);
  const [v2, setV2] = useState(5);
  const [r1, setR1] = useState(100);
  const [r2, setR2] = useState(200);
  const [r3, setR3] = useState(150);

  const calc = useMemo(() => {
    const d = (r1 + r3) * (r2 + r3) - r3 * r3;
    const i1 = (v1 * (r2 + r3) - v2 * r3) / d;
    const i2 = (v2 * (r1 + r3) - v1 * r3) / d;
    const i3 = i1 + i2;
    return { d, i1, i2, i3 };
  }, [v1, v2, r1, r2, r3]);

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="V₁ (left loop)" unit="V"><NumberInput value={v1} onChange={setV1} step={0.5} /></Field>
            <Field label="V₂ (right loop)" unit="V"><NumberInput value={v2} onChange={setV2} step={0.5} /></Field>
            <Field label="R₁" unit="Ω"><NumberInput value={r1} onChange={setR1} step={10} min={1} /></Field>
            <Field label="R₂" unit="Ω"><NumberInput value={r2} onChange={setR2} step={10} min={1} /></Field>
            <Field label="R₃ (shared branch)" unit="Ω"><NumberInput value={r3} onChange={setR3} step={10} min={1} /></Field>
          </div>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            If a solved current comes out negative, the actual current flows opposite to the arrow direction assumed when writing the loop equations — not an error.
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.primary, 0.12)}, ${hexToRgba(ACCENT.secondary, 0.06)})` }}>
          <div className="grid grid-cols-3 gap-2 cal-mono text-sm mb-3">
            {[["I₁", calc.i1], ["I₂", calc.i2], ["I₃", calc.i3]].map(([label, val]) => (
              <div key={label} className="rounded-md p-2 text-center" style={{ background: theme.panelAlt }}>
                <div className="text-xs" style={{ color: theme.muted }}>{label}</div>
                <div className="text-lg font-bold" style={{ color: val < 0 ? "#DC2626" : theme.text }}>
                  {(val * 1000).toFixed(1)} mA
                </div>
              </div>
            ))}
          </div>
          <div className="cal-mono text-xs space-y-1" style={{ color: theme.muted }}>
            <div>KCL at node: I₁ + I₂ = I₃</div>
            <div>Loop 1 (KVL): V₁ = I₁(R₁+R₃) + I₂R₃ → {v1} = I₁({r1}+{r3}) + I₂({r3})</div>
            <div>Loop 2 (KVL): V₂ = I₁R₃ + I₂(R₂+R₃) → {v2} = I₁({r3}) + I₂({r2}+{r3})</div>
            <div>Solving the 2×2 system: I₁ = {(calc.i1 * 1000).toFixed(2)} mA, I₂ = {(calc.i2 * 1000).toFixed(2)} mA</div>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Circuit diagram</h3>
          <style>{flowKeyframes}</style>
          <svg viewBox="0 0 340 160" className="w-full h-44">
            {/* left loop */}
            <line x1="20" y1="30" x2="20" y2="130" stroke={theme.wire} strokeWidth="2" />
            <line x1="20" y1="30" x2="60" y2="30" stroke={theme.wire} strokeWidth="2" />
            <line x1="20" y1="130" x2="60" y2="130" stroke={theme.wire} strokeWidth="2" />
            <BatteryV x={10} y={80} />
            <ResistorH x={60} y={30} />
            <text x="90" y="20" fontSize="10" fill={theme.muted} textAnchor="middle">R₁</text>
            <line x1="120" y1="30" x2="170" y2="30" stroke={theme.wire} strokeWidth="2" />
            {/* right loop */}
            <line x1="320" y1="30" x2="320" y2="130" stroke={theme.wire} strokeWidth="2" />
            <line x1="280" y1="30" x2="320" y2="30" stroke={theme.wire} strokeWidth="2" />
            <line x1="280" y1="130" x2="320" y2="130" stroke={theme.wire} strokeWidth="2" />
            <BatteryV x={330} y={80} />
            <line x1="220" y1="30" x2="230" y2="30" stroke={theme.wire} strokeWidth="2" />
            <ResistorH x={230} y={30} />
            <text x="255" y="20" fontSize="10" fill={theme.muted} textAnchor="middle">R₂</text>
            <line x1="170" y1="30" x2="230" y2="30" stroke={theme.wire} strokeWidth="0" />
            {/* middle shared branch */}
            <Node x={170} y={30} /><Node x={170} y={130} />
            <ResistorV x={170} y={45} />
            <text x="185" y="80" fontSize="10" fill={theme.muted}>R₃</text>
            <line x1="170" y1="30" x2="170" y2="45" stroke={theme.wire} strokeWidth="2" />
            <line x1="170" y1="105" x2="170" y2="130" stroke={theme.wire} strokeWidth="2" />
            <line x1="60" y1="130" x2="170" y2="130" stroke={theme.wire} strokeWidth="2" />
            <line x1="170" y1="130" x2="280" y2="130" stroke={theme.wire} strokeWidth="2" />

            <CurrentFlow d="M60,30 L170,30" magnitude={calc.i1} reverse={calc.i1 < 0} />
            <CurrentFlow d="M230,30 L170,30" magnitude={calc.i2} reverse={calc.i2 < 0} />
            <CurrentFlow d="M170,45 L170,105" magnitude={calc.i3} reverse={calc.i3 < 0} />
          </svg>
        </Panel>
      </div>
    </div>
  );
}


/*  4. Wheatstone Bridge                                                */

const HIDDEN_RX = 560; 

function WheatstoneLab() {
  const [r1] = useState(1000); 
  const [r2] = useState(1000); 
  const [r3, setR3] = useState(400); 
  const [voltage, setVoltage] = useState(6);

  const calc = useMemo(() => {
    const vA = (voltage * r2) / (r1 + r2);
    const vB = (voltage * HIDDEN_RX) / (r3 + HIDDEN_RX);
    const dV = vA - vB;
    const rxEstimate = (r2 * r3) / r1;
    const balanced = Math.abs(dV) < 0.01;
    return { vA, vB, dV, rxEstimate, balanced };
  }, [r3, voltage, r1, r2]);

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <Field label="Supply voltage" unit="V"><NumberInput value={voltage} onChange={setVoltage} step={0.5} min={0.5} /></Field>
          <Field label="R₁ — known ratio arm" unit="Ω"><div className="text-sm cal-mono px-1" style={{ color: theme.muted }}>{r1} (fixed)</div></Field>
          <Field label="R₂ — known ratio arm" unit="Ω"><div className="text-sm cal-mono px-1" style={{ color: theme.muted }}>{r2} (fixed)</div></Field>
          <Field label="R₃ — variable resistance box" unit="Ω">
            <Slider value={r3} onChange={setR3} min={100} max={1000} step={1} />
            <div className="text-sm cal-mono mt-1" style={{ color: theme.text }}>{r3} Ω</div>
          </Field>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            R₄ is an unknown resistor. Slide R₃ until the galvanometer nulls — at balance, R₄ = R₂·R₃/R₁.
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(calc.balanced ? "#16A34A" : ACCENT.primary, 0.14)}, ${hexToRgba(ACCENT.secondary, 0.06)})`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            {calc.balanced ? <CheckCircle2 size={18} style={{ color: "#16A34A" }} /> : <Scale size={18} style={{ color: ACCENT.primary }} />}
            <span className="text-sm font-semibold" style={{ color: calc.balanced ? "#16A34A" : ACCENT.primary }}>
              {calc.balanced ? "Bridge balanced" : "Not yet balanced"}
            </span>
          </div>
          <div className="cal-display text-3xl font-bold mb-1">
            ΔV = {(calc.dV * 1000).toFixed(1)} <span className="text-lg font-medium">mV</span>
          </div>
          <p className="text-xs mb-3" style={{ color: theme.muted }}>Galvanometer reads V_A − V_B, ideally driven to zero.</p>
          <div className="cal-mono text-xs space-y-1" style={{ color: theme.muted }}>
            <div>V_A = V·R₂/(R₁+R₂) = {calc.vA.toFixed(3)} V</div>
            <div>V_B = V·R₄/(R₃+R₄) = {calc.vB.toFixed(3)} V</div>
            <div>Estimated R₄ = R₂·R₃/R₁ = {calc.rxEstimate.toFixed(0)} Ω</div>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Bridge diagram</h3>
          <style>{flowKeyframes}</style>
          <svg viewBox="0 0 300 180" className="w-full h-48">
            <Node x={150} y={20} /><Node x={40} y={90} /><Node x={260} y={90} /><Node x={150} y={160} />
            <line x1="150" y1="20" x2="40" y2="90" stroke={theme.wire} strokeWidth="2" />
            <line x1="150" y1="20" x2="260" y2="90" stroke={theme.wire} strokeWidth="2" />
            <line x1="40" y1="90" x2="150" y2="160" stroke={theme.wire} strokeWidth="2" />
            <line x1="260" y1="90" x2="150" y2="160" stroke={theme.wire} strokeWidth="2" />
            <text x="75" y="50" fontSize="10" fill={theme.muted}>R₁</text>
            <text x="215" y="50" fontSize="10" fill={theme.muted}>R₂</text>
            <text x="75" y="135" fontSize="10" fill={theme.muted}>R₃</text>
            <text x="205" y="135" fontSize="10" fill={theme.muted}>R₄ (?)</text>
            <Galvanometer x={150} y={90} />
            <line x1="40" y1="90" x2="134" y2="90" stroke={theme.wire} strokeWidth="1.5" strokeDasharray="2 3" />
            <line x1="166" y1="90" x2="260" y2="90" stroke={theme.wire} strokeWidth="1.5" strokeDasharray="2 3" />
            <line x1="150" y1="20" x2="150" y2="-10" stroke={theme.wire} strokeWidth="0" />
            <BatteryV x={150} y={-4} />
          </svg>
        </Panel>
      </div>
    </div>
  );
}

/*  Quiz                                                                */

const FALLBACK_QUIZ = [
  { q: "In a series circuit, which quantity is the same through every resistor?", options: ["Voltage", "Current", "Power", "Resistance"], correct: 1, explain: "There's only one path for charge to flow, so the same current passes through every element in series." },
  { q: "In a parallel circuit, which quantity is the same across every branch?", options: ["Current", "Voltage", "Power", "Resistance"], correct: 1, explain: "All branches connect the same two nodes, so they all share the same voltage." },
  { q: "Combining three resistors in parallel always makes the equivalent resistance:", options: ["Larger than the largest resistor", "Smaller than the smallest resistor", "Equal to the average", "Equal to the sum"], correct: 1, explain: "Adding parallel paths always gives current more ways to flow, so R_eq is always less than the smallest individual resistor." },
  { q: "After exactly one time constant (τ = RC) of charging, a capacitor reaches what percentage of its final voltage?", options: ["50%", "63.2%", "86.5%", "100%"], correct: 1, explain: "V_C(t) = V(1 − e^(−t/τ)); at t = τ, 1 − e⁻¹ ≈ 0.632, or 63.2%." },
  { q: "Doubling both R and C in an RC circuit will:", options: ["Halve τ", "Leave τ unchanged", "Double τ", "Quadruple τ"], correct: 3, explain: "τ = RC, so doubling both factors multiplies τ by 2 × 2 = 4." },
  { q: "Kirchhoff's Current Law (KCL) is a statement of:", options: ["Conservation of energy", "Conservation of charge", "Ohm's law", "Conservation of momentum"], correct: 1, explain: "KCL says the total current into a node equals the total current out — charge can't pile up or vanish at a junction." },
  { q: "If solving a Kirchhoff's-law circuit gives a negative current for a branch, that means:", options: ["You made an arithmetic error", "The actual current flows opposite to your assumed direction", "The circuit is impossible", "That branch has no current"], correct: 1, explain: "The sign just tells you the real direction relative to the arrow you originally assumed — the magnitude is still valid." },
  { q: "A Wheatstone bridge is 'balanced' when:", options: ["The galvanometer reads maximum current", "R₁·R₄ = R₂·R₃ (zero current through the galvanometer)", "All four resistors are equal", "The supply voltage is zero"], correct: 1, explain: "At balance, the two midpoint voltages are equal, so no current flows through the galvanometer branch." },
  { q: "Ohm's law relates voltage, current, and resistance as:", options: ["V = I + R", "V = I × R", "V = I / R", "V = I² × R"], correct: 1, explain: "V = IR is the defining relationship for an ohmic resistor — voltage drop equals current times resistance." },
  { q: "Electrical power dissipated by a resistor can be written as I²R or, equivalently, as:", options: ["V²/R", "V/R²", "V + R", "V − IR"], correct: 0, explain: "Substituting V = IR into P = IV gives P = V²/R — both forms describe the same power, just in terms of different known quantities." },
  { q: "Adding more resistors in parallel to an existing parallel network will:", options: ["Increase the equivalent resistance", "Decrease the equivalent resistance", "Leave the equivalent resistance unchanged", "Only affect voltage, not resistance"], correct: 1, explain: "Every additional parallel branch gives current another path, so 1/R_eq grows and R_eq always shrinks." },
  { q: "The instant a capacitor starts charging in an RC circuit (t = 0), it behaves like:", options: ["An open circuit (no current flows)", "A short circuit (maximum current flows)", "A resistor equal to R", "A resistor equal to C"], correct: 1, explain: "An uncharged capacitor offers no opposition to the very first instant of current flow, so it briefly acts like a wire — current is at its maximum right at t = 0." },
  { q: "Once a capacitor is fully charged in a DC circuit, the current flowing through it is:", options: ["Equal to V/R, unchanged from t = 0", "Zero", "Infinite", "Oscillating"], correct: 1, explain: "A fully-charged capacitor blocks DC entirely — once V_C equals the source voltage, no more charge needs to flow, so current drops to zero." },
  { q: "For two resistors in series across a voltage source, the voltage divider rule says the voltage across R₁ is:", options: ["V × R₁", "V × R₁/(R₁+R₂)", "V × R₂/R₁", "V / (R₁+R₂)"], correct: 1, explain: "Since the same current flows through both, V₁ = I·R₁ = [V/(R₁+R₂)]·R₁ = V·R₁/(R₁+R₂) — the resistor's share of the total resistance sets its share of the voltage." },
  { q: "A Wheatstone bridge is a practical way to measure:", options: ["Capacitance only", "An unknown resistance with high precision, by nulling a galvanometer rather than reading a meter directly", "AC frequency", "Magnetic field strength"], correct: 1, explain: "Because balance is found by nulling the galvanometer to zero rather than trusting an analog reading, bridge measurements can be far more precise than a simple ohmmeter — this is the basis for strain gauges and precision resistance measurement." },
  { q: "If one branch of a parallel network is a direct short (0 Ω), the equivalent resistance of that combination is:", options: ["The average of all branches", "0 Ω", "Infinite", "Equal to the largest resistor"], correct: 1, explain: "A zero-resistance path in parallel with anything else provides a 'free' route for current, forcing the equivalent resistance of the whole combination down to 0 Ω." },
  { q: "Kirchhoff's Voltage Law (KVL) is a statement of:", options: ["Conservation of charge", "Conservation of energy around a closed loop", "Ohm's law", "Conservation of power"], correct: 1, explain: "KVL says the sum of voltage rises and drops around any closed loop is zero — energy gained from sources must equal energy dissipated by resistive elements in that loop." },
];

const QUIZ_SAMPLE_SIZE = 8;
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/*  Main component                                                      */

const MODES = [
  { id: "series-parallel", label: "Series / Parallel", icon: Layers, Component: SeriesParallelLab },
  { id: "rc", label: "RC Circuit", icon: Timer, Component: RCLab },
  { id: "kirchhoff", label: "Kirchhoff's Laws", icon: Route, Component: KirchhoffLab },
  { id: "wheatstone", label: "Wheatstone Bridge", icon: Scale, Component: WheatstoneLab },
];

export default function CircuitsLab() {
  const [mode, setMode] = useState("series-parallel");
  const { questions } = useQuestions('circuits', FALLBACK_QUIZ);
  const [quizSet, setQuizSet] = useState(() => shuffled(questions).slice(0, QUIZ_SAMPLE_SIZE));
  useEffect(() => {
    setQuizSet(shuffled(questions).slice(0, QUIZ_SAMPLE_SIZE));
  }, [questions]);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState({});
  function newQuiz() {
    setQuizSet(shuffled(questions).slice(0, QUIZ_SAMPLE_SIZE));
    setAnswers({});
    setChecked({});
  }

  const Active = MODES.find((m) => m.id === mode).Component;

  return (
    <div className="min-h-screen w-full" style={{ background: theme.bg, color: theme.text, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        .cal-display { font-family: ui-sans-serif, system-ui, sans-serif; }
        .cal-mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <CircuitBoard size={22} style={{ color: ACCENT.primary }} />
            <h1 className="cal-display text-2xl font-bold tracking-tight">DC Circuits Lab</h1>
          </div>
          <p className="text-sm" style={{ color: theme.muted }}>
            Build resistor networks, watch capacitors charge, solve multi-loop circuits, and balance a Wheatstone bridge.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg p-1 mb-6 border" style={{ background: theme.panelAlt, borderColor: theme.border }}>
          {MODES.map(({ id, label, icon: Ic }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                background: mode === id ? theme.panel : "transparent",
                color: mode === id ? theme.text : theme.muted,
                boxShadow: mode === id ? `0 1px 2px ${hexToRgba("#000000", 0.2)}` : "none",
              }}
            >
              <Ic size={14} /> {label}
            </button>
          ))}
        </div>

        <Active />

        {/* Quiz */}
        <div className="mt-6 rounded-xl border p-5" style={{ background: theme.panel, borderColor: theme.border }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="cal-display text-lg font-bold">Check your understanding</h3>
            <button
              onClick={newQuiz}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border"
              style={{ borderColor: theme.border, color: theme.muted, background: theme.panelAlt }}
            >
              <RotateCcw size={12} /> New questions
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: theme.muted }}>{quizSet.length} of {questions.length} questions, shuffled — click "New questions" for a different set.</p>
          <div className="space-y-4">
            {quizSet.map((item, qi) => {
              const picked = answers[qi];
              const isChecked = checked[qi];
              return (
                <div key={qi} className="rounded-lg p-3" style={{ background: theme.panelAlt }}>
                  <p className="text-sm font-medium mb-2">{qi + 1}. {item.q}</p>
                  <div className="grid sm:grid-cols-2 gap-2 mb-2">
                    {item.options.map((opt, oi) => {
                      const selected = picked === oi;
                      const showCorrect = isChecked && oi === item.correct;
                      const showWrong = isChecked && selected && oi !== item.correct;
                      return (
                        <button
                          key={oi}
                          onClick={() => setAnswers({ ...answers, [qi]: oi })}
                          className="text-left text-xs px-3 py-2 rounded-md border transition-colors"
                          style={{
                            borderColor: showCorrect ? "#16A34A" : showWrong ? "#DC2626" : selected ? ACCENT.primary : theme.border,
                            background: showCorrect ? hexToRgba("#16A34A", 0.1) : showWrong ? hexToRgba("#DC2626", 0.1) : selected ? hexToRgba(ACCENT.primary, 0.08) : theme.panel,
                            color: theme.text,
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setChecked({ ...checked, [qi]: true })}
                      disabled={picked === undefined}
                      className="text-xs font-semibold px-3 py-1 rounded-md disabled:opacity-40"
                      style={{ background: ACCENT.primary, color: "#111" }}
                    >
                      Check answer
                    </button>
                    {isChecked && (
                      picked === item.correct ? (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#16A34A" }}>
                          <CheckCircle2 size={14} /> Correct
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#DC2626" }}>
                          <XCircle size={14} /> Not quite
                        </span>
                      )
                    )}
                  </div>
                  {isChecked && <p className="text-xs mt-2" style={{ color: theme.muted }}>{item.explain}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}