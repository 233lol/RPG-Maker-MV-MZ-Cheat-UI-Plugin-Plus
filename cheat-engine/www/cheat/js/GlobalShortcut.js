import { Key } from "./KeyCodes.js";
import { Alert } from "./AlertHelper.js";
import { cloneObject } from "./Tools.js";
import { getCheatSettingsPath } from "./SettingsPath.js";
import { writeJsonAtomic } from "./AtomicFile.js";
import {
  SpeedCheat,
  SceneCheat,
  GeneralCheat,
  BattleCheat,
  MessageCheat,
} from "./CheatHelper.js";
import { ShortcutMap } from "./ShortcutHelper.js";
import { t } from "./strings.js";

// default shortcut settings
const defaultShortcutSettings = {
  toggleCheatModal: {
    shortcut: "ctrl c",
  },

  toggleCheatModalToSaveLocationComponent: {
    shortcut: "ctrl m",
  },

  toggleCheatModalToSaveBackupComponent: {
    shortcut: "ctrl b",
  },

  quickSave: {
    shortcut: "ctrl s",
    param: {
      slot: 1, // 1-indexed
    },
  },

  quickLoad: {
    shortcut: "ctrl q",
    param: {
      slot: 1, // 1-indexed
    },
  },

  openSaveScene: {
    shortcut: "ctrl [",
  },

  openLoadScene: {
    shortcut: "ctrl ]",
  },

  gotoTitle: {
    shortcut: "ctrl t",
  },

  forceVictory: {
    shortcut: "ctrl v",
  },

  forceDefeat: {
    shortcut: "ctrl d",
  },

  forceEscape: {
    shortcut: "ctrl e",
  },

  toggleNoClip: {
    shortcut: "alt w",
  },

  enemyWound: {
    shortcut: "alt 1",
  },

  enemyRecovery: {
    shortcut: "alt 0",
  },

  partyWound: {
    shortcut: "alt 2",
  },

  partyRecovery: {
    shortcut: "alt 9",
  },

  setSpeed: {
    shortcut: "", // no keymap
    param: {
      speed: 5,
    },
  },

  skipMessage: {
    shortcut: "",
    param: {
      accelerate: 1,
    },
  },

  openDevTool: {
    shortcut: "f12",
  },
};

export function isInValueInRange(value, lowerBound, upperBound) {
  try {
    value = Number(value);
  } catch (err) {
    return t("shortcut.valueNotNumber");
  }

  if (isNaN(value) || !Number.isInteger(value)) {
    return t("shortcut.valueNotNumber");
  }

  if (value < lowerBound || upperBound < value) {
    return t("shortcut.valueOutOfRange", {
      min: lowerBound,
      max: upperBound,
    });
  }

  return false;
}

