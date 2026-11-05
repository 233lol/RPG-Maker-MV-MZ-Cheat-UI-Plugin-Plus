import { Alert } from "./AlertHelper.js";
import { KeyValueStorage } from "./KeyValueStorage.js";
import { getCheatSettingsPath } from "./SettingsPath.js";
import { requireGameReady } from "./GameState.js";
import { subscribeGameData } from "./GameDataState.js";

export class GeneralCheat {
  // will be replaced from main component
  static toggleCheatModal(componentName = null) {}

  static openCheatModal(componentName = null) {}

  static toggleNoClip(notify = false) {
    // 键盘监听在 app 挂载时就绑定了，读档 / 加载转圈（MZ 还要初始化 effekseer
    // WASM）这段窗口里 $gamePlayer 还不存在，直接取属性会抛错。
    if (!requireGameReady("切换穿墙状态")) {
      return;
    }

    $gamePlayer._through = !$gamePlayer._through;

    if (notify) {
      Alert.success(`穿墙状态: ${$gamePlayer._through}`);
    }
  }

  // 无敌状态存在静态 Map 上，用 actorId 做 key，并额外记录「打补丁时的那个实例」。
  //
  // 原来用 Game_Actor 实例做 key 有两个问题：
  //  1. 泄漏：DataManager.setupNewGame() / 读档都会重建 Game_Actor，旧实例被
  //     Map 强引用、永远不释放，getGodModeOnActorIds() 还会遍历到僵尸条目。
  //  2. 状态说谎：实例换掉后 Map 里的 godMode 仍是 true，但猴补丁打在旧实例上，
  //     新实例并没有被保护 —— UI 显示「无敌」而实际不生效。
  //
  // 改用 actorId 做 key 后条目数有上界（不会无界增长），取用时校验实例是否还是
  // 同一个，不是就丢弃重建。
  // 注意：无敌本来就不跨存档 —— 猴补丁挂在实例上，读档后实例重建就没了。
  // 这里显式重置为「未开启」，而不是留着骗人的 flag。
  static getGodModeMap() {
    if (!this.godModeMap) {
      this.godModeMap = new Map();
    }

    return this.godModeMap;
  }

  static getGodModeData(actor) {
    if (!(actor instanceof Game_Actor)) {
      return null;
    }

    const actorId = actor._actorId;
    const map = this.getGodModeMap();
    const cached = map.get(actorId);

    if (cached && cached.actor === actor) {
      return cached;
    }

    const data = {
      actor: actor,
      actorId: actorId,
      godMode: false,
    };

    map.set(actorId, data);

    return data;
  }

  // 当前真正开启了无敌的角色实例。
  // 读档 / 新游戏会重建 Game_Actor，旧实例上的猴补丁已经无效；
  // 这里顺手清掉过期条目（无敌本来就不跨存档）。
  static getGodModeActors() {
    const ret = [];
    const map = this.getGodModeMap();

    for (const [actorId, data] of map) {
      if (!data.godMode || !data.actor) {
        continue;
      }

      let liveActor = null;

      try {
        if (typeof $gameActors !== "undefined" && $gameActors) {
          liveActor = $gameActors.actor(actorId);
        }
      } catch (error) {
        liveActor = null;
      }

      if (liveActor && liveActor !== data.actor) {
        map.delete(actorId);
        continue;
      }

      ret.push(data.actor);
    }

    return ret;
  }

  static getGodModeOnActorIds() {
    return this.getGodModeActors().map((actor) => actor._actorId);
  }

  // 共享的 1s 回血 / 回蓝 / 回 TP 定时器。
  // 原来每个开启无敌的角色各起一个 setInterval，N 个角色就是 N 个定时器，
  // 各自调用 gainHp() → refresh()。改为单个定时器遍历所有开启的角色，
  // 全员关闭时自动停掉。
  static syncGodModeInterval() {
    if (this.getGodModeActors().length === 0) {
      if (this.godModeInterval) {
        clearInterval(this.godModeInterval);
        this.godModeInterval = undefined;
      }
      return;
    }

    if (this.godModeInterval) {
      return;
    }

    this.godModeInterval = setInterval(() => {
      const actors = GeneralCheat.getGodModeActors();

      if (actors.length === 0) {
        GeneralCheat.syncGodModeInterval();
        return;
      }

      for (const actor of actors) {
        actor.gainHp(actor.mhp);
        actor.gainMp(actor.mmp);
        actor.gainTp(actor.maxTp());
      }
    }, 1000);
  }

