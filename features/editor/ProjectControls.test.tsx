import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fixtureDocument } from "./fixture";
import { ProjectControls } from "./ProjectControls";
import { serializeProject } from "./projectPersistence";

function textFile(source: string, name: string, type: string) {
  const file = new File([source], name, { type });
  if (typeof file.text !== "function") {
    Object.defineProperty(file, "text", {
      configurable: true,
      value: async () => source,
    });
  }
  return file;
}

function jsonFile(source: string, name: string) {
  return textFile(source, name, "application/json");
}

describe("project controls", () => {
  it("downloads the authored project with the project file extension", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:project");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    try {
      render(<ProjectControls document={fixtureDocument} onLoad={() => undefined} />);
      await user.click(screen.getByRole("button", { name: "Save project" }));

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      const anchor = click.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toBe("Nova character study.flatstories.json");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:project");
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("loads a validated project file through the callback", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<ProjectControls document={fixtureDocument} onLoad={onLoad} />);
    const source = serializeProject({ ...fixtureDocument, name: "Loaded study" });
    const file = jsonFile(source, "loaded.flatstories.json");

    await user.upload(screen.getByLabelText("Load project file"), file);

    expect(onLoad).toHaveBeenCalledOnce();
    expect(onLoad.mock.calls[0][0].name).toBe("Loaded study");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });


  it("imports supported SVG through the same document replacement callback", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<ProjectControls document={fixtureDocument} onLoad={onLoad} />);
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><title>SVG study</title><g id="badge" transform="translate(4 5)" opacity="0.8"><rect x="10" y="12" width="40" height="30" rx="5" fill="#ffcc00"/></g></svg>';
    const file = textFile(source, "badge.svg", "image/svg+xml");

    await user.upload(screen.getByLabelText("Import SVG file"), file);

    expect(onLoad).toHaveBeenCalledOnce();
    expect(onLoad.mock.calls[0][0]).toMatchObject({
      name: "SVG study",
      width: 120,
      height: 80,
      animations: [],
    });
    expect(onLoad.mock.calls[0][0].objects[0]).toMatchObject({
      id: "badge",
      kind: "rectangle",
      x: 10,
      y: 12,
      width: 40,
      height: 30,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports unsupported SVG features without replacing the current project", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<ProjectControls document={fixtureDocument} onLoad={onLoad} />);
    const file = textFile(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><ellipse cx="10" cy="10" rx="5" ry="4"/></svg>',
      "unsupported.svg",
      "image/svg+xml",
    );

    await user.upload(screen.getByLabelText("Import SVG file"), file);

    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/ellipse.*outside the supported SVG subset/);
  });

  it("reports validation errors without replacing the current project", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<ProjectControls document={fixtureDocument} onLoad={onLoad} />);
    const file = jsonFile("{}", "invalid.flatstories.json");

    await user.upload(screen.getByLabelText("Load project file"), file);

    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/project\.format/);
  });
});
