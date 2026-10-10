import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";

// The public "Save project" button hands the serialized project to downloadEditorJson.
// Capturing that envelope lets the tests compare the authored document a button produces
// with the document its keyboard shortcut produces, without reaching into editor internals.
const downloads = vi.hoisted(() => [] as unknown[]);
vi.mock("@moenarch/editor-core/browser", async (importOriginal) => {
  const original = await importOriginal<typeof import("@moenarch/editor-core/browser")>();
  return {
    ...original,
    downloadEditorJson: (value: unknown) => {
      downloads.push(structuredClone(value));
    },
  };
});

beforeEach(() => {
  downloads.length = 0;
});

afterEach(cleanup);

type Selection = "single-caption" | "single-ground" | "pair" | "triple";

type Outcome = { project: string; layers: string[]; selected: string[] };

const inspector = () => within(screen.getByRole("complementary", { name: "Inspector" }));
const toolbar = () => within(screen.getByRole("complementary", { name: "Drawing tools" }));

async function saveProject(user: UserEvent) {
  const before = downloads.length;
  await user.click(screen.getByRole("button", { name: "Save project" }));
  expect(downloads).toHaveLength(before + 1);
  return JSON.stringify(downloads.at(-1));
}

/** Layer-tree labels in rendered order plus the ones currently pressed (selected). */
function layerState() {
  const labels = inspector()
    .getAllByRole("treeitem")
    .map((item) => item.querySelector("button[aria-pressed]"))
    .filter((button): button is HTMLButtonElement => button !== null);
  return {
    layers: labels.map((button) => button.getAttribute("aria-label") ?? ""),
    selected: labels.filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.getAttribute("aria-label") ?? ""),
  };
}

async function snapshot(user: UserEvent): Promise<Outcome> {
  const project = await saveProject(user);
  return { project, ...layerState() };
}

async function setNumber(user: UserEvent, label: string, value: number) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, String(value));
}

async function addPositioned(user: UserEvent, tool: "Rectangle" | "Circle", x: number, y: number) {
  await user.click(toolbar().getByRole("button", { name: tool }));
  await setNumber(user, "X", x);
  await setNumber(user, "Y", y);
}

async function selectLayers(user: UserEvent, names: string[]) {
  const [first, ...rest] = names;
  await user.click(inspector().getByRole("button", { name: first }));
  if (rest.length > 0) {
    await user.keyboard("{Shift>}");
    for (const name of rest) await user.click(inspector().getByRole("button", { name }));
    await user.keyboard("{/Shift}");
  }
}

/**
 * Builds a selection through the public UI only:
 * - single-caption: the initially selected root Caption text,
 * - single-ground: the Ground path (can move both forward and backward),
 * - pair: Ground + Caption (compatible siblings, align enabled, distribute disabled),
 * - triple: Caption + two authored shapes at distinct positions (distribute enabled).
 */
async function arrange(user: UserEvent, selection: Selection) {
  if (selection === "single-caption") {
    await selectLayers(user, ["text Caption"]);
  } else if (selection === "single-ground") {
    await selectLayers(user, ["path Ground"]);
  } else if (selection === "pair") {
    await selectLayers(user, ["path Ground", "text Caption"]);
  } else {
    await addPositioned(user, "Rectangle", 300, 180);
    await addPositioned(user, "Circle", 760, 420);
    await selectLayers(user, ["text Caption", "rectangle Rectangle", "circle Circle"]);
  }
  // Fire shortcuts from a neutral, non-editable target (as after clicking an empty area).
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement).toBe(document.body);
}

type Case = {
  command: string;
  button: string;
  /** Documented shortcut from the issue table. */
  shortcut: string;
  /** user-event key sequence that produces the shortcut, with Control as Mod. */
  keys: string;
  selection: Selection;
};

const cases: Case[] = [
  { command: "duplicate", button: "Duplicate", shortcut: "Mod+D", keys: "{Control>}d{/Control}", selection: "single-caption" },
  { command: "bring forward", button: "Forward", shortcut: "Mod+]", keys: "{Control>}]{/Control}", selection: "single-ground" },
  { command: "send backward", button: "Backward", shortcut: "Mod+[", keys: "{Control>}[[{/Control}", selection: "single-ground" },
  { command: "align left", button: "Align L", shortcut: "Alt+Shift+ArrowLeft", keys: "{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}", selection: "pair" },
  { command: "align right", button: "Align R", shortcut: "Alt+Shift+ArrowRight", keys: "{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}", selection: "pair" },
  { command: "align top", button: "Align T", shortcut: "Alt+Shift+ArrowUp", keys: "{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}", selection: "pair" },
  { command: "align bottom", button: "Align B", shortcut: "Alt+Shift+ArrowDown", keys: "{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}", selection: "pair" },
  { command: "align horizontal centers", button: "Align H", shortcut: "Shift+H", keys: "{Shift>}H{/Shift}", selection: "pair" },
  { command: "align vertical centers", button: "Align V", shortcut: "Shift+V", keys: "{Shift>}V{/Shift}", selection: "pair" },
  { command: "distribute horizontally", button: "Dist H", shortcut: "Mod+Shift+ArrowRight", keys: "{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}", selection: "triple" },
  { command: "distribute vertically", button: "Dist V", shortcut: "Mod+Shift+ArrowDown", keys: "{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}", selection: "triple" },
];

