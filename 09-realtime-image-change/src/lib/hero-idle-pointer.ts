/**
 * Idle-pointer signals for `LivekitVideoWebGLCanvas`.
 * Unused in this example (always expanded call surface); pad is 0.
 */

export const HERO_CANVAS_PAD_CSS = 0;

export const heroIdlePointer = {
  current: {
    cardActive: false,
    bubbleActive: false,
    clientX: 0,
    clientY: 0,
  },
};

export function heroPointerOffsetPx(
  _canvas: HTMLCanvasElement,
  _clientX: number,
  _clientY: number,
): { x: number; y: number } {
  return { x: 0, y: 0 };
}
