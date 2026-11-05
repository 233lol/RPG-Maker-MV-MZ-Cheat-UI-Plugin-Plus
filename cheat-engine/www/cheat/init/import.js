// Chromium 在 ResizeObserver 回调里同步修改布局时会派发
// "ResizeObserver loop completed with undelivered notifications" 错误事件。
// 它只是观察循环的提示，但 MZ/MV 的 SceneManager.onError 会把它当成致命错误：
// 停掉游戏循环并显示错误页。这里只过滤这一条已知消息，其他错误照常处理。
function isResizeObserverLoopEvent(event) {
  return String((event && event.message) || "").startsWith(
    "ResizeObserver loop",
  );
}

function ignoreResizeObserverLoopErrors() {
  // 在 window 上捕获拦截。本文件在引擎脚本之后、SceneManager.run 之前执行，
  // 所以监听器注册得比 SceneManager.setupEventHandlers 更早；同时用捕获阶段，
  // 避免游戏插件包装过的 onError 再弹一次错误页。
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function" &&
    !window.__CHEAT_RESIZE_OBSERVER_GUARD__
  ) {
    const guard = (event) => {
      if (isResizeObserverLoopEvent(event)) {
        event.stopImmediatePropagation();
      }
    };

    // 暴露给自动化测试，便于确认拦截器已经安装。
    window.__CHEAT_RESIZE_OBSERVER_GUARD__ = guard;
    window.addEventListener("error", guard, true);
  }

  if (typeof SceneManager === "undefined" || !SceneManager) {
    return;
  }

  const original = SceneManager.onError;

  if (
    typeof original !== "function" ||
    original.__cheatResizeObserverFiltered
  ) {
    return;
  }

  function onErrorFiltered(event) {
    if (isResizeObserverLoopEvent(event)) {
      return;
    }

    return original.apply(this, arguments);
  }

  onErrorFiltered.__cheatResizeObserverFiltered = true;
  SceneManager.onError = onErrorFiltered;
}

function validateNwjsVersion() {
  if (!(typeof require === "function" && typeof process === "object")) {
    return true;
  }

  const nwjsVersion = process.versions["node-webkit"];
  const minRequiredNwjsVersion = "0.44.0";

  if (!nwjsVersion) {
    // 拿不到版本号时不做判断，避免 undefined.localeCompare 抛错
    return true;
  }

  const lowVersion =
    nwjsVersion.localeCompare(minRequiredNwjsVersion, undefined, {
      numeric: true,
    }) < 0;

  if (lowVersion) {
    const msg = `Node Webkit version of game is too low to using cheat
  - version=${nwjsVersion}, minimum required version=${minRequiredNwjsVersion}
Cheat may not work properly.

Click "OK" button to see the solution.
`;
    const docsUrl =
      "https://github.com/233lol/RPG-Maker-MV-MZ-Cheat-UI-Plugin-Plus#readme";

    if (window.confirm(msg)) {
      window.open(docsUrl, "_blank");
    }
    return false;
  }

  return true;
}

function applyCheat() {
  // 插件 / 启动器 / 热重载可能再次加载本文件。重复执行会创建第二个
  // #app、第二套 Vue 实例和 window 监听，必须在入口处拦截。
  if (window.__CHEAT_APPLIED__) {
    console.warn("[cheat plugin] 作弊模块已经初始化，跳过重复加载");
    return;
  }

  window.__CHEAT_APPLIED__ = true;

  ignoreResizeObserverLoopErrors();

  function __addScript(type, src) {
    const cheatScript = document.createElement("script");
    cheatScript.type = type;
    cheatScript.src = src;

    document.body.appendChild(cheatScript);
  }

  // add <div id='app'> node for vue
  const appDiv = document.createElement("div");

  appDiv.id = "app";
  appDiv.style.cssText =
    "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999;";
  appDiv.innerHTML = `
<v-app>
    <v-main>
        <main-component></main-component>
    </v-main>
</v-app>
`;

  document.body.appendChild(appDiv);

  // import in head：只做增量插入，不要用 innerHTML += ——
  // 那等价于「把整个 head 序列化成字符串再整段重新解析」，游戏自带的
  // link / style / meta 会全部销毁重建，既有样式表可能被重新请求并引起闪烁。
  const cheatStyleSheets = [
    "cheat/css/roboto.css",
    "cheat/css/materialdesignicons.css",
    "cheat/css/vuetify.css",
    "cheat/css/main.css",
  ];

  // 按数组顺序依次追加，保证层叠顺序（vuetify.css 在 main.css 之前），与原实现一致；
  // 已存在相同 href 时跳过，重复执行不会插入两份
  cheatStyleSheets.forEach((href) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });

  // import in body
  __addScript("module", "cheat/init/setup.js");
}

// 版本过低只弹提示、不阻断：无论校验结果如何都继续加载 cheat（保持原有行为）
validateNwjsVersion();
applyCheat();
