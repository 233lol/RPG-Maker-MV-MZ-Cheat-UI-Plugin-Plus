import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const IS_WINDOWS = process.platform === "win32";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function detectGameType(gameDir) {
  if (existsSync(path.join(gameDir, "www", "index.html"))) {
    return "mv";
  }
  if (existsSync(path.join(gameDir, "index.html"))) {
    return "mz";
  }
  throw new Error(
    `无法识别游戏类型：${gameDir} 下既没有 www/index.html 也没有 index.html`,
  );
}

export function resolveNwExecutable() {
  const candidates = [];

  if (process.env.NWJS_PATH) {
    candidates.push(process.env.NWJS_PATH);
  }

  // scoop / 手动安装的常见位置
  const home = os.homedir();
  candidates.push(
    path.join(home, "scoop", "apps", "nwjs-sdk", "current", "nwjs-sdk", "nw.exe"),
    path.join(home, "scoop", "apps", "nwjs", "current", "nwjs", "nw.exe"),
    path.join(home, "scoop", "shims", "nw.exe"),
    "/usr/local/bin/nw",
    "/usr/bin/nw",
    "/opt/nwjs/nw",
  );

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return resolveShim(candidate);
    }
  }

  // 从 PATH 里找。Windows 的 scoop shim 旁边通常有一个 .shim 文件，
  // 里面写着真正的可执行文件路径，优先用真实路径（进程树更好管理）。
  try {
    const finder = IS_WINDOWS ? "where" : "which";
    const output = execFileSync(finder, ["nw"], { encoding: "utf8" });
    for (const line of output.split(/\r?\n/)) {
      const found = line.trim();
      if (found && existsSync(found)) {
        return resolveShim(found);
      }
    }
  } catch (error) {
    // 继续抛下面的错误
  }

  throw new Error(
    "找不到 nw.js 可执行文件。请安装 nwjs-sdk，或用 NWJS_PATH 环境变量指定 nw 的路径。\n" +
      "例如：NWJS_PATH=C:\\path\\to\\nwjs-sdk\\nw.exe node tests/run.mjs",
  );
}

function resolveShim(executable) {
  const shim = executable.replace(/\.exe$/i, ".shim");

  if (existsSync(shim)) {
    try {
      const text = readFileSync(shim, "utf8");
      const match = text.match(/^\s*path\s*=\s*"(.+?)"/m);

      if (match && existsSync(match[1])) {
        return match[1];
      }
    } catch (error) {
      // 解析失败就用原路径
    }
  }

  return executable;
}

export function installCheat(repoRoot, gameDir, type) {
  const source = path.join(repoRoot, "cheat-engine", "www", "cheat");
  const initMain = path.join(
    repoRoot,
    "cheat-engine",
    "www",
    "_cheat_initialize",
    type,
    "js",
    "main.js",
  );

  const requiredVendorFiles = [
    path.join(source, "libs", "vue.js"),
    path.join(source, "libs", "vuetify.js"),
    path.join(source, "libs", "shiki.bundle.mjs"),
    path.join(source, "css", "vuetify.css"),
    path.join(source, "css", "materialdesignicons.css"),
  ];

  const missing = requiredVendorFiles.filter((file) => !existsSync(file));

  if (missing.length > 0) {
    throw new Error(
      "缺少 vendor 文件，先运行 `pnpm i && make vendor`（或 `pnpm run vendor:libs && pnpm run vendor:shiki`）：\n" +
        missing.map((file) => `  - ${path.relative(repoRoot, file)}`).join("\n"),
    );
  }

  const gameRoot = type === "mv" ? path.join(gameDir, "www") : gameDir;
  const destination = path.join(gameRoot, "cheat");

  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
  copyFileSync(initMain, path.join(gameRoot, "js", "main.js"));

  return { gameRoot, destination };
}

export function backupCheatSettings(gameDir) {
  const settingsDir = path.join(gameDir, "www", "cheat-settings");
  const backupDir = path.join(os.tmpdir(), "opencode-cheat-test-settings", `${path.basename(gameDir)}-${Date.now()}`);

  const existed = existsSync(settingsDir);

  if (existed) {
    mkdirSync(path.dirname(backupDir), { recursive: true });
    cpSync(settingsDir, backupDir, { recursive: true });
    rmSync(settingsDir, { recursive: true, force: true });
  }

  return {
    restore() {
      rmSync(settingsDir, { recursive: true, force: true });

      if (existed && existsSync(backupDir)) {
        cpSync(backupDir, settingsDir, { recursive: true });
      }

      rmSync(backupDir, { recursive: true, force: true });

      // 如果原本没有 www/ 目录，测试过程中创建的 www/ 也一并清掉，
      // 避免在 MZ 游戏里留下一个空目录。
      const wwwDir = path.dirname(settingsDir);
      if (!existed) {
        try {
          if (readdirSync(wwwDir).length === 0) {
            rmSync(wwwDir, { recursive: true, force: true });
          }
        } catch (error) {
          // 目录不存在 / 非空都无所谓
        }
      }
    },
  };
}

