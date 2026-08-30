import React, { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Flame, Snowflake, FlaskConical, Thermometer, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Info, Beaker, RotateCcw,
} from "lucide-react";
import { useQuestions } from './lib/useQuestions';

/* ------------------------------------------------------------------ */
/*  Fixed dark palette (matches the rest of Virtual Lab — no theming   */
/*  infrastructure, hardcoded colors only).                            */
/* ------------------------------------------------------------------ */
const theme = {
  bg: "#0C1118", panel: "#151C27", panelAlt: "#111722", border: "#25303E",
  text: "#EAEDF2", muted: "#8B96A5", grid: "#20293580", track: "#25303E",
};

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const heatAccent = (isExo) =>
  isExo
    ? { primary: "#DC2626", secondary: "#F59E0B", label: "Exothermic", Icon: Flame }
    : { primary: "#2563EB", secondary: "#06B6D4", label: "Endothermic", Icon: Snowflake };

/* ------------------------------------------------------------------ */
/*  Reaction presets                                                   */
/* ------------------------------------------------------------------ */
const COFFEE_PRESETS = [
  { id: "neutralization", name: "HCl (aq) + NaOH (aq) → NaCl (aq) + H₂O (l)", litDh: -57.3, moles: 0.0500, mass: 100, tInitial: 21.0, tFinal: 27.9, note: "Strong acid–strong base neutralization." },
  { id: "nh4no3", name: "NH₄NO₃ (s) → NH₄⁺ (aq) + NO₃⁻ (aq)", litDh: 25.7, moles: 0.0500, mass: 100, tInitial: 21.0, tFinal: 17.9, note: "Endothermic dissolution — the chemistry behind instant cold packs." },
  { id: "cacl2", name: "CaCl₂ (s) → Ca²⁺ (aq) + 2 Cl⁻ (aq)", litDh: -82.8, moles: 0.0500, mass: 100, tInitial: 21.0, tFinal: 30.9, note: "Exothermic dissolution — the chemistry behind instant hot packs." },
  { id: "custom", name: "Custom / unknown reaction", litDh: null, moles: 0.0500, mass: 100, tInitial: 21.0, tFinal: 21.0, note: "Enter your own measured temperatures to determine ΔH experimentally." },
];

const BOMB_PRESETS = [
  { id: "glucose", name: "Glucose, C₆H₁₂O₆ (combustion)", litDuPerGram: -15.56, molarMass: 180.16, mass: 1.000, bombC: 9.05, tInitial: 25.00, tFinal: 26.72 },
  { id: "benzoic", name: "Benzoic acid (calibration standard)", litDuPerGram: -26.38, molarMass: 122.12, mass: 1.000, bombC: 9.05, tInitial: 25.00, tFinal: 27.92 },
  { id: "custom", name: "Custom / unknown fuel sample", litDuPerGram: null, molarMass: 100.0, mass: 1.000, bombC: 9.05, tInitial: 25.00, tFinal: 25.00 },
];

/* ------------------------------------------------------------------ */
/*  Heat-loss correction (Dickinson extrapolation)                     */
/*  Real calorimeters leak a little heat to/from the surroundings      */
/*  throughout the run, so the raw "final − initial" thermometer       */
/*  reading slightly underestimates the true temperature change. The   */
/*  standard fix is to fit straight lines to the pre-mix baseline and  */
/*  the post-mix drift, then read ΔT off their extrapolation back to   */
/*  the moment of mixing, rather than off the raw endpoints.           */
/* ------------------------------------------------------------------ */
const T_MIX = 3, T_SPIKE_END = 3.6, T_DOMAIN_END = 9;
const K_COFFEE = 0.05; // per-minute heat-exchange rate — uninsulated Styrofoam cup
const K_BOMB = 0.01;   // per-minute heat-exchange rate — heavily insulated steel bomb