  static godModeOn(actor) {
    if (!(actor instanceof Game_Actor) || this.isGodMode(actor)) {
      return;
    }

    if (!requireGameReady("切换无敌模式")) {
      return;
    }

    const godModeData = this.getGodModeData(actor);
    godModeData.godMode = true;

    actor.gainHP_bkup = actor.gainHp;
    actor.gainHp = function (value) {
      value = actor.mhp;
      actor.gainHP_bkup(value);
    };

    actor.setHp_bkup = actor.setHp;
    actor.setHp = function (hp) {
      hp = actor.mhp;
      actor.setHp_bkup(hp);
    };

    actor.gainMp_bkup = actor.gainMp;
    actor.gainMp = function (value) {
      value = actor.mmp;
      actor.gainMp_bkup(value);
    };

    actor.setMp_bkup = actor.setMp;
    actor.setMp = function (mp) {
      mp = actor.mmp;
      actor.setMp_bkup(mp);
    };

    actor.gainTp_bkup = actor.gainTp;
    actor.gainTp = function (value) {
      value = actor.maxTp();
      actor.gainTp_bkup(value);
    };

    actor.setTp_bkup = actor.setTp;
    actor.setTp = function (tp) {
      tp = actor.maxTp();
      actor.setTp_bkup(tp);
    };

    actor.paySkillCost_bkup = actor.paySkillCost;
    actor.paySkillCost = function (skill) {
      // do nothing
    };

    this.syncGodModeInterval();
  }

  static godModeOff(actor) {
    if (!(actor instanceof Game_Actor) || !this.isGodMode(actor)) {
      return;
    }

    if (!requireGameReady("切换无敌模式")) {
      return;
    }

    const godModeData = this.getGodModeData(actor);
    godModeData.godMode = false;

    if (actor.gainHP_bkup) {
      actor.gainHp = actor.gainHP_bkup;
      actor.setHp = actor.setHp_bkup;
      actor.gainMp = actor.gainMp_bkup;
      actor.setMp = actor.setMp_bkup;
      actor.gainTp = actor.gainTp_bkup;
      actor.setTp = actor.setTp_bkup;
      actor.paySkillCost = actor.paySkillCost_bkup;

      // 备份字段必须清掉：Game_Actor 会被 JsonEx 逐字段写进存档，
      // 不清的话存档里会残留这些函数字段（读档后变成 undefined）。
      delete actor.gainHP_bkup;
      delete actor.setHp_bkup;
      delete actor.gainMp_bkup;
      delete actor.setMp_bkup;
      delete actor.gainTp_bkup;
      delete actor.setTp_bkup;
      delete actor.paySkillCost_bkup;
    }

    this.syncGodModeInterval();
  }

  static toggleGodMode(actor) {
    if (this.isGodMode(actor)) {
      this.godModeOff(actor);
    } else {
      this.godModeOn(actor);
    }
  }

  static isGodMode(actor) {
    const godModeData = this.getGodModeData(actor);
    return godModeData ? godModeData.godMode : false;
  }
}

export class GameSpeedCheat {
  static sceneOptions() {
    if (!this._sceneOptions) {
      this._sceneOptions = {
        all() {
          return true;
        },

        battle() {
          return SceneManager._scene instanceof Scene_Battle;
        },
      };
    }

    return this._sceneOptions;
  }

  static getRate() {
    if (this.rate) {
      return this.rate;
    }

    return 1;
  }

  static getSceneOption() {
    if (this.sceneOption) {
      return this.sceneOption;
    }

    return this.sceneOptions().all;
  }

