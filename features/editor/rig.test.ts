import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import { getBoneWorldPose, resetRigPose, solveRigConstraint, updateConstraintTarget } from "./rig";

describe("character rig", () => {
  it("solves a connected two-bone chain to its target", () => {
    const rig = fixtureDocument.rig!;
    const solved = solveRigConstraint(rig, "ik-hand-right");
    const constraint = solved.constraints.find((candidate) => candidate.id === "ik-hand-right")!;
    const pose = getBoneWorldPose(solved, constraint.midBoneId)!;
    expect(Math.hypot(pose.end.x - constraint.target.x, pose.end.y - constraint.target.y)).toBeLessThan(0.001);
  });

  it("keeps IK deterministic when the same target is solved repeatedly", () => {
    const rig = updateConstraintTarget(fixtureDocument.rig!, "ik-hand-left", { x: 300, y: 280 });
    const once = solveRigConstraint(rig, "ik-hand-left");
    const twice = solveRigConstraint(once, "ik-hand-left");
    expect(twice.bones).toEqual(once.bones);
  });

  it("restores every bone rotation to the authored rest pose", () => {
    const solved = solveRigConstraint(fixtureDocument.rig!, "ik-hand-right");
    const reset = resetRigPose(solved);
    for (const bone of reset.bones) expect(bone.rotation).toBe(bone.restRotation);
  });
});
