import type { DrawableObject } from "../model";

type CanvasStateTarget = Pick<CanvasRenderingContext2D,
  | "fillStyle"
  | "font"
  | "globalAlpha"
  | "lineCap"
  | "lineJoin"
  | "lineWidth"
  | "setLineDash"
  | "strokeStyle"
  | "textBaseline"
>;

export type CanvasStateWriteCounts = {
  fillStyle: number;
  font: number;
  globalAlpha: number;
  lineCap: number;
  lineDash: number;
  lineJoin: number;
  lineWidth: number;
  strokeStyle: number;
  textBaseline: number;
};

function initialCounts(): CanvasStateWriteCounts {
  return {
    fillStyle: 0,
    font: 0,
    globalAlpha: 0,
    lineCap: 0,
    lineDash: 0,
    lineJoin: 0,
    lineWidth: 0,
    strokeStyle: 0,
    textBaseline: 0,
  };
}

export class CanvasStateCache {
  readonly writes = initialCounts();

  private fillStyle: string | CanvasGradient | CanvasPattern | undefined;
  private font: string | undefined;
  private globalAlpha: number | undefined;
  private lineCap: CanvasLineCap | undefined;
  private lineDashKey: string | undefined;
  private lineJoin: CanvasLineJoin | undefined;
  private lineWidth: number | undefined;
  private strokeStyle: string | CanvasGradient | CanvasPattern | undefined;
  private textBaseline: CanvasTextBaseline | undefined;

  constructor(private readonly target: CanvasStateTarget) {}

  setGlobalAlpha(value: number) {
    if (this.globalAlpha === value) return;
    this.target.globalAlpha = value;
    this.globalAlpha = value;
    this.writes.globalAlpha += 1;
  }

  applyDrawable(object: DrawableObject) {
    if (object.fill !== "none") this.setFillStyle(object.fill);
    if (object.stroke && object.stroke !== "none") {
      this.setStrokeStyle(object.stroke);
      this.setLineWidth(object.strokeWidth ?? 1);
      this.setLineCap(object.strokeLinecap ?? "butt");
      this.setLineJoin(object.strokeLinejoin ?? "miter");
      this.setLineDash([]);
    }
    if (object.kind === "text") {
      this.setFont(`700 ${object.fontSize}px system-ui, sans-serif`);
      this.setTextBaseline("alphabetic");
    }
  }

  applySelection(stroke: string, object: DrawableObject) {
    this.setStrokeStyle(stroke);
    this.setLineWidth(4);
    this.setLineDash([7, 5]);
    this.setLineCap("butt");
    this.setLineJoin("round");
    if (object.kind === "text") {
      this.setFont(`700 ${object.fontSize}px system-ui, sans-serif`);
      this.setTextBaseline("alphabetic");
    }
  }

  private setFillStyle(value: string | CanvasGradient | CanvasPattern) {
    if (this.fillStyle === value) return;
    this.target.fillStyle = value;
    this.fillStyle = value;
    this.writes.fillStyle += 1;
  }

  private setStrokeStyle(value: string | CanvasGradient | CanvasPattern) {
    if (this.strokeStyle === value) return;
    this.target.strokeStyle = value;
    this.strokeStyle = value;
    this.writes.strokeStyle += 1;
  }

  private setLineWidth(value: number) {
    if (this.lineWidth === value) return;
    this.target.lineWidth = value;
    this.lineWidth = value;
    this.writes.lineWidth += 1;
  }

  private setLineCap(value: CanvasLineCap) {
    if (this.lineCap === value) return;
    this.target.lineCap = value;
    this.lineCap = value;
    this.writes.lineCap += 1;
  }

  private setLineJoin(value: CanvasLineJoin) {
    if (this.lineJoin === value) return;
    this.target.lineJoin = value;
    this.lineJoin = value;
    this.writes.lineJoin += 1;
  }

  private setLineDash(value: readonly number[]) {
    const key = value.join(",");
    if (this.lineDashKey === key) return;
    this.target.setLineDash([...value]);
    this.lineDashKey = key;
    this.writes.lineDash += 1;
  }

  private setFont(value: string) {
    if (this.font === value) return;
    this.target.font = value;
    this.font = value;
    this.writes.font += 1;
  }

  private setTextBaseline(value: CanvasTextBaseline) {
    if (this.textBaseline === value) return;
    this.target.textBaseline = value;
    this.textBaseline = value;
    this.writes.textBaseline += 1;
  }
}
