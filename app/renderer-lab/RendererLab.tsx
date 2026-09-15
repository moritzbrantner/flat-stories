"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { sampleAnimation } from "@/features/editor/animation";
import { fixtureDocument } from "@/features/editor/fixture";
import { createRendererBenchmarkDocument } from "@/features/editor/rendering/benchmarkFixture";
import { CanvasScene, drawDocumentToCanvas } from "@/features/editor/rendering/CanvasScene";
import { SvgScene } from "@/features/editor/rendering/SvgScene";
import { loadBrowserWasmTransformKernel, referenceTransformKernel, type TransformKernel } from "@/features/editor/rendering/transformKernel";

type BrowserBenchmark = {
  svgDomMs: number;
  canvasMs: number;
  speedup: number;
  frames: number;
  copies: number;
  backend: TransformKernel["name"];
};

export function RendererLab() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [kernel, setKernel] = useState<TransformKernel>(referenceTransformKernel);
  const [benchmark, setBenchmark] = useState<BrowserBenchmark | null>(null);
  const clip = fixtureDocument.animations[0];
  const displayDocument = useMemo(() => sampleAnimation(fixtureDocument, clip.id, time), [clip.id, time]);

  useEffect(() => {
    let active = true;
    loadBrowserWasmTransformKernel().then((loaded) => { if (active) setKernel(loaded); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      setTime((current) => (current + delta) % clip.duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clip.duration, playing]);

  function runBenchmark() {
    const copies = 36;
    const frames = 60;
    const workload = createRendererBenchmarkDocument(fixtureDocument, copies);
    const sampled = Array.from({ length: frames }, (_, index) => sampleAnimation(workload, clip.id, index / frames * clip.duration));
    const host = document.createElement("div");
    const svgHost = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.style.position = "fixed";
    host.style.left = "-20000px";
    host.style.top = "0";
    host.append(svgHost, canvas);
    document.body.append(host);
    const root = createRoot(svgHost);

    try {
      flushSync(() => root.render(<SvgScene document={sampled[0]} />));
      drawDocumentToCanvas(canvas, sampled[0], kernel);

      const svgStart = performance.now();
      for (const documentFrame of sampled) {
        flushSync(() => root.render(<SvgScene document={documentFrame} />));
        svgHost.querySelector("svg")?.getBBox();
      }
      const svgDomMs = performance.now() - svgStart;

      const canvasStart = performance.now();
      for (const documentFrame of sampled) drawDocumentToCanvas(canvas, documentFrame, kernel);
      const canvasMs = performance.now() - canvasStart;

      setBenchmark({
        svgDomMs,
        canvasMs,
        speedup: svgDomMs / canvasMs,
        frames,
        copies,
        backend: kernel.name,
      });
    } finally {
      root.unmount();
      host.remove();
    }
  }

  const sceneStyle = { width: "100%", height: "auto", display: "block", background: "white" } as const;

  return <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <header style={{ display: "flex", gap: 16, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Renderer lab</h1>
        <p style={{ marginTop: 0 }}>SVG DOM is the semantic reference. Canvas 2D consumes the same scene through the {kernel.name === "rust-wasm" ? "Rust/WASM" : "TypeScript fallback"} transform kernel.</p>
      </div>
      <a href="../">Back to editor</a>
    </header>

    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <button type="button" onClick={() => setPlaying((current) => !current)}>{playing ? "Pause" : "Play"}</button>
      <input aria-label="Renderer lab time" type="range" min={0} max={clip.duration} step={0.01} value={time}
        onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} />
      <output>{time.toFixed(2)}s / {clip.duration.toFixed(2)}s</output>
    </div>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
      <article>
        <h2>SVG DOM reference</h2>
        <SvgScene document={displayDocument} style={sceneStyle} />
      </article>
      <article>
        <h2>Canvas / {kernel.name === "rust-wasm" ? "Rust WASM" : "JS fallback"}</h2>
        <CanvasScene document={displayDocument} kernel={kernel} style={sceneStyle} />
      </article>
    </section>

    <section style={{ marginTop: 28 }}>
      <h2>Representative browser benchmark</h2>
      <p>Updates 36 copies of the character across 60 pre-sampled animation frames. SVG uses React DOM updates plus an SVG geometry flush; Canvas uses the selected transform kernel and Canvas 2D draw path. Results are evidence, not pass/fail thresholds.</p>
      <button type="button" onClick={runBenchmark}>Run benchmark</button>
      {benchmark ? <p>
        SVG DOM: {benchmark.svgDomMs.toFixed(1)} ms · Canvas/{benchmark.backend}: {benchmark.canvasMs.toFixed(1)} ms · ratio: {benchmark.speedup.toFixed(2)}× over this run.
      </p> : null}
    </section>
  </main>;
}
