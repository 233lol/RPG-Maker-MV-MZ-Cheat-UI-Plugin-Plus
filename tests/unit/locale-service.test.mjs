import test from "node:test";
import assert from "node:assert/strict";

import {
  detectLocale,
  loadSavedLocale,
  saveLocale,
} from "../../cheat-engine/www/cheat/js/LocaleService.js";
import { getCheatSettingsPath } from "../../cheat-engine/www/cheat/js/SettingsPath.js";

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

function withWindow(language, callback) {
  globalThis.window = {};

  Object.defineProperty(globalThis, "navigator", {
    value: { language },
    configurable: true,
  });

  try {
    return callback();
  } finally {
    delete globalThis.window;

    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
}

function installLocalStorage() {
  const store = new Map();

  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };

  return store;
}

function localeKey() {
  return `${getCheatSettingsPath("locale.json")}:locale`;
}

test("detectLocale：没有窗口环境时固定中文", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(detectLocale(), "zh-CN");
});

test("detectLocale：按 navigator.language 归一化", () => {
  assert.equal(withWindow("zh-CN", detectLocale), "zh-CN");
  assert.equal(withWindow("zh-TW", detectLocale), "zh-CN");
  assert.equal(withWindow("en-GB", detectLocale), "en");
  assert.equal(withWindow("ja-JP", detectLocale), "ja");
  assert.equal(withWindow("fr-FR", detectLocale), "zh-CN");
  assert.equal(withWindow(undefined, detectLocale), "zh-CN");
});

test("detectLocale：navigator 读取异常时回退中文", () => {
  globalThis.window = {};

  Object.defineProperty(globalThis, "navigator", {
    get() {
      throw new Error("blocked");
    },
    configurable: true,
  });

  try {
    assert.equal(detectLocale(), "zh-CN");
  } finally {
    delete globalThis.window;

    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    }
  }
});

test("loadSavedLocale：优先使用持久化语言，再进行归一化", () => {
  withWindow("ja-JP", () => {
    const store = installLocalStorage();

    try {
      store.set(localeKey(), "en");
      assert.equal(loadSavedLocale(), "en");

      store.set(localeKey(), "zh-TW");
      assert.equal(loadSavedLocale(), "zh-CN");

      store.set(localeKey(), "fr");
      assert.equal(loadSavedLocale(), "ja", "不支持的语言应退回浏览器语言");
    } finally {
      delete globalThis.localStorage;
    }
  });
});

test("loadSavedLocale：没有记录时使用浏览器语言", () => {
  withWindow("en-US", () => {
    installLocalStorage();

    try {
      assert.equal(loadSavedLocale(), "en");
    } finally {
      delete globalThis.localStorage;
    }
  });
});

test("loadSavedLocale：存储读取异常时回退浏览器语言", () => {
  withWindow("en-US", () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {},
    };

    try {
      assert.equal(loadSavedLocale(), "en");
    } finally {
      delete globalThis.localStorage;
    }
  });
});

test("saveLocale：归一化后写入，非法语言不写入", () => {
  withWindow("ja-JP", () => {
    const store = installLocalStorage();

    try {
      saveLocale("en-US");
      assert.equal(store.get(localeKey()), "en");

      saveLocale("zh-Hans");
      assert.equal(store.get(localeKey()), "zh-CN");

      saveLocale("fr");
      assert.equal(store.get(localeKey()), "zh-CN", "非法语言不应覆盖旧值");

      saveLocale(null);
      assert.equal(store.get(localeKey()), "zh-CN");
    } finally {
      delete globalThis.localStorage;
    }
  });
});
