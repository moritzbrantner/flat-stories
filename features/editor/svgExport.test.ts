import { describe, expect, it } from "vitest";
import type { EditorObject } from "./model";
import { fixtureDocument } from "./fixture";
import { patchObject, patchObjectTransform } from "./sceneGraph";
import { exportDocumentToSvg } from "./svgExport";

describe("static SVG export", () => {
  it("exports the supported scene graph in deterministic layer order", () => {
    const first = exportDocumentToSvg(fixtureDocument);
    const second = exportDocumentToSvg(fixtureDocument);

    expect(second).toBe(first);
    expect(first).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">');
    expect(first).toContain("<title>Nova character study</title>");
    expect(first.indexOf('id="background"')).toBeLessThan(first.indexOf('id="ground"'));
    expect(first.indexOf('id="ground"')).toBeLessThan(first.indexOf('id="nova"'));
    expect(first).toContain('id="caption"');
    expect(first).toContain('font-size="28" font-weight="700" fill="#283241">NOVA / CHARACTER RIG</text>');
  });

  it("exports rig-attached artwork using the same world-pose transform semantics", () => {
    const svg = exportDocumentToSvg(fixtureDocument);
    expect(svg).toContain('<g transform="translate(450 410) rotate(-90)"><g id="torso"');
    expect(svg).toContain('stroke="#8b4b42" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"');
  });

  it("omits invisible nodes and escapes XML content", () => {
    const renamed = patchObject(fixtureDocument, "caption", {
      name: "Unused editor name",
      value: 'A&B <C> "D"',
    } as Partial<EditorObject>);
    const escaped = exportDocumentToSvg(renamed);
    expect(escaped).toContain('A&amp;B &lt;C&gt; &quot;D&quot;');

    const hidden = patchObject(renamed, "caption", { visible: false });
    expect(exportDocumentToSvg(hidden)).not.toContain('id="caption"');
  });

  it("does not leak editor-only metadata into the SVG", () => {
    const svg = exportDocumentToSvg(fixtureDocument);
    expect(svg).not.toContain("boneId");
    expect(svg).not.toContain("locked=");
    expect(svg).not.toContain("data-node-id");
  });

  it("rejects non-finite geometry instead of emitting invalid SVG", () => {
    const invalid = patchObjectTransform(fixtureDocument, "caption", { x: Number.POSITIVE_INFINITY });
    expect(() => exportDocumentToSvg(invalid)).toThrow(/non-finite SVG number/);
  });
});
