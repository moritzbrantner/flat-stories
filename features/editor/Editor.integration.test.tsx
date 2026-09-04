import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";
import { flattenObjects } from "./sceneGraph";

describe("Editor", () => {
  it("renders every fixture node in the hierarchical layers panel", () => {
    render(<Editor initialDocument={fixtureDocument} />);
    for (const { node } of flattenObjects(fixtureDocument.objects)) {
      expect(screen.getByRole("button", { name: new RegExp(node.name, "i") })).toBeInTheDocument();
    }
  });

  it("creates and selects each supported drawable object", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const toolbar = within(screen.getByRole("complementary", { name: "Drawing tools" }));
    for (const label of ["Rectangle", "Circle", "Path", "Text"]) await user.click(toolbar.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: /^text Text$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(flattenObjects(fixtureDocument.objects).length + 4);
  });

  it("edits the selected layer name", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Headline");
    expect(screen.getByRole("button", { name: /Headline/i })).toBeInTheDocument();
  });

  it("exposes the rig and animation vertical slice", () => {
    render(<Editor initialDocument={fixtureDocument} />);
    expect(screen.getByRole("slider", { name: "Timeline time" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Animation clip" })).toHaveValue("hello");
    expect(screen.getAllByRole("button", { name: "Solve IK" })).toHaveLength(2);
    expect(screen.getByText(/bone:head/)).toBeInTheDocument();
  });
});