  static removeApplied() {
    if (this.isApplied) {
      SceneManager.updateScene = this.origin_SceneManager_updateScene;
      Scene_Map.prototype.update = this.origin_Scene_Map_update;
      Spriteset_Base.prototype.update = this.origin_Spriteset_Base_update;
      this.isApplied = false;
    }
  }

  static setGameSpeed(rate, sceneOption) {
    // 损坏的配置 / 缺失的 param 可能传进 NaN、0 或非函数，
    // 直接进入 updateScene 包装器会让 currStep 恒为 NaN，游戏一帧都不再更新。
    rate = Number(rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      rate = 1;
    }

    if (typeof sceneOption !== "function") {
      sceneOption = GameSpeedCheat.sceneOptions().all;
    }

    // backup original functions
    if (!this.origin_SceneManager_updateScene) {
      this.origin_SceneManager_updateScene = SceneManager.updateScene;
    }

    if (!this.origin_Scene_Map_update) {
      this.origin_Scene_Map_update = Scene_Map.prototype.update;
    }

    if (!this.origin_Spriteset_Base_update) {
      this.origin_Spriteset_Base_update = Spriteset_Base.prototype.update;
    }

    this.rate = rate;
    this.sceneOption = sceneOption;

    // remove previously modified functions
    this.removeApplied();

    // if rate is 1, do not modify functions
    if (Math.abs(rate - 1.0) < Number.EPSILON) {
      return;
    }

    // updateScene triggers event such as key inpuy, mouse input ...
    // It occurs double click.
    const SceneManager_updateScene = this.origin_SceneManager_updateScene;
    let currentUpdateSceneRate = 0;
    SceneManager.updateScene = function () {
      if (!sceneOption()) {
        SceneManager_updateScene.call(this);
        return;
      }

      currentUpdateSceneRate += rate;
      const currStep = Math.floor(currentUpdateSceneRate);
      currentUpdateSceneRate -= currStep;

      if (currStep > 0) {
        // update original frame
        SceneManager_updateScene.call(this);

        // update duplicated frames
        for (let i = 0; i < currStep - 1; ++i) {
          if (SceneManager.updateInputData) {
            SceneManager.updateInputData();
          }
          SceneManager.changeScene();
          SceneManager_updateScene.call(this);
        }
      }
    };

    this.isApplied = true;
  }

  static __writeSettings(rate, sceneOption) {
    const options = GameSpeedCheat.sceneOptions();
    const sceneOptionKey = Object.keys(GameSpeedCheat.sceneOptions()).find(
      (key) => options[key] === sceneOption,
    );

    const storage = new KeyValueStorage(getCheatSettingsPath("gameSpeed.json"));

    storage.setItem(
      "data",
      JSON.stringify({ rate: rate, sceneOption: sceneOptionKey }),
    );
  }

  static __readSettings() {
    const storage = new KeyValueStorage(getCheatSettingsPath("gameSpeed.json"));

    const json = storage.getItem("data");

    if (!json) {
      return;
    }

    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      return;
    }

    // rate 未校验会让损坏的配置直接进 setGameSpeed：
    // 超大值使 SceneManager.updateScene 每帧进入巨量循环（游戏卡死且每次启动自动重试），
    // 非数值则变 NaN 静默失效。范围与 GeneralPanel.maxGameSpeed 保持一致。
    if (typeof data.rate !== "number" || !Number.isFinite(data.rate)) {
      return;
    }

    if (data.rate <= 0 || data.rate > 10) {
      return;
    }

    // 白名单校验：__proto__ / 不存在的方法名会取到 Object.prototype，
    // 之后包装器每帧调用 sceneOption() 都会抛错，表现为游戏卡死。
    const options = GameSpeedCheat.sceneOptions();
    const sceneOption = Object.prototype.hasOwnProperty.call(
      options,
      data.sceneOption,
    )
      ? options[data.sceneOption]
      : options.all;

    GameSpeedCheat.setGameSpeed(data.rate, sceneOption);
  }
}

