import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";

describe("keyframe inspector", () => {
  it("edits time, value and easing for an existing keyframe and can delete it", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Animation clip" }), "hello");
    expect(screen.getByLabelText("Keyframe track")).toHaveValue("head-sway");
    await user.selectOptions(screen.getByLabelText("Keyframe"), "0.5");

    await user.clear(screen.getByLabelText("Key time"));
    await user.type(screen.getByLabelText("Key time"), "0.75");
    await user.clear(screen.getByLabelText("Key value"));
    await user.type(screen.getByLabelText("Key value"), "-12");
    await user.selectOptions(screen.getByLabelText("Key easing"), "ease-out");
    await user.click(screen.getByRole("button", { name: "Apply keyframe" }));

    expect(screen.getByLabelText("Key time")).toHaveValue(0.75);
    expect(screen.getByLabelText("Key value")).toHaveValue(-12);
    expect(screen.getByLabelText("Key easing")).toHaveValue("ease-out");
    expect(screen.getByRole("option", { name: "0.75s · -12" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete keyframe" }));
    expect(screen.queryByRole("option", { name: "0.75s · -12" })).not.toBeInTheDocument();
  });
});