async function runWithButton({ button, selection }: Case) {
  const user = userEvent.setup();
  render(<Editor initialDocument={fixtureDocument} />);
  await arrange(user, selection);
  const before = await snapshot(user);
  const target = inspector().getByRole("button", { name: button });
  expect(target).toBeEnabled();
  await user.click(target);
  const after = await snapshot(user);
  cleanup();
  return { before, after };
}

async function runWithShortcut({ keys, selection }: Case) {
  const user = userEvent.setup();
  render(<Editor initialDocument={fixtureDocument} />);
  await arrange(user, selection);
  const before = await snapshot(user);
  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard(keys);
  const after = await snapshot(user);
  cleanup();
  return { before, after };
}

/** Accepts the documented "Mod+X" spelling or the ARIA "Control+X" / "Meta+X" spelling. */
function shortcutSpellings(shortcut: string) {
  return [shortcut, shortcut.replace("Mod+", "Control+"), shortcut.replace("Mod+", "Meta+")].map((value) => value.toLowerCase());
}

function expectExposesShortcut(button: HTMLElement, shortcut: string) {
  const spellings = shortcutSpellings(shortcut);
  const tokens = (button.getAttribute("aria-keyshortcuts") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  expect(tokens.some((token) => spellings.includes(token)), `aria-keyshortcuts of "${button.textContent}" should contain ${shortcut}`).toBe(true);
  const title = (button.getAttribute("title") ?? "").toLowerCase();
  const titleSpellings = [...spellings, shortcut.replace("Mod+", "Ctrl+").toLowerCase()];
  expect(titleSpellings.some((spelling) => title.includes(spelling)), `title of "${button.textContent}" should mention ${shortcut}`).toBe(true);
}

describe("layer/layout keyboard shortcuts", () => {
  describe("produce the same document as their buttons", () => {
    it.each(cases)("$shortcut runs $command like the $button button", async (testCase) => {
      const viaButton = await runWithButton(testCase);
      // Guard: the chosen selection must make the button change the authored document.
      expect(viaButton.after.project).not.toBe(viaButton.before.project);

      const viaShortcut = await runWithShortcut(testCase);
      expect(viaShortcut.before.project).toBe(viaButton.before.project);
      expect(viaShortcut.after.project).toBe(viaButton.after.project);
      expect(viaShortcut.after.layers).toEqual(viaButton.after.layers);
      expect(viaShortcut.after.selected).toEqual(viaButton.after.selected);
    });

    it("treats Meta as Mod (macOS Command+D duplicates)", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "single-caption");
      await user.keyboard("{Meta>}d{/Meta}");
      expect(inspector().getByRole("button", { name: "text Caption Copy" })).toHaveAttribute("aria-pressed", "true");
    });

    it("prevents the browser default for a matched shortcut", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "single-caption");
      // fireEvent returns false when a handler called preventDefault (Mod+D would bookmark the page).
      expect(fireEvent.keyDown(document.body, { key: "d", ctrlKey: true })).toBe(false);
      expect(inspector().getByRole("button", { name: "text Caption Copy" })).toBeInTheDocument();
    });

    it("leaves unrelated keys alone", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "pair");
      const before = await snapshot(user);
      // Without Shift, plain letters and Alt+Arrow (no Shift) are not layout shortcuts.
      expect(fireEvent.keyDown(document.body, { key: "h" })).toBe(true);
      expect(fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true })).toBe(true);
      expect(await snapshot(user)).toEqual(before);
    });
  });

  describe("do nothing when the button would be disabled", () => {
    async function expectNoOp(selection: Selection | "none", button: string, keys: string) {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      if (selection === "none") {
        // The Caption is selected initially; a Shift-click toggles it off.
        await selectLayers(user, ["text Caption"]);
        await user.keyboard("{Shift>}");
        await user.click(inspector().getByRole("button", { name: "text Caption" }));
        await user.keyboard("{/Shift}");
        expect(screen.getByText("Select an object.")).toBeInTheDocument();
        (document.activeElement as HTMLElement | null)?.blur();
      } else {
        await arrange(user, selection);
      }
      for (const candidate of inspector().getAllByRole("button", { name: button })) expect(candidate).toBeDisabled();
      const before = await snapshot(user);
      (document.activeElement as HTMLElement | null)?.blur();
      await user.keyboard(keys);
      expect(await snapshot(user)).toEqual(before);
    }

    it("Mod+D without a selection", async () => {
      await expectNoOp("none", "Duplicate", "{Control>}d{/Control}");
    });

    it("Mod+] and Mod+[ with a multi-selection", async () => {
      await expectNoOp("pair", "Forward", "{Control>}]{/Control}");
      cleanup();
      await expectNoOp("pair", "Backward", "{Control>}[[{/Control}");
    });

    it.each([
      ["Align L", "{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}"],
      ["Align R", "{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}"],
      ["Align T", "{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}"],
      ["Align B", "{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}"],
      ["Align H", "{Shift>}H{/Shift}"],
      ["Align V", "{Shift>}V{/Shift}"],
    ])("%s shortcut with a single selected object", async (button, keys) => {
      await expectNoOp("single-ground", button, keys);
    });

    it.each([
      ["Dist H", "{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}"],
      ["Dist V", "{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}"],
    ])("%s shortcut with fewer than three objects", async (button, keys) => {
      await expectNoOp("pair", button, keys);
    });

    it("every shortcut during read-only animation preview", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "pair");
      await user.selectOptions(screen.getByRole("combobox", { name: "Animation clip" }), "hello");
      expect(inspector().getByRole("button", { name: "Align L" })).toBeDisabled();
      const before = await snapshot(user);
      for (const { keys } of cases) {
        (document.activeElement as HTMLElement | null)?.blur();
        await user.keyboard(keys);
      }
      expect(await snapshot(user)).toEqual(before);
    });
  });

  describe("are ignored while focus is in an editable field", () => {
    it.each(cases.map((testCase) => [testCase.shortcut, testCase] as const))("%s in the inspector X field", async (_shortcut, testCase) => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, testCase.selection);
      const before = await snapshot(user);
      const x = screen.getByLabelText("X");
      const xValue = (x as HTMLInputElement).value;
      x.focus();
      expect(x).toHaveFocus();
      // Dispatch on the field directly so no character is typed into it.
      const [, ...parts] = testCase.shortcut.split("+").reverse();
      const key = testCase.shortcut.split("+").at(-1)!;
      fireEvent.keyDown(x, {
        key: key.length === 1 ? key.toLowerCase() : key,
        ctrlKey: parts.includes("Mod"),
        altKey: parts.includes("Alt"),
        shiftKey: parts.includes("Shift"),
      });
      expect(x).toHaveValue(Number(xValue));
      expect(await snapshot(user)).toEqual(before);
    });

    it("Mod+D in the layer Name text field", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "single-caption");
      const before = await snapshot(user);
      await user.click(screen.getByLabelText("Name"));
      await user.keyboard("{Control>}d{/Control}");
      expect(await snapshot(user)).toEqual(before);
    });
  });

  describe("are discoverable on their buttons", () => {
    it.each(cases.map((testCase) => [testCase.button, testCase.shortcut] as const))("%s exposes %s via aria-keyshortcuts and title", (button, shortcut) => {
      render(<Editor initialDocument={fixtureDocument} />);
      // Duplicate exists twice (drawing toolbar and Arrange section); both must expose it.
      const buttons = screen.getAllByRole("button", { name: button });
      expect(buttons.length).toBeGreaterThan(0);
      for (const candidate of buttons) expectExposesShortcut(candidate, shortcut);
    });
  });

  describe("keep history shortcuts working", () => {
    it("Mod+Z undoes and Mod+Shift+Z redoes an alignment edit", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "pair");
      const initial = await snapshot(user);
      await user.click(inspector().getByRole("button", { name: "Align L" }));
      const aligned = await snapshot(user);
      expect(aligned.project).not.toBe(initial.project);

      (document.activeElement as HTMLElement | null)?.blur();
      await user.keyboard("{Control>}z{/Control}");
      expect((await snapshot(user)).project).toBe(initial.project);

      (document.activeElement as HTMLElement | null)?.blur();
      await user.keyboard("{Control>}{Shift>}Z{/Shift}{/Control}");
      expect((await snapshot(user)).project).toBe(aligned.project);
    });

    it("Mod+Z reverts a Mod+D duplicate", async () => {
      const user = userEvent.setup();
      render(<Editor initialDocument={fixtureDocument} />);
      await arrange(user, "single-caption");
      const initial = await snapshot(user);
      await user.keyboard("{Control>}d{/Control}");
      expect(inspector().getByRole("button", { name: "text Caption Copy" })).toBeInTheDocument();
      (document.activeElement as HTMLElement | null)?.blur();
      await user.keyboard("{Control>}z{/Control}");
      expect(inspector().queryByRole("button", { name: "text Caption Copy" })).not.toBeInTheDocument();
      expect((await snapshot(user)).project).toBe(initial.project);
    });
  });
});
