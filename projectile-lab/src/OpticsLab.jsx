import React, { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot,
} from "recharts";
import {
  Sparkles, Waves, Aperture, ScanLine, CheckCircle2, XCircle, Info, RotateCcw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Fixed dark palette — matches the rest of Virtual Lab, no theming   */
/*  infrastructure, hardcoded colors only.                             */
/* ------------------------------------------------------------------ */
const theme = {
  bg: "#0C1118", panel: "#151C27", panelAlt: "#111722", border: "#25303E",
  text: "#EAEDF2", muted: "#8B96A5", grid: "#20293580", axis: "#3A4A63",
};
const ACCENT = { primary: "#22D3EE", secondary: "#A78BFA" };

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Map a visible wavelength (nm) to an approximate display color.
function wavelengthToColor(nm) {
  let r, g, b;
  if (nm < 440) { r = -(nm - 440) / (440 - 380); g = 0; b = 1; }
  else if (nm < 490) { r = 0; g = (nm - 440) / (490 - 440); b = 1; }
  else if (nm < 510) { r = 0; g = 1; b = -(nm - 510) / (510 - 490); }
  else if (nm < 580) { r = (nm - 510) / (580 - 510); g = 1; b = 0; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / (645 - 580); b = 0; }
  else { r = 1; g = 0; b = 0; }
  const to255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

function classifyImage(di, m) {
  return {
    real: di > 0,
    upright: m > 0,
    magnitude: Math.abs(m),
    sizeLabel: Math.abs(m) > 1.02 ? "magnified" : Math.abs(m) < 0.98 ? "reduced" : "same size",
  };
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
      type="number" value={value} step={step} min={min} max={max}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none border"
      style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
    />
  );
}
function Slider({ value, onChange, min, max, step }) {
  return (
    <input
      type="range" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full"
    />
  );
}
function Select({ value, onChange, options }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md px-3 py-2 text-sm border"
      style={{ background: theme.panelAlt, borderColor: theme.border, color: theme.text }}
    >
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
function ImageStatCard({ classification, distanceLabel, di }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs cal-mono mt-2">
      <div className="rounded-md p-2 text-center" style={{ background: theme.panelAlt }}>
        <div style={{ color: theme.muted }}>Type</div>
        <div className="font-semibold" style={{ color: classification.real ? "#F59E0B" : "#22D3EE" }}>
          {classification.real ? "Real" : "Virtual"}
        </div>
      </div>
      <div className="rounded-md p-2 text-center" style={{ background: theme.panelAlt }}>
        <div style={{ color: theme.muted }}>Orientation</div>
        <div className="font-semibold" style={{ color: theme.text }}>{classification.upright ? "Upright" : "Inverted"}</div>
      </div>
      <div className="rounded-md p-2 text-center" style={{ background: theme.panelAlt }}>
        <div style={{ color: theme.muted }}>Size</div>
        <div className="font-semibold" style={{ color: theme.text }}>{classification.sizeLabel} ({classification.magnitude.toFixed(2)}×)</div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  1. Reflection & Mirrors                                             */
/* ==================================================================== */
function MirrorsLab() {
  const [type, setType] = useState("concave"); // plane | concave | convex
  const [focalMag, setFocalMag] = useState(10); // cm, magnitude
  const [doDist, setDoDist] = useState(15); // cm
  const ho = 3; // cm, fixed object height for the diagram

  const f = type === "convex" ? -focalMag : focalMag;

  const calc = useMemo(() => {
    if (type === "plane") return { di: -doDist, m: 1, hi: ho };
    const di = 1 / (1 / f - 1 / doDist);
    const m = -di / doDist;
    return { di, m, hi: m * ho };
  }, [type, f, doDist, ho]);

  const classification = type === "plane"
    ? { real: false, upright: true, magnitude: 1, sizeLabel: "same size" }
    : classifyImage(calc.di, calc.m);

  // pixel mapping
  const scale = 3.2, mirrorX = 260, axisY = 110;
  const objX = mirrorX - doDist * scale;
  const objTopY = axisY - ho * scale;
  const imgX = mirrorX - calc.di * scale;
  const imgTopY = axisY - calc.hi * scale;
  const Fx = mirrorX - f * scale;
  const Cx = mirrorX - 2 * f * scale;
  const stubDir = -1; // reflected light always heads back toward -x (object side)
  const stubX = mirrorX + stubDir * 40;

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <div className="inline-flex rounded-lg p-1 mb-4 border w-full" style={{ background: theme.panelAlt, borderColor: theme.border }}>
            {["plane", "concave", "convex"].map((t) => (
              <button key={t} onClick={() => setType(t)}
                className="flex-1 px-2 py-1.5 rounded-md text-sm font-medium capitalize"
                style={{ background: type === t ? theme.panel : "transparent", color: type === t ? theme.text : theme.muted }}>
                {t}
              </button>
            ))}
          </div>
          <Field label="Object distance (dₒ)" unit="cm"><Slider value={doDist} onChange={setDoDist} min={2} max={60} step={0.5} /><div className="text-sm cal-mono mt-1">{doDist.toFixed(1)} cm</div></Field>
          {type !== "plane" && (
            <Field label="Focal length magnitude |f|" unit="cm"><Slider value={focalMag} onChange={setFocalMag} min={2} max={30} step={0.5} /><div className="text-sm cal-mono mt-1">{focalMag.toFixed(1)} cm (R = {(focalMag * 2).toFixed(0)} cm)</div></Field>
          )}
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            {type === "plane" && "A plane mirror always forms a virtual, upright, same-size image the same distance behind the mirror as the object is in front."}
            {type === "concave" && "A concave mirror's image depends on where the object sits relative to F and C — drag dₒ across those thresholds to see it flip."}
            {type === "convex" && "A convex mirror always forms a virtual, upright, reduced image, no matter the object distance — that's why they're used for wide-view safety mirrors."}
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.primary, 0.12)}, ${hexToRgba(ACCENT.secondary, 0.06)})` }}>
          <div className="cal-display text-2xl font-bold mb-1">
            d_i = {calc.di.toFixed(2)} cm{type !== "plane" && <> · m = {calc.m.toFixed(2)}</>}
          </div>
          {type !== "plane" && (
            <div className="cal-mono text-xs mt-1" style={{ color: theme.muted }}>
              1/f = 1/dₒ + 1/dᵢ → 1/{f} = 1/{doDist.toFixed(1)} + 1/dᵢ → dᵢ = {calc.di.toFixed(2)} cm
            </div>
          )}
          <ImageStatCard classification={classification} />
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Ray diagram</h3>
          <svg viewBox="0 0 400 220" className="w-full h-56">
            <line x1="10" y1={axisY} x2="390" y2={axisY} stroke={theme.axis} strokeWidth="1" strokeDasharray="3 3" />
            {type !== "plane" && (
              <>
                <circle cx={Fx} cy={axisY} r="2.5" fill={theme.muted} />
                <text x={Fx} y={axisY + 14} fontSize="10" fill={theme.muted} textAnchor="middle">F</text>
                <circle cx={Cx} cy={axisY} r="2.5" fill={theme.muted} />
                <text x={Cx} y={axisY + 14} fontSize="10" fill={theme.muted} textAnchor="middle">C</text>
              </>
            )}
            {/* mirror surface */}
            {type === "plane" ? (
              <line x1={mirrorX} y1="20" x2={mirrorX} y2="200" stroke={theme.text} strokeWidth="3" />
            ) : (
              <path
                d={type === "concave"
                  ? `M${mirrorX},20 Q${mirrorX - 18},${axisY} ${mirrorX},200`
                  : `M${mirrorX},20 Q${mirrorX + 18},${axisY} ${mirrorX},200`}
                fill="none" stroke={theme.text} strokeWidth="3"
              />
            )}
            {/* object */}
            <line x1={objX} y1={axisY} x2={objX} y2={objTopY} stroke="#F59E0B" strokeWidth="2.5" markerEnd="url(#arrowMirrorObj)" />
            <text x={objX} y={objTopY - 6} fontSize="10" fill="#F59E0B" textAnchor="middle">object</text>
            {/* image */}
            <line x1={imgX} y1={axisY} x2={imgX} y2={imgTopY}
              stroke={classification.real ? ACCENT.primary : ACCENT.secondary} strokeWidth="2.5"
              strokeDasharray={classification.real ? "0" : "4 3"} />
            <text x={imgX} y={imgTopY + (calc.hi >= 0 ? -6 : 16)} fontSize="10" fill={classification.real ? ACCENT.primary : ACCENT.secondary} textAnchor="middle">image</text>
            {/* ray A: parallel then through image */}
            <line x1={objX} y1={objTopY} x2={mirrorX} y2={objTopY} stroke={ACCENT.primary} strokeWidth="1.25" />
            <line x1={mirrorX} y1={objTopY} x2={imgX} y2={imgTopY} stroke={ACCENT.primary} strokeWidth="1.25" strokeDasharray={classification.real ? "0" : "3 3"} />
            {/* ray B: through pole */}
            <line x1={objX} y1={objTopY} x2={mirrorX} y2={axisY} stroke={ACCENT.secondary} strokeWidth="1.25" />
            <line x1={mirrorX} y1={axisY} x2={imgX} y2={imgTopY} stroke={ACCENT.secondary} strokeWidth="1.25" strokeDasharray={classification.real ? "0" : "3 3"} />
            <defs>
              <marker id="arrowMirrorObj" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#F59E0B" /></marker>
            </defs>
          </svg>
        </Panel>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  2. Refraction & Snell's Law                                         */
/* ==================================================================== */
const MEDIA = [
  { name: "Air", n: 1.0003 }, { name: "Water", n: 1.33 }, { name: "Crown glass", n: 1.52 },
  { name: "Diamond", n: 2.42 },
];
function RefractionLab() {
  const [n1, setN1] = useState(1.0003);
  const [n2, setN2] = useState(1.33);
  const [theta1Deg, setTheta1Deg] = useState(30);

  const calc = useMemo(() => {
    const theta1 = (theta1Deg * Math.PI) / 180;
    const sinTheta2 = (n1 / n2) * Math.sin(theta1);
    const tir = sinTheta2 > 1;
    const theta2 = tir ? null : Math.asin(sinTheta2);
    const criticalAngle = n1 > n2 ? Math.asin(n2 / n1) * (180 / Math.PI) : null;
    return { theta2Deg: tir ? null : theta2 * (180 / Math.PI), tir, criticalAngle };
  }, [n1, n2, theta1Deg]);

  // pixel geometry
  const originX = 200, originY = 110, rayLen = 90;
  const t1 = (theta1Deg * Math.PI) / 180;
  const incidentStart = { x: originX - rayLen * Math.sin(t1), y: originY - rayLen * Math.cos(t1) };
  const reflectedEnd = { x: originX + rayLen * Math.sin(t1), y: originY - rayLen * Math.cos(t1) };
  const t2 = calc.tir ? 0 : (calc.theta2Deg * Math.PI) / 180;
  const refractedEnd = { x: originX + rayLen * Math.sin(t2), y: originY + rayLen * Math.cos(t2) };

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <Field label="Incident medium (n₁)">
            <Select value={n1} onChange={(v) => setN1(parseFloat(v))} options={MEDIA.map((m) => ({ value: m.n, label: `${m.name} (n = ${m.n})` }))} />
          </Field>
          <Field label="Transmitted medium (n₂)">
            <Select value={n2} onChange={(v) => setN2(parseFloat(v))} options={MEDIA.map((m) => ({ value: m.n, label: `${m.name} (n = ${m.n})` }))} />
          </Field>
          <Field label="Angle of incidence (θ₁)" unit="°">
            <Slider value={theta1Deg} onChange={setTheta1Deg} min={0} max={89} step={1} />
            <div className="text-sm cal-mono mt-1">{theta1Deg}°</div>
          </Field>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            {calc.criticalAngle !== null
              ? `Going from a denser to a less-dense medium, total internal reflection begins at θc = ${calc.criticalAngle.toFixed(1)}°.`
              : "Total internal reflection can only happen going from a higher-index to a lower-index medium."}
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.primary, 0.12)}, ${hexToRgba(ACCENT.secondary, 0.06)})` }}>
          {calc.tir ? (
            <div className="flex items-center gap-2">
              <XCircle size={20} style={{ color: "#DC2626" }} />
              <span className="cal-display text-xl font-bold">Total internal reflection</span>
            </div>
          ) : (
            <div className="cal-display text-2xl font-bold">θ₂ = {calc.theta2Deg.toFixed(1)}°</div>
          )}
          <div className="cal-mono text-xs mt-2" style={{ color: theme.muted }}>
            n₁ sin θ₁ = n₂ sin θ₂ → {n1.toFixed(3)} × sin({theta1Deg}°) = {n2.toFixed(3)} × sin θ₂
          </div>
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Ray diagram</h3>
          <svg viewBox="0 0 400 220" className="w-full h-56">
            <rect x="0" y={originY} width="400" height="110" fill={hexToRgba(ACCENT.secondary, 0.06)} />
            <line x1="0" y1={originY} x2="400" y2={originY} stroke={theme.text} strokeWidth="2" />
            <line x1={originX} y1="10" x2={originX} y2="210" stroke={theme.axis} strokeWidth="1" strokeDasharray="3 3" />
            <text x={originX + 4} y="20" fontSize="10" fill={theme.muted}>normal</text>
            <line x1={incidentStart.x} y1={incidentStart.y} x2={originX} y2={originY} stroke="#F59E0B" strokeWidth="2.5" />
            <text x={incidentStart.x - 10} y={incidentStart.y} fontSize="10" fill="#F59E0B" textAnchor="end">incident</text>
            <line x1={originX} y1={originY} x2={reflectedEnd.x} y2={reflectedEnd.y} stroke={ACCENT.secondary} strokeWidth="2" strokeDasharray="4 3" />
            <text x={reflectedEnd.x + 6} y={reflectedEnd.y} fontSize="10" fill={ACCENT.secondary}>reflected</text>
            {!calc.tir && (
              <>
                <line x1={originX} y1={originY} x2={refractedEnd.x} y2={refractedEnd.y} stroke={ACCENT.primary} strokeWidth="2.5" />
                <text x={refractedEnd.x + 6} y={refractedEnd.y} fontSize="10" fill={ACCENT.primary}>refracted</text>
              </>
            )}
            <text x="10" y={originY - 8} fontSize="11" fill={theme.muted}>n₁</text>
            <text x="10" y={originY + 20} fontSize="11" fill={theme.muted}>n₂</text>
          </svg>
        </Panel>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  3. Thin Lenses                                                      */