export function backupSaveGlobals(gameDir, type) {
  const saveDir =
    type === "mv"
      ? path.join(gameDir, "www", "save")
      : path.join(gameDir, "save");
  const backupDir = path.join(
    os.tmpdir(),
    "opencode-cheat-test-globals",
    `${path.basename(gameDir)}-${Date.now()}`,
  );

  const files = [];

  try {
    for (const name of readdirSync(saveDir)) {
      if (!name.startsWith("global.")) continue;
      const source = path.join(saveDir, name);
      const target = path.join(backupDir, name);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
      files.push(name);
    }
  } catch (error) {
    // 存档目录不存在 / 没有 global 文件都正常
  }

  return {
    restore() {
      try {
        for (const name of readdirSync(saveDir)) {
          if (name.startsWith("global.")) {
            rmSync(path.join(saveDir, name), { force: true });
          }
        }
      } catch (error) {
        // ignore
      }

      for (const name of files) {
        const source = path.join(backupDir, name);
        try {
          copyFileSync(source, path.join(saveDir, name));
        } catch (error) {
          // ignore
        }
      }

      rmSync(backupDir, { recursive: true, force: true });
    },
  };
}

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

export class NwGame {
  constructor({ repoRoot, gameDir, type, nwPath }) {
    this.repoRoot = repoRoot;
    this.gameDir = gameDir;
    this.type = type;
    this.nwPath = nwPath || resolveNwExecutable();
    this.packagePath = path.join(gameDir, "package.json");
    this.originalPackage = null;
    this.child = null;
    this.ws = null;
    this.port = null;
    this.pending = new Map();
    this.nextId = 0;
    this.exceptions = [];
    this.consoleErrors = [];
    this.outputLines = [];
    this.closed = false;
  }

  async start() {
    if (typeof WebSocket === "undefined") {
      throw new Error(
        "当前 Node.js 没有内置 WebSocket。请使用 Node.js >= 22（node -v 查看）。",
      );
    }

    this.port = await getFreePort();

    const profileDir = path.join(
      os.tmpdir(),
      "opencode-cheat-test-profile",
      `${this.type}-${this.port}`,
    );
    rmSync(profileDir, { recursive: true, force: true });
    mkdirSync(profileDir, { recursive: true });
    this.profileDir = profileDir;

    this.originalPackage = readFileSync(this.packagePath, "utf8");
    const pkg = JSON.parse(this.originalPackage);

    pkg.window = { ...(pkg.window || {}), show: false };
    writeFileSync(this.packagePath, JSON.stringify(pkg, null, 2));

    const args = [
      this.gameDir,
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${profileDir}`,
      "--mute-audio",
      "--no-first-run",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ];

    // 隐藏窗口在无 GPU / 无显示器的环境里会让 MZ 的 initGraphics 失败。
    // 默认强制 SwiftShader 软件 WebGL，保证真正无头；需要测真实 GPU 时用
    // NW_TEST_GPU=1 关闭这些参数。
    if (process.env.NW_TEST_GPU !== "1") {
      args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
    }

    if (process.env.NWJS_ARGS) {
      args.push(...process.env.NWJS_ARGS.split(/\s+/).filter(Boolean));
    }

    this.child = spawn(this.nwPath, args, {
      cwd: this.gameDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stdout.on("data", (chunk) => this.captureOutput(chunk));
    this.child.stderr.on("data", (chunk) => this.captureOutput(chunk));

    const page = await this.waitForPage();
    await this.connect(page);
    await this.waitForCheatUi();
    await this.waitForSceneStartup();
  }

  async waitForSceneStartup() {
    await this.waitFor(
      () => {
        if (typeof SceneManager === "undefined") return false;
        const scene = SceneManager._scene;
        return (
          !!scene &&
          scene.constructor &&
          scene.constructor.name !== "Scene_Boot"
        );
      },
      { timeout: 120000, interval: 200, label: "游戏启动完成" },
    );
  }

  captureOutput(chunk) {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      this.outputLines.push(line);
      if (this.outputLines.length > 80) this.outputLines.shift();
    }
  }

  async waitForPage() {
    const deadline = Date.now() + 60000;
    let lastError = null;

    while (Date.now() < deadline) {
      if (this.child && this.child.exitCode !== null) {
        throw new Error(
          `nw.js 进程提前退出（code=${this.child.exitCode}）\n${this.outputLines.join("\n")}`,
        );
      }

      try {
        const response = await fetch(
          `http://127.0.0.1:${this.port}/json/list`,
        );
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");

        if (page && page.webSocketDebuggerUrl) {
          return page;
        }
      } catch (error) {
        lastError = error;
      }