// immutable
const shortcutConfig = {
  toggleCheatModal: {
    nameKey: "shortcutAction.toggleCheatModal",
    descKey: "shortcut.necessary",
    necessary: true,
    enterAction(param) {
      GeneralCheat.toggleCheatModal();
    },
  },

  toggleCheatModalToSaveLocationComponent: {
    nameKey: "shortcutAction.toggleCheatModalToSaveLocationComponent",
    desc: "",
    enterAction(param) {
      GeneralCheat.toggleCheatModal("save-recall-panel");
    },
  },

  toggleCheatModalToSaveBackupComponent: {
    nameKey: "shortcutAction.toggleCheatModalToSaveBackupComponent",
    descKey: "shortcutAction.toggleCheatModalToSaveBackupComponentDesc",
    enterAction(param) {
      GeneralCheat.toggleCheatModal("save-backup-panel");
    },
  },

  quickSave: {
    nameKey: "shortcutAction.quickSave",
    descKey: "shortcutAction.quickSaveDesc",
    param: {
      slot: {
        nameKey: "shortcutAction.slotParam",
        descKey: "shortcutAction.slotSaveDesc",
        get name() {
          return t(this.nameKey);
        },
        get desc() {
          return t(this.descKey);
        },
        isInvalidValue(value) {
          return isInValueInRange(value, 1, DataManager.maxSavefiles());
        },
        convertValue(value) {
          return Number(value);
        },
      },
    },
    enterAction(param) {
      SceneCheat.quickSave(param.slot);
    },
  },

  quickLoad: {
    nameKey: "shortcutAction.quickLoad",
    descKey: "shortcutAction.quickLoadDesc",
    param: {
      slot: {
        nameKey: "shortcutAction.slotParam",
        descKey: "shortcutAction.slotLoadDesc",
        get name() {
          return t(this.nameKey);
        },
        get desc() {
          return t(this.descKey);
        },
        isInvalidValue(value) {
          return isInValueInRange(value, 1, DataManager.maxSavefiles());
        },
        convertValue(value) {
          return Number(value);
        },
      },
    },
    enterAction(param) {
      SceneCheat.quickLoad(param.slot);
    },
  },

  openSaveScene: {
    nameKey: "shortcutAction.openSaveScene",
    desc: "",
    enterAction(param) {
      SceneCheat.toggleSaveScene();
    },
  },

  openLoadScene: {
    nameKey: "shortcutAction.openLoadScene",
    desc: "",
    enterAction(param) {
      SceneCheat.toggleLoadScene();
    },
  },

  gotoTitle: {
    nameKey: "shortcutAction.gotoTitle",
    desc: "",
    enterAction(param) {
      SceneCheat.gotoTitle();
    },
  },

  forceVictory: {
    nameKey: "shortcutAction.forceVictory",
    desc: "",
    enterAction(param) {
      BattleCheat.victory();
    },
  },

  forceDefeat: {
    nameKey: "shortcutAction.forceDefeat",
    desc: "",
    enterAction(param) {
      BattleCheat.defeat();
    },
  },

  forceEscape: {
    nameKey: "shortcutAction.forceEscape",
    desc: "",
    enterAction(param) {
      BattleCheat.escape();
    },
  },

  toggleNoClip: {
    nameKey: "shortcutAction.toggleNoClip",
    desc: "",
    enterAction(param) {
      GeneralCheat.toggleNoClip(true);
    },
  },

  enemyWound: {
    nameKey: "shortcutAction.enemyWound",
    desc: "",
    enterAction(param) {
      BattleCheat.changeAllEnemyHealth(1);
    },
  },

  enemyRecovery: {
    nameKey: "shortcutAction.enemyRecovery",
    descKey: "shortcutAction.enemyRecoveryDesc",
    enterAction(param) {
      BattleCheat.recoverAllEnemy();
    },
  },

  partyWound: {
    nameKey: "shortcutAction.partyWound",
    desc: "",
    enterAction(param) {
      BattleCheat.changeAllPartyHealth(1);
    },
  },

  partyRecovery: {
    nameKey: "shortcutAction.partyRecovery",
    descKey: "shortcutAction.partyRecoveryDesc",
    enterAction(param) {
      BattleCheat.recoverAllParty();
    },
  },

  setSpeed: {
    nameKey: "shortcutAction.setSpeed",
    descKey: "shortcutAction.setSpeedDesc",
    param: {
      speed: {
        nameKey: "shortcutAction.speedParam",
        descKey: "shortcutAction.speedParamDesc",
        get name() {
          return t(this.nameKey);
        },
        get desc() {
          return t(this.descKey);
        },
        isInvalidValue(value) {
          return isInValueInRange(value, 1, 10);
        },
        convertValue(value) {
          return Number(value);
        },
      },
    },
    enterAction(param) {
      SpeedCheat.removeFixSpeedInterval();
      SpeedCheat.setSpeed(param.speed);
    },
  },

  skipMessage: {
    nameKey: "shortcutAction.skipMessage",
    desc: "",
    combiningKeyAlone: true,
    param: {
      accelerate: {
        nameKey: "shortcutAction.accelerateParam",
        descKey: "shortcutAction.accelerateParamDesc",
        get name() {
          return t(this.nameKey);
        },
        get desc() {
          return t(this.descKey);
        },
        isInvalidValue(value) {
          return isInValueInRange(value, 1, 50);
        },
        convertValue(value) {
          return Number(value);
        },
      },
    },
    enterAction(param) {
      MessageCheat.startSkip(param.accelerate);
    },

    leaveAction(param) {
      MessageCheat.stopSkip();
    },
  },

  openDevTool: {
    nameKey: "shortcutAction.openDevTool",
    descKey: "shortcutAction.openDevToolDesc",
    enterAction(param) {
      // `require("nw.gui")` 是 nwjs 0.12 时代的 API，0.13 起已被 `nw.Window` 取代；
      // 本项目 init/import.js 要求 nwjs >= 0.44.0，走新 API（与 mz/main.js 一致）。
      if (typeof nw === "object" && nw.Window) {
        nw.Window.get().showDevTools();
      }
    },
  },
};

