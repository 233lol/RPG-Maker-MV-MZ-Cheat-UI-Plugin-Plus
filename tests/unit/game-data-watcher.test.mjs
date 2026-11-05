import test from "node:test";
import assert from "node:assert/strict";

import { gameDataWatcherMixin } from "../../cheat-engine/www/cheat/js/GameDataWatcher.js";
import { notifyGameDataChanged } from "../../cheat-engine/www/cheat/js/GameDataState.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeComponent(overrides = {}) {
  return {
    __gameDataRefreshTimer: null,
    ...gameDataWatcherMixin.methods,
    ...overrides,
  };
}

test("gameDataWatcherMixin：数据变化后防抖调用 initializeVariables", async () => {
  const calls = [];
  const component = makeComponent({
    initializeVariables() {
      calls.push("init");
    },
  });

  gameDataWatcherMixin.created.call(component);

  try {
    notifyGameDataChanged("one");
    notifyGameDataChanged("two");
    notifyGameDataChanged("three");

    assert.equal(calls.length, 0, "防抖期间不应立即刷新");

    await sleep(90);

    assert.deepEqual(calls, ["init"], "连续事件只应合并成一次刷新");
  } finally {
    gameDataWatcherMixin.beforeUnmount.call(component);
  }
});

test("gameDataWatcherMixin：没有 initializeVariables 时回退到 reload", async () => {
  const calls = [];
  const component = makeComponent({
    reload() {
      calls.push("reload");
    },
  });

  gameDataWatcherMixin.created.call(component);

  try {
    notifyGameDataChanged("fallback");
    await sleep(90);

    assert.deepEqual(calls, ["reload"]);
  } finally {
    gameDataWatcherMixin.beforeUnmount.call(component);
  }
});

test("gameDataWatcherMixin：卸载后取消订阅与待执行刷新", async () => {
  const calls = [];
  const component = makeComponent({
    initializeVariables() {
      calls.push("init");
    },
  });

  gameDataWatcherMixin.created.call(component);

  notifyGameDataChanged("before-unmount");
  gameDataWatcherMixin.beforeUnmount.call(component);

  await sleep(90);

  notifyGameDataChanged("after-unmount");
  await sleep(90);

  assert.deepEqual(calls, []);
  assert.equal(component.__gameDataUnsubscribe, null);
});

test("gameDataWatcherMixin：刷新异常与 Promise rejection 只警告不抛出", async () => {
  const originalWarn = console.warn;
  const warnings = [];

  console.warn = (...args) => warnings.push(args);

  const throwing = makeComponent({
    initializeVariables() {
      throw new Error("sync boom");
    },
  });
  const rejecting = makeComponent({
    initializeVariables() {
      return Promise.reject(new Error("async boom"));
    },
  });

  gameDataWatcherMixin.created.call(throwing);
  gameDataWatcherMixin.created.call(rejecting);

  try {
    notifyGameDataChanged("errors");
    await sleep(90);

    assert.equal(warnings.length, 2, "同步异常与异步 rejection 都应记录警告");
  } finally {
    gameDataWatcherMixin.beforeUnmount.call(throwing);
    gameDataWatcherMixin.beforeUnmount.call(rejecting);
    console.warn = originalWarn;
  }
});