// Baseline is assumed flat (the system starts in equilibrium with its
// surroundings at tInitial), so the post-mix line's slope relative to
// that same reference gives a closed-form correction factor.
function correctedDeltaT(rawDT, k) {
  return rawDT * (1 + k * (T_SPIKE_END - T_MIX));
}

// Small deterministic "measurement noise" so the curve looks like real
// thermometer data rather than a mathematically perfect line.
function noise(t, amplitude) {
  return amplitude * (Math.sin(t * 13.7) * 0.6 + Math.sin(t * 5.2 + 1.3) * 0.4);
}

function buildCurveData(tInitial, tFinalRaw, k) {
  const rawDT = tFinalRaw - tInitial;
  const slopePost = -k * rawDT;
  const pts = [];
  for (let t = 0; t <= T_DOMAIN_END; t += 0.12) {
    let T;
    if (t <= T_MIX) {
      T = tInitial + noise(t, 0.025);
    } else if (t <= T_SPIKE_END) {
      // smoothstep, not linear — mixing/stirring approaches equilibrium
      // asymptotically rather than as a straight ramp
      const frac = (t - T_MIX) / (T_SPIKE_END - T_MIX);
      const eased = frac * frac * (3 - 2 * frac);
      T = tInitial + rawDT * eased + noise(t, 0.02);
    } else {
      T = tFinalRaw + slopePost * (t - T_SPIKE_END) + noise(t, 0.03);
    }
    const postExtrap = tFinalRaw + slopePost * (t - T_SPIKE_END);
    pts.push({
      t: Number(t.toFixed(2)),
      T: Number(T.toFixed(2)),
      preExtrap: Number(tInitial.toFixed(2)),
      postExtrap: Number(postExtrap.toFixed(2)),
    });
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  Quiz                                                               */
/* ------------------------------------------------------------------ */
const FALLBACK_QUIZ = [
  {
    q: "In a coffee-cup calorimeter (constant pressure), the heat measured directly corresponds to:",
    options: ["ΔH", "ΔU", "ΔS", "ΔG"],
    correct: 0,
    explain: "At constant pressure, q_p = ΔH — that's exactly why coffee-cup calorimetry is the standard way to measure reaction enthalpies.",
  },
  {
    q: "A bomb calorimeter is sealed and rigid, so it operates at constant:",
    options: ["Temperature", "Pressure", "Volume", "Entropy"],
    correct: 2,
    explain: "The bomb's fixed volume means q_v = ΔU, the internal energy change — not ΔH directly.",
  },
  {
    q: "If solution temperature rises during a reaction in a coffee-cup calorimeter, the reaction is:",
    options: ["Exothermic", "Endothermic", "Isothermal", "Non-spontaneous"],
    correct: 0,
    explain: "Heat flowing out of the reaction and into the solution (raising its temperature) means the reaction released energy — exothermic, ΔH < 0.",
  },
  {
    q: "Why is a calorimeter constant, C_cal, sometimes added to the heat balance?",
    options: [
      "The calorimeter itself absorbs or releases some heat along with the solution",
      "It corrects for atmospheric pressure changes",
      "It changes the number of moles of reactant",
      "It has no real effect and is only included for tradition",
    ],
    correct: 0,
    explain: "Real calorimeters (cups, stirrers, thermometers) aren't perfectly heat-inert — C_cal accounts for the heat they themselves soak up or release.",
  },
  {
    q: "To convert a bomb calorimeter's ΔU_rxn to ΔH_rxn, you need to add:",
    options: ["m × c × ΔT", "C_cal × ΔT", "Δn_gas × R × T", "moles × Avogadro's number"],
    correct: 2,
    explain: "ΔH = ΔU + Δn_gas·R·T, where Δn_gas is the change in moles of gas between products and reactants.",
  },
  {
    q: "Specific heat capacity (c) has units of:",
    options: ["J/°C", "J/g·°C", "J", "J/mol"],
    correct: 1,
    explain: "Specific heat is heat per unit mass per degree — J/g·°C — which is why it gets multiplied by both mass and ΔT in q = mcΔT.",
  },
  {
    q: "Water is commonly used in calorimetry experiments mainly because:",
    options: ["It's cheap and available", "It has an unusually high specific heat, making temperature changes easy to measure precisely", "It doesn't dissolve anything", "It has a low boiling point"],
    correct: 1,
    explain: "Water's high specific heat (4.18 J/g·°C) means a given amount of heat produces a modest, easily-read temperature change rather than a wild swing.",
  },
  {
    q: "If the same amount of heat is released into a larger mass of solution (same c, same q), the observed ΔT will be:",
    options: ["Larger", "Smaller", "Unchanged", "Impossible to predict"],
    correct: 1,
    explain: "Since q = mcΔT, for fixed q and c, ΔT is inversely proportional to mass — more solution to heat means a smaller temperature rise.",
  },
  {
    q: "A negative ΔH for a reaction means:",
    options: ["The reaction absorbs energy from the surroundings", "The reaction releases energy to the surroundings", "The reaction is non-spontaneous", "The reaction has no measurable heat change"],
    correct: 1,
    explain: "By convention, ΔH < 0 means the system loses enthalpy to the surroundings — exothermic — matching the temperature rise you'd measure in a coffee-cup calorimeter.",
  },
  {
    q: "In a bomb calorimeter, the heat capacity C_bomb represents:",
    options: ["Only the metal bomb itself", "The heat capacity of the entire apparatus — bomb, water bath, and stirrer together", "The specific heat of the fuel sample", "The heat capacity of the surrounding air"],
    correct: 1,
    explain: "C_bomb is a single lumped constant (usually found by calibration burns) covering everything that absorbs heat inside the calorimeter, not just the steel vessel.",
  },
  {
    q: "Why does coffee-cup calorimetry extrapolate the cooling curve back to the moment of mixing instead of just reading the raw thermometer values?",
    options: ["To make the math simpler", "To correct for heat the cup exchanges with the room during the run", "Because the thermometer is inaccurate", "It's a purely cosmetic step with no effect on the result"],
    correct: 1,
    explain: "An uninsulated cup leaks a little heat to or from the room throughout the run, so the raw endpoint reading slightly understates the true temperature change — the Dickinson extrapolation corrects for that.",
  },
  {
    q: "Combustion reactions are typically studied in a bomb calorimeter rather than a coffee-cup calorimeter mainly because:",
    options: ["Combustion needs a sealed, pressurized environment with excess oxygen", "Bomb calorimeters are cheaper", "Coffee cups melt at combustion temperatures", "Combustion doesn't release measurable heat"],
    correct: 0,
    explain: "Combustion requires enough oxygen to fully react and needs to be contained — the sealed, rigid steel bomb can be pressurized with O₂ safely, which an open coffee cup can't do.",
  },
  {
    q: "The percent error between a measured ΔH and the literature value is useful because it:",
    options: ["Proves the measurement is correct", "Quantifies how far the experimental result is from the accepted value, independent of the sign", "Replaces the need for units", "Only applies to bomb calorimetry"],
    correct: 1,
    explain: "Percent error = |measured − literature| / |literature| × 100% gives a scale-independent sense of how much experimental heat loss, impurities, or measurement error affected the result.",
  },
];

/* ------------------------------------------------------------------ */
/*  Small UI helpers                                                   */
/* ------------------------------------------------------------------ */
function Field({ label, unit, children, theme }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold tracking-wide uppercase mb-1" style={{ color: theme.muted }}>
        {label} {unit ? <span className="normal-case font-normal">({unit})</span> : null}
      </label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, step = 0.1, theme, min, max }) {
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

function Toggle({ checked, onChange, label, theme }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm mb-3"
      style={{ color: theme.text }}
    >
      <span
        className="inline-flex w-9 h-5 rounded-full items-center px-0.5 transition-colors"
        style={{ background: checked ? "#2563EB" : theme.track }}
      >
        <span
          className="w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0px)" }}
        />
      </span>
      {label}
    </button>
  );
}

