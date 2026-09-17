import type { ModelResult } from './arena';

export type WorkCanvas = {
  width: number;
  height: number;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
};
export type WorkFraming = Required<WorkCanvas>;

// Viewing tasks opt in explicitly. Responsive website tasks keep native sizing.
const PROMPT_CANVASES: Record<string, WorkCanvas> = {
  '001': { width: 1280, height: 720 },
};
// Optional exceptions use stable work IDs, never model names or A/B positions.
const WORK_CANVASES: Record<string, WorkCanvas> = {};

export function workCanvas(result: ModelResult): WorkCanvas | undefined {
  if (result.content.kind !== 'html') return;
  return (
    result.content.framing ??
    WORK_CANVASES[result.id] ??
    PROMPT_CANVASES[result.promptId]
  );
}

// All displays share a 16:9 viewing window, including letterboxed dialogs.
export function framedCanvas(
  canvas: WorkCanvas,
  width: number,
  height: number,
) {
  const windowFit = containCanvas({ width: 16, height: 9 }, width, height);
  const viewWidth = 16 * windowFit.scale;
  const viewHeight = 9 * windowFit.scale;
  const scale =
    containCanvas(canvas, viewWidth, viewHeight).scale * (canvas.zoom ?? 1);
  return {
    viewWidth,
    viewHeight,
    viewLeft: windowFit.left,
    viewTop: windowFit.top,
    scale,
    left:
      (viewWidth - canvas.width * scale) / 2 +
      (canvas.offsetX ?? 0) * viewWidth,
    top:
      (viewHeight - canvas.height * scale) / 2 +
      (canvas.offsetY ?? 0) * viewHeight,
  };
}

export function containCanvas(
  canvas: WorkCanvas,
  width: number,
  height: number,
) {
  const scale = Math.max(
    0,
    Math.min(width / canvas.width, height / canvas.height),
  );
  return {
    scale,
    left: (width - canvas.width * scale) / 2,
    top: (height - canvas.height * scale) / 2,
  };
}