class ShortcutConfig {
  constructor(id, config) {
    this.id = id;
    this.nameKey = config.nameKey || "";
    this.descKey = config.descKey || "";

    const fields = [
      "necessary",
      "combiningKeyAlone",
      "param",
      "enterAction",
      "repeatAction",
      "leaveAction",
    ];

    for (const field of fields) {
      this[field] = config[field];
    }

    if (!this.necessary) this.necessary = false;
    if (!this.combiningKeyAlone) this.combiningKeyAlone = false;
    if (!this.param) this.param = {};
    if (!this.enterAction) this.enterAction = (param) => {};
    if (!this.repeatAction) this.repeatAction = (param) => {};
    if (!this.leaveAction) this.leaveAction = (param) => {};
  }

  // 名称 / 描述按当前语言实时解析：切换语言后不需要重建配置对象。
  get name() {
    return this.nameKey ? t(this.nameKey) : "";
  }

  get desc() {
    return this.descKey ? t(this.descKey) : "";
  }

  getEnterAction(shortcutSetting) {
    return () => {
      this.enterAction(shortcutSetting.param);
    };
  }

  getRepeatAction(shortcutSetting) {
    return () => {
      this.repeatAction(shortcutSetting.param);
    };
  }

  getLeaveAction(shortcutSetting) {
    return () => {
      this.leaveAction(shortcutSetting.param);
    };
  }
}

/**
 * parse string written keymap to Key object
 *
 * @param src: string written keymap
 * @param dest: object which Key objects be stored
 */
function parseStringToKeyObject(src) {
  const ret = cloneObject(src);

  for (const key of Object.keys(src)) {
    ret[key].shortcut = Key.fromString(src[key].shortcut);
  }

  return ret;
}

function parseKeyObjectToString(src) {
  const ret = cloneObject(src);

  for (const key of Object.keys(src)) {
    ret[key].shortcut = src[key].shortcut.asString();
  }

  return ret;
}

class GlobalShortcut {
  constructor() {
    this.initialize();
  }

  initialize() {
    this.shortcutSettingsFile = getCheatSettingsPath("shortcuts.json");

    // initialize shortcut settings
    this.shortcutSettings = {};
    this.readShortcutSettings();

    // initialize shortcut config
    this.shortcutConfig = {};
    this.initializeShortcutConfig();

    // migrate if settings file is old version
    this.migrateShortcutSettings();

    // initialize shortcut map
    this.shortcutMap = new ShortcutMap();
    this.initializeShortcutMap();
  }

  initializeShortcutConfig() {
    this.shortcutConfig = {};

    for (const key of Object.keys(shortcutConfig)) {
      this.shortcutConfig[key] = new ShortcutConfig(key, shortcutConfig[key]);
    }
  }