const QUIZ_SAMPLE_SIZE = 8;
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function CalorimetryLab() {
  const [mode, setMode] = useState("coffee"); // 'coffee' | 'bomb'

  /* ---------- coffee-cup state ---------- */
  const [reactionId, setReactionId] = useState("neutralization");
  const preset = COFFEE_PRESETS.find((p) => p.id === reactionId);
  const [mass, setMass] = useState(preset.mass);
  const [specificHeat, setSpecificHeat] = useState(4.18);
  const [tInitial, setTInitial] = useState(preset.tInitial);
  const [tFinal, setTFinal] = useState(preset.tFinal);
  const [moles, setMoles] = useState(preset.moles);
  const [includeCal, setIncludeCal] = useState(false);
  const [calConstant, setCalConstant] = useState(10.0);

  function applyCoffeePreset(id) {
    const p = COFFEE_PRESETS.find((x) => x.id === id);
    setReactionId(id);
    setMass(p.mass);
    setTInitial(p.tInitial);
    setTFinal(p.tFinal);
    setMoles(p.moles);
  }

  const coffee = useMemo(() => {
    const rawDT = tFinal - tInitial;
    const dT = correctedDeltaT(rawDT, K_COFFEE);
    const qSolution = mass * specificHeat * dT;
    const qCal = includeCal ? calConstant * dT : 0;
    const qRxn = -(qSolution + qCal);
    const dH = moles !== 0 ? qRxn / moles / 1000 : 0; // kJ/mol
    const litDh = preset.litDh;
    const pctError = litDh ? Math.abs((dH - litDh) / litDh) * 100 : null;
    return { rawDT, dT, qSolution, qCal, qRxn, dH, litDh, pctError };
  }, [mass, specificHeat, tInitial, tFinal, moles, includeCal, calConstant, preset]);

  /* ---------- bomb state ---------- */
  const [bombPresetId, setBombPresetId] = useState("glucose");
  const bombPreset = BOMB_PRESETS.find((p) => p.id === bombPresetId);
  const [sampleMass, setSampleMass] = useState(bombPreset.mass);
  const [molarMass, setMolarMass] = useState(bombPreset.molarMass);
  const [bombC, setBombC] = useState(bombPreset.bombC);
  const [tInitialB, setTInitialB] = useState(bombPreset.tInitial);
  const [tFinalB, setTFinalB] = useState(bombPreset.tFinal);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deltaNGas, setDeltaNGas] = useState(0);

  function applyBombPreset(id) {
    const p = BOMB_PRESETS.find((x) => x.id === id);
    setBombPresetId(id);
    setSampleMass(p.mass);
    setMolarMass(p.molarMass);
    setBombC(p.bombC);
    setTInitialB(p.tInitial);
    setTFinalB(p.tFinal);
  }

  const bomb = useMemo(() => {
    const rawDT = tFinalB - tInitialB;
    const dT = correctedDeltaT(rawDT, K_BOMB);
    const qRxn = -(bombC * dT); // kJ, constant volume
    const nMol = molarMass !== 0 ? sampleMass / molarMass : 0;
    const duPerGram = sampleMass !== 0 ? qRxn / sampleMass : 0;
    const duPerMol = nMol !== 0 ? qRxn / nMol : 0;
    const R = 8.314e-3; // kJ/mol.K
    const T = tInitialB + 273.15;
    const dhPerMol = duPerMol + deltaNGas * R * T;
    const litDuPerGram = bombPreset.litDuPerGram;
    const pctError = litDuPerGram ? Math.abs((duPerGram - litDuPerGram) / litDuPerGram) * 100 : null;
    return { rawDT, dT, qRxn, nMol, duPerGram, duPerMol, dhPerMol, litDuPerGram, pctError };
  }, [bombC, tInitialB, tFinalB, sampleMass, molarMass, deltaNGas, bombPreset]);

  const isExo = mode === "coffee" ? coffee.dH < 0 : bomb.duPerMol < 0;
  const accent = heatAccent(isExo);
  const chartData = useMemo(
    () => (mode === "coffee" ? buildCurveData(tInitial, tFinal, K_COFFEE) : buildCurveData(tInitialB, tFinalB, K_BOMB)),
    [mode, tInitial, tFinal, tInitialB, tFinalB]
  );

  /* ---------- quiz state ---------- */
  const { questions } = useQuestions('calorimetry', FALLBACK_QUIZ);
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

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: theme.bg, color: theme.text, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{`
        .cal-display { font-family: ui-sans-serif, system-ui, sans-serif; }
        .cal-mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Beaker size={22} style={{ color: accent.primary }} />
            <h1 className="cal-display text-2xl font-bold tracking-tight">Calorimetry Lab</h1>
          </div>
          <p className="text-sm" style={{ color: theme.muted }}>
            Measure heat flow, derive ΔH or ΔU, and see why calorimetry is corrected the way it is.
          </p>
        </div>

        {/* Mode toggle */}
        <div
          className="inline-flex rounded-lg p-1 mb-6 border"
          style={{ background: theme.panelAlt, borderColor: theme.border }}
        >
          {[
            { id: "coffee", label: "Coffee-Cup (constant P)", icon: FlaskConical },
            { id: "bomb", label: "Bomb Calorimeter (constant V)", icon: Thermometer },
          ].map(({ id, label, icon: Ic }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                background: mode === id ? theme.panel : "transparent",
                color: mode === id ? theme.text : theme.muted,
                boxShadow: mode === id ? `0 1px 2px ${hexToRgba("#000000", 0.08)}` : "none",
              }}
            >
              <Ic size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-5">
          {/* -------- Inputs -------- */}
          <div className="lg:col-span-2 rounded-xl border p-4" style={{ background: theme.panel, borderColor: theme.border }}>
            {mode === "coffee" ? (
              <>
                <Field label="Reaction" theme={theme}>
                  <select
                    value={reactionId}
                    onChange={(e) => applyCoffeePreset(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-sm border"
                    style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
                  >
                    {COFFEE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: theme.muted }}>{preset.note}</p>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Solution mass" unit="g" theme={theme}>
                    <NumberInput value={mass} onChange={setMass} step={5} theme={theme} min={1} />
                  </Field>
                  <Field label="Specific heat" unit="J/g·°C" theme={theme}>
                    <NumberInput value={specificHeat} onChange={setSpecificHeat} step={0.01} theme={theme} min={0.1} />
                  </Field>
                  <Field label="Initial temp" unit="°C" theme={theme}>
                    <NumberInput value={tInitial} onChange={setTInitial} step={0.1} theme={theme} />
                  </Field>
                  <Field label="Final temp" unit="°C" theme={theme}>
                    <NumberInput value={tFinal} onChange={setTFinal} step={0.1} theme={theme} />
                  </Field>
                  <Field label="Moles limiting reactant" unit="mol" theme={theme}>
                    <NumberInput value={moles} onChange={setMoles} step={0.001} theme={theme} min={0.001} />
                  </Field>
                </div>

                <Toggle checked={includeCal} onChange={setIncludeCal} label="Include calorimeter heat capacity (C_cal)" theme={theme} />
                {includeCal && (
                  <Field label="Calorimeter constant" unit="J/°C" theme={theme}>
                    <NumberInput value={calConstant} onChange={setCalConstant} step={0.5} theme={theme} min={0} />
                  </Field>
                )}

                <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
                  <Info size={14} className="mt-0.5 shrink-0" />
                  Constant-pressure calorimetry measures q_p, which equals ΔH directly. The ΔT used below is extrapolated back to the moment of mixing to correct for the heat this uninsulated cup leaks to the room during the run — see the dashed lines on the chart.
                </div>
              </>
            ) : (
              <>
                <Field label="Fuel sample" theme={theme}>
                  <select
                    value={bombPresetId}
                    onChange={(e) => applyBombPreset(e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-sm border"
                    style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
                  >
                    {BOMB_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sample mass" unit="g" theme={theme}>
                    <NumberInput value={sampleMass} onChange={setSampleMass} step={0.01} theme={theme} min={0.01} />
                  </Field>
                  <Field label="Molar mass" unit="g/mol" theme={theme}>
                    <NumberInput value={molarMass} onChange={setMolarMass} step={0.1} theme={theme} min={1} />
                  </Field>
                  <Field label="Bomb heat capacity" unit="kJ/°C" theme={theme}>
                    <NumberInput value={bombC} onChange={setBombC} step={0.05} theme={theme} min={0.1} />
                  </Field>
                  <Field label="Initial temp" unit="°C" theme={theme}>
                    <NumberInput value={tInitialB} onChange={setTInitialB} step={0.01} theme={theme} />
                  </Field>
                  <Field label="Final temp" unit="°C" theme={theme}>
                    <NumberInput value={tFinalB} onChange={setTFinalB} step={0.01} theme={theme} />
                  </Field>
                </div>

                <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2 mb-2" style={{ background: theme.panelAlt, color: theme.muted }}>
                  <Info size={14} className="mt-0.5 shrink-0" />
                  Constant-volume calorimetry measures q_v, which equals ΔU — not ΔH. The steel bomb is heavily insulated, so the heat-loss correction here is much smaller than in the coffee-cup case.
                </div>

                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-xs font-semibold"
                  style={{ color: accent.primary }}
                >
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Advanced: convert ΔU → ΔH
                </button>
                {showAdvanced && (
                  <div className="mt-2">
                    <Field label="Δn(gas) — mol gas products − mol gas reactants" theme={theme}>
                      <NumberInput value={deltaNGas} onChange={setDeltaNGas} step={0.5} theme={theme} />
                    </Field>
                  </div>
                )}
              </>
            )}
          </div>

          {/* -------- Live readout + formula -------- */}
          <div className="lg:col-span-3 flex flex-col gap-5">
            <div
              className="rounded-xl border p-5"
              style={{
                borderColor: theme.border,
                background: `linear-gradient(135deg, ${hexToRgba(accent.primary, 0.14)}, ${hexToRgba(accent.secondary, 0.08)})`,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <accent.Icon size={18} style={{ color: accent.primary }} />
                <span className="text-sm font-semibold" style={{ color: accent.primary }}>{accent.label}</span>
              </div>

              {mode === "coffee" ? (
                <>
                  <div className="cal-display text-4xl font-bold mb-1" style={{ color: theme.text }}>
                    ΔH = {coffee.dH.toFixed(2)} <span className="text-xl font-medium">kJ/mol</span>
                  </div>
                  {coffee.litDh !== null && (
                    <p className="text-xs mb-3" style={{ color: theme.muted }}>
                      Literature value: {coffee.litDh.toFixed(1)} kJ/mol · % error {coffee.pctError.toFixed(1)}%
                    </p>
                  )}
                  <div className="cal-mono text-xs space-y-1 mt-3" style={{ color: theme.muted }}>
                    <div>Raw ΔT (thermometer) = {tFinal} − {tInitial} = {coffee.rawDT.toFixed(2)} °C</div>
                    <div>Corrected ΔT (extrapolated) = {coffee.dT.toFixed(2)} °C</div>
                    <div>q_solution = m·c·ΔT = {mass} × {specificHeat} × {coffee.dT.toFixed(2)} = {coffee.qSolution.toFixed(1)} J</div>
                    {includeCal && (
                      <div>q_cal = C_cal·ΔT = {calConstant} × {coffee.dT.toFixed(2)} = {coffee.qCal.toFixed(1)} J</div>
                    )}
                    <div>q_rxn = −(q_solution {includeCal ? "+ q_cal" : ""}) = {coffee.qRxn.toFixed(1)} J</div>
                    <div>ΔH_rxn = q_rxn ÷ n = {coffee.qRxn.toFixed(1)} J ÷ {moles} mol = {(coffee.qRxn / moles).toFixed(0)} J/mol</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="cal-display text-4xl font-bold mb-1" style={{ color: theme.text }}>
                    ΔU = {bomb.duPerMol.toFixed(0)} <span className="text-xl font-medium">kJ/mol</span>
                  </div>
                  <p className="text-sm mb-1" style={{ color: theme.text }}>
                    ({bomb.duPerGram.toFixed(2)} kJ/g)
                    {showAdvanced && deltaNGas !== 0 && <> · ΔH ≈ {bomb.dhPerMol.toFixed(0)} kJ/mol</>}
                  </p>
                  {bomb.litDuPerGram !== null && (
                    <p className="text-xs mb-3" style={{ color: theme.muted }}>
                      Literature value: {bomb.litDuPerGram.toFixed(2)} kJ/g · % error {bomb.pctError.toFixed(1)}%
                    </p>
                  )}
                  <div className="cal-mono text-xs space-y-1 mt-3" style={{ color: theme.muted }}>
                    <div>Raw ΔT (thermometer) = {tFinalB} − {tInitialB} = {bomb.rawDT.toFixed(2)} °C</div>
                    <div>Corrected ΔT (extrapolated) = {bomb.dT.toFixed(2)} °C</div>
                    <div>q_rxn = −(C_bomb·ΔT) = −({bombC} × {bomb.dT.toFixed(2)}) = {bomb.qRxn.toFixed(2)} kJ</div>
                    <div>n = mass ÷ M = {sampleMass} ÷ {molarMass} = {bomb.nMol.toFixed(4)} mol</div>
                    <div>ΔU_rxn = q_rxn ÷ n = {bomb.duPerMol.toFixed(0)} kJ/mol</div>
                    {showAdvanced && (
                      <div>ΔH = ΔU + Δn(gas)·R·T = {bomb.duPerMol.toFixed(0)} + ({deltaNGas})(8.314×10⁻³)({(tInitialB + 273.15).toFixed(1)}) = {bomb.dhPerMol.toFixed(0)} kJ/mol</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Chart */}
            <div className="rounded-xl border p-4" style={{ background: theme.panel, borderColor: theme.border }}>
              <h3 className="text-sm font-semibold mb-1">Temperature vs. time</h3>
              <p className="text-xs mb-2" style={{ color: theme.muted }}>
                Dashed lines extrapolate the pre-mix baseline and post-mix drift back to the moment of mixing — the standard correction for heat exchanged with the surroundings during a real run.
              </p>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={chartData} margin={{ top: 5, right: 15, bottom: 5, left: -10 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="t" stroke={theme.muted} tick={{ fontSize: 11 }} label={{ value: "Time (min)", position: "insideBottom", offset: -3, fontSize: 11, fill: theme.muted }} />
                  <YAxis stroke={theme.muted} tick={{ fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "T (°C)", angle: -90, position: "insideLeft", fontSize: 11, fill: theme.muted }} />
                  <Tooltip contentStyle={{ background: theme.panel, borderColor: theme.border, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="T" name="Measured" stroke={accent.primary} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="preExtrap" name="Baseline extrap." stroke={theme.muted} strokeDasharray="4 3" strokeWidth={1.25} dot={false} />
                  <Line type="monotone" dataKey="postExtrap" name="Drift extrap." stroke={theme.muted} strokeDasharray="4 3" strokeWidth={1.25} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

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
                            borderColor: showCorrect ? "#16A34A" : showWrong ? "#DC2626" : selected ? accent.primary : theme.border,
                            background: showCorrect ? hexToRgba("#16A34A", 0.1) : showWrong ? hexToRgba("#DC2626", 0.1) : selected ? hexToRgba(accent.primary, 0.08) : theme.panel,
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
                      style={{ background: accent.primary, color: "#fff" }}
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
                  {isChecked && (
                    <p className="text-xs mt-2" style={{ color: theme.muted }}>{item.explain}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}