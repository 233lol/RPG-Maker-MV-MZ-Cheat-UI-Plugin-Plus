import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  isCheatUiTarget,
  isGameInputBlocked,
  setGameInputBlocked,
} from "../../cheat-engine/www/cheat/js/ClickGuard.js";

function targetMatching(match) {
  return {
    closest(selector) {
      return match(selector) ? { selector } : null;
    },
  };
}

test("isCheatUiTarget：命中作弊窗口与各类 teleport 弹层", () => {
  const selectors = [
    "#cheat-modal",
    ".v-overlay",
    ".v-overlay__content",
    ".v-overlay__scrim",
    ".v-snackbar",
    ".v-menu",
    ".v-tooltip",
  ];

  for (const selector of selectors) {
    assert.equal(
      isCheatUiTarget(targetMatching((value) => value === selector)),
      true,
      selector,
    );
  }
});

test("isCheatUiTarget：普通游戏元素不命中", () => {
  assert.equal(isCheatUiTarget(targetMatching(() => false)), false);
});

test("isCheatUiTarget：空值 / 非元素目标安全返回 false", () => {
  assert.equal(isCheatUiTarget(null), false);
  assert.equal(isCheatUiTarget(undefined), false);
  assert.equal(isCheatUiTarget({}), false);
  assert.equal(isCheatUiTarget({ closest: "not-a-function" }), false);
});

test("isCheatUiTarget：closest 抛错时不向调用方冒泡", () => {
  const target = {
    closest() {
      throw new Error("detached node");
    },
  };

  assert.equal(isCheatUiTarget(target), false);
});

afterEach(() => setGameInputBlocked(false));

test("setGameInputBlocked：默认放行，设为真后统一阻断游戏输入", () => {
  assert.equal(isGameInputBlocked(), false);

  setGameInputBlocked(true);
  assert.equal(isGameInputBlocked(), true);

  setGameInputBlocked(false);
  assert.equal(isGameInputBlocked(), false);

  // 非布尔值统一归一化
  setGameInputBlocked(1);
  assert.equal(isGameInputBlocked(), true);
  setGameInputBlocked(null);
  assert.equal(isGameInputBlocked(), false);
});
