// Searchable site list with category filters and a custom-coordinate form.

import { Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { customElevation } from "../data/dataset";
import type { SiteCategory } from "../data/types";
import { CATEGORY_LABEL } from "../lib/theme";
import { fmtLatLon } from "../lib/time";
import { useAllSummaries } from "../hooks/useSiteData";
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
      {error ? <p className="custom__error" role="alert">{error}</p> : <p className="custom__hint">East-positive degrees. You can also double-click the map.</p>}
    </form>
  );
}

export function SiteList() {
  const ds = useStore((s) => s.dataset);
  const customSites = useStore((s) => s.customSites);
  const selected = useStore((s) => s.selectedIds);
  const focusId = useStore((s) => s.focusId);
  const hoverId = useStore((s) => s.hoverSiteId);
  const setHoverSite = useStore((s) => s.setHoverSite);
  const toggle = useStore((s) => s.toggleSelect);
  const focus = useStore((s) => s.focus);
  const removeCustom = useStore((s) => s.removeCustomSite);
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
          const sum = summaries.get(s.id);
          const isSel = selected.includes(s.id);
          return (
            <li
              key={s.id} className={`site${focusId === s.id ? " is-focus" : ""}${hoverId === s.id ? " is-hover" : ""}`}
              onPointerEnter={() => setHoverSite(s.id)} onPointerLeave={() => setHoverSite(null)}
            >
              <input
                type="checkbox" checked={isSel} onChange={() => toggle(s.id)} aria-label={`Compare ${s.name}`}
                disabled={!isSel && selected.length >= MAX_SELECTED}
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
                <span className="site__verdict" title={`${sum.evaluation.overall}: ${sum.evaluation.driver.reason}`}>
                  <VerdictIcon v={sum.evaluation.overall} size={15} />
                  <span className="sr-only">{sum.evaluation.overall}</span>
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
