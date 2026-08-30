import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Scale, FlaskConical, Thermometer, ArrowLeftRight, Wind, Plus, Minus,
  RotateCcw, CheckCircle2, XCircle, Info,
} from "lucide-react";
import { useQuestions } from './lib/useQuestions';

/* ------------------------------------------------------------------ */
/*  Fixed dark palette — matches the rest of Virtual Lab, no theming   */
/*  infrastructure, hardcoded colors only.                             */
/* ------------------------------------------------------------------ */
const theme = {
  bg: "#0C1118", panel: "#151C27", panelAlt: "#111722", border: "#25303E",
  text: "#EAEDF2", muted: "#8B96A5", grid: "#20293580",
};
const ACCENT = { reactant: "#3B82F6", product: "#F59E0B" };

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  General equilibrium solver (numeric, bisection on extent x)        */
/*  Works for any stoichiometry: aA + bB ⇌ cC + dD                     */
/* ------------------------------------------------------------------ */
function solveEquilibrium(reactants, products, K) {
  const Q = (x) => {
    let num = 1, den = 1;
    for (const p of products) num *= Math.pow(Math.max(p.init + p.coeff * x, 1e-12), p.coeff);
    for (const r of reactants) den *= Math.pow(Math.max(r.init - r.coeff * x, 1e-12), r.coeff);
    return num / den;
  };
  const xMaxReactant = Math.min(...reactants.map((r) => r.init / r.coeff));
  const xMinProduct = -Math.min(...products.map((p) => p.init / p.coeff));
  let lo = xMinProduct + 1e-9;
  let hi = xMaxReactant - 1e-9;
  let flo = Q(lo) - K;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fmid = Q(mid) - K;
    if (flo < 0 === fmid < 0) { lo = mid; flo = fmid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}
function reactionQuotient(reactants, products) {
  let num = 1, den = 1;
  for (const p of products) num *= Math.pow(p.init, p.coeff);
  for (const r of reactants) den *= Math.pow(r.init, r.coeff);
  return den === 0 ? Infinity : num / den;
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
function NumberInput({ value, onChange, step = 0.01, min, max }) {
  return (
    <input
      type="number" value={value} step={step} min={min} max={max}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none border"
      style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
    />
  );
}
function Slider({ value, onChange, min, max, step }) {
  return (
    <input type="range" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
  );
}
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md px-3 py-2 text-sm border"
      style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Panel({ children, style }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: theme.panel, borderColor: theme.border, ...style }}>
      {children}
    </div>
  );
}

/* ==================================================================== */
/*  1. ICE Table Solver                                                 */
/* ==================================================================== */
const ICE_PRESETS = [
  { id: "hi", name: "H₂(g) + I₂(g) ⇌ 2HI(g)", reactants: [{ sym: "H₂", coeff: 1, init: 0.500 }, { sym: "I₂", coeff: 1, init: 0.500 }], products: [{ sym: "HI", coeff: 2, init: 0 }], k: 54.3 },
  { id: "n2o4", name: "N₂O₄(g) ⇌ 2NO₂(g)", reactants: [{ sym: "N₂O₄", coeff: 1, init: 0.0500 }], products: [{ sym: "NO₂", coeff: 2, init: 0 }], k: 4.63e-3 },
  { id: "nh3", name: "N₂(g) + 3H₂(g) ⇌ 2NH₃(g)", reactants: [{ sym: "N₂", coeff: 1, init: 1.000 }, { sym: "H₂", coeff: 3, init: 1.000 }], products: [{ sym: "NH₃", coeff: 2, init: 0 }], k: 0.500 },
];

