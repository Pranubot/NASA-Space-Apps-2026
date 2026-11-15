// Searchable site list with category filters and a custom-coordinate form.

import { GripVertical, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { customElevation } from "../data/dataset";
import type { Site, SiteCategory } from "../data/types";
import { CATEGORY_LABEL, VERDICT_LABEL } from "../lib/theme";
import { fmtLatLon } from "../lib/time";
import { useAllSummaries, type SiteSummary } from "../hooks/useSiteData";
import { useSiteDrag } from "../hooks/useSiteDrag";
import { MAX_SELECTED, allSites, useStore } from "../state/store";
import { VerdictIcon } from "./Scorecards";

const ORDER: SiteCategory[] = ["artemis", "clps", "commercial", "international", "apollo", "reference", "custom"];

function CustomForm() {
  const ds = useStore((s) => s.dataset);
  const addCustom = useStore((s) => s.addCustomSite);
  const bump = useStore((s) => s.bumpHorizons);
  const showToast = useStore((s) => s.showToast);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat), lo = Number(lon);
    if (lat.trim() === "" || !Number.isFinite(la) || la < -90 || la > 90) return setError("Latitude must be between −90 and 90.");
    if (lon.trim() === "" || !Number.isFinite(lo) || lo < -180 || lo > 360) return setError("Longitude must be between −180 and 360 (east positive).");
    setError(null);
    const lonE = lo > 180 ? lo - 360 : lo;
    const elev = ds ? await customElevation(ds, la, lonE) : undefined;
    const site = addCustom(la, lonE, elev);
    setLat("");
    setLon("");
    if (ds) {
      await ds.ensureHorizon(site);
      bump();
      showToast(`${site.name} added. Horizon computed from LOLA.`);
    }
  };

  return (
    <form className="custom" onSubmit={submit} noValidate>
      <label className="field">
        <span>Latitude</span>
        <input inputMode="decimal" placeholder="-89.45" value={lat} onChange={(e) => setLat(e.target.value)} aria-invalid={!!error} />
      </label>
      <label className="field">
        <span>Longitude E</span>
        <input inputMode="decimal" placeholder="-137.31" value={lon} onChange={(e) => setLon(e.target.value)} aria-invalid={!!error} />
      </label>
      <button type="submit" className="btn btn--primary">Add</button>
      {error ? <p className="custom__error" role="alert">{error}</p> : <p className="custom__hint">East-positive degrees. Or use the pin button on the map, then click where you want it.</p>}
    </form>
  );
}

function SiteRow({
  site: s, summary: sum, selected, full, focused, hovered,
}: { site: Site; summary?: SiteSummary; selected: boolean; full: boolean; focused: boolean; hovered: boolean }) {
  const setHoverSite = useStore((st) => st.setHoverSite);
  const toggle = useStore((st) => st.toggleSelect);
  const focus = useStore((st) => st.focus);
  const removeCustom = useStore((st) => st.removeCustomSite);
  const drag = useSiteDrag(s.id);
  return (
    <li
      className={`site${focused ? " is-focus" : ""}${hovered ? " is-hover" : ""}`}
      onPointerEnter={() => setHoverSite(s.id)} onPointerLeave={() => setHoverSite(null)} onPointerDown={drag.onPointerDown}
    >
      <GripVertical size={13} className="site__grip" aria-hidden />
      <input
        type="checkbox" checked={selected} onChange={() => toggle(s.id)} aria-label={`Compare ${s.name}`}
        disabled={!selected && full}
      />
      <button type="button" className="site__main" onClick={() => focus(s.id)}>
        <span className="site__name">
          {s.name}
          {s.approx && <span className="tag" title="Region centre or planning estimate, not a surveyed point">approx.</span>}
        </span>
        <span className="site__meta">
          {CATEGORY_LABEL[s.category]} · <span className="num">{fmtLatLon(s.lat, s.lon, 1)}</span>
        </span>
      </button>
      {sum ? (
        <span className="site__verdict" title={`${VERDICT_LABEL[sum.evaluation.overall]}: ${sum.evaluation.driver.reason}`}>
          <VerdictIcon v={sum.evaluation.overall} size={15} />
          <span className="sr-only">{VERDICT_LABEL[sum.evaluation.overall]}</span>
        </span>
      ) : (
        <span className="site__verdict site__verdict--pending" title="Computing horizon" />
      )}
      {s.category === "custom" && (
        <button type="button" className="iconbtn iconbtn--bare" onClick={() => removeCustom(s.id)} aria-label={`Delete ${s.name}`}>
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
}

export function SiteList() {
  const ds = useStore((s) => s.dataset);
  const customSites = useStore((s) => s.customSites);
  const selected = useStore((s) => s.selectedIds);
  const focusId = useStore((s) => s.focusId);
  const hoverId = useStore((s) => s.hoverSiteId);
  const summaries = useAllSummaries();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<SiteCategory | "all">("all");
  const [adding, setAdding] = useState(false);

  const sites = useMemo(() => allSites({ dataset: ds, customSites }), [ds, customSites]);
  const cats = useMemo(() => ORDER.filter((c) => sites.some((s) => s.category === c)), [sites]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites
      .filter((s) => cat === "all" || s.category === cat)
      .filter((s) => !q || `${s.name} ${s.mission ?? ""} ${s.science?.tags.join(" ") ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
  }, [sites, query, cat]);

  return (
    <section className="panel sitelist" aria-label="Site list">
      <div className="sitelist__filters">
        <div className="sitelist__top">
          <label className="search">
            <Search size={14} aria-hidden />
            <input type="search" placeholder="Search sites, missions, tags" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sites" />
          </label>
          <button type="button" className="btn" aria-expanded={adding} onClick={() => setAdding((a) => !a)} title="Add any lunar coordinate">
            <Plus size={14} /> Custom
          </button>
        </div>
        {adding && <CustomForm />}
        <div className="chips" role="group" aria-label="Filter by programme">
          <button type="button" className={cat === "all" ? "is-on" : ""} aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
          {cats.map((c) => (
            <button key={c} type="button" className={cat === c ? "is-on" : ""} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <ul className="sitelist__items">
        {shown.map((s) => {
          const isSel = selected.includes(s.id);
          return (
            <SiteRow
              key={s.id} site={s} summary={summaries.get(s.id)} selected={isSel} full={selected.length >= MAX_SELECTED}
              focused={focusId === s.id} hovered={hoverId === s.id}
            />
          );
        })}
        {shown.length === 0 && (
          <li className="sitelist__empty">
            No site matches “{query}”. Clear the search, or add the coordinate below.
          </li>
        )}
      </ul>
    </section>
  );
}
