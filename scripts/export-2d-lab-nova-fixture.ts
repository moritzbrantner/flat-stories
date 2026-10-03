import { execFileSync } from "node:child_process";

import { create2dLabNovaFixture } from "./2d-lab-nova-fixture";

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

if (git("status", "--porcelain") !== "") {
  throw new Error("Refusing to export the 2d-lab Nova fixture from a dirty tree: its provenance would not match any commit");
}

process.stdout.write(
  `${JSON.stringify(create2dLabNovaFixture({ sourceRevision: git("rev-parse", "HEAD") }), null, 2)}\n`,
);
