import { Alert } from "./AlertHelper.js";
import { KeyValueStorage } from "./KeyValueStorage.js";

export class GeneralCheat {
  // will be replaced from main component
  static toggleCheatModal(componentName = null) { }

  static openCheatModal(componentName = null) { }

  static toggleNoClip(notify = false) {
    // 键盘监听在 app 挂载时就绑定了，读档 / 加载转圈（MZ 还要初始化 effekseer
    // WASM）这段窗口里 $gamePlayer 还不存在，直接取属性会抛错。
    if (!$gamePlayer) {
      Alert.warn("玩家数据尚未初始化，无法切换穿墙状态");
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

  // 当前真正开启了无敌的角色实例（过期条目已被 getGodModeData 重置掉）
  static getGodModeActors() {
    const ret = [];

    for (const data of this.getGodModeMap().values()) {
      if (data.godMode && data.actor) {
        ret.push(data.actor);
      }
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
      for (const actor of GeneralCheat.getGodModeActors()) {
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

    if (!sceneOption) {
      sceneOption = GameSpeedCheat.sceneOptions().all;
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

    const storage = new KeyValueStorage("./www/cheat-settings/gameSpeed.json");

    storage.setItem(
      "data",
      JSON.stringify({ rate: rate, sceneOption: sceneOptionKey }),
    );
  }

  static __readSettings() {
    const storage = new KeyValueStorage("./www/cheat-settings/gameSpeed.json");

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

    GameSpeedCheat.setGameSpeed(
      data.rate,
      GameSpeedCheat.sceneOptions()[data.sceneOption],
    );
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
    SpeedCheat.__setSpeed(speed);

    if (fixed) {
      SpeedCheat.setFixSpeedInterval(speed);
    } else {
      SpeedCheat.removeFixSpeedInterval();
    }
  }

  static __writeSettings(speed, fixed) {
    const storage = new KeyValueStorage("./www/cheat-settings/speed.json");

    storage.setItem("data", JSON.stringify({ speed: speed, fixed: fixed }));
  }

  static __readSettings() {
    const storage = new KeyValueStorage("./www/cheat-settings/speed.json");

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

    if (typeof data.speed !== "number" || !Number.isFinite(data.speed)) {
      return;
    }

    if (data.fixed) {
      SpeedCheat.setSpeed(data.speed, data.fixed);
    }
  }
}

export class SceneCheat {
  static gotoTitle() {
    SceneManager.goto(Scene_Title);
  }

  static toggleSaveScene() {
    if (SceneManager._scene.constructor === Scene_Save) {
      SceneManager.pop();
    } else if (SceneManager._scene.constructor === Scene_Load) {
      SceneManager.goto(Scene_Save);
    } else {
      SceneManager.push(Scene_Save);
    }
  }

  static toggleLoadScene() {
    if (SceneManager._scene.constructor === Scene_Load) {
      SceneManager.pop();
    } else if (SceneManager._scene.constructor === Scene_Save) {
      SceneManager.goto(Scene_Load);
    } else {
      SceneManager.push(Scene_Load);
    }
  }

  static quickSave(slot = 1) {
    $gameSystem.onBeforeSave();
    DataManager.saveGame(slot);

    Alert.success(`保存进度到存档 ${slot}`);
  }

  static quickLoad(slot = 1) {
    DataManager.loadGame(slot);
    SceneManager.goto(Scene_Map);

    Alert.success(`从存档 ${slot} 加载游戏`);
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
    for (const member of $gameTroop.members()) {
      this.recover(member);
    }

    Alert.success("恢复所有敌人的生命值");
  }

  static recoverAllParty() {
    for (const member of $gameParty.members()) {
      this.recover(member);
    }

    Alert.success("恢复所有己方成员");
  }

  static fillTpAllEnemy() {
    for (const member of $gameTroop.members()) {
      member.setTp(member.maxTp());
    }

    Alert.success("补满所有敌人的TP");
  }

  static fillTpAllParty() {
    for (const member of $gameParty.members()) {
      member.setTp(member.maxTp());
    }

    Alert.success("补满所有己方成员的TP");
  }

  static changeAllEnemyHealth(newHp) {
    for (const member of $gameTroop.members()) {
      member.setHp(newHp);
    }

    Alert.success(`设定所有敌人HP为 ${newHp}`);
  }

  static changeAllPartyHealth(newHp) {
    for (const member of $gameParty.members()) {
      member.setHp(newHp);
    }

    Alert.success(`设定所有队员HP为 ${newHp}`);
  }

  static canExecuteBattleEndProcess() {
    return (
      SceneManager._scene &&
      SceneManager._scene.constructor === Scene_Battle &&
      BattleManager._phase !== "battleEnd"
    );
  }

  static encounterBattle() {
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
      $gameParty.performEscape();
      SoundManager.playEscape();
      BattleManager._escaped = true;
      BattleManager.processEscape();
      Alert.success("强制逃跑...");
      return true;
    }
    return false;
  }

  static abort() {
    if (this.canExecuteBattleEndProcess()) {
      $gameParty.performEscape();
      SoundManager.playEscape();
      BattleManager._escaped = true;
      BattleManager.processAbort();
      Alert.success("强制结束战斗");
      return true;
    }
    return false;
  }

  static toggleDisableRandomEncounter() {
    // change $gamePlayer.canEncounter function
    // if canEncounter is false, $gamePlayer.updateEncounterCount() do not decreases $gamePlayer._encounterCount
    if (this.isDisableRandomEncounter()) {
      if (this.canEncounter_bkup) {
        $gamePlayer.canEncounter = this.canEncounter_bkup;
      }
    } else {
      this.canEncounter_bkup = $gamePlayer.canEncounter;

      $gamePlayer.canEncounter = function () {
        return false;
      };
    }

    this.disableRandomEncounter = !this.isDisableRandomEncounter();
  }

  static isDisableRandomEncounter() {
    return !!this.disableRandomEncounter && this.disableRandomEncounter;
  }
}

export class MessageCheat {
  static initialize() {
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
    if (gameSpeed === 1) {
      this.gameSpeedBackup = null;
    } else {
      this.gameSpeedBackup = {
        rate: GameSpeedCheat.getRate(),
        sceneOption: GameSpeedCheat.getSceneOption(),
      };

      GameSpeedCheat.setGameSpeed(gameSpeed, GameSpeedCheat.sceneOptions().all);
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
  let finished = false;
  let tryCount = 0;

  const interval = setInterval(() => {
    try {
      ++tryCount;
      action();
      finished = true;
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

function initialize() {
  const intervalTimeout = 500;
  const maxTryCount = 100;

  const initializeActions = [
    SpeedCheat.__readSettings,
    GameSpeedCheat.__readSettings,
  ];

  const intervals = initializeActions.forEach((action) =>
    multiRetryAction(action, intervalTimeout, maxTryCount),
  );
}

initialize();