  migrateShortcutSettings() {
    let defaultSettings = null;
    let migrated = false;

    const getDefaultSettings = () => {
      if (!defaultSettings) {
        defaultSettings = parseStringToKeyObject(defaultShortcutSettings);
      }

      return defaultSettings;
    };

    const assignedKeys = new Set(
      Object.values(this.shortcutSettings).map((setting) =>
        setting.shortcut.asString(),
      ),
    );

    for (const shortcutConfig of Object.values(this.shortcutConfig)) {
      if (
        !Object.hasOwnProperty.call(this.shortcutSettings, shortcutConfig.id)
      ) {
        // initialize default settings if not initialized
        const defaultSetting = getDefaultSettings()[shortcutConfig.id];

        // handle conflict keys
        if (
          !defaultSetting.shortcut.isEmpty() &&
          assignedKeys.has(defaultSetting.shortcut.asString())
        ) {
          console.warn(
            `key conflicts while migrating : ${shortcutConfig.name} - ${defaultSetting.shortcut.asString()}`,
          );
          defaultSetting.shortcut = Key.createEmpty();
        }

        assignedKeys.add(defaultSetting.shortcut.asString());

        this.shortcutSettings[shortcutConfig.id] = defaultSetting;
        migrated = true;
        continue;
      }

      // 已有条目补齐后续版本新增的参数。
      // 例如 1.0.3 才加入的 skipMessage.param.accelerate：旧文件里整段
      // param 缺失，不补的话 enterAction 会拿到 undefined 并抛错。
      const defaultParam = getDefaultSettings()[shortcutConfig.id]?.param;

      if (!defaultParam) {
        continue;
      }

      const setting = this.shortcutSettings[shortcutConfig.id];

      if (
        !setting.param ||
        typeof setting.param !== "object" ||
        Array.isArray(setting.param)
      ) {
        setting.param = {};
      }

      for (const [paramId, value] of Object.entries(defaultParam)) {
        if (!Object.hasOwnProperty.call(setting.param, paramId)) {
          setting.param[paramId] = value;
          migrated = true;
        }
      }
    }

    // if settings migrated, save to file
    if (migrated) {
      console.warn("__settings migrated");
      this.writeShortcutSettings();
    }
  }

  initializeShortcutMap() {
    for (const shortcutConfig of Object.values(this.shortcutConfig)) {
      const shortcutSetting = this.shortcutSettings[shortcutConfig.id];

      // 配置文件里可能有两个动作绑定同一个键（手改 / 旧默认值冲突）。
      // 先注册者生效，避免后注册者静默覆盖前者后 UI 仍显示两者都已绑定。
      const occupied = this.shortcutMap.getValue(shortcutSetting.shortcut);

      if (occupied && occupied !== shortcutConfig) {
        console.warn(
          `快捷键冲突，已忽略: ${shortcutConfig.name} - ${shortcutSetting.shortcut.asDisplayString()}`,
        );
        continue;
      }

      this.shortcutMap.register(
        shortcutSetting.shortcut,
        shortcutConfig,
        shortcutConfig.getEnterAction(shortcutSetting),
        shortcutConfig.getRepeatAction(shortcutSetting),
        shortcutConfig.getLeaveAction(shortcutSetting),
      );
    }
  }