function ICELab() {
  const [presetId, setPresetId] = useState("hi");
  const preset = ICE_PRESETS.find((p) => p.id === presetId);
  const [reactants, setReactants] = useState(preset.reactants.map((r) => ({ ...r })));
  const [products, setProducts] = useState(preset.products.map((p) => ({ ...p })));
  const [k, setK] = useState(preset.k);

  function applyPreset(id) {
    const p = ICE_PRESETS.find((x) => x.id === id);
    setPresetId(id);
    setReactants(p.reactants.map((r) => ({ ...r })));
    setProducts(p.products.map((p2) => ({ ...p2 })));
    setK(p.k);
  }

  const calc = useMemo(() => {
    const q0 = reactionQuotient(reactants, products);
    const x = solveEquilibrium(reactants, products, k);
    const reactantsEq = reactants.map((r) => ({ ...r, eq: r.init - r.coeff * x }));
    const productsEq = products.map((p) => ({ ...p, eq: p.init + p.coeff * x }));
    const direction = q0 < k ? "forward (toward products)" : q0 > k ? "reverse (toward reactants)" : "already at equilibrium";
    return { q0, x, reactantsEq, productsEq, direction };
  }, [reactants, products, k]);

  const chartData = [
    ...calc.reactantsEq.map((r) => ({ name: r.sym, conc: r.eq, side: "reactant" })),
    ...calc.productsEq.map((p) => ({ name: p.sym, conc: p.eq, side: "product" })),
  ];

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <Field label="Reaction">
            <Select value={presetId} onChange={applyPreset} options={ICE_PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Equilibrium constant (Kc)">
            <NumberInput value={k} onChange={setK} step={0.001} min={0.00001} />
          </Field>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: theme.muted }}>Initial concentrations (M)</div>
          {reactants.map((r, i) => (
            <Field key={r.sym} label={`[${r.sym}]₀`} unit="M">
              <NumberInput value={r.init} step={0.01} min={0}
                onChange={(v) => setReactants(reactants.map((rr, ri) => ri === i ? { ...rr, init: v } : rr))} />
            </Field>
          ))}
          {products.map((p, i) => (
            <Field key={p.sym} label={`[${p.sym}]₀`} unit="M">
              <NumberInput value={p.init} step={0.01} min={0}
                onChange={(v) => setProducts(products.map((pp, pi) => pi === i ? { ...pp, init: v } : pp))} />
            </Field>
          ))}
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            Q compares current concentrations to K using the same expression — it tells you which way the reaction still needs to shift.
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.product, 0.12)}, ${hexToRgba(ACCENT.reactant, 0.06)})` }}>
          <div className="cal-display text-2xl font-bold mb-1">
            Q₀ = {Number.isFinite(calc.q0) ? calc.q0.toFixed(4) : "∞"} {calc.q0 < k ? "<" : calc.q0 > k ? ">" : "="} K = {k}
          </div>
          <p className="text-xs mb-2" style={{ color: theme.muted }}>Reaction proceeds {calc.direction}.</p>
          <div className="cal-mono text-xs" style={{ color: theme.muted }}>Extent of reaction x = {calc.x.toFixed(4)} M</div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">ICE table</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs cal-mono">
              <thead>
                <tr style={{ color: theme.muted }}>
                  <td className="pb-1"></td>
                  {reactants.map((r) => <td key={r.sym} className="pb-1 text-center font-semibold" style={{ color: ACCENT.reactant }}>{r.sym}</td>)}
                  {products.map((p) => <td key={p.sym} className="pb-1 text-center font-semibold" style={{ color: ACCENT.product }}>{p.sym}</td>)}
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ color: theme.muted }}>Initial</td>
                  {reactants.map((r) => <td key={r.sym} className="text-center">{r.init.toFixed(3)}</td>)}
                  {products.map((p) => <td key={p.sym} className="text-center">{p.init.toFixed(3)}</td>)}
                </tr>
                <tr><td style={{ color: theme.muted }}>Change</td>
                  {reactants.map((r) => <td key={r.sym} className="text-center">−{r.coeff > 1 ? r.coeff : ""}x</td>)}
                  {products.map((p) => <td key={p.sym} className="text-center">+{p.coeff > 1 ? p.coeff : ""}x</td>)}
                </tr>
                <tr style={{ color: theme.text, fontWeight: 600 }}><td>Equilibrium</td>
                  {calc.reactantsEq.map((r) => <td key={r.sym} className="text-center">{r.eq.toFixed(4)}</td>)}
                  {calc.productsEq.map((p) => <td key={p.sym} className="text-center">{p.eq.toFixed(4)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Equilibrium concentrations</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 15, bottom: 5, left: -10 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke={theme.muted} tick={{ fontSize: 11 }} />
              <YAxis stroke={theme.muted} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: theme.panel, borderColor: theme.border, fontSize: 12 }} />
              <Bar dataKey="conc" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.side === "reactant" ? ACCENT.reactant : ACCENT.product} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  2. Le Chatelier Simulator — N2O4(g) ⇌ 2NO2(g)                       */
/* ==================================================================== */
const N2O4_BASE = 0.0500; // M, starting total before establishing equilibrium
const DH_RXN = 58000; // J/mol, endothermic forward (N2O4 -> 2NO2)
const R_GAS = 8.314; // J/mol.K
const T_REF = 298.15; // K (25 C)
const K_REF = 4.63e-3;

function kAtTemperature(tK) {
  return K_REF * Math.exp((-DH_RXN / R_GAS) * (1 / tK - 1 / T_REF));
}
function no2Color(no2Conc) {
  // interpolate colorless -> reddish-brown as [NO2] rises toward ~0.05 M
  const frac = Math.max(0, Math.min(1, no2Conc / 0.05));
  const r = Math.round(20 + frac * (150 - 20));
  const g = Math.round(24 + frac * (60 - 24));
  const b = Math.round(30 + frac * (30 - 30));
  return `rgb(${r}, ${g}, ${b})`;
}

function LeChatelierLab() {
  const [tempC, setTempC] = useState(25);
  const tK = tempC + 273.15;
  const k = useMemo(() => kAtTemperature(tK), [tK]);

  const [state, setState] = useState(() => {
    const reactants = [{ coeff: 1, init: N2O4_BASE }];
    const products = [{ coeff: 2, init: 0 }];
    const x = solveEquilibrium(reactants, products, K_REF);
    return { n2o4: N2O4_BASE - x, no2: 2 * x };
  });
  const [lastStress, setLastStress] = useState("Starting equilibrium at 25°C");

  function reEquilibrate(n2o4Now, no2Now, kNow, label) {
    const reactants = [{ coeff: 1, init: Math.max(n2o4Now, 0) }];
    const products = [{ coeff: 2, init: Math.max(no2Now, 0) }];
    const x = solveEquilibrium(reactants, products, kNow);
    setState({ n2o4: Math.max(n2o4Now, 0) - x, no2: Math.max(no2Now, 0) + 2 * x });
    setLastStress(label);
  }

  function stress(kind) {
    switch (kind) {
      case "addReactant": reEquilibrate(state.n2o4 + 0.02, state.no2, k, "Added N₂O₄"); break;
      case "removeReactant": reEquilibrate(Math.max(state.n2o4 - 0.02, 0.001), state.no2, k, "Removed N₂O₄"); break;
      case "addProduct": reEquilibrate(state.n2o4, state.no2 + 0.02, k, "Added NO₂"); break;
      case "removeProduct": reEquilibrate(state.n2o4, Math.max(state.no2 - 0.02, 0), k, "Removed NO₂"); break;
      case "compress": reEquilibrate(state.n2o4 * 2, state.no2 * 2, k, "Compressed — volume halved"); break;
      case "expand": reEquilibrate(state.n2o4 * 0.5, state.no2 * 0.5, k, "Expanded — volume doubled"); break;
      default: break;
    }
  }

  function reset() {
    const reactants = [{ coeff: 1, init: N2O4_BASE }];
    const products = [{ coeff: 2, init: 0 }];
    const x = solveEquilibrium(reactants, products, K_REF);
    setState({ n2o4: N2O4_BASE - x, no2: 2 * x });
    setTempC(25);
    setLastStress("Reset to starting equilibrium at 25°C");
  }

  // whenever temperature changes, re-equilibrate the current amounts at the new K
  const prevK = useRef(k);
  useEffect(() => {
    if (prevK.current !== k) {
      reEquilibrate(state.n2o4, state.no2, k, `Temperature changed to ${tempC.toFixed(0)}°C`);
      prevK.current = k;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  const totalN = state.n2o4 + state.no2 / 2;
  const chartData = [
    { name: "N₂O₄", conc: state.n2o4, side: "reactant" },
    { name: "NO₂", conc: state.no2, side: "product" },
  ];

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <Field label="Temperature" unit="°C">
            <Slider value={tempC} onChange={setTempC} min={0} max={100} step={1} />
            <div className="text-sm cal-mono mt-1">{tempC.toFixed(0)}°C · K = {k.toExponential(2)}</div>
          </Field>
          <div className="text-xs font-semibold uppercase tracking-wide mt-3 mb-2" style={{ color: theme.muted }}>Apply a stress</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button onClick={() => stress("addReactant")} className="flex items-center gap-1 justify-center text-xs px-2 py-2 rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panelAlt }}><Plus size={12} /> N₂O₄</button>
            <button onClick={() => stress("removeReactant")} className="flex items-center gap-1 justify-center text-xs px-2 py-2 rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panelAlt }}><Minus size={12} /> N₂O₄</button>
            <button onClick={() => stress("addProduct")} className="flex items-center gap-1 justify-center text-xs px-2 py-2 rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panelAlt }}><Plus size={12} /> NO₂</button>
            <button onClick={() => stress("removeProduct")} className="flex items-center gap-1 justify-center text-xs px-2 py-2 rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panelAlt }}><Minus size={12} /> NO₂</button>
            <button onClick={() => stress("compress")} className="flex items-center gap-1 justify-center text-xs px-2 py-2 rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panelAlt }}><Wind size={12} /> Compress</button>
            <button onClick={() => stress("expand")} className="flex items-center gap-1 justify-center text-xs px-2 py-2 rounded-md border" style={{ borderColor: theme.border, color: theme.text, background: theme.panelAlt }}><Wind size={12} /> Expand</button>
          </div>
          <button onClick={reset} className="w-full flex items-center gap-1.5 justify-center text-xs font-semibold px-3 py-2 rounded-md" style={{ background: ACCENT.product, color: "#111" }}>
            <RotateCcw size={12} /> Reset to 25°C equilibrium
          </button>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-3" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            N₂O₄ ⇌ 2NO₂ is endothermic forward (ΔH° = +58.0 kJ/mol) and increases moles of gas — a real classroom demo where heating darkens the tube and compressing it also darkens it (more concentrated), while cooling or expanding lightens it.
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.product, 0.1)}, ${hexToRgba(ACCENT.reactant, 0.06)})` }}>
          <div className="cal-display text-lg font-bold mb-1">{lastStress}</div>
          <div className="cal-mono text-xs" style={{ color: theme.muted }}>
            [N₂O₄] = {state.n2o4.toFixed(4)} M · [NO₂] = {state.no2.toFixed(4)} M · K(T) = {k.toExponential(3)}
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Reaction vessel</h3>
          <div className="rounded-lg h-24 flex items-center justify-center border" style={{ background: no2Color(state.no2), borderColor: theme.border }}>
            <span className="text-xs font-mono" style={{ color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
              {state.no2 < 0.005 ? "nearly colorless" : state.no2 < 0.02 ? "pale brown" : "deep reddish-brown"}
            </span>
          </div>
          <p className="text-xs mt-2" style={{ color: theme.muted }}>NO₂ is reddish-brown; N₂O₄ is colorless — the vessel's tint tracks [NO₂] directly.</p>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Concentrations</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 15, bottom: 5, left: -10 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke={theme.muted} tick={{ fontSize: 11 }} />
              <YAxis stroke={theme.muted} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: theme.panel, borderColor: theme.border, fontSize: 12 }} />
              <Bar dataKey="conc" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.side === "reactant" ? ACCENT.reactant : ACCENT.product} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz                                                                */
