import test from "node:test";
import assert from "node:assert/strict";

import { Alert } from "../../cheat-engine/www/cheat/js/AlertHelper.js";
import {
  isGameReady,
  isPartyReady,
  isSwitchesReady,
  isVariablesReady,
  requireGameReady,
  requirePartyReady,
} from "../../cheat-engine/www/cheat/js/GameState.js";

const GLOBAL_NAMES = [
  "$gamePlayer",
  "$gameParty",
  "$gameMap",
  "$gameSystem",
  "$gameSwitches",
  "$gameVariables",
];

function clearGlobals() {
  for (const name of GLOBAL_NAMES) {
    delete globalThis[name];
  }
}

test("GameState：全部核心对象存在时才算就绪", () => {
  clearGlobals();

  assert.equal(isGameReady(), false);

  globalThis.$gamePlayer = {};
  assert.equal(isPartyReady(), false);

  globalThis.$gameParty = {};
  assert.equal(isPartyReady(), true);
  assert.equal(isGameReady(), false);

  globalThis.$gameMap = {};
  globalThis.$gameSystem = {};
  assert.equal(isGameReady(), true);

  clearGlobals();
});

test("GameState：开关 / 变量独立判断", () => {
  clearGlobals();

  assert.equal(isSwitchesReady(), false);
  assert.equal(isVariablesReady(), false);

  globalThis.$gameSwitches = {};
  globalThis.$gameVariables = {};
  assert.equal(isSwitchesReady(), true);
  assert.equal(isVariablesReady(), true);

  clearGlobals();
});

test("GameState：requireXxx 未就绪时给出一次提示并返回 false", () => {
  clearGlobals();

  const warnings = [];
  Alert.setHandler((level, msg) => warnings.push({ level, msg }));

  assert.equal(requireGameReady("穿墙"), false);
  assert.equal(requirePartyReady("修改金钱"), false);

  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].level, "warn");
  assert.match(warnings[0].msg, /游戏尚未加载完成/);
  assert.match(warnings[0].msg, /穿墙/);
  assert.match(warnings[1].msg, /修改金钱/);

  Alert.handler = null;
  Alert.pending = [];
});

test("GameState：requireXxx 就绪时直接返回 true，不提示", () => {
  clearGlobals();

  globalThis.$gamePlayer = {};
  globalThis.$gameParty = {};
  globalThis.$gameMap = {};
  globalThis.$gameSystem = {};

  const warnings = [];
  Alert.setHandler((level, msg) => warnings.push(msg));

  assert.equal(requireGameReady("任意操作"), true);
  assert.equal(warnings.length, 0);

  Alert.handler = null;
  Alert.pending = [];
  clearGlobals();
});
