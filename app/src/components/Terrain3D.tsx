// 3D terrain around the site, lit by the Sun at the current time.
//
// Shadow maps break down when the light is one degree above the horizon, so shadows are
// ray-marched in the fragment shader through the LOLA height texture instead. The patch has the
// Moon's curvature baked in (h - d^2 / 2R), which lets the shader march straight rays.

import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { TerrainPatch } from "../data/types";
import { R_MOON_KM, rad } from "../lib/astro";
import { COLOR, FONT_UI } from "../lib/theme";
import type { Instant } from "../lib/visibility";
import type { SiteData } from "../hooks/useSiteData";
import { useStore } from "../state/store";

const DATA = `${import.meta.env.BASE_URL}data/`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uH;      // metres relative to the site, curvature baked in
uniform float uN;          // texture size
uniform float uPixM;       // metres per texel
uniform vec3 uSun;         // unit vector to the Sun (x east, y up, z south)
uniform float uSunR;       // angular radius, rad
uniform vec3 uEarth;       // unit vector to Earth
uniform float uEarthshine; // 0..1
uniform float uExposure;
uniform float uContours;
uniform float uHoffset;    // site height above the reference sphere, for contour labels
varying vec2 vUv;

float H(vec2 uv) { return texture2D(uH, uv).r; }

void main() {
  float e = 1.0 / uN;
  float h0 = H(vUv);
  float hx = H(vUv + vec2(e, 0.0)) - H(vUv - vec2(e, 0.0));
  float hz = H(vUv + vec2(0.0, e)) - H(vUv - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx, 2.0 * uPixM, -hz));

  float cosEl = max(1e-4, length(uSun.xz));
  float tanEl = uSun.y / cosEl;
  vec2 dirUv = normalize(uSun.xz) / (uPixM * uN);

  float minClear = 1.0;
  float t = 0.0;
  float stepLen = uPixM * 0.7;
  for (int i = 0; i < 96; i++) {
    t += stepLen;
    stepLen *= 1.045;
    vec2 p = vUv + dirUv * t;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
    minClear = min(minClear, (h0 + 1.5 + t * tanEl - H(p)) / t);
  }
  float lit = smoothstep(-uSunR, uSunR, minClear);

  // regolith: slightly warm grey, a touch brighter on steep fresh slopes
  float slope = 1.0 - n.y;
  vec3 albedo = mix(vec3(0.44, 0.43, 0.41), vec3(0.60, 0.58, 0.55), smoothstep(0.02, 0.35, slope));
  float diff = max(0.0, dot(n, uSun)) * lit * uExposure;
  // filmic shoulder: sunward slopes stay textured instead of clipping to white
  vec3 col = albedo * (1.0 - exp(-diff * 1.1)) * 1.22;

  // earthshine and a whisper of fill so permanently dark ground keeps its shape
  float es = 0.5 + 0.5 * dot(n, uEarth);
  col += albedo * vec3(0.045, 0.075, 0.13) * uEarthshine * es;
  col += albedo * 0.016 * (0.4 + 0.6 * max(0.0, dot(n, normalize(vec3(-0.4, 0.8, 0.45)))));

  if (uContours > 0.5) {
    float hv = (h0 + uHoffset) / 250.0;
    float line = 1.0 - min(1.0, abs(fract(hv - 0.5) - 0.5) / fwidth(hv));
    col = mix(col, vec3(0.42, 0.56, 0.80), line * 0.22);
  }
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

