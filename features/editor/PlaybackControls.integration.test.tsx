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

function installRaf() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return callbacks;
}

describe("playback controls", () => {
  it("plays, pauses, advances the preview clock and restarts", async () => {
    const callbacks = installRaf();

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

  it("loops inside an editor-only preview range and restarts at its start", async () => {
    const callbacks = installRaf();

    function Harness() {
      const [time, setTime] = useState(1.4);
      return <>
        <PlaybackControls clip={clip} currentTime={time} onTimeChange={setTime} />
        <output aria-label="Playback test time">{time.toFixed(2)}</output>
      </>;
    }

    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    try {
      await user.click(screen.getByLabelText("Loop preview range"));
      await user.clear(screen.getByLabelText("Preview range start"));
      await user.type(screen.getByLabelText("Preview range start"), "0.5");
      await user.clear(screen.getByLabelText("Preview range end"));
      await user.type(screen.getByLabelText("Preview range end"), "1.5");

      await user.click(screen.getByRole("button", { name: "Play" }));
      act(() => callbacks.get(1)?.(1000));
      act(() => callbacks.get(2)?.(1300));
      expect(screen.getByLabelText("Playback test time")).toHaveTextContent("0.70");

      await user.click(screen.getByRole("button", { name: "Pause" }));
      await user.click(screen.getByRole("button", { name: "Restart" }));
      expect(screen.getByLabelText("Playback test time")).toHaveTextContent("0.50");
      expect(clip.duration).toBe(2);
      expect(clip.loop).toBe(false);
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });
});
