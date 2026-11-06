import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampGeometry,
  getDefaultGeometry,
  getViewportSize,
} from "../../cheat-engine/www/cheat/js/CheatWindowGeometry.js";

test("getDefaultGeometry：居中且不超过最大尺寸", () => {
  const geometry = getDefaultGeometry({ width: 1920, height: 1080 });

  assert.deepEqual(geometry, {
    x: Math.round((1920 - 775) / 2),
    y: Math.round((1080 - 550) / 2),
    width: 775,
    height: 550,
  });
});

test("getDefaultGeometry：小视口下收缩到视口内", () => {
  const geometry = getDefaultGeometry({ width: 640, height: 480 });

  assert.ok(geometry.width <= 624);
  assert.ok(geometry.height <= 464);
  assert.ok(geometry.x >= 0);
  assert.ok(geometry.y >= 0);
});

test("getDefaultGeometry / clampGeometry：极小视口下不超出视口", () => {
  const viewport = { width: 300, height: 200 };

  const defaults = getDefaultGeometry(viewport);
  assert.ok(defaults.width <= viewport.width);
  assert.ok(defaults.height <= viewport.height);
  assert.ok(defaults.x >= 0);
  assert.ok(defaults.y >= 0);

  const clamped = clampGeometry(
    { x: 999, y: 999, width: 775, height: 550 },
    viewport,
  );
  assert.ok(clamped.width <= viewport.width);
  assert.ok(clamped.height <= viewport.height);
  assert.ok(clamped.x + clamped.width <= viewport.width);
  assert.ok(clamped.y + clamped.height <= viewport.height);
});

test("clampGeometry：限制最小尺寸并拉回视口", () => {
  const geometry = clampGeometry(
    { x: -100, y: -100, width: 10, height: 10 },
    { width: 1280, height: 800 },
  );

  assert.deepEqual(geometry, {
    x: 0,
    y: 0,
    width: MIN_WINDOW_WIDTH,
    height: MIN_WINDOW_HEIGHT,
  });

  const offscreen = clampGeometry(
    { x: 5000, y: 5000, width: 775, height: 550 },
    { width: 1280, height: 800 },
  );

  assert.equal(offscreen.x, 1280 - 775);
  assert.equal(offscreen.y, 800 - 550);
});

test("getViewportSize：有 window 时读取 innerWidth / innerHeight，否则回退默认值", () => {
  assert.deepEqual(getViewportSize(), { width: 1280, height: 800 });

  try {
    globalThis.window = { innerWidth: 1024, innerHeight: 768 };
    assert.deepEqual(getViewportSize(), { width: 1024, height: 768 });

    globalThis.window = { innerWidth: 0, innerHeight: 0 };
    assert.deepEqual(getViewportSize(), { width: 1280, height: 800 });

    globalThis.window = {};
    assert.deepEqual(getViewportSize(), { width: 1280, height: 800 });
  } finally {
    delete globalThis.window;
  }
});

test("clampGeometry：非数字尺寸 / 坐标回退到最小值", () => {
  const geometry = clampGeometry(
    {
      x: Number.NaN,
      y: "bad",
      width: "bad",
      height: Number.POSITIVE_INFINITY,
    },
    { width: 1280, height: 800 },
  );

  assert.equal(geometry.x, 0);
  assert.equal(geometry.y, 0);
  assert.equal(geometry.width, MIN_WINDOW_WIDTH);
  assert.equal(geometry.height, 800 - 8);
});