/** x east, y up, z south */
function dirVec(azDeg: number, elDeg: number): THREE.Vector3 {
  const a = rad(azDeg), e = rad(elDeg);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function TerrainMesh({ patch, inst, exag, contours, siteElevationM }: { patch: TerrainPatch; inst: Instant; exag: number; contours: boolean; siteElevationM: number }) {
  const gl = useThree((s) => s.gl);
  const sizeKm = ((patch.n - 1) * patch.pixelM) / 1000;

  const { geometry, texture, centreH } = useMemo(() => {
    const n = patch.n;
    const half = (n - 1) / 2;
    const centre = patch.heights[Math.round(half) * n + Math.round(half)];
    // bake curvature: terrain d metres away sits d^2 / 2R below the local tangent plane
    const baked = new Float32Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const dx = (c - half) * patch.pixelM, dz = (r - half) * patch.pixelM;
        baked[r * n + c] = patch.heights[r * n + c] - centre - (dx * dx + dz * dz) / (2 * R_MOON_KM * 1000);
      }
    }
    const tex = new THREE.DataTexture(baked, n, n, THREE.RedFormat, THREE.FloatType);
    const linear = !!gl.getContext().getExtension("OES_texture_float_linear");
    tex.minFilter = tex.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    const seg = Math.min(n - 1, 383);
    const geo = new THREE.PlaneGeometry(sizeKm, sizeKm, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // after the rotation: x = east, z = south; uv.x runs west to east, uv.y flips so v = 0 is north
      const u = THREE.MathUtils.clamp(pos.getX(i) / sizeKm + 0.5, 0, 1), v = THREE.MathUtils.clamp(pos.getZ(i) / sizeKm + 0.5, 0, 1);
      uv.setXY(i, u, v);
      const fc = u * (n - 1), fr = v * (n - 1);
      const c0 = Math.max(0, Math.min(n - 2, Math.floor(fc))), r0 = Math.max(0, Math.min(n - 2, Math.floor(fr)));
      const tc = fc - c0, tr = fr - r0;
      const h =
        (baked[r0 * n + c0] * (1 - tc) + baked[r0 * n + c0 + 1] * tc) * (1 - tr) +
        (baked[(r0 + 1) * n + c0] * (1 - tc) + baked[(r0 + 1) * n + c0 + 1] * tc) * tr;
      pos.setY(i, h / 1000);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeBoundingSphere();
    return { geometry: geo, texture: tex, centreH: centre };
  }, [patch, gl, sizeKm]);

  useEffect(() => () => {
    geometry.dispose();
    texture.dispose();
  }, [geometry, texture]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uH: { value: texture }, uN: { value: patch.n }, uPixM: { value: patch.pixelM },
          uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunR: { value: 0.00465 },
          uEarth: { value: new THREE.Vector3(0, 1, 0) }, uEarthshine: { value: 0 },
          uExposure: { value: 4 }, uContours: { value: 0 }, uHoffset: { value: 0 },
        },
      }),
    [texture, patch],
  );
  useEffect(() => () => material.dispose(), [material]);

  const u = material.uniforms;
  u.uSun.value.copy(dirVec(inst.sunAz, inst.sunEl));
  u.uSunR.value = rad(inst.sunR);
  u.uEarth.value.copy(dirVec(inst.earthAz, inst.earthEl));
  u.uEarthshine.value = inst.earthEl > -2 ? 1 : 0;
  // expose for the grazing light: flat ground should not be black when the Sun is 1.5 degrees up
  u.uExposure.value = THREE.MathUtils.clamp(0.4 / Math.sin(rad(Math.max(inst.sunEl, 1.2))), 1.2, 7);
  u.uContours.value = contours ? 1 : 0;
  u.uHoffset.value = centreH || siteElevationM;

  return <mesh geometry={geometry} material={material} scale={[1, exag, 1]} />;
}

function Sky({ inst }: { inst: Instant }) {
  const earthTex = useTexture(`${DATA}textures/earth_1k.jpg`);
  earthTex.colorSpace = THREE.SRGBColorSpace;
  const D = 900;
  const sun = dirVec(inst.sunAz, inst.sunEl);
  const earth = dirVec(inst.earthAz, inst.earthEl);
  // drawn three times true angular size so they read at a glance; labelled as such in the legend
  const K = 3;
  return (
    <>
      <directionalLight position={sun.clone().multiplyScalar(D)} intensity={3.2} />
      <mesh position={sun.clone().multiplyScalar(D)}>
        <sphereGeometry args={[D * Math.tan(rad(inst.sunR)) * K, 24, 16]} />
        <meshBasicMaterial color="#fff6dc" toneMapped={false} />
      </mesh>
      <mesh position={earth.clone().multiplyScalar(D)}>
        <sphereGeometry args={[D * Math.tan(rad(inst.earthR)) * K, 48, 32]} />
        <meshStandardMaterial map={earthTex} roughness={1} metalness={0} />
      </mesh>
    </>
  );
}

