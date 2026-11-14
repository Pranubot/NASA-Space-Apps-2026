// Opening sequence: the Moon lit from the real Sun direction at the scenario time, the camera
// dropping from the Earth-facing side to the south pole where the candidate sites sit.
// Skippable at any moment (button, Enter, Escape) and bypassed entirely by shared links.

import { useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Site } from "../data/types";
import { rad } from "../lib/astro";
import { COLOR } from "../lib/theme";
import { usePrefersReducedMotion } from "../hooks/useApp";
import { findSite, useStore } from "../state/store";

const DATA = `${import.meta.env.BASE_URL}data/`;
const DURATION = 9;

/** Matches three's sphere UV mapping for an equirectangular map centred on longitude 0. */
const onGlobe = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(Math.cos(rad(lat)) * Math.cos(rad(lon)), Math.sin(rad(lat)), -Math.cos(rad(lat)) * Math.sin(rad(lon))).multiplyScalar(r);

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function Globe({ sunLat, sunLon, sites, still }: { sunLat: number; sunLon: number; sites: Site[]; still: boolean }) {
  const tex = useTexture(`${DATA}textures/moon_2k.jpg`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const t = useRef(still ? DURATION : 0);
  const pins = useRef<THREE.Group>(null);
  const light = useMemo(() => onGlobe(sunLat, sunLon, 50), [sunLat, sunLon]);

  useFrame(({ camera }, dt) => {
    t.current += Math.min(dt, 0.05);
    const k = ease(Math.min(1, t.current / DURATION));
    const drift = Math.max(0, t.current - DURATION) * 0.6;
    const lat = 10 - 82 * k;
    const lon = 30 - 30 * k + drift;
    const dist = 4.4 - 1.5 * k;
    camera.position.copy(onGlobe(lat, lon, dist));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, -0.3 * k, 0);
    if (pins.current) {
      const a = THREE.MathUtils.clamp((t.current - DURATION * 0.62) / 1.4, 0, 1);
      pins.current.children.forEach((c, i) => {
        const s = (0.6 + 0.4 * Math.sin(t.current * 2.2 + i)) * a;
        (c.children[1] as THREE.Mesh).scale.setScalar(1 + s * 0.9);
        c.children.forEach((m) => (((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = a * (m === c.children[1] ? 0.55 - 0.35 * s : 1)));
      });
    }
  });

  return (
    <>
      <directionalLight position={light} intensity={3.4} />
      <ambientLight intensity={0.018} />
      <mesh>
        <sphereGeometry args={[1, 128, 96]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} />
      </mesh>
      <group ref={pins}>
        {sites.map((s) => {
          const p = onGlobe(s.lat, s.lon, 1.004);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.clone().normalize());
          return (
            <group key={s.id} position={p} quaternion={q}>
              <mesh>
                <circleGeometry args={[0.0045, 20]} />
                <meshBasicMaterial color={COLOR.both} transparent opacity={0} depthTest={false} />
              </mesh>
              <mesh>
                <ringGeometry args={[0.009, 0.0105, 32]} />
                <meshBasicMaterial color={COLOR.both} transparent opacity={0} depthTest={false} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
      </group>
    </>
  );
}

function StarField() {
  const geo = useMemo(() => {
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pts = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pts.set([r * Math.cos(a) * 60, u * 60, r * Math.sin(a) * 60], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.11} color="#cfd9f0" sizeAttenuation transparent opacity={0.75} />
    </points>
  );
}

const LINES = [
  "At the Moon's south pole the Sun never climbs more than about a degree and a half above the horizon.",
  "A ridge ten kilometres away can switch a lander's power off. A two-week slip can put Earth out of sight.",
  "Pick a site and a date, and see the sky you would get.",
];

export default function Intro() {
  const close = useStore((s) => s.closeIntro);
  const startTour = useStore((s) => s.startTour);
  const ds = useStore((s) => s.dataset);
  const tMs = useStore((s) => s.tMs);
  const selected = useStore((s) => s.selectedIds);
  const customSites = useStore((s) => s.customSites);
  const reduced = usePrefersReducedMotion();
  const btn = useRef<HTMLButtonElement>(null);

  const sub = useMemo(() => ds?.subpoints(tMs).sp, [ds, tMs]);
  const sites = useMemo(
    () => selected.map((id) => findSite({ dataset: ds, customSites }, id)).filter((s): s is Site => !!s),
    [selected, ds, customSites],
  );

  useEffect(() => {
    btn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <motion.div
      className="intro" role="dialog" aria-modal="true" aria-label="Lunar Landing Site Navigator introduction"
      initial={{ opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.08, filter: "blur(14px)" }}
      transition={{ duration: reduced ? 0.2 : 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      <Canvas className="intro__canvas" camera={{ fov: 32, near: 0.05, far: 200, position: [3.4, 0.4, 0.8] }} dpr={[1, 2]}>
        <color attach="background" args={["#020409"]} />
        <StarField />
        <Suspense fallback={null}>
          {sub && <Globe sunLat={sub.sLat} sunLon={sub.sLon} sites={sites} still={reduced} />}
        </Suspense>
      </Canvas>
      <div className="intro__shade" />
      <div className="intro__copy">
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}>
          Lunar Landing Site Navigator
        </motion.h1>
        <div className="intro__lines">
          {LINES.map((line, i) => (
            <motion.p
              key={line} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: reduced ? 0 : 1.1 + i * 2.1, ease: [0.16, 1, 0.3, 1] }}
            >
              {line}
            </motion.p>
          ))}
        </div>
        <motion.div className="intro__actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }}>
          <button ref={btn} type="button" className="btn btn--primary btn--large" onClick={close}>
            Open the planner <ArrowRight size={17} />
          </button>
          <span className="intro__hint">or press Enter</span>
          <button type="button" className="btn btn--large" onClick={startTour}>Take the tour</button>
        </motion.div>
      </div>
      <p className="intro__credit">Imagery: NASA SVS, LROC · Positions: JPL Horizons · Terrain: LOLA</p>
    </motion.div>
  );
}
