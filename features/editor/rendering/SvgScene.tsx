import type { CSSProperties } from "react";
import { boneWorldTransformToSvg } from "../rig";
import { objectTransformToSvg } from "../sceneGraph";
import type { CharacterRig, DrawableObject, EditorDocument, EditorObject } from "../model";
import { pathToSvg } from "../vectorPath";

type SvgSceneProps = {
  document: EditorDocument;
  className?: string;
  style?: CSSProperties;
};

export function SvgScene({ document, className, style }: SvgSceneProps) {
  return <svg
    className={className}
    aria-label={`${document.name} SVG reference renderer`}
    data-renderer="svg-dom"
    width={document.width}
    height={document.height}
    viewBox={`0 0 ${document.width} ${document.height}`}
    style={style}
  >
    {document.objects.map((object) => <SvgObject key={object.id} object={object} rig={document.rig} />)}
  </svg>;
}

function SvgObject({ object, rig }: { object: EditorObject; rig?: CharacterRig }) {
  if (!object.visible) return null;
  const nodeTransform = objectTransformToSvg(object.transform);
  const boneTransform = object.boneId && rig ? boneWorldTransformToSvg(rig, object.boneId) : undefined;
  const content = object.kind === "group"
    ? <g transform={nodeTransform} opacity={object.opacity} data-node-id={object.id} data-node-kind="group">
        {object.children.map((child) => <SvgObject key={child.id} object={child} rig={rig} />)}
      </g>
    : <g transform={nodeTransform} opacity={object.opacity} data-node-id={object.id} data-node-kind={object.kind} data-drawable="true">
        <SvgDrawable object={object} />
      </g>;
  return boneTransform ? <g transform={boneTransform}>{content}</g> : content;
}

function SvgDrawable({ object }: { object: DrawableObject }) {
  const common = {
    fill: object.fill,
    stroke: object.stroke,
    strokeWidth: object.strokeWidth,
    strokeLinecap: object.strokeLinecap,
    strokeLinejoin: object.strokeLinejoin,
  };
  switch (object.kind) {
    case "rectangle":
      return <rect {...common} x={object.x} y={object.y} width={object.width} height={object.height} rx={object.cornerRadius} />;
    case "circle":
      return <circle {...common} cx={object.cx} cy={object.cy} r={object.radius} />;
    case "path":
      return <path {...common} d={pathToSvg(object.path)} />;
    case "text":
      return <text {...common} x={object.x} y={object.y} fontSize={object.fontSize} fontWeight="700">{object.value}</text>;
  }
}
