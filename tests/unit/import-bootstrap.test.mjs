// import.js 是被 MV/MZ 以 classic script 方式加载的，没有模块导出。
// 这里用 node:vm 在受控的 window / document 环境里执行真实源码，
// 只验证不依赖游戏引擎的启动逻辑，避免为了测试把入口改成 ESM。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const IMPORT_SOURCE = readFileSync(
  new URL("../../cheat-engine/www/cheat/init/import.js", import.meta.url),
  "utf8",
);

const MIN_NWJS_VERSION = "0.44.0";
const DOCS_URL =
  "https://github.com/233lol/RPG-Maker-MV-MZ-Cheat-UI-Plugin-Plus#readme";

function createElement() {
  return {
    style: { cssText: "" },
    id: "",
    type: "",
    src: "",
    rel: "",
    href: "",
    innerHTML: "",
    remove() {},
  };
}

function createEnvironment({
  nwjsVersion = MIN_NWJS_VERSION,
  language = "zh-CN",
  confirmResult = false,
} = {}) {
  const confirmCalls = [];
  const openCalls = [];
  const warnings = [];
  const errorListeners = [];
  const bodyAppends = [];
  const headAppends = [];
  const sceneCalls = [];

  const document = {
    createElement: () => createElement(),
    querySelector: () => null,
    body: {
      appendChild(element) {
        bodyAppends.push(element);
      },
    },
    head: {
      appendChild(element) {
        headAppends.push(element);
      },
    },
  };

  const window = {
    __CHEAT_APPLIED__: false,
    addEventListener(type, listener, capture) {
      errorListeners.push({ type, listener, capture });
    },
    confirm(message) {
      confirmCalls.push(message);
      return confirmResult;
    },
    open(url, target) {
      openCalls.push([url, target]);
    },
  };

  const SceneManager = {
    onError(event) {
      sceneCalls.push(event);
    },
  };

  const process = { versions: {} };

  if (nwjsVersion !== null) {
    process.versions["node-webkit"] = nwjsVersion;
  }

  const context = vm.createContext({
    window,
    document,
    SceneManager,
    process,
    // validateNwjsVersion 用 typeof require 判断是否运行在 NW.js 里；
    // 这里只提供一个不会被调用的占位函数。
    require: () => {},
    navigator: { language },
    console: {
      log() {},
      error() {},
      warn(...args) {
        warnings.push(args.map(String).join(" "));
      },
    },
  });

  return {
    context,
    window,
    document,
    SceneManager,
    confirmCalls,
    openCalls,
    warnings,
    errorListeners,
    bodyAppends,
    headAppends,
    sceneCalls,
  };
}

function runImport(environment) {
  const script = new vm.Script(IMPORT_SOURCE, { filename: "import.js" });

  script.runInContext(environment.context);

  return environment;
}

test("import.js：低版本 NW.js 弹本地化提示，确认后打开文档", () => {
  const env = runImport(
    createEnvironment({ nwjsVersion: "0.43.0", confirmResult: true }),
  );

  assert.equal(env.confirmCalls.length, 1);
  assert.match(env.confirmCalls[0], /当前版本=0\.43\.0/);
  assert.match(env.confirmCalls[0], new RegExp(`最低要求=${MIN_NWJS_VERSION}`));
  assert.deepEqual(env.openCalls, [[DOCS_URL, "_blank"]]);
});

test("import.js：低版本 NW.js 取消提示时不打开文档，也不阻断加载", () => {
  const env = runImport(
    createEnvironment({ nwjsVersion: "0.43.0", confirmResult: false }),
  );

  assert.equal(env.confirmCalls.length, 1);
  assert.deepEqual(env.openCalls, []);
  assert.equal(env.window.__CHEAT_APPLIED__, true);
  assert.ok(
    env.bodyAppends.some((element) => element.src === "cheat/init/setup.js"),
  );
});

test("import.js：达到最低版本 / 拿不到版本号时不提示", () => {
  for (const nwjsVersion of [MIN_NWJS_VERSION, "0.45.0", null]) {
    const env = runImport(createEnvironment({ nwjsVersion }));

    assert.equal(env.confirmCalls.length, 0, String(nwjsVersion));
    assert.deepEqual(env.openCalls, []);
  }
});

test("import.js：按浏览器语言选择提示文案", () => {
  const env = runImport(
    createEnvironment({ nwjsVersion: "0.43.0", language: "ja-JP" }),
  );

  assert.equal(env.confirmCalls.length, 1);
  assert.match(env.confirmCalls[0], /Node Webkit バージョンが低すぎる/);
});

test("import.js：ResizeObserver 循环提示被拦截，其他错误正常交给引擎", () => {
  const env = runImport(createEnvironment());

  assert.equal(env.errorListeners.length, 1);
  assert.equal(env.errorListeners[0].type, "error");
  assert.equal(env.errorListeners[0].capture, true);
  assert.equal(typeof env.window.__CHEAT_RESIZE_OBSERVER_GUARD__, "function");

  let stopped = 0;
  env.window.__CHEAT_RESIZE_OBSERVER_GUARD__({
    message: "ResizeObserver loop completed with undelivered notifications.",
    stopImmediatePropagation() {
      stopped += 1;
    },
  });
  assert.equal(stopped, 1);

  // SceneManager.onError 也被包装：循环提示吞掉，真实错误继续上报。
  env.SceneManager.onError({
    message: "ResizeObserver loop limit exceeded",
  });
  assert.equal(env.sceneCalls.length, 0);

  const realError = { message: "boom" };
  env.SceneManager.onError(realError);
  assert.equal(env.sceneCalls.length, 1);
  assert.equal(env.sceneCalls[0], realError);
});

test("import.js：重复加载不会创建第二个 #app", () => {
  const env = createEnvironment();

  runImport(env);
  const firstRunBodyAppends = env.bodyAppends.length;
  const firstRunHeadAppends = env.headAppends.length;

  assert.equal(env.window.__CHEAT_APPLIED__, true);
  assert.ok(firstRunBodyAppends > 0);
  assert.ok(firstRunHeadAppends > 0);

  runImport(env);

  assert.equal(env.bodyAppends.length, firstRunBodyAppends);
  assert.equal(env.headAppends.length, firstRunHeadAppends);
  assert.ok(env.warnings.some((message) => message.includes("已经初始化")));
});