export class SpeedCheat {
  // static fixed = null // WARN: declaring static variable occurs error in nw.js (why?)

  static isFixed() {
    return !!SpeedCheat.fixed;
  }

  static setFixSpeedInterval(speed) {
    if (SpeedCheat.isFixed()) {
      SpeedCheat.removeFixSpeedInterval();
    }

    SpeedCheat.fixed = setInterval(() => {
      SpeedCheat.__setSpeed(speed, false);
    }, 1000);
  }

  static removeFixSpeedInterval() {
    if (SpeedCheat.isFixed()) {
      clearInterval(SpeedCheat.fixed);
      SpeedCheat.fixed = undefined;
    }
  }

  static __setSpeed(speed) {
    if ($gamePlayer) {
      $gamePlayer.setMoveSpeed(speed);
    }
  }

  static setSpeed(speed, fixed = false) {
    if (!requireGameReady("修改移动速度")) {
      return;
    }

    SpeedCheat.__setSpeed(speed);

    if (fixed) {
      SpeedCheat.setFixSpeedInterval(speed);
    } else {
      SpeedCheat.removeFixSpeedInterval();
    }
  }

  static __writeSettings(speed, fixed) {
    const storage = new KeyValueStorage(getCheatSettingsPath("speed.json"));

    storage.setItem("data", JSON.stringify({ speed: speed, fixed: fixed }));
  }

  static __readSettings() {
    const storage = new KeyValueStorage(getCheatSettingsPath("speed.json"));

    const json = storage.getItem("data");

    if (!json) {
      return;
    }

    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      return;
    }

    // 与 GeneralPanel 的移动速度滑块保持一致（1-10）。
    // 只校验 isFinite 不够：0 / 负数 / 1e9 也会被接受，固定速度定时器
    // 每秒把角色速度设成这些值，轻则角色瞬移，重则游戏逻辑异常。
    if (typeof data.speed !== "number" || !Number.isFinite(data.speed)) {
      return;
    }

    if (data.speed < 1 || data.speed > 10) {
      return;
    }

    if (data.fixed) {
      // 启动阶段游戏数据可能还没创建：先启动定时器，__setSpeed 会等
      // $gamePlayer 出现后再套用，保持“固定速度”跨读档生效的旧行为。
      SpeedCheat.setFixSpeedInterval(data.speed);
    }
  }
}

export class SceneCheat {
  static gotoTitle() {
    SceneManager.goto(Scene_Title);
  }

  static toggleSaveScene() {
    const scene = SceneManager._scene;

    if (scene instanceof Scene_Save) {
      SceneManager.pop();
    } else if (scene instanceof Scene_Load) {
      SceneManager.goto(Scene_Save);
    } else {
      SceneManager.push(Scene_Save);
    }
  }

  static toggleLoadScene() {
    const scene = SceneManager._scene;

    if (scene instanceof Scene_Load) {
      SceneManager.pop();
    } else if (scene instanceof Scene_Save) {
      SceneManager.goto(Scene_Load);
    } else {
      SceneManager.push(Scene_Load);
    }
  }

  static async quickSave(slot = 1) {
    if (!requireGameReady("快速保存")) {
      return false;
    }

    try {
      $gameSystem.onBeforeSave();
      const result = await DataManager.saveGame(slot);

      if (result === false) {
        throw new Error("游戏拒绝了本次存档");
      }

      Alert.success(`保存进度到存档 ${slot}`);
      return true;
    } catch (error) {
      console.warn("[cheat plugin] 快速保存失败", error);
      Alert.error(`保存到存档 ${slot} 失败`, error);
      return false;
    }
  }

