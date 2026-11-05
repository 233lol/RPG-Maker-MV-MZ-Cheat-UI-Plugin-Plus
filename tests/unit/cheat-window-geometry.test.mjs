import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampGeometry,
  getDefaultGeometry,
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
