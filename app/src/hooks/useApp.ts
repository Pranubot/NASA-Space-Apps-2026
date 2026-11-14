// Small app-level hooks: element size, playback clock, URL sync, reduced motion.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { DAY, HOUR } from "../lib/time";
import { useStore, type ScenarioState } from "../state/store";
import { encodeScenario } from "../state/url";

export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Advances mission time while playing. Loops back to the landing at the end of the mission. */
export function usePlayback() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = useStore.getState();
      const end = s.startMs + s.days * DAY;
      let t = s.tMs + dt * s.speed * HOUR;
      if (t >= end) t = s.startMs + (t - end);
      useStore.setState({ tMs: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

export function scenarioOf(s: ScenarioState): ScenarioState {
  return {
    selectedIds: s.selectedIds, focusId: s.focusId, startMs: s.startMs, days: s.days, tMs: s.tMs,
    constraints: s.constraints, customSites: s.customSites, title: s.title, view: s.view, simple: s.simple,
  };
}

/** Keeps the address bar in step with the scenario (throttled; never while the intro is open). */
export function useUrlSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const write = () => {
      timer = undefined;
      const qs = encodeScenario(scenarioOf(useStore.getState()));
      window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
    };
    write();
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.selectedIds === prev.selectedIds && s.focusId === prev.focusId && s.startMs === prev.startMs &&
        s.days === prev.days && s.tMs === prev.tMs && s.constraints === prev.constraints &&
        s.customSites === prev.customSites && s.title === prev.title && s.view === prev.view && s.simple === prev.simple
      ) return;
      if (timer === undefined) timer = window.setTimeout(write, 400);
    });
    return () => {
      unsub();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled]);
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Tween a number towards a target (used to ease view ranges when the focused site changes). */
export function useTween(target: number, ms = 420): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cur.current = target;
      setValue(target);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 4);
      cur.current = from.current + (target - from.current) * e;
      setValue(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
