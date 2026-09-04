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
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    for (const { node } of flattenObjects(fixtureDocument.objects)) {
      expect(inspector.getByRole("button", { name: `${node.kind} ${node.name}` })).toBeInTheDocument();
    }
  });

  it("creates, duplicates and selects supported drawable objects", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const toolbar = within(screen.getByRole("complementary", { name: "Drawing tools" }));
    for (const label of ["Rectangle", "Circle", "Path", "Text"]) await user.click(toolbar.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: /^text Text$/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(toolbar.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByRole("button", { name: /^text Text Copy$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(flattenObjects(fixtureDocument.objects).length + 5);
  });

  it("edits the selected layer name", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Headline");
    expect(screen.getByRole("button", { name: /Headline/i })).toBeInTheDocument();
  });

  it("enables alignment for compatible sibling selections", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    await user.click(inspector.getByRole("button", { name: "path Ground" }));
    await user.keyboard("{Shift>}");
    await user.click(inspector.getByRole("button", { name: "text Caption" }));
    await user.keyboard("{/Shift}");
    expect(inspector.getByRole("button", { name: "Align L" })).toBeEnabled();
    expect(inspector.getByRole("button", { name: "Dist H" })).toBeDisabled();
    await user.click(inspector.getByRole("button", { name: "Align L" }));
  });

  it("exposes direct vector-path authoring and transform handles for a selected path", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    await user.click(inspector.getByRole("button", { name: "path Ground" }));
    expect(screen.getByLabelText("Path point count")).toHaveTextContent("5");
    expect(screen.getAllByRole("button", { name: /Path anchor/ })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Rotate selection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resize SE" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add point" }));
    expect(screen.getByLabelText("Path point count")).toHaveTextContent("6");
  });

  it("exposes stroke width, caps and joins for drawable artwork", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    await user.click(inspector.getByRole("button", { name: "path Smile" }));
    expect(screen.getByLabelText("Stroke W")).toHaveValue(4);
    expect(screen.getByLabelText("Line cap")).toHaveValue("round");
    expect(screen.getByLabelText("Line join")).toHaveValue("round");
  });

  it("captures and reapplies named character poses", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const x = screen.getByLabelText("X");
    await user.clear(x);
    await user.type(x, "25");
    await user.type(screen.getByLabelText("Pose name"), "Caption offset");
    await user.click(screen.getByRole("button", { name: "Save pose" }));
    expect(screen.getByText("Caption offset")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("X"));
    await user.type(screen.getByLabelText("X"), "80");
    await user.click(screen.getByRole("button", { name: "Apply pose Caption offset" }));
    expect(screen.getByLabelText("X")).toHaveValue(25);
  });

  it("captures expressions from only the selected character layers", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    await user.click(inspector.getByRole("button", { name: "circle Eye L" }));

    await user.clear(screen.getByLabelText("Opacity"));
    await user.type(screen.getByLabelText("Opacity"), "0.25");
    await user.type(screen.getByLabelText("Expression name"), "Left blink");
    await user.click(screen.getByRole("button", { name: "Save expression" }));
    expect(screen.getByText("Left blink")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Opacity"));
    await user.type(screen.getByLabelText("Opacity"), "1");
    await user.click(screen.getByRole("button", { name: "Apply expression Left blink" }));
    expect(screen.getByLabelText("Opacity")).toHaveValue(0.25);
  });

  it("keeps grid snapping an explicit editor control", () => {
    render(<Editor initialDocument={fixtureDocument} />);
    expect(screen.getByRole("button", { name: "Snap 10" })).toHaveAttribute("aria-pressed", "true");
  });

  it("makes animation preview read-only and returns to editing in rest pose", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    const clip = screen.getByRole("combobox", { name: "Animation clip" });
    expect(clip).toHaveValue("");
    await user.selectOptions(clip, "hello");
    expect(screen.getByText(/bone:head/)).toBeInTheDocument();
    expect(screen.getByText(/Animation preview is read-only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save pose" })).toBeDisabled();
    await user.selectOptions(clip, "");
    expect(screen.queryByText(/Animation preview is read-only/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeEnabled();
  });
});
