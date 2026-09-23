function validateNwjsVersion() {
  if (!(typeof require === "function" && typeof process === "object")) {
    return true;
  }

  const nwjsVersion = process.versions["node-webkit"];
  const minRequiredNwjsVersion = "0.44.0";

  const lowVersion = nwjsVersion.localeCompare(minRequiredNwjsVersion, undefined, { numeric: true }) < 0;

  if (lowVersion) {
    let msg = "";
    let docsUrl = "";

    msg = `Node Webkit version of game is too low to using cheat
  - version=${nwjsVersion}, minimum required version=${minRequiredNwjsVersion}
Cheat may not work properly.

Click "OK" button to see the solution.
`;
    docsUrl =
      "https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin#if-embeded-nwjs-version-of-game-is-lower-than-0264";

    if (window.confirm(msg)) {
      window.open(docsUrl, "_blank");
    }
    return false;
  }

  return true;
}

function applyCheat() {
  function __addScript(type, src) {
    var cheatScript = document.createElement("script");
    cheatScript.type = type;
    cheatScript.src = src;

    document.body.appendChild(cheatScript);
  }

  function __loadJavaScript(src) {
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = src;
    script.async = false;
    script._url = src;
    document.body.appendChild(script);
  }

  // add <div id='app'> node for vue
  const appDiv = document.createElement("div");

  appDiv.id = "app";
  appDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999;";
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

validateNwjsVersion();
applyCheat();
