import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
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
    try {
      const executable = execFileSync("which", [candidate], { encoding: "utf8" }).trim();
      if (executable) return executable;
    } catch {
      // Try the next supported browser name.
    }
  }
  throw new Error("No supported Chrome/Chromium executable was found on PATH.");
}

function sleep(milliseconds: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${origin}/renderer-lab`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await sleep(100);
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

async function readStdout(child: ChildProcess) {
  const stdout = child.stdout;
  if (!stdout) return "";
  stdout.setEncoding("utf8");
  let output = "";
  for await (const chunk of stdout) output += chunk;
  return output;
}

async function exitCode(child: ChildProcess) {
  if (child.exitCode !== null) return child.exitCode;
  const [code] = await once(child, "exit");
  return typeof code === "number" ? code : 1;
}

await mkdir(outputDir, { recursive: true });
const chrome = browserExecutable();
const server = spawn("bun", ["scripts/serve-static-export.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
});

try {
  await waitForServer();
  const browserVersion = execFileSync(chrome, ["--version"], { encoding: "utf8" }).trim();
  const browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=20000",
    "--dump-dom",
    benchmarkUrl,
  ], { stdio: ["ignore", "pipe", "inherit"] });

  const html = await readStdout(browser);
  const browserExitCode = await exitCode(browser);
  await writeFile(htmlPath, html);
  if (browserExitCode !== 0) throw new Error(`Headless browser exited with code ${browserExitCode}.`);

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
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}
