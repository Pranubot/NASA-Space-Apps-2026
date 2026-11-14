// Side sheet with two tabs: a plain-language guide, and data sources with the validation record.

import { ExternalLink, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { RESOURCES } from "../lib/links";
import { COLOR } from "../lib/theme";
import { fmtDate } from "../lib/time";
import { useStore } from "../state/store";

function LowSunFigure() {
  // Earth noon versus lunar-pole "noon", to scale in angle
  return (
    <svg viewBox="0 0 320 96" className="figure" role="img" aria-label="On Earth the midday Sun stands high. At the lunar south pole it stays within about 1.5 degrees of the horizon.">
      <line x1="10" y1="80" x2="150" y2="80" stroke={COLOR.text3} />
      <path d="M22,80 A58,58 0 0 1 138,80" fill="none" stroke={COLOR.sun} strokeOpacity="0.5" strokeDasharray="2 4" />
      <circle cx="80" cy="22" r="6" fill={COLOR.sun} />
      <text x="80" y="94" textAnchor="middle" fontSize="10" fill={COLOR.text2}>Earth, mid-latitudes</text>
      <line x1="170" y1="80" x2="310" y2="80" stroke={COLOR.text3} />
      <path d="M170,80 L186,71 L202,78 L226,66 L246,79 L270,72 L292,78 L310,74 L310,80Z" fill="#2a3040" stroke="#8b97b3" strokeWidth="0.8" />
      <line x1="170" y1="73" x2="310" y2="73" stroke={COLOR.sun} strokeOpacity="0.5" strokeDasharray="2 4" />
      <circle cx="214" cy="73" r="6" fill={COLOR.sun} />
      <text x="240" y="94" textAnchor="middle" fontSize="10" fill={COLOR.text2}>Lunar south pole</text>
    </svg>
  );
}

function LibrationFigure() {
  return (
    <svg viewBox="0 0 320 96" className="figure" role="img" aria-label="Seen from the pole, Earth traces a small loop that dips below the horizon for part of each month.">
      <path d="M0,62 L40,56 L70,64 L110,52 L150,63 L190,57 L230,66 L275,54 L320,61 L320,96 L0,96Z" fill="#2a3040" stroke="#8b97b3" strokeWidth="0.8" />
      <ellipse cx="160" cy="54" rx="34" ry="30" fill="none" stroke={COLOR.earth} strokeOpacity="0.6" strokeDasharray="3 4" />
      <circle cx="184" cy="33" r="9" fill={COLOR.earth} />
      <circle cx="142" cy="79" r="9" fill="none" stroke={COLOR.earth} strokeDasharray="3 3" />
      <text x="200" y="26" fontSize="10" fill={COLOR.text2}>link</text>
      <text x="158" y="92" fontSize="10" fill={COLOR.text2}>no link</text>
    </svg>
  );
}

function Guide() {
  return (
    <div className="prose">
      <h3>Why is the Sun so low?</h3>
      <p>
        The Moon's spin axis leans only 1.5° from upright, so it has almost no seasons. At the poles the Sun never rises overhead: it circles
        the horizon once a month, never more than a degree or two up. Whether a lander sees it depends on every hill in that direction.
      </p>
      <LowSunFigure />
      <h3>Why does Earth wobble?</h3>
      <p>
        The Moon keeps the same face towards Earth, so Earth hangs in nearly one place in the lunar sky. But the Moon's orbit is tilted and
        stretched, and from the surface Earth traces a slow loop about 7° wide every month. Near the pole that loop crosses the horizon, so
        a direct radio link comes and goes on a two-week rhythm.
      </p>
      <LibrationFigure />
      <h3>Why does a small move matter?</h3>
      <p>
        With the Sun one degree up, a ridge 200 m high and 10 km away covers it completely. Shift the landing point a few kilometres, or the
        date by a few days, and the power and communication windows can change from continuous to none. The date-shift chart under
        "What if" shows this for every landing date around your plan.
      </p>
      <h3>Reading the verdicts</h3>
      <p>
        Each site is checked against the mission limits. <strong>GO</strong> passes with room to spare, <strong>MARGINAL</strong> is within
        20% of a limit, and <strong>NO-GO</strong> breaks one. Limits marked ENG belong to engineering (battery, antenna, array). Limits
        marked OPS belong to operations. The "decided by" line names the limit that sets the result, so science and engineering argue about
        the same number.
      </p>
      <h3>Canada at the south pole</h3>
      <p>
        The Canadian Space Agency is preparing Canada's first lunar rover to explore the south polar region, search for water ice and
        operate through the cold of lunar night. Canada is also building Canadarm3 for the Gateway station as part of Artemis.{" "}
        <a href="https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/" target="_blank" rel="noreferrer">
          CSA Moon Exploration <ExternalLink size={11} />
        </a>
      </p>
      <h3>Keyboard</h3>
      <dl className="keys">
        <div><dt><kbd>Space</kbd></dt><dd>Play or pause</dd></div>
        <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Step one hour (hold Shift for six)</dd></div>
        <div><dt><kbd>Home</kbd></dt><dd>Back to landing</dd></div>
        <div><dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dt><dd>Focus a compared site</dd></div>
      </dl>
    </div>
  );
}

function Sources() {
  const ds = useStore((s) => s.dataset);
  if (!ds) return null;
  return (
    <div className="prose">
      <h3>What you are looking at</h3>
      <dl className="facts">
        <div><dt>Sun and Earth positions</dt><dd>{ds.ephemerisSource}</dd></div>
        <div><dt>Terrain horizons</dt><dd>{ds.terrainSource}</dd></div>
        {ds.rangeMs && (
          <div>
            <dt>Published range</dt>
            <dd>
              {fmtDate(ds.rangeMs[0])} to {fmtDate(ds.rangeMs[1])}, hourly. Dates outside it use an analytic model and are marked approximate.
            </dd>
          </div>
        )}
      </dl>

      {ds.validation && (
        <>
          <h3>Checked against JPL Horizons</h3>
          <p>
            The app computes directions from sub-Earth and sub-solar points, so any coordinate works offline. These are the largest
            differences from asking Horizons directly for each site ({ds.validation.cases[0].samples} hourly samples from {ds.validation.startUtc}).
          </p>
          <table className="mini">
            <thead>
              <tr><th scope="col">Site</th><th scope="col">Sun elev.</th><th scope="col">Sun az.</th><th scope="col">Earth elev.</th><th scope="col">Earth az.</th></tr>
            </thead>
            <tbody>
              {ds.validation.cases.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td className="num">{c.sunElMaxErrDeg.toFixed(4)}°</td>
                  <td className="num">{c.sunAzMaxErrDeg.toFixed(4)}°</td>
                  <td className="num">{c.earthElMaxErrDeg.toFixed(4)}°</td>
                  <td className="num">{c.earthAzMaxErrDeg.toFixed(4)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="prose__small">The Sun's disc is 0.53° wide, so these differences are under 2% of a solar diameter.</p>
        </>
      )}

      <h3>Method</h3>
      <ul>
        <li>The Moon has no atmosphere, so there is no refraction: the horizon is the terrain and the curve of the sphere, nothing else.</li>
        <li>Horizons are ray-cast over LOLA elevation out to 400 km in 0.25° azimuth steps from 2 m above the surface.</li>
        <li>The Sun counts as partly visible: the fraction of its disc above the ridge line sets the power, so output ramps instead of switching.</li>
        <li>Power is rated power × visible disc × cos(elevation) for a vertical tracking array, or × sin(elevation) for a flat panel.</li>
        <li>Earth is in view when its centre clears the terrain by the antenna mask angle.</li>
      </ul>

      <h3>Limits to keep in mind</h3>
      <ul>
        <li>Sites marked "approx." are region centres or planning estimates, not surveyed points. At the pole 1 km changes the answer.</li>
        <li>The polar DEM is 80 m per pixel. Boulders and small crater rims below that scale are not in the horizon.</li>
        <li>Custom coordinates use a coarser grid computed in the browser (400 m at the pole, about 7.6 km elsewhere).</li>
        <li>Science values are assigned by our team for the trade view. They are not NASA ratings.</li>
        <li>No thermal model, no relay satellites, no surface mobility.</li>
      </ul>

      <h3>Data and tools</h3>
      <ul className="resources">
        {RESOURCES.map((r) => (
          <li key={r.name}>
            <a href={r.url} target="_blank" rel="noreferrer">{r.name} <ExternalLink size={11} /></a>
            <span className="resources__org">{r.org}</span>
            <span>{r.use}</span>
          </li>
        ))}
      </ul>
      <p className="prose__small">Built for the NASA Space Apps Challenge 2026, Lunar Landing Site Navigator. Not an operational planning product.</p>
    </div>
  );
}

export function Drawer() {
  const live = useStore((s) => s.drawer);
  const setDrawer = useStore((s) => s.setDrawer);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // keep showing the last tab while the exit animation runs
  const last = useRef(live);
  if (live) last.current = live;
  const drawer = last.current ?? "guide";

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDrawer]);

  return (
    <>
      <motion.div className="scrim" onClick={() => setDrawer(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <motion.aside
        className="drawer" role="dialog" aria-label={drawer === "guide" ? "Guide" : "Data sources"}
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="drawer__head">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={drawer === "guide"} className={drawer === "guide" ? "is-on" : ""} onClick={() => setDrawer("guide")}>
              Guide
            </button>
            <button type="button" role="tab" aria-selected={drawer === "sources"} className={drawer === "sources" ? "is-on" : ""} onClick={() => setDrawer("sources")}>
              Data sources
            </button>
          </div>
          <button ref={closeBtn} type="button" className="iconbtn" onClick={() => setDrawer(null)} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="drawer__body">{drawer === "guide" ? <Guide /> : <Sources />}</div>
      </motion.aside>
    </>
  );
}
