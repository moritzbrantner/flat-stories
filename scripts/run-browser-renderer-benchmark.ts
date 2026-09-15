import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const benchmarkUrl = `${origin}/renderer-lab?benchmark=1`;
const outputDir = resolve(process.env.RENDERER_BENCHMARK_OUTPUT ?? ".");
const htmlPath = resolve(outputDir, "browser-renderer-benchmark.html");
const jsonPath = resolve(outputDir, "browser-renderer-benchmark.json");

function browserExecutable() {
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const executable = Bun.which(candidate);
    if (executable) return executable;
  }
  throw new Error("No supported Chrome/Chromium executable was found on PATH.");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${origin}/renderer-lab`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await Bun.sleep(100);
  }
  throw new Error("Static export server did not become ready.");
}

function decodeHtmlText(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function extractBenchmark(html: string) {
  const match = html.match(/<pre[^>]*\bid="renderer-benchmark-json"[^>]*>([\s\S]*?)<\/pre>/);
  if (!match) throw new Error("Headless browser did not emit renderer benchmark JSON.");
  const parsed = JSON.parse(decodeHtmlText(match[1])) as Record<string, unknown>;
  const numericFields = ["svgDomMs", "canvasTotalMs", "framePreparationMs", "canvasDrawMs", "speedup"];
  for (const field of numericFields) {
    const value = parsed[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Renderer benchmark emitted invalid ${field}: ${String(value)}`);
    }
  }
  if (parsed.backend !== "rust-wasm") {
    throw new Error(`Browser benchmark expected the Rust/WASM backend but used ${String(parsed.backend)}.`);
  }
  if (parsed.frames !== 60 || parsed.copies !== 36) {
    throw new Error(`Browser benchmark workload drifted: ${String(parsed.copies)} copies / ${String(parsed.frames)} frames.`);
  }
  return parsed;
}

await mkdir(outputDir, { recursive: true });
const chrome = browserExecutable();
const server = Bun.spawn(["bun", "scripts/serve-static-export.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdout: "inherit",
  stderr: "inherit",
});

try {
  await waitForServer();

  const versionProcess = Bun.spawn([chrome, "--version"], { stdout: "pipe", stderr: "pipe" });
  const browserVersion = (await new Response(versionProcess.stdout).text()).trim();
  const versionExitCode = await versionProcess.exited;
  if (versionExitCode !== 0) throw new Error("Could not determine browser version.");

  const browser = Bun.spawn([
    chrome,
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=20000",
    "--dump-dom",
    benchmarkUrl,
  ], { stdout: "pipe", stderr: "inherit" });

  const html = await new Response(browser.stdout).text();
  const exitCode = await browser.exited;
  await writeFile(htmlPath, html);
  if (exitCode !== 0) throw new Error(`Headless browser exited with code ${exitCode}.`);

  const benchmark = extractBenchmark(html);
  const artifact = {
    schemaVersion: 1,
    browserVersion,
    workloadUrl: benchmarkUrl,
    benchmark,
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(jsonPath, serialized);
  process.stdout.write(serialized);
} finally {
  server.kill();
  await server.exited;
}