/** Text label as a screen-sized sprite, so nothing mounts outside the WebGL canvas. */
function Label({ text, color, position, large = false }: { text: string; color: string; position: [number, number, number]; large?: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d")!;
    const font = `650 ${large ? 34 : 30}px ${FONT_UI}`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 20;
    cv.width = w;
    cv.height = 48;
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(text, 10, 25);
    ctx.fillStyle = color;
    ctx.fillText(text, 10, 25);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: w / 48 };
  }, [text, color, large]);
  useEffect(() => () => texture.dispose(), [texture]);
  const hgt = large ? 0.03 : 0.025;
  return (
    <sprite position={position} scale={[hgt * aspect, hgt, 1]} renderOrder={20}>
      <spriteMaterial map={texture} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  );
}

function Markers({ inst, name, sizeKm, close }: { inst: Instant; name: string; sizeKm: number; close: boolean }) {
  const len = sizeKm * 0.2;
  const line = (az: number, color: string) => {
    const a = rad(az);
    const pts = new Float32Array([0, 0.06, 0, Math.sin(a) * len, 0.06, -Math.cos(a) * len]);
    return (
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pts, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.9} depthTest={false} />
      </line>
    );
  };
  const tip = (az: number, label: string, color: string) => {
    const a = rad(az);
    return <Label text={label} color={color} position={[Math.sin(a) * len * 1.1, 0.25, -Math.cos(a) * len * 1.1]} />;
  };
  return (
    <group renderOrder={10}>
      {!close && (
        <>
          <mesh position={[0, sizeKm * 0.03, 0]}>
            <cylinderGeometry args={[sizeKm * 0.0012, sizeKm * 0.0012, sizeKm * 0.06, 6]} />
            <meshBasicMaterial color={COLOR.text} depthTest={false} transparent opacity={0.9} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[sizeKm * 0.012, sizeKm * 0.015, 48]} />
            <meshBasicMaterial color={COLOR.text} depthTest={false} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          <Label text={name} color={COLOR.text} position={[0, sizeKm * 0.085, 0]} large />
        </>
      )}
      {line(inst.sunAz, COLOR.sun)}
      {tip(inst.sunAz, "to Sun", COLOR.sun)}
      {line(inst.earthAz, COLOR.earth)}
      {tip(inst.earthAz, "to Earth", COLOR.earth)}
      {line(0, COLOR.text3)}
      {tip(0, "N", COLOR.text2)}
    </group>
  );
}

const BASE_FOV = 38;

/**
 * Keep the terrain the same size on screen when the view changes height (resizing the timeline,
 * a smaller window). A fixed vertical field of view would shrink everything as the view gets
 * shorter; instead the field of view follows the height, so the view just shows less or more.
 */
function ConstantScale() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const height = useThree((s) => s.size.height);
  const ref = useRef(0);
  useEffect(() => {
    if (height <= 0) return;
    if (!ref.current) ref.current = height;
    const half = Math.atan(Math.tan(rad(BASE_FOV / 2)) * (height / ref.current));
    camera.fov = THREE.MathUtils.clamp((half * 2 * 180) / Math.PI, 14, 80);
    camera.updateProjectionMatrix();
  }, [camera, height]);
  return null;
}

type CamMode = "orbit" | "lander";