  // 读档成功后补齐 Scene_Load 原本会做的收尾。
  //
  // 直接 DataManager.loadGame() + SceneManager.goto(Scene_Map) 会漏掉：
  //   - MZ 的 Scene_Load.reloadMapIfUpdated()：游戏更新过地图数据后，
  //     读档仍会停留在旧地图上；
  //   - MZ 的 $gameSystem.onAfterLoad()：部分插件依赖它做读档后的初始化；
  //   - 当前场景的 fadeOutAll()：读档时的淡出过渡。
  // 这些步骤都不影响「存档已经加载成功」这个结果，所以任何一步失败都只
  // 打警告，不把一次成功的读档判成失败。
  static finishLoadIntoMap() {
    const scene = SceneManager._scene;

    try {
      if (scene && typeof scene.fadeOutAll === "function") {
        scene.fadeOutAll();
      }
    } catch (error) {
      console.warn("[cheat plugin] 读档淡出失败", error);
    }

    try {
      if (
        typeof Scene_Load !== "undefined" &&
        Scene_Load.prototype &&
        typeof Scene_Load.prototype.reloadMapIfUpdated === "function"
      ) {
        // 当前场景通常不是 Scene_Load（可能在地图上按快捷键读档）。
        // 用 Scene_Load 的原型对象做 this，插件若在方法里访问
        // this.fadeOutAll() 之类的场景方法仍能找到。
        const loadScene =
          scene instanceof Scene_Load
            ? scene
            : Object.create(Scene_Load.prototype);

        Scene_Load.prototype.reloadMapIfUpdated.call(loadScene);
      }
    } catch (error) {
      console.warn("[cheat plugin] 读档后重载地图失败", error);
    }

    SceneManager.goto(Scene_Map);

    try {
      if (
        typeof $gameSystem !== "undefined" &&
        $gameSystem &&
        typeof $gameSystem.onAfterLoad === "function"
      ) {
        $gameSystem.onAfterLoad();
      }
    } catch (error) {
      console.warn("[cheat plugin] 读档后 onAfterLoad 失败", error);
    }
  }

  static async quickLoad(slot = 1) {
    try {
      const result = await DataManager.loadGame(slot);

      if (result === false) {
        throw new Error("游戏拒绝了本次读档");
      }

      this.finishLoadIntoMap();
      Alert.success(`从存档 ${slot} 加载游戏`);
      return true;
    } catch (error) {
      console.warn("[cheat plugin] 快速加载失败", error);
      Alert.error(`从存档 ${slot} 加载失败`, error);
      return false;
    }
  }
}

export class BattleCheat {
  static recover(member) {
    member.setHp(member.mhp);
    member.setMp(member.mmp);
    // member.setTp(member.maxTp())
    // Some games use TP for lust value, so do not recover TP
  }

  static recoverAllEnemy() {
    if (!requireGameReady("恢复敌人生命值")) return;

    for (const member of $gameTroop.members()) {
      this.recover(member);
    }

    Alert.success("恢复所有敌人的生命值");
  }

  static recoverAllParty() {
    if (!requireGameReady("恢复己方成员")) return;

    for (const member of $gameParty.members()) {
      this.recover(member);
    }

    Alert.success("恢复所有己方成员");
  }

  static fillTpAllEnemy() {
    if (!requireGameReady("补满敌人 TP")) return;

    for (const member of $gameTroop.members()) {
      member.setTp(member.maxTp());
    }

    Alert.success("补满所有敌人的TP");
  }

  static fillTpAllParty() {
    if (!requireGameReady("补满己方成员 TP")) return;

    for (const member of $gameParty.members()) {
      member.setTp(member.maxTp());
    }

    Alert.success("补满所有己方成员的TP");
  }

  static changeAllEnemyHealth(newHp) {
    if (!requireGameReady("修改敌人 HP")) return;

    for (const member of $gameTroop.members()) {
      member.setHp(newHp);
    }

    Alert.success(`设定所有敌人HP为 ${newHp}`);
  }

  static changeAllPartyHealth(newHp) {
    if (!requireGameReady("修改队员 HP")) return;

    for (const member of $gameParty.members()) {
      member.setHp(newHp);
    }

    Alert.success(`设定所有队员HP为 ${newHp}`);
  }

  static canExecuteBattleEndProcess() {
    return (
      SceneManager._scene &&
      SceneManager._scene instanceof Scene_Battle &&
      BattleManager._phase !== "battleEnd"
    );
  }

