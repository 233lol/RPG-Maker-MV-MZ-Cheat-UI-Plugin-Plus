// @ts-check

// 主窗口尺寸 / 位置计算。纯函数，便于单测与复用。
export const MIN_WINDOW_WIDTH = 480;
export const MIN_WINDOW_HEIGHT = 320;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }

  return {
    width: window.innerWidth || 1280,
    height: window.innerHeight || 800,
  };
}

/**
 * @param {{ width: number, height: number }} [viewport]
 */
export function getDefaultGeometry(viewport = getViewportSize()) {
  // 视口可能比最小窗口还小（分屏 / 远程桌面）。上限不能再钳到 320，
  // 否则窗口会超出视口；CSS 的 min() 也做了同样处理。
  const maxWidth = Math.max(1, viewport.width - 16);
  const maxHeight = Math.max(1, viewport.height - 16);
  const width = clampNumber(
    Math.round(viewport.width * 0.8),
    Math.min(MIN_WINDOW_WIDTH, maxWidth),
    Math.min(775, maxWidth),
  );
  const height = clampNumber(
    Math.round(viewport.height * 0.9),
    Math.min(MIN_WINDOW_HEIGHT, maxHeight),
    Math.min(550, maxHeight),
  );

  return {
    x: Math.max(0, Math.round((viewport.width - width) / 2)),
    y: Math.max(0, Math.round((viewport.height - height) / 2)),
    width,
    height,
  };
}

/**
 * 把窗口限制在视口内，并保证最小尺寸。
 *
 * @param {{ x?: number, y?: number, width?: number, height?: number }} geometry
 * @param {{ width: number, height: number }} [viewport]
 */
export function clampGeometry(geometry, viewport = getViewportSize()) {
  const maxWidth = Math.max(1, viewport.width - 8);
  const maxHeight = Math.max(1, viewport.height - 8);
  const minWidth = Math.min(MIN_WINDOW_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_WINDOW_HEIGHT, maxHeight);
  const width = clampNumber(
    Math.round(Number(geometry.width) || minWidth),
    minWidth,
    maxWidth,
  );
  const height = clampNumber(
    Math.round(Number(geometry.height) || minHeight),
    minHeight,
    maxHeight,
  );
  const x = clampNumber(
    Math.round(Number(geometry.x) || 0),
    0,
    Math.max(0, viewport.width - width),
  );
  const y = clampNumber(
    Math.round(Number(geometry.y) || 0),
    0,
    Math.max(0, viewport.height - height),
  );

  return { x, y, width, height };
}
