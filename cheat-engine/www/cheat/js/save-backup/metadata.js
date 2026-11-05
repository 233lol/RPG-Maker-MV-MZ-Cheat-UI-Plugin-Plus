/**
 * 存档数据解析、元数据整理与校验。
 */

import { t } from "../strings.js";

export class SaveBackupMetadata {
  /* --------------------------------------------------------- 元数据展示 */

  // 尽量取出「跟游戏内读取列表一致」的信息。
  //
  // 来源优先级：
  //   1. DataManager.loadSavefileInfo —— 引擎自己读存档头，游戏时长 / 存档时间
  //      与菜单完全一致，而且不依赖整份存档能解压；
  //   2. 自己解压整份存档 —— 用来补 savefileInfo 里没有的地图信息（尽力而为）。
  // 任何一步失败都只是少几个展示字段，绝不影响快照本身。
  static parseSaveMeta(slot) {
    const meta = {
      slot: slot,
      mapId: 0,
      mapName: "",
      savefileTime: 0,
      savefileTimeText: "",
      saveTime: "",
      playtimeFrames: 0,
      playtime: "",
      dataSize: 0,
    };

    const info = this.readSavefileInfo(slot);
    if (info) {
      meta.savefileTime = info.timestamp;
      meta.savefileTimeText = info.timestampText;
      meta.playtimeFrames = info.playtimeFrames;
      meta.playtime = info.playtimeText;
    }

    let saveObject = null;

    if (this.isLocalMode()) {
      try {
        const filePath = this.getSaveFilePath(slot);
        const fs = this.requireFs();

        if (filePath && fs.existsSync(filePath)) {
          meta.dataSize = fs.statSync(filePath).size;
          saveObject = this.parseAnySaveData(this.readSaveText(slot));
        }
      } catch (error) {
        // 存档损坏 / 压缩方式不认识（如 pako）都只影响展示，不影响快照本身
        console.warn(
          "[cheat plugin] 解析存档元数据失败，仅保留存档头信息",
          error,
        );
      }
    } else {
      try {
        const text = this.readSaveText(slot);
        if (text) {
          meta.dataSize = text.length;
          saveObject = this.parseAnySaveData(text);
        }
      } catch (error) {
        console.warn(
          "[cheat plugin] 解析存档元数据失败，仅保留存档头信息",
          error,
        );
      }
    }

    if (!saveObject || typeof saveObject !== "object") {
      return meta;
    }

    try {
      // 地图 ID 的位置因引擎版本 / 插件而异：
      //   标准 MV/MZ：player.map._mapId
      //   另一些版本：顶层 map._mapId（实测「芙兰与罪人之岛」就是这种）
      const mapId =
        Number(
          saveObject.player &&
            saveObject.player.map &&
            saveObject.player.map._mapId,
        ) ||
        Number(saveObject.map && saveObject.map._mapId) ||
        0;

      if (Number.isFinite(mapId) && mapId > 0) {
        meta.mapId = mapId;
        const mapInfo = this.getMapInfo(mapId);
        meta.mapName = mapInfo ? mapInfo.name : "";
      }

      // 有些存档的 Game_System 根本没有 _playtime（老版本 MV / MZ），
      // 此时退回引擎自己的 _framesOnSave（存档那刻的帧数）计算时长。
      const system = saveObject.system;
      if (!meta.playtime && system) {
        const frames = Number.isFinite(system._playtime)
          ? Number(system._playtime)
          : Number.isFinite(system._framesOnSave)
            ? Number(system._framesOnSave)
            : null;

        if (frames !== null) {
          meta.playtimeFrames = frames;
          meta.playtime = this.formatFrames(frames);
        }
      }
    } catch (error) {
      console.warn("[cheat plugin] 读取存档字段失败", error);
    }

    try {
      if (
        !meta.savefileTimeText &&
        Number.isFinite(saveObject.saveTime) &&
        saveObject.saveTime > 0
      ) {
        meta.savefileTime = Number(saveObject.saveTime);
        meta.savefileTimeText = this.formatDateTime(saveObject.saveTime);
      } else if (
        !meta.savefileTimeText &&
        Number.isFinite(saveObject.timestamp) &&
        saveObject.timestamp > 0
      ) {
        meta.savefileTime = Number(saveObject.timestamp);
        meta.savefileTimeText = this.formatDateTime(saveObject.timestamp);
      } else if (typeof saveObject.saveTime === "string") {
        meta.saveTime = saveObject.saveTime;
      }
    } catch (error) {
      // 时间只用于展示，解析失败就算了
    }

    return meta;
  }

  static parseAnySaveData(raw) {
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }

    if (typeof raw === "object") {
      return raw;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      // 有些游戏存档最外层还包了一层，交给 JsonEx 再试一次
      try {
        if (typeof JsonEx !== "undefined" && JsonEx.parse) {
          return JsonEx.parse(raw);
        }
      } catch (innerError) {
        console.warn("[cheat plugin] 存档不是可解析的 JSON", innerError);
      }
    }

    return null;
  }

  // 写回存档 / 导入快照前的最后一道校验：宁可报错，也不要把损坏数据
  // 覆盖到玩家的存档上。RPG Maker 的存档一定包含 system / party / actors
  // 等对象，这里只要求至少命中一个，避免误伤改过结构的游戏。
  static validateSaveText(jsonText, label = null) {
    label = label || t("saveBackup.saveData");
    if (typeof jsonText !== "string" || jsonText.trim() === "") {
      throw new Error(t("saveBackup.labelEmpty", { label }));
    }

    const data = this.parseAnySaveData(jsonText);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(t("saveBackup.labelInvalidJson", { label }));
    }

    // system / party 是引擎读档的必需对象。只看 key 是否存在会让
    // {"system":null} 通过，还原后 extractSaveContents 直接把 $gameSystem
    // 置空，读档必崩。
    for (const key of ["system", "party"]) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        throw new Error(t("saveBackup.fieldEmpty", { label, key }));
      }

      const value = data[key];

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(t("saveBackup.fieldInvalid", { label, key }));
      }
    }

    const knownKeys = ["actors", "switches", "variables", "player", "map"];
    const hasSaveShape = knownKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(data, key),
    );

    if (!hasSaveShape) {
      throw new Error(t("saveBackup.saveStructureMissing", { label }));
    }

    return data;
  }

  static getMapInfo(mapId) {
    try {
      if (
        typeof $dataMapInfos !== "undefined" &&
        $dataMapInfos &&
        $dataMapInfos[mapId]
      ) {
        return $dataMapInfos[mapId];
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  static formatFrames(frames) {
    const value = Number(frames);
    // 0 帧视为「没有记录」而不是 00:00:00 —— 旧快照 / 读不到存档头时
    // 会走到这里，显示 00:00:00 会让人误以为存档真的没有游玩时长
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const total = Math.floor(value / 60);
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    const pad = (n) => String(n).padStart(2, "0");

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
}
