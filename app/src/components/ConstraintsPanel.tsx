// Mission limits. Each is owned by engineering (hardware) or operations and feeds the verdicts.

import { ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { DEFAULT_CONSTRAINTS, type Constraints } from "../lib/visibility";
import { useSay, useStore } from "../state/store";

interface Def {
  key: Exclude<keyof Constraints, "panelMode">;
  owner: "ENG" | "OPS";
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  /** hidden in Simple mode, which keeps the two limits a newcomer can reason about */
  expert?: boolean;
}

const DEFS: Def[] = [
  { key: "maxDarkH", owner: "ENG", label: "Battery survives", hint: "Longest continuous darkness the lander can ride out", min: 0, max: 400, step: 5, fmt: (v) => `${v} h dark` },
  { key: "minBothHoursPerDay", owner: "OPS", label: "Power + comms needed", hint: "Minimum hours per day with Sun and Earth together", min: 0, max: 24, step: 0.5, fmt: (v) => `${v} h/day` },
  { key: "maxCommsGapH", owner: "OPS", expert: true, label: "Longest comms gap", hint: "Longest time operations accept without a direct link", min: 0, max: 400, step: 4, fmt: (v) => `${v} h` },
  { key: "earthMaskDeg", owner: "ENG", expert: true, label: "Antenna mask", hint: "Earth's centre must clear the terrain by this much", min: 0, max: 5, step: 0.1, fmt: (v) => `${v.toFixed(1)}°` },
  { key: "sunMinFraction", owner: "ENG", expert: true, label: "Sun disc needed", hint: "Fraction of the Sun's disc that must be above terrain to count as lit", min: 0.05, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "panelW", owner: "ENG", expert: true, label: "Array rating", hint: "Rated solar array power", min: 100, max: 5000, step: 100, fmt: (v) => `${v} W` },
];

export function ConstraintsPanel({ embedded = false }: { embedded?: boolean }) {
  const c = useStore((s) => s.constraints);
  const set = useStore((s) => s.setConstraint);
  const reset = useStore((s) => s.resetConstraints);
  const say = useSay();
  // on short screens the comparison needs the room; limits open on demand
  const [openState, setOpen] = useState(() => window.innerHeight >= 820);
  const open = embedded || openState;
  const changed = (Object.keys(DEFAULT_CONSTRAINTS) as (keyof Constraints)[]).some((k) => c[k] !== DEFAULT_CONSTRAINTS[k]);

  return (
    <section className="panel constraints" aria-label="Mission limits">
      <header className="panel__head">
        {embedded ? (
          <h2>Mission limits</h2>
        ) : (
          <button type="button" className="constraints__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <ChevronDown size={14} className={open ? "is-open" : ""} />
            <h2>Mission limits</h2>
          </button>
        )}
        <span className="panel__sub">
          {open ? "Verdicts update as you drag" : `battery ${c.maxDarkH} h · ${c.minBothHoursPerDay} h/day · gap ${c.maxCommsGapH} h`}
        </span>
        <button type="button" className="textbtn" onClick={reset} disabled={!changed}>
          <RotateCcw size={12} /> Reset
        </button>
      </header>
      <div className="constraints__grid" hidden={!open}>
        {DEFS.map((d) => (
          <label key={d.key} className={`slider${d.expert ? " x-expert" : ""}`} title={d.hint}>
            <span className="slider__top">
              <span className={`owner owner--${d.owner.toLowerCase()} x-expert`}>{d.owner}</span>
              <span className="slider__label">{say(d.label)}</span>
              <output className="num">{d.fmt(c[d.key])}</output>
            </span>
            <input
              type="range" min={d.min} max={d.max} step={d.step} value={c[d.key]}
              style={{ ["--fill" as string]: `${((c[d.key] - d.min) / (d.max - d.min)) * 100}%` }}
              onChange={(e) => set(d.key, Number(e.target.value))}
            />
          </label>
        ))}
        <div className="slider x-expert">
          <span className="slider__top">
            <span className="owner owner--eng x-expert">ENG</span>
            <span className="slider__label">Array type</span>
          </span>
          <div className="seg seg--full" role="group" aria-label="Array type">
            <button type="button" className={c.panelMode === "vertical" ? "is-on" : ""} aria-pressed={c.panelMode === "vertical"} onClick={() => set("panelMode", "vertical")}>
              Vertical, Sun-tracking
            </button>
            <button type="button" className={c.panelMode === "horizontal" ? "is-on" : ""} aria-pressed={c.panelMode === "horizontal"} onClick={() => set("panelMode", "horizontal")}>
              Flat on deck
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