/* ==================================================================== */
function LensesLab() {
  const [type, setType] = useState("converging"); // converging | diverging
  const [focalMag, setFocalMag] = useState(15);
  const [doDist, setDoDist] = useState(40);
  const ho = 3;
  const f = type === "diverging" ? -focalMag : focalMag;

  const calc = useMemo(() => {
    const di = 1 / (1 / f - 1 / doDist);
    const m = -di / doDist;
    return { di, m, hi: m * ho };
  }, [f, doDist, ho]);
  const classification = classifyImage(calc.di, calc.m);

  const scale = 2.4, lensX = 200, axisY = 110;
  const objX = lensX - doDist * scale;
  const objTopY = axisY - ho * scale;
  const imgX = lensX + calc.di * scale;
  const imgTopY = axisY - calc.hi * scale;
  const FxR = lensX + f * scale, FxL = lensX - f * scale;

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <div className="inline-flex rounded-lg p-1 mb-4 border w-full" style={{ background: theme.panelAlt, borderColor: theme.border }}>
            {["converging", "diverging"].map((t) => (
              <button key={t} onClick={() => setType(t)}
                className="flex-1 px-2 py-1.5 rounded-md text-sm font-medium capitalize"
                style={{ background: type === t ? theme.panel : "transparent", color: type === t ? theme.text : theme.muted }}>
                {t}
              </button>
            ))}
          </div>
          <Field label="Object distance (dₒ)" unit="cm"><Slider value={doDist} onChange={setDoDist} min={2} max={80} step={0.5} /><div className="text-sm cal-mono mt-1">{doDist.toFixed(1)} cm</div></Field>
          <Field label="Focal length magnitude |f|" unit="cm"><Slider value={focalMag} onChange={setFocalMag} min={2} max={30} step={0.5} /><div className="text-sm cal-mono mt-1">{focalMag.toFixed(1)} cm</div></Field>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            {type === "converging"
              ? "A converging lens forms a real, inverted image when the object is beyond F — and a magnified virtual image (like a magnifying glass) when it's inside F."
              : "A diverging lens always forms a virtual, upright, reduced image, no matter the object distance."}
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.primary, 0.12)}, ${hexToRgba(ACCENT.secondary, 0.06)})` }}>
          <div className="cal-display text-2xl font-bold mb-1">d_i = {calc.di.toFixed(2)} cm · m = {calc.m.toFixed(2)}</div>
          <div className="cal-mono text-xs mt-1" style={{ color: theme.muted }}>
            1/f = 1/dₒ + 1/dᵢ → 1/{f} = 1/{doDist.toFixed(1)} + 1/dᵢ → dᵢ = {calc.di.toFixed(2)} cm
          </div>
          <ImageStatCard classification={classification} />
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-2">Ray diagram</h3>
          <svg viewBox="0 0 400 220" className="w-full h-56">
            <line x1="10" y1={axisY} x2="390" y2={axisY} stroke={theme.axis} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={FxR} cy={axisY} r="2.5" fill={theme.muted} /><text x={FxR} y={axisY + 14} fontSize="10" fill={theme.muted} textAnchor="middle">F</text>
            <circle cx={FxL} cy={axisY} r="2.5" fill={theme.muted} /><text x={FxL} y={axisY + 14} fontSize="10" fill={theme.muted} textAnchor="middle">F</text>
            {/* lens symbol */}
            {type === "converging" ? (
              <path d={`M${lensX},20 Q${lensX + 10},${axisY} ${lensX},200 Q${lensX - 10},${axisY} ${lensX},20`} fill={hexToRgba(ACCENT.primary, 0.15)} stroke={theme.text} strokeWidth="2.5" />
            ) : (
              <path d={`M${lensX - 6},20 Q${lensX},${axisY} ${lensX - 6},200 M${lensX + 6},20 Q${lensX},${axisY} ${lensX + 6},200`} fill="none" stroke={theme.text} strokeWidth="2.5" />
            )}
            {/* object */}
            <line x1={objX} y1={axisY} x2={objX} y2={objTopY} stroke="#F59E0B" strokeWidth="2.5" />
            <text x={objX} y={objTopY - 6} fontSize="10" fill="#F59E0B" textAnchor="middle">object</text>
            {/* image */}
            <line x1={imgX} y1={axisY} x2={imgX} y2={imgTopY}
              stroke={classification.real ? ACCENT.primary : ACCENT.secondary} strokeWidth="2.5"
              strokeDasharray={classification.real ? "0" : "4 3"} />
            <text x={imgX} y={imgTopY + (calc.hi >= 0 ? -6 : 16)} fontSize="10" fill={classification.real ? ACCENT.primary : ACCENT.secondary} textAnchor="middle">image</text>
            {/* ray A: parallel then bends through focal point direction */}
            <line x1={objX} y1={objTopY} x2={lensX} y2={objTopY} stroke={ACCENT.primary} strokeWidth="1.25" />
            <line x1={lensX} y1={objTopY} x2={imgX} y2={imgTopY} stroke={ACCENT.primary} strokeWidth="1.25" strokeDasharray={classification.real ? "0" : "3 3"} />
            {/* ray B: undeviated through center */}
            <line x1={objX} y1={objTopY} x2={lensX} y2={axisY} stroke={ACCENT.secondary} strokeWidth="1.25" />
            <line x1={lensX} y1={axisY} x2={imgX} y2={imgTopY} stroke={ACCENT.secondary} strokeWidth="1.25" strokeDasharray={classification.real ? "0" : "3 3"} />
          </svg>
        </Panel>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  4. Diffraction & Interference                                       */
/* ==================================================================== */
function sinc(x) { return x === 0 ? 1 : Math.sin(x) / x; }

function DiffractionLab() {
  const [mode, setMode] = useState("double"); // double | single
  const [wavelengthNm, setWavelengthNm] = useState(550);
  const [slitSepMm, setSlitSepMm] = useState(0.1);
  const [slitWidthUm, setSlitWidthUm] = useState(20);
  const [screenDistM, setScreenDistM] = useState(2);

  const calc = useMemo(() => {
    const lambda = wavelengthNm * 1e-9;
    const d = slitSepMm * 1e-3;
    const a = slitWidthUm * 1e-6;
    const L = screenDistM;
    const fringeSpacingMm = mode === "double" ? (lambda * L / d) * 1000 : null;
    const singleMinSpacingMm = (lambda * L / a) * 1000;
    const rangeMm = mode === "double" ? fringeSpacingMm * 6 : singleMinSpacingMm * 3.5;
    const pts = [];
    const N = 260;
    for (let i = 0; i <= N; i++) {
      const yMm = -rangeMm + (2 * rangeMm * i) / N;
      const yM = yMm / 1000;
      const envelopeArg = (Math.PI * a * yM) / (lambda * L);
      const envelope = Math.pow(sinc(envelopeArg), 2);
      let intensity;
      if (mode === "double") {
        const interferenceArg = (Math.PI * d * yM) / (lambda * L);
        intensity = envelope * Math.pow(Math.cos(interferenceArg), 2);
      } else {
        intensity = envelope;
      }
      pts.push({ y: Number(yMm.toFixed(3)), I: Number(intensity.toFixed(4)) });
    }
    return { pts, fringeSpacingMm, singleMinSpacingMm, rangeMm };
  }, [mode, wavelengthNm, slitSepMm, slitWidthUm, screenDistM]);

  const color = wavelengthToColor(wavelengthNm);
  const bandCount = 60;

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2">
        <Panel>
          <div className="inline-flex rounded-lg p-1 mb-4 border w-full" style={{ background: theme.panelAlt, borderColor: theme.border }}>
            {["double", "single"].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 px-2 py-1.5 rounded-md text-sm font-medium capitalize"
                style={{ background: mode === m ? theme.panel : "transparent", color: mode === m ? theme.text : theme.muted }}>
                {m}-slit
              </button>
            ))}
          </div>
          <Field label="Wavelength (λ)" unit="nm">
            <Slider value={wavelengthNm} onChange={setWavelengthNm} min={400} max={700} step={5} />
            <div className="text-sm cal-mono mt-1 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
              {wavelengthNm} nm
            </div>
          </Field>
          {mode === "double" && (
            <Field label="Slit separation (d)" unit="mm"><Slider value={slitSepMm} onChange={setSlitSepMm} min={0.02} max={0.3} step={0.005} /><div className="text-sm cal-mono mt-1">{slitSepMm.toFixed(3)} mm</div></Field>
          )}
          <Field label="Slit width (a)" unit="μm"><Slider value={slitWidthUm} onChange={setSlitWidthUm} min={5} max={60} step={1} /><div className="text-sm cal-mono mt-1">{slitWidthUm} μm</div></Field>
          <Field label="Screen distance (L)" unit="m"><Slider value={screenDistM} onChange={setScreenDistM} min={0.5} max={4} step={0.1} /><div className="text-sm cal-mono mt-1">{screenDistM.toFixed(1)} m</div></Field>
          <div className="flex items-start gap-2 text-xs rounded-md p-2.5 mt-2" style={{ background: theme.panelAlt, color: theme.muted }}>
            <Info size={14} className="mt-0.5 shrink-0" />
            {mode === "double"
              ? "Bright fringes appear where the path-length difference from the two slits is a whole number of wavelengths."
              : "The single-slit pattern is a broad central maximum with much dimmer side lobes — no separate 'fringes' like the double-slit case."}
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <Panel style={{ background: `linear-gradient(135deg, ${hexToRgba(ACCENT.primary, 0.12)}, ${hexToRgba(ACCENT.secondary, 0.06)})` }}>
          {mode === "double" ? (
            <>
              <div className="cal-display text-2xl font-bold mb-1">Δy = {calc.fringeSpacingMm.toFixed(3)} mm</div>
              <div className="cal-mono text-xs" style={{ color: theme.muted }}>Δy = λL/d = ({wavelengthNm}nm × {screenDistM}m) / {slitSepMm}mm</div>
            </>
          ) : (
            <>
              <div className="cal-display text-2xl font-bold mb-1">First minimum at {calc.singleMinSpacingMm.toFixed(3)} mm</div>
              <div className="cal-mono text-xs" style={{ color: theme.muted }}>y₁ = λL/a = ({wavelengthNm}nm × {screenDistM}m) / {slitWidthUm}μm</div>
            </>
          )}
        </Panel>

        <Panel>
          <h3 className="text-sm font-semibold mb-1">Intensity on screen</h3>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={calc.pts} margin={{ top: 5, right: 15, bottom: 5, left: -10 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
              <XAxis dataKey="y" stroke={theme.muted} tick={{ fontSize: 11 }} label={{ value: "Position on screen (mm)", position: "insideBottom", offset: -3, fontSize: 11, fill: theme.muted }} />
              <YAxis stroke={theme.muted} tick={{ fontSize: 11 }} domain={[0, 1]} />
              <Tooltip contentStyle={{ background: theme.panel, borderColor: theme.border, fontSize: 12 }} />
              <Line type="monotone" dataKey="I" name="Relative intensity" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 rounded-md overflow-hidden flex h-8">
            {Array.from({ length: bandCount }).map((_, i) => {
              const yMm = -calc.rangeMm + (2 * calc.rangeMm * i) / bandCount;
              const yM = yMm / 1000;
              const lambda = wavelengthNm * 1e-9, a = slitWidthUm * 1e-6, d = slitSepMm * 1e-3, L = screenDistM;
              const env = Math.pow(sinc((Math.PI * a * yM) / (lambda * L)), 2);
              const intensity = mode === "double" ? env * Math.pow(Math.cos((Math.PI * d * yM) / (lambda * L)), 2) : env;
              return <div key={i} style={{ flex: 1, background: color, opacity: Math.max(0.03, intensity) }} />;
            })}
          </div>
          <p className="text-xs mt-1" style={{ color: theme.muted }}>Simulated appearance of the pattern on the screen.</p>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz                                                                */
/* ------------------------------------------------------------------ */
const QUIZ = [
  { q: "A concave mirror with the object beyond its center of curvature C forms an image that is:", options: ["Virtual, upright, magnified", "Real, inverted, reduced", "Real, upright, magnified", "Virtual, inverted, reduced"], correct: 1, explain: "Beyond C, a concave mirror always forms a real, inverted image that's smaller than the object, located between F and C." },
  { q: "A convex mirror's image is always:", options: ["Real and inverted", "Virtual, upright, and reduced", "Real and magnified", "Virtual and inverted"], correct: 1, explain: "Convex mirrors diverge reflected light, so the image is always virtual, upright, and smaller than the object — regardless of object distance." },
  { q: "Snell's law, n₁sinθ₁ = n₂sinθ₂, describes what happens to light at:", options: ["A mirror surface", "The boundary between two media", "A diffraction grating", "The focal point of a lens"], correct: 1, explain: "Snell's law governs refraction — the bending of light as it crosses an interface between materials with different indices of refraction." },
  { q: "Total internal reflection can only occur when light travels:", options: ["From a lower-index medium to a higher-index medium", "From a higher-index medium to a lower-index medium, beyond the critical angle", "Through a converging lens", "Along the normal to the surface"], correct: 1, explain: "TIR requires going from denser (higher n) to less dense (lower n) and hitting the interface beyond the critical angle θc = sin⁻¹(n₂/n₁)." },
  { q: "A diverging lens always produces an image that is:", options: ["Real, inverted, magnified", "Virtual, upright, reduced", "Real, upright, reduced", "Virtual, inverted, magnified"], correct: 1, explain: "A diverging lens spreads out parallel rays, so it can never bring light to a real focus — the image is always virtual, upright, and reduced." },
  { q: "A converging lens produces a magnified virtual image (like a magnifying glass) when the object is placed:", options: ["Beyond 2F", "Between F and 2F", "Inside the focal length F", "Exactly at 2F"], correct: 2, explain: "Placing the object closer than the focal length prevents the lens from converging the rays to a real image — instead they appear to diverge from a magnified virtual image on the same side as the object." },
  { q: "In a double-slit experiment, decreasing the slit separation d while keeping λ and L fixed will:", options: ["Decrease the fringe spacing", "Increase the fringe spacing", "Leave the fringe spacing unchanged", "Eliminate the fringes entirely"], correct: 1, explain: "Fringe spacing Δy = λL/d — since d is in the denominator, a smaller separation spreads the fringes farther apart." },
  { q: "The central maximum of a single-slit diffraction pattern is:", options: ["Narrower than the side lobes", "The same width as every other bright region", "Twice as wide as the side lobes and much brighter", "Only visible with a double slit"], correct: 2, explain: "The central peak of the single-slit sinc² pattern spans twice the angular width of the side lobes and carries most of the diffracted intensity." },
  { q: "The law of reflection states that the angle of reflection:", options: ["Is always 90° from the surface", "Equals the angle of incidence, both measured from the normal", "Depends on the wavelength of light", "Is always half the angle of incidence"], correct: 1, explain: "For any mirror surface, the outgoing ray leaves at the same angle from the normal that the incoming ray arrived at — this holds regardless of the mirror's shape at the point of reflection." },
  { q: "The index of refraction of a medium is defined as:", options: ["n = v/c (speed in medium over speed in vacuum)", "n = c/v (speed of light in vacuum over speed in the medium)", "n = λ/f", "n = sin θ alone"], correct: 1, explain: "n = c/v is always ≥ 1 since light never travels faster in a medium than in vacuum — a higher n means light slows down more in that material." },
  { q: "For a spherical mirror, the focal length f relates to the radius of curvature R as:", options: ["f = R", "f = 2R", "f = R/2", "f = R²"], correct: 2, explain: "The focal point sits halfway between the mirror's surface and its center of curvature, so f = R/2 for both concave and convex mirrors." },
  { q: "A real image, as opposed to a virtual image, is one where:", options: ["Light rays actually converge and could be projected on a screen", "The image only appears to an observer looking into the optical device", "The image is always upright", "The image is always smaller than the object"], correct: 0, explain: "Real images form where light rays physically cross and converge — you could place a screen there and see it. Virtual images only exist to an eye tracing the rays backward; no screen would catch them." },
  { q: "In a double-slit experiment, increasing the wavelength λ while keeping d and L fixed will:", options: ["Compress the fringes closer together", "Spread the fringes farther apart", "Leave fringe spacing unchanged", "Make the fringes disappear"], correct: 1, explain: "Since Δy = λL/d, a longer wavelength directly increases the fringe spacing — red light spreads fringes wider than blue light does." },
  { q: "Diffraction effects become most noticeable when the size of an aperture or obstacle is:", options: ["Much larger than the wavelength of light", "Comparable to the wavelength of light", "Exactly zero", "Irrelevant — diffraction is the same at any size"], correct: 1, explain: "Diffraction is only strongly visible when the opening's size is on the same order as the wavelength — that's why sound (long wavelength) diffracts around doorways easily, but visible light (much shorter) needs a very narrow slit to show the effect clearly." },
  { q: "A glass prism separates white light into a rainbow of colors because:", options: ["Each color has a different index of refraction in glass, so each bends by a different amount", "Glass absorbs all colors except one at a time", "Prisms only work with polarized light", "The colors reflect instead of refract"], correct: 0, explain: "This wavelength-dependence of the refractive index is called dispersion — violet light bends more than red light because glass's index of refraction is slightly higher at shorter wavelengths." },
  { q: "The human eye and a camera both form images the same way a converging lens does — where does that real image land?", options: ["In front of the lens, in the air", "On the retina (eye) or sensor/film (camera), on the opposite side of the lens from the object", "It doesn't form a real image at all", "Exactly at the focal point regardless of object distance"], correct: 1, explain: "Both are converging-lens systems designed so that for objects beyond the focal length, a real, inverted image lands precisely on the light-sensitive surface — the retina or the sensor." },
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

/* ==================================================================== */
/*  Main component                                                      */
/* ==================================================================== */
const MODES = [
  { id: "mirrors", label: "Reflection & Mirrors", icon: ScanLine, Component: MirrorsLab },
  { id: "refraction", label: "Refraction", icon: Waves, Component: RefractionLab },
  { id: "lenses", label: "Thin Lenses", icon: Aperture, Component: LensesLab },
  { id: "diffraction", label: "Diffraction", icon: Sparkles, Component: DiffractionLab },
];

export default function OpticsLab() {
  const [mode, setMode] = useState("mirrors");
  const [quizSet, setQuizSet] = useState(() => shuffled(QUIZ).slice(0, QUIZ_SAMPLE_SIZE));
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState({});
  function newQuiz() {
    setQuizSet(shuffled(QUIZ).slice(0, QUIZ_SAMPLE_SIZE));
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
            <Sparkles size={22} style={{ color: ACCENT.primary }} />
            <h1 className="cal-display text-2xl font-bold tracking-tight">Optics Lab</h1>
          </div>
          <p className="text-sm" style={{ color: theme.muted }}>
            Trace rays through mirrors and lenses, bend light across interfaces, and watch interference patterns form.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg p-1 mb-6 border" style={{ background: theme.panelAlt, borderColor: theme.border }}>
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
            <button
              onClick={newQuiz}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border"
              style={{ borderColor: theme.border, color: theme.muted, background: theme.panelAlt }}
            >
              <RotateCcw size={12} /> New questions
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: theme.muted }}>{quizSet.length} of {QUIZ.length} questions, shuffled — click "New questions" for a different set.</p>
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
                            borderColor: showCorrect ? "#16A34A" : showWrong ? "#DC2626" : selected ? ACCENT.primary : theme.border,
                            background: showCorrect ? hexToRgba("#16A34A", 0.1) : showWrong ? hexToRgba("#DC2626", 0.1) : selected ? hexToRgba(ACCENT.primary, 0.08) : theme.panel,
                            color: theme.text,
                          }}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setChecked({ ...checked, [qi]: true })} disabled={picked === undefined}
                      className="text-xs font-semibold px-3 py-1 rounded-md disabled:opacity-40"
                      style={{ background: ACCENT.primary, color: "#111" }}>
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