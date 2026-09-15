"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { sampleAnimation } from "@/features/editor/animation";
import { fixtureDocument } from "@/features/editor/fixture";
import { createRendererBenchmarkDocument } from "@/features/editor/rendering/benchmarkFixture";
import { CanvasScene, drawCompositionToCanvas, drawDocumentToCanvas } from "@/features/editor/rendering/CanvasScene";
import { buildRenderComposition } from "@/features/editor/rendering/renderComposition";
import { SvgScene } from "@/features/editor/rendering/SvgScene";
import { loadBrowserWasmTransformKernel, referenceTransformKernel, type TransformKernel } from "@/features/editor/rendering/transformKernel";

type BrowserBenchmark = {
  svgDomMs: number;
  canvasTotalMs: number;
  framePreparationMs: number;
  canvasDrawMs: number;
  speedup: number;
  frames: number;
  copies: number;
  backend: TransformKernel["name"];
};

export function RendererLab() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [kernel, setKernel] = useState<TransformKernel>(referenceTransformKernel);
  const [kernelReady, setKernelReady] = useState(false);
  const [benchmark, setBenchmark] = useState<BrowserBenchmark | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clip = fixtureDocument.animations[0];
  const displayDocument = useMemo(() => sampleAnimation(fixtureDocument, clip.id, time), [clip.id, time]);

  useEffect(() => {
    let active = true;
    loadBrowserWasmTransformKernel()
      .then((loaded) => { if (active) setKernel(loaded); })
      .catch(() => undefined)
      .finally(() => { if (active) setKernelReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!kernelReady || new URLSearchParams(window.location.search).get("benchmark") !== "1") return;
    let benchmarkTimer = 0;
    const pauseTimer = window.setTimeout(() => {
      const playback = document.querySelector<HTMLButtonElement>("[data-toggle-renderer-playback]");
      if (playback?.textContent === "Pause") playback.click();
      benchmarkTimer = window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>("[data-run-renderer-benchmark]")?.click();
      }, 0);
    }, 0);
    return () => {
      window.clearTimeout(pauseTimer);
      window.clearTimeout(benchmarkTimer);
    };
  }, [kernelReady]);

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

      const preparationStart = performance.now();
      const prepared = sampled.map((documentFrame) => buildRenderComposition([
        { kind: "current", document: documentFrame, opacity: 1, hitTestable: true },
      ], kernel));
      const framePreparationMs = performance.now() - preparationStart;

      drawCompositionToCanvas(canvas, prepared[0]);
      const drawStart = performance.now();
      for (const composition of prepared) drawCompositionToCanvas(canvas, composition);
      const canvasDrawMs = performance.now() - drawStart;

      const canvasTotalStart = performance.now();
      for (const documentFrame of sampled) drawDocumentToCanvas(canvas, documentFrame, kernel);
      const canvasTotalMs = performance.now() - canvasTotalStart;

      setBenchmark({
        svgDomMs,
        canvasTotalMs,
        framePreparationMs,
        canvasDrawMs,
        speedup: svgDomMs / canvasTotalMs,
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
  const dominantCanvasStage = benchmark
    ? benchmark.canvasDrawMs >= benchmark.framePreparationMs ? "Canvas API drawing" : "frame preparation"
    : null;

  return <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <header style={{ display: "flex", gap: 16, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Renderer lab</h1>
        <p style={{ marginTop: 0 }}>SVG DOM is the semantic reference. Canvas 2D consumes the same scene through the {kernel.name === "rust-wasm" ? "Rust/WASM" : "TypeScript fallback"} transform kernel and uses that same render frame for hit testing.</p>
      </div>
      <a href="../">Back to editor</a>
    </header>

    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <button type="button" data-toggle-renderer-playback onClick={() => setPlaying((current) => !current)}>{playing ? "Pause" : "Play"}</button>
      <input aria-label="Renderer lab time" type="range" min={0} max={clip.duration} step={0.01} value={time}
        onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} />
      <output>{time.toFixed(2)}s / {clip.duration.toFixed(2)}s</output>
      <output aria-label="Canvas selection">Selected: {selectedId ?? "none"}</output>
      {selectedId ? <button type="button" onClick={() => setSelectedId(null)}>Clear selection</button> : null}
    </div>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
      <article>
        <h2>SVG DOM reference</h2>
        <SvgScene document={displayDocument} style={sceneStyle} />
      </article>
      <article>
        <h2>Canvas / {kernel.name === "rust-wasm" ? "Rust WASM" : "JS fallback"}</h2>
        <p>Click a visible shape to dogfood topmost-node hit testing and selection highlighting.</p>
        <CanvasScene
          document={displayDocument}
          kernel={kernel}
          selectedIds={selectedId ? [selectedId] : []}
          onNodePointerDown={(id) => setSelectedId(id)}
          style={{ ...sceneStyle, cursor: "pointer" }}
        />
      </article>
    </section>

    <section style={{ marginTop: 28 }} data-browser-benchmark-status={benchmark ? "complete" : kernelReady ? "ready" : "loading"}>
      <h2>Representative browser benchmark</h2>
      <p>Updates 36 copies of the character across 60 pre-sampled animation frames. Separate runs measure renderer-frame preparation, Canvas API drawing from already-prepared frames, the complete Canvas pass, and React/SVG DOM updates with a geometry flush. Results are evidence, not pass/fail thresholds.</p>
      <button type="button" data-run-renderer-benchmark onClick={runBenchmark} disabled={!kernelReady}>Run benchmark</button>
      {benchmark ? <table style={{ marginTop: 14, borderCollapse: "collapse" }}>
        <tbody>
          <tr><th style={{ textAlign: "left", paddingRight: 18 }}>SVG DOM total</th><td><output aria-label="SVG DOM benchmark">{benchmark.svgDomMs.toFixed(1)} ms</output></td></tr>
          <tr><th style={{ textAlign: "left", paddingRight: 18 }}>Canvas total</th><td><output aria-label="Canvas total benchmark">{benchmark.canvasTotalMs.toFixed(1)} ms</output></td></tr>
          <tr><th style={{ textAlign: "left", paddingRight: 18 }}>Frame preparation ({benchmark.backend})</th><td><output aria-label="Frame preparation benchmark">{benchmark.framePreparationMs.toFixed(1)} ms</output></td></tr>
          <tr><th style={{ textAlign: "left", paddingRight: 18 }}>Canvas API drawing</th><td><output aria-label="Canvas draw benchmark">{benchmark.canvasDrawMs.toFixed(1)} ms</output></td></tr>
          <tr><th style={{ textAlign: "left", paddingRight: 18 }}>SVG / Canvas ratio</th><td><output aria-label="Renderer speedup benchmark">{benchmark.speedup.toFixed(2)}×</output></td></tr>
          <tr><th style={{ textAlign: "left", paddingRight: 18 }}>Larger Canvas stage</th><td><output aria-label="Canvas bottleneck benchmark">{dominantCanvasStage}</output></td></tr>
        </tbody>
      </table> : null}
      {benchmark ? <p><small>Stage timings are independent loops over the same sampled frames, so preparation + drawing is diagnostic rather than an arithmetic decomposition of the total run.</small></p> : null}
      {benchmark ? <pre id="renderer-benchmark-json" hidden>{JSON.stringify(benchmark)}</pre> : null}
    </section>
  </main>;
}