      await sleep(250);
    }

    throw new Error(
      `等待 nw.js 页面超时（port=${this.port}）` +
        (lastError ? `\n${lastError.message}` : "") +
        `\n${this.outputLines.join("\n")}`,
    );
  }

  async connect(page) {
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline) {
      try {
        this.ws = new WebSocket(page.webSocketDebuggerUrl);

        await new Promise((resolve, reject) => {
          this.ws.onopen = resolve;
          this.ws.onerror = (event) =>
            reject(new Error(`WebSocket 连接失败: ${event?.message || "unknown"}`));
        });

        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await sleep(250);
      }
    }

    this.ws.onmessage = (event) => this.onMessage(event);
    this.ws.onclose = () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("CDP 连接已关闭"));
      }
      this.pending.clear();
    };

    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Page.enable");
  }

  onMessage(event) {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }

      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      const description =
        details?.exception?.description || details?.text || "Unknown exception";
      this.exceptions.push(description);
      return;
    }

    if (message.method === "Runtime.consoleAPICalled") {
      if (message.params.type === "error" || message.params.type === "assert") {
        const text = (message.params.args || [])
          .map((arg) => arg.value ?? arg.description ?? "")
          .join(" ");
        this.consoleErrors.push(text);
      }
      return;
    }

    if (message.method === "Log.entryAdded") {
      const entry = message.params.entry;

      if (entry && entry.level === "error") {
        this.consoleErrors.push(`${entry.text || ""} ${entry.url || ""}`.trim());
      }
    }
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP 连接未就绪"));
    }

    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(fn, arg) {
    const source = fn.toString();
    const expression =
      arg === undefined
        ? `(${source})()`
        : `(${source})(${JSON.stringify(arg)})`;

    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "页面脚本执行失败";
      throw new Error(description);
    }

    return result.result?.value;
  }

  async waitFor(predicate, { timeout = 15000, interval = 100, label = "条件" } = {}) {
    const deadline = Date.now() + timeout;
    let lastValue;

    while (Date.now() < deadline) {
      lastValue = await this.evaluate(() => {
        const errorPrinter = document.getElementById("errorPrinter");
        if (errorPrinter) {
          const text = (errorPrinter.innerText || errorPrinter.textContent || "").trim();
          if (text) {
            return {
              __pageError: text,
              __pageErrorHtml: errorPrinter.innerHTML,
            };
          }
        }
        return null;
      });

      if (lastValue && lastValue.__pageError) {
        throw new Error(
          `游戏页面报错：\n${lastValue.__pageError}\n\n${lastValue.__pageErrorHtml || ""}`,
        );
      }

      const value = await this.evaluate(predicate);

      if (value) {
        return value;
      }

      await sleep(interval);
    }

    throw new Error(`等待${label}超时（${timeout} ms）`);
  }

  async waitForCheatUi() {
    await this.waitFor(
      () => {
        const app = document.getElementById("app");
        if (!app || !app._vnode) return false;

        const stack = [app._vnode];
        const seen = new Set();

        while (stack.length > 0) {
          const node = stack.pop();
          if (!node || typeof node !== "object" || seen.has(node)) continue;
          seen.add(node);

          if (node.component) {
            const instance = node.component;
            if (instance.type && instance.type.name === "MainComponent") {
              return true;
            }
            if (instance.subTree) stack.push(instance.subTree);
          }

          if (Array.isArray(node.children)) {
            for (const child of node.children) stack.push(child);
          }
          if (node.suspense?.activeBranch) stack.push(node.suspense.activeBranch);
        }

        return false;
      },
      { timeout: 90000, interval: 250, label: "作弊 UI 挂载" },
    );
  }

  async dispatchShortcut({ key, code, keyCode, modifiers = 0 }) {
    const base = {
      key,
      code,
      modifiers,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    };

    await this.send("Input.dispatchKeyEvent", { ...base, type: "keyDown" });
    await this.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  }

  getCheatErrors() {
    const fromCheat = (text) => /\/cheat\//.test(String(text));
    return [
      ...this.exceptions.filter(fromCheat),
      ...this.consoleErrors.filter(fromCheat),
    ];
  }

  getPageErrors() {
    return {
      exceptions: [...this.exceptions],
      consoleErrors: [...this.consoleErrors],
      output: [...this.outputLines],
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    // 先试着正常退出；隐藏窗口下 nw.App.quit() 通常有效。
    try {
      await Promise.race([
        this.evaluate(() => {
          try {
            if (typeof nw !== "undefined" && nw.App && nw.App.quit) {
              nw.App.quit();
              return true;
            }
          } catch (error) {
            // ignore
          }
          return false;
        }),
        sleep(1500),
      ]);
    } catch (error) {
      // 页面已经关闭 / CDP 已断开，继续强杀
    }

    try {
      this.ws?.close();
    } catch (error) {
      // ignore
    }

    await this.killProcessTree();

    if (this.originalPackage !== null) {
      writeFileSync(this.packagePath, this.originalPackage);
    }

    if (this.profileDir && process.env.NW_TEST_KEEP_PROFILE !== "1") {
      rmSync(this.profileDir, { recursive: true, force: true });
    }
  }

  async killProcessTree() {
    const child = this.child;

    if (!child || child.exitCode !== null) return;

    if (IS_WINDOWS) {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch (error) {
        // 进程可能已经退出
      }
    } else {
      try {
        child.kill("SIGKILL");
      } catch (error) {
        // ignore
      }
    }

    const deadline = Date.now() + 5000;

    while (child.exitCode === null && Date.now() < deadline) {
      await sleep(100);
    }
  }
}
