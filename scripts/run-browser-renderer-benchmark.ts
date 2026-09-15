import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const port = 4173;
const debuggingPort = 9222;
const origin = `http://127.0.0.1:${port}`;
const benchmarkUrl = `${origin}/renderer-lab?benchmark=1`;
const outputDir = resolve(process.env.RENDERER_BENCHMARK_OUTPUT ?? ".");
const htmlPath = resolve(outputDir, "browser-renderer-benchmark.html");
const jsonPath = resolve(outputDir, "browser-renderer-benchmark.json");
const chromeProfile = `/tmp/flat-stories-renderer-benchmark-${process.pid}`;

type CdpTarget = {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

type CdpMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

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

async function waitForPageTarget() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (response.ok) {
        const targets = await response.json() as CdpTarget[];
        const target = targets.find((candidate) => candidate.type === "page"
          && candidate.url.includes("/renderer-lab")
          && candidate.webSocketDebuggerUrl);
        if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome may still be opening the page.
    }
    await sleep(100);
  }
  throw new Error("Chrome DevTools target did not become ready.");
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = JSON.parse(event.data) as CdpMessage;
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message ?? "Chrome DevTools command failed."));
      else request.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const request of this.pending.values()) request.reject(new Error("Chrome DevTools connection closed."));
      this.pending.clear();
    });
  }

  static async connect(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", () => resolveOpen(), { once: true });
      socket.addEventListener("error", () => rejectOpen(new Error("Could not connect to Chrome DevTools.")), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<unknown>((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate<T>(client: CdpClient, expression: string): Promise<T> {
  const evaluation = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }) as { result?: { value?: T }; exceptionDetails?: unknown };
  if (evaluation.exceptionDetails) throw new Error(`Browser evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`);
  return evaluation.result?.value as T;
}

function validateBenchmark(parsed: Record<string, unknown>) {
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

async function waitForBenchmark(client: CdpClient) {
  let lastStatus: string | null = null;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    lastStatus = await evaluate<string | null>(client,
      `document.querySelector('[data-browser-benchmark-status]')?.getAttribute('data-browser-benchmark-status') ?? null`);
    if (lastStatus === "complete") {
      const json = await evaluate<string>(client,
        `document.getElementById('renderer-benchmark-json')?.textContent ?? ''`);
      if (!json) throw new Error("Completed browser benchmark did not expose JSON.");
      return validateBenchmark(JSON.parse(json) as Record<string, unknown>);
    }
    await sleep(100);
  }
  const diagnostic = await evaluate<string>(client,
    `JSON.stringify({status: document.querySelector('[data-browser-benchmark-status]')?.getAttribute('data-browser-benchmark-status') ?? null, canvasHeading: Array.from(document.querySelectorAll('h2')).map((node) => node.textContent).find((text) => text?.startsWith('Canvas /')) ?? null})`);
  throw new Error(`Browser renderer benchmark did not complete (last status ${String(lastStatus)}): ${diagnostic}`);
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

await mkdir(outputDir, { recursive: true });
await rm(chromeProfile, { recursive: true, force: true });
const chrome = browserExecutable();
const server = spawn("bun", ["scripts/serve-static-export.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "inherit", "inherit"],
});
let browser: ChildProcess | null = null;
let client: CdpClient | null = null;

try {
  await waitForServer();
  const browserVersion = execFileSync(chrome, ["--version"], { encoding: "utf8" }).trim();
  browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-logging",
    `--remote-debugging-port=${debuggingPort}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${chromeProfile}`,
    benchmarkUrl,
  ], { stdio: ["ignore", "ignore", "inherit"] });

  const webSocketUrl = await waitForPageTarget();
  client = await CdpClient.connect(webSocketUrl);
  const benchmark = await waitForBenchmark(client);
  const html = await evaluate<string>(client, "document.documentElement.outerHTML");
  await writeFile(htmlPath, html);

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
  client?.close();
  if (browser) await stopChild(browser);
  await stopChild(server);
  await rm(chromeProfile, { recursive: true, force: true });
}
