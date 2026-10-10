import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";

const downloads = vi.hoisted(() => [] as unknown[]);
vi.mock("@moenarch/editor-core/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@moenarch/editor-core/browser")>()),
  downloadEditorJson: (value: unknown) => {
    downloads.push(structuredClone(value));
  },
}));

async function savedProject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Save project" }));
  return JSON.stringify(downloads.at(-1));
}

const inspector = () => within(screen.getByRole("complementary", { name: "Inspector" }));

function pressed() {
  return inspector()
    .getAllByRole("button", { pressed: true })
    .map((button) => button.getAttribute("aria-label"));
}

describe("layout arrow shortcuts with focus in the layer tree", () => {
  it("leave arrow combinations to the tree instead of aligning the previous selection", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    await user.click(inspector().getByRole("button", { name: "path Ground" }));
    await user.keyboard("{Shift>}");
    await user.click(inspector().getByRole("button", { name: "text Caption" }));
    await user.keyboard("{/Shift}");
    const before = await savedProject(user);
    expect(pressed()).toEqual(["path Ground", "text Caption"]);

    // Focus goes back to a layer label, inside the tree.
    inspector().getByRole("button", { name: "text Caption" }).focus();
    expect(document.activeElement?.closest('[role="tree"]')).not.toBeNull();
    await user.keyboard("{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}");
    await user.keyboard("{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}");

    // No layout command changed the authored document.
    expect(await savedProject(user)).toBe(before);
  });

  it("still runs letter shortcuts from the layer tree", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    await user.click(inspector().getByRole("button", { name: "text Caption" }));
    expect(document.activeElement?.closest('[role="tree"]')).not.toBeNull();
    await user.keyboard("{Control>}d{/Control}");
    expect(inspector().getByRole("button", { name: "text Caption Copy" })).toBeInTheDocument();
  });
});
