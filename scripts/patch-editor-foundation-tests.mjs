import { readFileSync, writeFileSync } from "node:fs";

const path = "features/editor/Editor.integration.test.tsx";
let source = readFileSync(path, "utf8");

source = source.replace(
  'expect(screen.getByRole("button", { name: /Headline/i })).toBeInTheDocument();',
  'expect(screen.getByRole("button", { name: /^text Headline$/i })).toBeInTheDocument();',
);

source = source.replace(
  '    const file = new File([serializeProject(loadedDocument)], "loaded.flatstories.json", { type: "application/json" });\n\n    await user.upload',
  '    const projectSource = serializeProject(loadedDocument);\n    const file = new File([projectSource], "loaded.flatstories.json", { type: "application/json" });\n    if (typeof file.text !== "function") {\n      Object.defineProperty(file, "text", { configurable: true, value: async () => projectSource });\n    }\n\n    await user.upload',
);

writeFileSync(path, source);