  static encounterBattle() {
    if (!requireGameReady("触发遇敌")) return;

    $gamePlayer._encounterCount = 0;
  }

  static victory() {
    if (this.canExecuteBattleEndProcess()) {
      $gameTroop.members().forEach((enemy) => {
        enemy.addNewState(enemy.deathStateId());
      });
      BattleManager.processVictory();
      Alert.success("强制胜利!");
      return true;
    }
    return false;
  }

  static defeat() {
    if (this.canExecuteBattleEndProcess()) {
      $gameParty.members().forEach((actor) => {
        actor.addNewState(actor.deathStateId());
      });
      BattleManager.processDefeat();
      Alert.success("强制失败...");
      return true;
    }
    return false;
  }

  static escape() {
    if (this.canExecuteBattleEndProcess()) {
      // processEscape 内部已经会 performEscape + playEscape，
      // 这里再手动调用会重复播放动画 / 音效。
      // _preemptive = true 让 MV/MZ 的逃跑判定直接成功，
      // 否则「强制逃跑」仍会被 _escapeRatio 的随机数拦住。
      const previousPreemptive = BattleManager._preemptive;

      BattleManager._preemptive = true;

      try {
        BattleManager.processEscape();
      } finally {
        BattleManager._preemptive = previousPreemptive;
      }

      Alert.success("强制逃跑...");
      return true;
    }
    return false;
  }

  static abort() {
    if (this.canExecuteBattleEndProcess()) {
      // processAbort 内部同样会播放逃跑音效并设置 _escaped
      BattleManager.processAbort();
      Alert.success("强制结束战斗");
      return true;
    }
    return false;
  }

  static getCanEncounterBackups() {
    if (!this.canEncounterBackups) {
      this.canEncounterBackups = new WeakMap();
    }

    return this.canEncounterBackups;
  }

  // 只替换当前 $gamePlayer 实例上的方法，原始方法按实例记录在 WeakMap 里。
  // 读档 / 新游戏会换一个 Game_Player，旧实例的备份自然失效，不会把
  // 旧函数错误地装到新实例上。
  static applyRandomEncounterPatch() {
    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;

    if (!player || typeof player.canEncounter !== "function") {
      return false;
    }

    const backups = this.getCanEncounterBackups();

    if (!backups.has(player)) {
      backups.set(player, player.canEncounter);
    }

    player.canEncounter = function () {
      return false;
    };

    return true;
  }

  static restoreRandomEncounterPatch() {
    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;

    if (!player) {
      return false;
    }

    const backups = this.getCanEncounterBackups();

    if (backups.has(player)) {
      player.canEncounter = backups.get(player);
      backups.delete(player);
    }

    return true;
  }

  static setDisableRandomEncounter(disabled) {
    if (!requireGameReady("切换随机遇敌")) {
      return false;
    }

    this.disableRandomEncounter = !!disabled;

    return this.disableRandomEncounter
      ? this.applyRandomEncounterPatch()
      : this.restoreRandomEncounterPatch();
  }

  static toggleDisableRandomEncounter() {
    return this.setDisableRandomEncounter(!this.isDisableRandomEncounter());
  }

  static isDisableRandomEncounter() {
    return !!this.disableRandomEncounter;
  }

  // 读档 / 新游戏后重新套用「不跨存档」以外的状态：
  //  - 无敌模式绑定在角色实例上，换实例后由 GeneralCheat 清理；
  //  - 禁止随机遇敌是玩家主动开的全局开关，需要 patch 到新的 $gamePlayer。
  static syncAfterGameChange() {
    try {
      GeneralCheat.syncGodModeInterval();

      if (this.isDisableRandomEncounter()) {
        this.applyRandomEncounterPatch();
      }
    } catch (error) {
      console.warn("[cheat plugin] 同步游戏状态失败", error);
    }
  }

