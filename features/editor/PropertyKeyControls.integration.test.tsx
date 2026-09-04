import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";

describe("individual property keying", () => {
  it("keys one selected-node property without requiring a saved pose", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);

    expect(screen.getByRole("button", { name: "Key property" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Animation clip" }), "hello");

    expect(screen.getByLabelText("Property target")).toHaveValue("node:caption");
    expect(screen.getByLabelText("Property")).toHaveValue("transform.x");
    await user.clear(screen.getByLabelText("Property value"));
    await user.type(screen.getByLabelText("Property value"), "42");
    await user.selectOptions(screen.getByLabelText("Property easing"), "linear");
    await user.click(screen.getByRole("button", { name: "Key property" }));

    expect(screen.getByRole("option", { name: "node:caption · transform.x" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Keyframe track"), "node:caption:transform.x");
    expect(screen.getByLabelText("Key value")).toHaveValue(42);
    expect(screen.getByLabelText("Key easing")).toHaveValue("linear");
  });

  it("offers rig bones as keyable targets while animation preview is active", async () => {
    const user = userEvent.setup();
    render(<Editor initialDocument={fixtureDocument} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Animation clip" }), "hello");

    await user.selectOptions(screen.getByLabelText("Property target"), "bone:head");
    expect(screen.getByLabelText("Property")).toHaveValue("rotation");
    expect(screen.getByLabelText("Property")).toBeDisabled();
  });
});
