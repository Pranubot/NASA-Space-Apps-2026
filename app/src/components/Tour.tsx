// Guided tour: dims the screen around one panel at a time and explains it. Steps come from
// state/tour.ts; this file only draws the spotlight and the caption and moves between steps.
// The page stays clickable underneath, so the viewer can scrub or play mid-tour.

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../state/store";
import { TOUR_STEPS, tourState, type TourStep } from "../state/tour";

const CARD_W = 320;
const GAP = 12;

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** Where the caption goes: beside the spotlit panel, kept inside the window. */
function cardStyle(r: Box, step: TourStep): CSSProperties {
  const clampX = (x: number) => Math.min(Math.max(GAP, x), window.innerWidth - CARD_W - GAP);
  const top = Math.max(GAP, r.top);
  if (step.place === "right") return { left: clampX(r.right + GAP), top };
  if (step.place === "left") return { left: clampX(r.left - CARD_W - GAP), top };
  const left = clampX(step.align === "end" ? r.right - CARD_W : step.align === "center" ? r.left + (r.width - CARD_W) / 2 : r.left);
  return step.place === "above" ? { left, bottom: window.innerHeight - r.top + GAP } : { left, top: r.bottom + GAP };
}

export function Tour() {
  const i = useStore((s) => s.tourStep) ?? 0;
  const setStep = useStore((s) => s.setTourStep);
  const end = useStore((s) => s.endTour);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;
  const [box, setBox] = useState<Box | null>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  // put the app in the state this step talks about
  useEffect(() => {
    useStore.setState(tourState(i));
    nextBtn.current?.focus();
  }, [i]);

  // follow the spotlit panel as the layout settles or the window resizes
  useEffect(() => {
    const measure = () => {
      const r = document.querySelector(step.target)?.getBoundingClientRect();
      setBox(r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null);
    };
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    const target = document.querySelector(step.target);
    if (target) ro.observe(target);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [step.target, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight") (last ? end : () => setStep(i + 1))();
      else if (e.key === "ArrowLeft" && i > 0) setStep(i - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, last, end, setStep]);

  return (
    <>
      {box && (
        <div
          className="tour__spot" aria-hidden
          style={{ left: box.left - 3, top: box.top - 3, width: box.width + 6, height: box.height + 6 }}
        />
      )}
      <div
        className="tour__card" role="dialog" aria-label={`Tour, step ${i + 1} of ${TOUR_STEPS.length}`}
        // no panel found (it should not happen): fall back to the middle of the window
        style={box ? cardStyle(box, step) : { left: (window.innerWidth - CARD_W) / 2, top: window.innerHeight / 3 }}
      >
        <span className="tour__count num">{i + 1} / {TOUR_STEPS.length}</span>
        <h2>{step.title}</h2>
        <p aria-live="polite">{step.text}</p>
        <div className="tour__nav">
          <button type="button" className="textbtn" onClick={end} title="Exit (Esc)">Exit tour</button>
          <button type="button" className="btn" onClick={() => setStep(i - 1)} disabled={i === 0} title="Back (←)">
            <ArrowLeft size={14} /> Back
          </button>
          <button ref={nextBtn} type="button" className="btn btn--primary" onClick={last ? end : () => setStep(i + 1)} title="Next (→)">
            {last ? "Finish" : "Next"} {!last && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}
