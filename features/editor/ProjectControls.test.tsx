import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fixtureDocument } from "./fixture";
import { ProjectControls } from "./ProjectControls";
import { serializeProject } from "./projectPersistence";

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
    const file = new File([source], "loaded.flatstories.json", { type: "application/json" });

    await user.upload(screen.getByLabelText("Load project file"), file);

    expect(onLoad).toHaveBeenCalledOnce();
    expect(onLoad.mock.calls[0][0].name).toBe("Loaded study");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports validation errors without replacing the current project", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<ProjectControls document={fixtureDocument} onLoad={onLoad} />);
    const file = new File(["{}"], "invalid.flatstories.json", { type: "application/json" });

    await user.upload(screen.getByLabelText("Load project file"), file);

    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/project\.format/);
  });
});
