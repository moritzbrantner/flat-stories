import type { Bone, CharacterRig, Point, TwoBoneIkConstraint } from "./model";

export type BoneWorldPose = {
  origin: Point;
  end: Point;
  rotation: number;
};

function radians(degrees: number) {
  return degrees * Math.PI / 180;
}

function degrees(radiansValue: number) {
  return radiansValue * 180 / Math.PI;
}

function rotate(point: Point, rotation: number): Point {
  const angle = radians(rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function normalizeAngle(angle: number) {
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampBoneRotation(bone: Bone, rotation: number) {
  return clamp(rotation, bone.minRotation ?? -Infinity, bone.maxRotation ?? Infinity);
}

function mixAngle(from: number, to: number, weight: number) {
  return from + normalizeAngle(to - from) * clamp(weight, 0, 1);
}

export function findBone(rig: CharacterRig, id: string): Bone | null {
  return rig.bones.find((bone) => bone.id === id) ?? null;
}

export function getBoneWorldPose(rig: CharacterRig, boneId: string): BoneWorldPose | null {
  const byId = new Map(rig.bones.map((bone) => [bone.id, bone]));
  const visiting = new Set<string>();
  const cache = new Map<string, BoneWorldPose>();

  function resolve(id: string): BoneWorldPose | null {
    const cached = cache.get(id);
    if (cached) return cached;
    const bone = byId.get(id);
    if (!bone || visiting.has(id)) return null;
    visiting.add(id);

    let origin: Point;
    let rotation: number;
    if (!bone.parentId) {
      origin = { x: bone.x, y: bone.y };
      rotation = bone.rotation;
    } else {
      const parent = resolve(bone.parentId);
      if (!parent) return null;
      const offset = rotate({ x: bone.x, y: bone.y }, parent.rotation);
      origin = { x: parent.origin.x + offset.x, y: parent.origin.y + offset.y };
      rotation = parent.rotation + bone.rotation;
    }

    const direction = rotate({ x: bone.length, y: 0 }, rotation);
    const pose = {
      origin,
      rotation,
      end: { x: origin.x + direction.x, y: origin.y + direction.y },
    };
    cache.set(id, pose);
    visiting.delete(id);
    return pose;
  }

  return resolve(boneId);
}

export function boneWorldTransformToSvg(rig: CharacterRig, boneId: string): string | undefined {
  const pose = getBoneWorldPose(rig, boneId);
  return pose ? `translate(${pose.origin.x} ${pose.origin.y}) rotate(${pose.rotation})` : undefined;
}

function replaceBoneRotations(rig: CharacterRig, rotations: ReadonlyMap<string, number>): CharacterRig {
  let changed = false;
  const bones = rig.bones.map((bone) => {
    const rotation = rotations.get(bone.id);
    if (rotation === undefined || rotation === bone.rotation) return bone;
    changed = true;
    return { ...bone, rotation };
  });
  return changed ? { ...rig, bones } : rig;
}

export function solveTwoBoneIk(rig: CharacterRig, constraint: TwoBoneIkConstraint): CharacterRig {
  if (!constraint.enabled || constraint.weight <= 0) return rig;
  const root = findBone(rig, constraint.rootBoneId);
  const mid = findBone(rig, constraint.midBoneId);
  if (!root || !mid || mid.parentId !== root.id) return rig;
  if (Math.abs(mid.x - root.length) > 0.001 || Math.abs(mid.y) > 0.001) return rig;
  if (root.length <= 0 || mid.length <= 0) return rig;

  const rootPose = getBoneWorldPose(rig, root.id);
  if (!rootPose) return rig;
  const parentRotation = root.parentId ? (getBoneWorldPose(rig, root.parentId)?.rotation ?? 0) : 0;
  const dx = constraint.target.x - rootPose.origin.x;
  const dy = constraint.target.y - rootPose.origin.y;
  const rawDistance = Math.hypot(dx, dy);
  const minimum = Math.abs(root.length - mid.length) + 0.0001;
  const maximum = root.length + mid.length - 0.0001;
  const distance = clamp(rawDistance, minimum, maximum);
  const targetAngle = Math.atan2(dy, dx);
  const rootOffset = Math.acos(clamp(
    (root.length ** 2 + distance ** 2 - mid.length ** 2) / (2 * root.length * distance),
    -1,
    1,
  ));
  const elbowInterior = Math.acos(clamp(
    (root.length ** 2 + mid.length ** 2 - distance ** 2) / (2 * root.length * mid.length),
    -1,
    1,
  ));

  const bend = constraint.bendDirection;
  const solvedRootGlobal = degrees(targetAngle - bend * rootOffset);
  const solvedMidGlobal = solvedRootGlobal + bend * degrees(Math.PI - elbowInterior);
  const desiredRootLocal = normalizeAngle(solvedRootGlobal - parentRotation);
  const desiredMidLocal = normalizeAngle(solvedMidGlobal - solvedRootGlobal);
  const rootRotation = clampBoneRotation(root, mixAngle(root.rotation, desiredRootLocal, constraint.weight));
  const midRotation = clampBoneRotation(mid, mixAngle(mid.rotation, desiredMidLocal, constraint.weight));

  return replaceBoneRotations(rig, new Map([[root.id, rootRotation], [mid.id, midRotation]]));
}

export function solveRigConstraint(rig: CharacterRig, constraintId: string): CharacterRig {
  const constraint = rig.constraints.find((candidate) => candidate.id === constraintId);
  return constraint ? solveTwoBoneIk(rig, constraint) : rig;
}

export function resetRigPose(rig: CharacterRig): CharacterRig {
  const rotations = new Map(rig.bones.map((bone) => [bone.id, bone.restRotation]));
  return replaceBoneRotations(rig, rotations);
}

export function updateConstraintTarget(rig: CharacterRig, constraintId: string, target: Partial<Point>): CharacterRig {
  let changed = false;
  const constraints = rig.constraints.map((constraint) => {
    if (constraint.id !== constraintId) return constraint;
    changed = true;
    return { ...constraint, target: { ...constraint.target, ...target } };
  });
  return changed ? { ...rig, constraints } : rig;
}
