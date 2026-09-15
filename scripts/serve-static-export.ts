import { extname, normalize, resolve, sep } from "node:path";

const root = resolve("out");
const port = Number(process.env.PORT ?? "4173");

function safePath(relativePath: string) {
  const normalized = normalize(relativePath).replace(/^([/\\])+/, "");
  const absolute = resolve(root, normalized);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return null;
  return absolute;
}

async function resolveExportedFile(pathname: string) {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  const relative = decoded || "index.html";
  const candidates = extname(relative)
    ? [relative]
    : [`${relative}.html`, `${relative}/index.html`];

  for (const candidate of candidates) {
    const absolute = safePath(candidate);
    if (!absolute) continue;
    const file = Bun.file(absolute);
    if (await file.exists()) return file;
  }
  return null;
}

Bun.serve({
  port,
  async fetch(request) {
    const file = await resolveExportedFile(new URL(request.url).pathname);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file, {
      headers: file.type ? { "content-type": file.type } : undefined,
    });
  },
});

console.log(`Serving static export at http://127.0.0.1:${port}`);