function CameraRig({ mode, inst, sizeKm, nonce }: { mode: CamMode; inst: Instant; sizeKm: number; nonce: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; t: number } | null>(null);
  const sunAz = useRef(inst.sunAz);
  sunAz.current = inst.sunAz;

  useEffect(() => {
    if (mode === "lander") {
      const a = rad(sunAz.current);
      const fwd = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      // a mast camera a little behind and above the lander, looking along the Sun's azimuth
      goal.current = { pos: fwd.clone().multiplyScalar(-0.5).setY(0.16), target: fwd.clone().multiplyScalar(3).setY(0.22), t: 0 };
    } else {
      goal.current = { pos: new THREE.Vector3(sizeKm * 0.42, sizeKm * 0.36, sizeKm * 0.62), target: new THREE.Vector3(0, 0, 0), t: 0 };
    }
  }, [mode, sizeKm, nonce]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    g.t = Math.min(1, g.t + dt / 1.1);
    const k = 1 - Math.pow(1 - g.t, 3);
    camera.position.lerp(g.pos, k * 0.18 + 0.02);
    c.target.lerp(g.target, k * 0.18 + 0.02);
    c.update();
    if (g.t >= 1 && camera.position.distanceTo(g.pos) < sizeKm * 0.002) goal.current = null;
  });

  return (
    <OrbitControls
      ref={controls} enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2 - 0.01}
      minDistance={0.3} maxDistance={sizeKm * 2.2} onStart={() => (goal.current = null)}
    />
  );
}

export default function Terrain3D({ data, inst }: { data: SiteData; inst: Instant }) {
  const ds = useStore((s) => s.dataset);
  const [patch, setPatch] = useState<TerrainPatch | null>(null);
  const [exag, setExag] = useState(1);
  const [contours, setContours] = useState(false);
  const [mode, setMode] = useState<CamMode>("orbit");
  const [nonce, setNonce] = useState(0);
  const site = data.site;

  useEffect(() => {
    let live = true;
    setPatch(null);
    ds?.terrain(site).then((p) => live && setPatch(p));
    return () => {
      live = false;
    };
  }, [ds, site]);

  const sizeKm = patch ? ((patch.n - 1) * patch.pixelM) / 1000 : 80;

  return (
    <div className="t3d">
      {patch ? (
        <Canvas
          camera={{ position: [sizeKm * 0.42, sizeKm * 0.36, sizeKm * 0.62], fov: BASE_FOV, near: 0.02, far: 6000 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 2]}
        >
          <color attach="background" args={["#000000"]} />
          <ConstantScale />
          <Stars radius={2400} depth={300} count={2600} factor={22} saturation={0} fade speed={0} />
          <TerrainMesh patch={patch} inst={inst} exag={exag} contours={contours} siteElevationM={site.elevationM ?? 0} />
          <Suspense fallback={null}>
            <Sky inst={inst} />
          </Suspense>
          <Markers inst={inst} name={site.name} sizeKm={sizeKm} close={mode === "lander"} />
          <CameraRig mode={mode} inst={inst} sizeKm={sizeKm} nonce={nonce} />
        </Canvas>
      ) : (
        <div className="t3d__loading">Loading LOLA terrain for {site.name}…</div>
      )}
      <div className="t3d__tools">
        <div className="seg" role="group" aria-label="Camera">
          <button
            type="button" className={mode === "orbit" ? "is-on" : ""} aria-pressed={mode === "orbit"}
            onClick={() => {
              setMode("orbit");
              setNonce((n) => n + 1);
            }}
          >
            Overview
          </button>
          <button
            type="button" className={mode === "lander" ? "is-on" : ""} aria-pressed={mode === "lander"}
            onClick={() => {
              setMode("lander");
              setNonce((n) => n + 1);
            }}
          >
            Lander view
          </button>
        </div>
        <label className="field field--inline">
          <span>Relief</span>
          <select value={exag} onChange={(e) => setExag(Number(e.target.value))} aria-label="Vertical exaggeration">
            <option value={1}>True scale</option>
            <option value={2}>×2 vertical</option>
            <option value={3}>×3 vertical</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={contours} onChange={(e) => setContours(e.target.checked)} /> 250 m contours
        </label>
      </div>
      {patch && (
        <p className="t3d__caption">
          <span className="num">{Math.round(sizeKm)} km</span> square · {patch.source} · shadows ray-marched from the Sun at this instant · Sun and Earth drawn ×3 size
        </p>
      )}
    </div>
  );
}
