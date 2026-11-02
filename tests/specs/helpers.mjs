// 这些函数会被序列化后送进游戏页面执行，因此不能引用模块作用域里的变量。

export function installTestApi() {
  const appElement = document.getElementById("app");

  function findComponent(name) {
    const root = appElement ? appElement._vnode : null;
    const seen = new Set();

    function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 100 || seen.has(node)) {
        return null;
      }
      seen.add(node);

      if (node.component) {
        const instance = node.component;
        if (instance.type && instance.type.name === name) {
          return instance;
        }
        const found = walk(instance.subTree, depth + 1);
        if (found) return found;
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = walk(child, depth + 1);
          if (found) return found;
        }
      }

      if (node.suspense?.activeBranch) {
        const found = walk(node.suspense.activeBranch, depth + 1);
        if (found) return found;
      }

      return null;
    }

    return walk(root, 0);
  }

  const api = {
    findComponent,

    main() {
      return this.findComponent("MainComponent")?.proxy || null;
    },

    panel(name) {
      return this.findComponent(name)?.proxy || null;
    },

    async waitFor(fn, timeout = 5000, interval = 50) {
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        const value = fn();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      return null;
    },

    async openPanel(navName, componentName, timeout = 10000) {
      const main = this.main();
      if (!main) throw new Error("MainComponent 尚未挂载");

      main.openCheatModal(navName);

      const panel = await this.waitFor(
        () => this.panel(componentName),
        timeout,
        50,
      );

      if (!panel) {
        throw new Error(`面板 ${componentName} 没有在 ${timeout} ms 内挂载`);
      }

      return panel;
    },

    async startGame() {
      DataManager.setupNewGame();
      SceneManager.goto(Scene_Map);

      const result = await this.waitFor(
        () => {
          if (SceneManager._scene?.constructor?.name !== "Scene_Map") {
            return null;
          }
          if (typeof $gameMap === "undefined" || !$gameMap) return null;
          if ($gameMap.mapId() <= 0) return null;
          if (typeof $dataMap === "undefined" || !$dataMap) return null;

          return {
            scene: SceneManager._scene.constructor.name,
            mapId: $gameMap.mapId(),
            player: { x: $gamePlayer.x, y: $gamePlayer.y },
            gold: $gameParty.gold(),
            party: $gameParty.members().map((actor) => ({
              id: actor.actorId(),
              name: actor.name(),
              hp: actor.hp,
              mhp: actor.mhp,
              mp: actor.mp,
              mmp: actor.mmp,
              level: actor.level,
            })),
          };
        },
        20000,
        100,
      );

      if (!result) throw new Error("新游戏没有在 20 秒内进入地图");

      return result;
    },

    saveExists(slot) {
      if (
        typeof DataManager !== "undefined" &&
        typeof DataManager.savefileExists === "function"
      ) {
        return !!DataManager.savefileExists(slot);
      }

      if (
        typeof StorageManager !== "undefined" &&
        typeof StorageManager.exists === "function"
      ) {
        return !!StorageManager.exists(slot);
      }

      return false;
    },

    async waitSave(slot, timeout = 10000) {
      const ok = await this.waitFor(
        () => this.saveExists(slot),
        timeout,
        100,
      );

      if (!ok) throw new Error(`存档 ${slot} 没有在 ${timeout} ms 内写入`);

      return true;
    },

    findFreeSlots(count) {
      const max =
        typeof DataManager.maxSavefiles === "function"
          ? DataManager.maxSavefiles()
          : 20;
      const slots = [];

      for (let slot = max; slot >= 1 && slots.length < count; slot--) {
        if (!this.saveExists(slot)) slots.push(slot);
      }

      return slots;
    },

    async waitScene(name, timeout = 15000) {
      return this.waitFor(
        () => SceneManager._scene?.constructor?.name === name,
        timeout,
        100,
      );
    },
  };

  window.__cheatTest = api;

  return true;
}