/* ------------------------------------------------------------------ */
const FALLBACK_QUIZ = [
  { q: "If the reaction quotient Q is less than K, the reaction will proceed:", options: ["Forward, toward products", "In reverse, toward reactants", "Not at all — it's already at equilibrium", "It depends on temperature"], correct: 0, explain: "Q < K means there aren't yet enough products relative to reactants, so the forward reaction dominates until Q rises to meet K." },
  { q: "If Q is greater than K, the reaction will proceed:", options: ["Forward, toward products", "In reverse, toward reactants", "It stops completely", "It depends on the catalyst"], correct: 1, explain: "Q > K means there's already too much product relative to reactant for equilibrium, so the reverse reaction dominates until Q falls to meet K." },
  { q: "Adding more reactant to a system at equilibrium will shift it:", options: ["Toward the reactants", "Toward the products", "Not at all", "Toward whichever side has fewer moles of gas"], correct: 1, explain: "Le Chatelier's principle: the system responds to the added reactant by consuming some of it, producing more product until a new equilibrium is reached." },
  { q: "Decreasing the volume of a gas-phase equilibrium (increasing pressure) shifts the reaction toward the side with:", options: ["More moles of gas", "Fewer moles of gas", "Higher molar mass", "It never shifts due to volume changes"], correct: 1, explain: "Compressing the system increases concentration on both sides, but the reaction relieves that stress by shifting toward fewer total gas molecules, which lowers the total moles present." },
  { q: "For an endothermic reaction, increasing the temperature will:", options: ["Decrease K and shift the equilibrium toward reactants", "Increase K and shift the equilibrium toward products", "Have no effect on K", "Only affect the rate, never the equilibrium position"], correct: 1, explain: "Heat acts like a reactant in an endothermic reaction — adding it via higher temperature shifts equilibrium forward and increases K, per the van't Hoff equation." },
  { q: "For an exothermic reaction, increasing the temperature will:", options: ["Increase K and shift toward products", "Decrease K and shift toward reactants", "Leave K unchanged", "Always stop the reaction"], correct: 1, explain: "Heat behaves like a product in an exothermic reaction — adding more of it via higher temperature pushes the equilibrium back toward reactants, decreasing K." },
  { q: "At chemical equilibrium, the forward and reverse reaction rates are:", options: ["Both zero — the reaction has stopped", "Equal to each other, but not zero", "The forward rate is always larger", "Unrelated to each other"], correct: 1, explain: "Equilibrium is dynamic — both reactions are still happening continuously, just at equal rates, so concentrations stop changing even though the reaction never truly stops." },
  { q: "Adding a catalyst to a system at equilibrium:", options: ["Shifts the equilibrium toward products", "Shifts the equilibrium toward reactants", "Speeds up both forward and reverse rates equally, reaching the same equilibrium faster — K is unchanged", "Increases K"], correct: 2, explain: "A catalyst lowers the activation energy for both directions equally, so the system reaches the same equilibrium position faster — it never changes the position (or K) itself." },
];

