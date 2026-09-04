import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";

describe("onion skinning", () => {
  it("renders neighboring sampled frames as non-interactive SVG context", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor initialDocument={fixtureDocument} />);

    expect(screen.getByLabelText("Onion skin")).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Animation clip" }), "hello");
    await user.click(screen.getByLabelText("Onion skin"));

    const previous = container.querySelector('[data-onion-skin="previous"]');
    const next = container.querySelector('[data-onion-skin="next"]');
    expect(previous).toBeInTheDocument();
    expect(next).toBeInTheDocument();
    expect(Number(previous?.getAttribute("data-sample-time"))).toBeCloseTo(1.9);
    expect(Number(next?.getAttribute("data-sample-time"))).toBeCloseTo(0.1);
    expect(previous).toHaveAttribute("pointer-events", "none");
    expect(next).toHaveAttribute("pointer-events", "none");
  });
});