  runKeyEnterEvent(e, key) {
    if (this.shortcutMap.runEnterAction(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    }
  }

  runKeyRepeatEvent(e, key) {
    if (this.shortcutMap.runRepeatAction(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    }
  }

  runKeyLeaveEvent(e, key) {
    if (this.shortcutMap.runLeaveAction(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    }
  }

  /**
   * read raw shortcut settings
   *
   */
  readRawShortcutSettings() {
    // if nwjs environment, read shortcut settings from file
    if (Utils.isNwjs()) {
      const fs = require("fs");

      try {
        // read settings file
        return JSON.parse(fs.readFileSync(this.shortcutSettingsFile, "utf-8"));
      } catch (err) {
        try {
          // create default settings file
          this.writeRawShortcutSettings(defaultShortcutSettings);

          // read created file
          return JSON.parse(
            fs.readFileSync(this.shortcutSettingsFile, "utf-8"),
          );
        } catch (fileWriteErr) {
          Alert.warn(t("shortcut.settingsInitFailed"), err);
          return defaultShortcutSettings;
        }
      }
    }

    // if using browser, read default shortcut settings
    console.warn("[cheat plugin warn] Use default settings");
    return defaultShortcutSettings;
  }

  /**
   * read and parse shortcut settings
   */
  readShortcutSettings() {
    const rawSettings = this.readRawShortcutSettings();
    this.shortcutSettings = {};

    try {
      this.shortcutSettings = parseStringToKeyObject(rawSettings);
    } catch (err) {
      Alert.warn(t("shortcut.settingsParseFailed"), err);

      try {
        this.shortcutSettings = parseStringToKeyObject(defaultShortcutSettings);
      } catch (err) {
        Alert.error(t("shortcut.settingsBroken"), err);
      }
    }
  }

  writeRawShortcutSettings(shortcutSettings) {
    if (Utils.isNwjs()) {
      writeJsonAtomic(this.shortcutSettingsFile, shortcutSettings);
    }
  }

  writeShortcutSettings() {
    this.writeRawShortcutSettings(
      parseKeyObjectToString(this.shortcutSettings),
    );
  }

  restoreDefaultSettings() {
    if (Utils.isNwjs()) {
      // 不再先 unlink 再重建：直接原子覆盖成默认值，避免中途崩溃丢配置。
      writeJsonAtomic(this.shortcutSettingsFile, defaultShortcutSettings);
      this.initialize();
    }
  }

  getSettings(shortcutId) {
    return this.shortcutSettings[shortcutId];
  }

  getConfig(shortcutId) {
    return this.shortcutConfig[shortcutId];
  }

  getParamConfig(shortcutId, paramId) {
    return this.getConfig(shortcutId).param[paramId];
  }

  getParam(shortcutId, paramId) {
    return this.getSettings(shortcutId).param[paramId];
  }

  getShortcut(shortcutId) {
    return this.getSettings(shortcutId).shortcut;
  }

  setShortcut(shortcutId, newKey) {
    if (!newKey || typeof newKey.isRepresentable !== "function") {
      throw Error(t("shortcut.invalidKey"));
    }

    if (!newKey.isRepresentable()) {
      throw Error(t("shortcut.unrepresentable"));
    }

    // not need to change shortcut
    const prevKey = this.getShortcut(shortcutId);
    if (prevKey.equals(newKey)) {
      return;
    }

    const existingValue = this.shortcutMap.getValue(newKey);
    if (existingValue) {
      throw Error(
        t("shortcut.conflict", {
          key: newKey.asDisplayString(),
          name: existingValue.name,
        }),
      );
    }

    // 只删除「确实属于当前动作」的旧绑定。配置里存在重复绑定时，
    // 这个槽位可能已经被另一个动作占用，直接 remove 会让它静默失效。
    if (this.shortcutMap.getValue(prevKey) === this.getConfig(shortcutId)) {
      this.shortcutMap.remove(prevKey);
    }

    // bind key
    const currValue = this.getConfig(shortcutId);
    const currSettings = this.getSettings(shortcutId);
    this.shortcutMap.register(
      newKey,
      currValue,
      currValue.getEnterAction(currSettings),
      currValue.getRepeatAction(currSettings),
      currValue.getLeaveAction(currSettings),
    );

    // change settings
    currSettings.shortcut = newKey;

    // write changed settings
    this.writeShortcutSettings();
  }

  setParam(shortcutId, paramId, newValue) {
    const paramConfig = this.getParamConfig(shortcutId, paramId);

    const invalidMsg = paramConfig.isInvalidValue(newValue);

    if (invalidMsg) {
      throw Error(invalidMsg);
    }

    this.getSettings(shortcutId).param[paramId] =
      paramConfig.convertValue(newValue);

    this.writeShortcutSettings();
  }
}

export const GLOBAL_SHORTCUT = new GlobalShortcut();