/* ==================================================================== */
/*  Main component                                                      */
/* ==================================================================== */
const QUIZ_SAMPLE_SIZE = 8;
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MODES = [
  { id: "ice", label: "ICE Table Solver", icon: FlaskConical, Component: ICELab },
  { id: "lechatelier", label: "Le Chatelier Simulator", icon: ArrowLeftRight, Component: LeChatelierLab },
];

export default function EquilibriumLab() {
  const [mode, setMode] = useState("ice");
  const { questions } = useQuestions('equilibrium', FALLBACK_QUIZ);
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
            <Scale size={22} style={{ color: ACCENT.product }} />
            <h1 className="cal-display text-2xl font-bold tracking-tight">Chemical Equilibrium Lab</h1>
          </div>
          <p className="text-sm" style={{ color: theme.muted }}>
            Solve ICE tables from scratch, then stress a real equilibrium and watch Le Chatelier's principle play out.
          </p>
        </div>

        <div className="inline-flex rounded-lg p-1 mb-6 border" style={{ background: theme.panelAlt, borderColor: theme.border }}>
          {MODES.map(({ id, label, icon: Ic }) => (
            <button key={id} onClick={() => setMode(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                background: mode === id ? theme.panel : "transparent",
                color: mode === id ? theme.text : theme.muted,
                boxShadow: mode === id ? `0 1px 2px ${hexToRgba("#000000", 0.2)}` : "none",
              }}>
              <Ic size={14} /> {label}
            </button>
          ))}
        </div>

        <Active />

        {/* Quiz */}
        <div className="mt-6 rounded-xl border p-5" style={{ background: theme.panel, borderColor: theme.border }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="cal-display text-lg font-bold">Check your understanding</h3>
            <button onClick={newQuiz} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border" style={{ borderColor: theme.border, color: theme.muted, background: theme.panelAlt }}>
              <RotateCcw size={12} /> New questions
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: theme.muted }}>{quizSet.length} of {questions.length} questions, shuffled.</p>
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
                        <button key={oi} onClick={() => setAnswers({ ...answers, [qi]: oi })}
                          className="text-left text-xs px-3 py-2 rounded-md border transition-colors"
                          style={{
                            borderColor: showCorrect ? "#16A34A" : showWrong ? "#DC2626" : selected ? ACCENT.product : theme.border,
                            background: showCorrect ? hexToRgba("#16A34A", 0.1) : showWrong ? hexToRgba("#DC2626", 0.1) : selected ? hexToRgba(ACCENT.product, 0.08) : theme.panel,
                            color: theme.text,
                          }}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setChecked({ ...checked, [qi]: true })} disabled={picked === undefined}
                      className="text-xs font-semibold px-3 py-1 rounded-md disabled:opacity-40" style={{ background: ACCENT.product, color: "#111" }}>
                      Check answer
                    </button>
                    {isChecked && (
                      picked === item.correct ? (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#16A34A" }}><CheckCircle2 size={14} /> Correct</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#DC2626" }}><XCircle size={14} /> Not quite</span>
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