  // 读档 / 新游戏 / 地图切换 / 战斗结束都通过 GameDataState 统一通知，
  // 不再各自包一层 DataManager.setupNewGame（两套猴补丁会互相嵌套）。
  static installGameStateHooks() {
    if (this.gameStateHooksInstalled) {
      return true;
    }

    this.gameStateHooksInstalled = true;
    subscribeGameData(() => {
      this.syncAfterGameChange();
    });

    return true;
  }
}

export class MessageCheat {
  static initialize() {
    // 重复调用会把已经包过的方法再包一层，栈越来越深。
    if (this.__initialized) {
      return;
    }

    this.__initialized = true;
    this.skip = false;

    // Skip message display animation
    // It seems to be executed whenever each character is output in the message window
    const _Window_Message_updateShowFast =
      Window_Message.prototype.updateShowFast;
    Window_Message.prototype.updateShowFast = function () {
      _Window_Message_updateShowFast.call(this);
      if (MessageCheat.skip) {
        this._showFast = true;
        this._pauseSkip = true;
      }
    };

    // Skip waiting for input after displaying text
    // It seems to always run every few ms
    const _Window_Message_updateInput = Window_Message.prototype.updateInput;
    Window_Message.prototype.updateInput = function () {
      const ret = _Window_Message_updateInput.call(this);

      if (this.pause && MessageCheat.skip) {
        this.pause = false;

        if (!this._textState) {
          this.terminateMessage();
        }
        return true;
      }

      return ret;
    };

    // Accelerates the scrolling message speed
    const Window_ScrollText_scrollSpeed =
      Window_ScrollText.prototype.scrollSpeed;
    Window_ScrollText.prototype.scrollSpeed = function () {
      let ret = Window_ScrollText_scrollSpeed.call(this);

      if (MessageCheat.skip) {
        ret *= 100;
      }

      return ret;
    };

    // Accelerates the battle log output speed
    const _Window_BattleLog_messageSpeed =
      Window_BattleLog.prototype.messageSpeed;
    Window_BattleLog.prototype.messageSpeed = function () {
      let ret = _Window_BattleLog_messageSpeed.call(this);

      if (MessageCheat.skip) {
        ret = 1;
      }

      return ret;
    };
  }

  static startSkip(gameSpeed) {
    const rate = Number(gameSpeed);

    // 旧配置可能缺少 accelerate（undefined）或被改成 0 / NaN。
    // 这种情况只跳过消息、不加速，不能把 NaN 传给 setGameSpeed。
    if (!Number.isFinite(rate) || rate <= 1) {
      this.gameSpeedBackup = null;
    } else {
      this.gameSpeedBackup = {
        rate: GameSpeedCheat.getRate(),
        sceneOption: GameSpeedCheat.getSceneOption(),
      };

      GameSpeedCheat.setGameSpeed(rate, GameSpeedCheat.sceneOptions().all);
    }

    this.skip = true;
  }

  static stopSkip() {
    if (this.gameSpeedBackup) {
      // restore game speed
      GameSpeedCheat.setGameSpeed(
        this.gameSpeedBackup.rate,
        this.gameSpeedBackup.sceneOption,
      );
      this.gameSpeedBackup = null;
    }

    this.skip = false;
  }
}

async function multiRetryAction(action, intervalTimeout, maxTryCount) {
  let tryCount = 0;

  const interval = setInterval(() => {
    try {
      ++tryCount;
      action();
    } catch (e) {
      // 初始化读取失败按次重试，失败过程需要留痕（最后一次成功即不再输出）
      console.warn(e);
      if (tryCount < maxTryCount) {
        // try again
        return;
      }
    }

    clearInterval(interval);
  }, intervalTimeout);
}

BattleCheat.installGameStateHooks();

function initialize() {
  const intervalTimeout = 500;
  const maxTryCount = 100;

  const initializeActions = [
    SpeedCheat.__readSettings,
    GameSpeedCheat.__readSettings,
  ];

  initializeActions.forEach((action) =>
    multiRetryAction(action, intervalTimeout, maxTryCount),
  );
}

initialize();
