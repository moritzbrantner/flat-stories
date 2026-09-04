import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import { parseProject, ProjectFormatError, serializeProject } from "./projectPersistence";

describe("project persistence", () => {
  it("round-trips the complete canonical document without semantic loss", () => {
    const serialized = serializeProject(fixtureDocument);
    expect(parseProject(serialized)).toEqual(fixtureDocument);
  });

  it("serializes deterministically with a versioned envelope", () => {
    const first = serializeProject(fixtureDocument);
    const reordered = {
      animations: fixtureDocument.animations,
      width: fixtureDocument.width,
      objects: fixtureDocument.objects,
      id: fixtureDocument.id,
      height: fixtureDocument.height,
      name: fixtureDocument.name,
      rig: fixtureDocument.rig,
    };
    const second = serializeProject(reordered);

    expect(second).toBe(first);
    expect(first.startsWith('{\n  "format": "flat-stories",\n  "version": 1,\n  "document": {')).toBe(true);
    expect(first.endsWith("\n")).toBe(true);
  });

  it("rejects malformed JSON and unsupported envelopes explicitly", () => {
    expect(() => parseProject("{")) .toThrow(ProjectFormatError);
    expect(() => parseProject(JSON.stringify({ format: "other", version: 1, document: fixtureDocument }))).toThrow(/project\.format/);
    expect(() => parseProject(JSON.stringify({ format: "flat-stories", version: 2, document: fixtureDocument }))).toThrow(/unsupported project version/);
  });

  it("rejects invalid or unknown version-one model fields", () => {
    const wrongWidth = JSON.stringify({ format: "flat-stories", version: 1, document: { ...fixtureDocument, width: "900" } });
    expect(() => parseProject(wrongWidth)).toThrow(/project\.document\.width/);

    const unknownField = JSON.stringify({ format: "flat-stories", version: 1, document: { ...fixtureDocument, futureField: true } });
    expect(() => parseProject(unknownField)).toThrow(/unknown field for project version 1/);
  });

  it("rejects unsupported scene vocabulary and duplicate stable node ids", () => {
    const unsupported = structuredClone(fixtureDocument) as unknown as { objects: Array<Record<string, unknown>> };
    unsupported.objects[0].kind = "polygon";
    expect(() => parseProject(JSON.stringify({ format: "flat-stories", version: 1, document: unsupported }))).toThrow(/unsupported node kind/);

    const duplicate = structuredClone(fixtureDocument);
    duplicate.objects[1].id = duplicate.objects[0].id;
    expect(() => parseProject(JSON.stringify({ format: "flat-stories", version: 1, document: duplicate }))).toThrow(/duplicate scene node id/);
  });

  it("rejects non-finite authored data before JSON can coerce it", () => {
    const invalid = { ...fixtureDocument, width: Number.POSITIVE_INFINITY };
    expect(() => serializeProject(invalid)).toThrow(/expected finite number/);
  });
});
