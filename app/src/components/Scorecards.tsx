// Compare columns: one per selected site, aligned rows, each engineering/operations limit with its
// own verdict so a science lead can see which constraint decides a site.

import { CircleCheck, CircleX, Copy, ExternalLink, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { coordString, horizonsUrl, moonTrekUrl, QUICKMAP_URL } from "../lib/links";
import type { Verdict } from "../lib/scenario";
import { CATEGORY_LABEL, VERDICT_COLOR, VERDICT_HINT, VERDICT_LABEL } from "../lib/theme";
import { fmtDuration } from "../lib/time";
import type { SiteData } from "../hooks/useSiteData";
import { useSelectedData } from "../hooks/useSiteData";
import { useSay, useStore } from "../state/store";

export function VerdictIcon({ v, size = 14 }: { v: Verdict; size?: number }) {
  const color = VERDICT_COLOR[v];
  if (v === "GO") return <CircleCheck size={size} color={color} aria-hidden />;
  if (v === "MARGINAL") return <TriangleAlert size={size} color={color} aria-hidden />;
  return <CircleX size={size} color={color} aria-hidden />;
}

export function VerdictChip({ v }: { v: Verdict }) {
  return (
    <span className={`verdict verdict--${v === "NO-GO" ? "nogo" : v.toLowerCase()}`} title={VERDICT_HINT[v]}>
      <VerdictIcon v={v} size={12} />
      {VERDICT_LABEL[v]}
    </span>
  );
}

interface Row {
  label: string;
  hint?: string;
  /** numeric value used to pick the best column; higher is better unless `lowerBetter` */
  score?: (d: SiteData) => number;
  lowerBetter?: boolean;
  render: (d: SiteData) => ReactNode;
  strong?: boolean;
  /** hidden in Simple mode */
  expert?: boolean;
}

const pct = (v: number) => `${Math.round(v)}%`;

const ROWS: Row[] = [
  { label: "Sunlit", hint: "Share of the mission with enough of the Sun's disc above terrain", score: (d) => d.metrics.sunlitPct, render: (d) => pct(d.metrics.sunlitPct) },
  { label: "Earth in view", hint: "Share of the mission with a direct-to-Earth link", score: (d) => d.metrics.earthPct, render: (d) => pct(d.metrics.earthPct) },
  { label: "Power + comms", hint: "Share of the mission with both at once", strong: true, score: (d) => d.metrics.bothPct, render: (d) => pct(d.metrics.bothPct) },
  {
    label: "First usable window", hint: "Time from landing until power and comms are available together",
    score: (d) => d.metrics.firstBothH ?? Infinity, lowerBetter: true,
    render: (d) => (d.metrics.firstBothH === null ? "never" : d.metrics.firstBothH === 0 ? "at landing" : `after ${fmtDuration(d.metrics.firstBothH)}`),
  },
  { label: "Mean Sun elevation", expert: true, hint: "Average elevation while lit", render: (d) => (Number.isFinite(d.metrics.meanSunElLitDeg) ? `${d.metrics.meanSunElLitDeg.toFixed(1)}°` : "n/a") },
  { label: "Energy", expert: true, hint: "Array output over the mission", score: (d) => d.metrics.energyKWh, render: (d) => `${d.metrics.energyKWh.toFixed(0)} kWh` },
];

function best(rows: SiteData[], r: Row): number {
  if (!r.score || rows.length < 2) return -1;
  const vals = rows.map(r.score);
  const target = r.lowerBetter ? Math.min(...vals) : Math.max(...vals);
  if (!Number.isFinite(target) || vals.every((v) => v === vals[0])) return -1;
  return vals.indexOf(target);
}

export function Scorecards() {
  const all = useSelectedData();
  const ids = useStore((s) => s.selectedIds);
  const focusId = useStore((s) => s.focusId);
  const focus = useStore((s) => s.focus);
  const toggle = useStore((s) => s.toggleSelect);
  const startMs = useStore((s) => s.startMs);
  const days = useStore((s) => s.days);
  const showToast = useStore((s) => s.showToast);
  const say = useSay();
  const rows = all.filter((d): d is SiteData => d !== null);
  const focused = rows.find((d) => d.site.id === focusId);

  const copyCoords = async (d: SiteData) => {
    try {
      await navigator.clipboard.writeText(coordString(d.site));
      showToast("Coordinates copied. Paste them into Quickmap's search box.");
    } catch {
      showToast(`Coordinates: ${coordString(d.site)}`);
    }
  };

  return (
    <section className="panel compare" aria-label="Compare sites">
      <header className="panel__head">
        <h2>Compare</h2>
        <span className="panel__sub">{days}-day mission</span>
      </header>
      {rows.length < ids.length && <p className="panel__note">Computing the terrain horizon for a custom site…</p>}
      <div className="compare__scroll">
        <table className="compare__table" style={{ ["--cols" as string]: rows.length }}>
          <thead>
            <tr>
              <th scope="col" className="compare__corner">
                <span className="sr-only">Metric</span>
              </th>
              {rows.map((d) => (
                <th key={d.site.id} scope="col" className={d.site.id === focusId ? "is-focus" : ""}>
                  <div className="compare__site">
                    <button type="button" className="compare__name" onClick={() => focus(d.site.id)} title="Show in the main view">
                      {d.site.name}
                    </button>
                    {rows.length > 1 && (
                      <button type="button" className="compare__remove" onClick={() => toggle(d.site.id)} aria-label={`Remove ${d.site.name} from the comparison`}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <span className="compare__meta">{CATEGORY_LABEL[d.site.category]}</span>
                  <VerdictChip v={d.evaluation.overall} />
                  {d.evaluation.overall !== "GO" && <span className="compare__driver">{d.evaluation.driver.label}</span>}
                </th>
              ))}
            </tr>
            {focused && (
              <tr className="compare__reason">
                <td colSpan={rows.length + 1}>
                  <strong>{focused.site.name}:</strong> {focused.evaluation.driver.reason}
                </td>
              </tr>
            )}
          </thead>
          <tbody>
            {rows[0]?.evaluation.checks.map((chk, ci) => (
              <tr key={chk.id} className="compare__check">
                <th scope="row">
                  <span className={`owner owner--${chk.owner.toLowerCase()} x-expert`} title={chk.owner === "ENG" ? "Engineering limit" : "Operations limit"}>
                    {chk.owner}
                  </span>
                  {say(chk.label)}
                  <span className="compare__limit num x-expert">{chk.limit}</span>
                </th>
                {rows.map((d) => {
                  const c = d.evaluation.checks[ci];
                  return (
                    <td key={d.site.id} title={c.reason}>
                      <span className="compare__checkval">
                        <VerdictIcon v={c.verdict} size={13} />
                        <span className={c.id === "touchdown" ? "" : "num"}>{c.value}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {ROWS.map((r) => {
              const b = best(rows, r);
              return (
                <tr key={r.label} className={`${r.strong ? "is-strong" : ""}${r.expert ? " x-expert" : ""}`}>
                  <th scope="row" title={r.hint}>{say(r.label)}</th>
                  {rows.map((d, i) => (
                    <td key={d.site.id} className={`num${i === b ? " is-best" : ""}`}>
                      {r.render(d)}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th scope="row" title="Team-assigned science value, 1 to 5. Not a NASA score.">Science value</th>
              {rows.map((d) => (
                <td key={d.site.id}>
                  {d.site.science ? (
                    <>
                      <span className="pips" aria-label={`${d.site.science.score} of 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={n <= d.site.science!.score ? "is-on" : ""} />
                        ))}
                      </span>
                      <span className="compare__tags">{d.site.science.tags.join(" · ")}</span>
                    </>
                  ) : (
                    <span className="compare__tags">not rated</span>
                  )}
                </td>
              ))}
            </tr>
            <tr className="compare__links x-expert">
              <th scope="row">Open in</th>
              {rows.map((d) => (
                <td key={d.site.id}>
                  <a href={moonTrekUrl(d.site)} target="_blank" rel="noreferrer">Moon Trek <ExternalLink size={11} /></a>
                  <a href={horizonsUrl(d.site, "sun", startMs, days)} target="_blank" rel="noreferrer">Horizons <ExternalLink size={11} /></a>
                  <a href={QUICKMAP_URL} target="_blank" rel="noreferrer" onClick={() => void copyCoords(d)}>Quickmap <Copy size={11} /></a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
