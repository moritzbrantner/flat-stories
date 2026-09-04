import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AnimationClip } from "./model";
import { PlaybackControls } from "./PlaybackControls";

const clip: AnimationClip = {
  id: "once",
  name: "Once",
  duration: 2,
  loop: false,
  tracks: [],
};

describe("playback controls", () => {
  it("plays, pauses, advances the preview clock and restarts", async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));

    function Harness() {
      const [time, setTime] = useState(0);
      return <>
        <PlaybackControls clip={clip} currentTime={time} onTimeChange={setTime} />
        <output aria-label="Playback test time">{time.toFixed(2)}</output>
      </>;
    }

    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    try {
      expect(screen.getByText("Once")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Play" }));
      expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");

      act(() => callbacks.get(1)?.(1000));
      act(() => callbacks.get(2)?.(1250));
      expect(screen.getByLabelText("Playback test time")).toHaveTextContent("0.25");

      await user.click(screen.getByRole("button", { name: "Pause" }));
      expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");

      await user.click(screen.getByRole("button", { name: "Restart" }));
      expect(screen.getByLabelText("Playback test time")).toHaveTextContent("0.00");
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });
});
