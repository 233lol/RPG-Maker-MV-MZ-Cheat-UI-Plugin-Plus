// @ts-check
/**
 * 存档 / 快照的压缩与解码（MV LZString、MZ pako）。
 */

import { t } from "../strings.js";

export class SaveBackupCodec {
  /* --------------------------------------------------------- 压缩 / 工具 */

  // 找 LZString。
  //
  // 不能只看全局变量：MV/MZ 的 www/js/libs/lz-string.js 是 UMD 包装，在 nw.js
  // 下走 `module.exports` 分支，**不会**挂到 window 上（只有浏览器里才挂）。
  // 这时全局取不到，而引擎自己的 StorageManager 是通过模块作用域拿到它的。
  // 取不到就会退化成「裸 base64」，解出来是乱码 → JSON.parse 失败 →
  // 地图名/时长全部读不出来（这正是此前存档内进度只剩大小的原因）。
  /** @this {SaveBackupApi} */
  static getLZString() {
    if (this.lzStringCache !== undefined) {
      return this.lzStringCache;
    }

    this.lzStringCache = this.resolveLZString();
    return this.lzStringCache;
  }

  // 找 pako。MZ 的 pako 在 nw.js 下可能只走 module.exports 分支，
  // 不能假设全局一定存在；优先全局，再按游戏目录探测模块。
  /** @this {SaveBackupApi} */
  static getPako() {
    if (this.pakoCache !== undefined) {
      return this.pakoCache;
    }

    this.pakoCache = this.resolvePako();
    return this.pakoCache;
  }

  /** @this {SaveBackupApi} */
  static resolvePako() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.pako) {
        return globalThis.pako;
      }
    } catch (error) {
      // 继续
    }

    try {
      if (typeof pako !== "undefined" && pako) {
        return pako;
      }
    } catch (error) {
      // 继续
    }

    try {
      if (typeof require !== "function" || typeof process === "undefined") {
        return null;
      }

      const fs = require("fs");
      const path = require("path");
      const candidates = [
        path.resolve(process.cwd(), "js", "libs", "pako.min.js"),
        path.resolve(process.cwd(), "www", "js", "libs", "pako.min.js"),
      ];

      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) {
          continue;
        }

        const loaded = require(candidate);
        if (loaded && typeof loaded.inflate === "function") {
          return loaded;
        }
      }
    } catch (error) {
      // 路径因游戏而异，失败就返回 null
    }

    return null;
  }

  /** @this {SaveBackupApi} */
  static resolveLZString() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.LZString) {
        return globalThis.LZString;
      }
    } catch (error) {
      // 忽略，继续试其它来源
    }

    try {
      if (typeof LZString !== "undefined" && LZString) {
        return LZString;
      }
    } catch (error) {
      // 未声明，继续
    }

    // nw.js：lz-string.js 是 UMD，只挂了 module.exports；不同游戏放在
    // www/js/libs/（MV）或 js/libs/（MZ），两个都试一下。
    // 先按模块相对路径试，再按游戏根目录绝对路径试，兼容 nw.js 把
    // require 解析到虚拟根目录的情况。
    try {
      if (typeof require === "function" && typeof process !== "undefined") {
        const fs = require("fs");
        const path = require("path");

        for (const relative of [
          "js/libs/lz-string.js",
          "www/js/libs/lz-string.js",
        ]) {
          const candidate = path.resolve(process.cwd(), relative);

          if (!fs.existsSync(candidate)) {
            continue;
          }

          const loaded = require(candidate);
          if (loaded && typeof loaded.decompressFromBase64 === "function") {
            return loaded;
          }
        }
      }
    } catch (error) {
      // 继续尝试相对路径
    }

    for (const candidate of [
      "./js/libs/lz-string.js",
      "./www/js/libs/lz-string.js",
    ]) {
      try {
        const loaded = require(candidate);

        if (loaded && typeof loaded.decompressFromBase64 === "function") {
          return loaded;
        }
      } catch (error) {
        // 路径因游戏而异，失败就试下一个
      }
    }

    return null;
  }

  // 快照文件的内部编码与引擎存档保持一致：
  //   MV：LZString base64，扩展名 .rpgsave，可直接改名回存档
  //   MZ：pako 压缩，扩展名 .rmmzsave，可直接改名回存档
  /** @this {SaveBackupApi} */
  static encodePayloadText(jsonText, codec = null) {
    const resolvedCodec = codec ?? this.getSnapshotCodec();
    const text = String(jsonText);

    try {
      if (resolvedCodec === "pako") {
        const pakoLib = this.getPako();
        if (!pakoLib || typeof pakoLib.deflate !== "function") {
          throw new Error(t("saveBackup.pakoMissing"));
        }

        return pakoLib.deflate(text, { to: "string", level: 1 });
      }

      if (resolvedCodec === "lzstring") {
        const lz = this.getLZString();
        if (lz && typeof lz.compressToBase64 === "function") {
          return lz.compressToBase64(text);
        }
        throw new Error(t("saveBackup.lzstringMissing"));
      }

      // 极端兜底：UTF-8 安全的 base64（仅供本插件读写）
      const bytes = new TextEncoder().encode(text);
      let binary = "";

      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      return btoa(binary);
    } catch (error) {
      console.warn("[cheat plugin] 压缩快照数据失败", error);
      return null;
    }
  }

  // 兼容旧调用：按当前引擎编码
  /** @this {SaveBackupApi} */
  static encodeSaveText(jsonText) {
    return this.encodePayloadText(jsonText);
  }

  /** @this {SaveBackupApi} */
  static decodePayloadText(raw, codec = null, label = null) {
    label = label || t("saveBackup.snapshotData");
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }

    const text = String(raw);
    const looksLikeJson = (value) => {
      if (typeof value !== "string") {
        return false;
      }
      const trimmed = value.trimStart();
      return trimmed.startsWith("{") || trimmed.startsWith("[");
    };

    if (looksLikeJson(text)) {
      return text;
    }

    if (codec === "pako" || !codec) {
      try {
        const pakoLib = this.getPako();
        if (pakoLib && typeof pakoLib.inflate === "function") {
          const decoded = pakoLib.inflate(text, { to: "string" });
          if (looksLikeJson(decoded)) {
            return decoded;
          }
        }
      } catch (error) {
        // 不是 pako，继续尝试其它格式
      }
    }

    if (codec === "lzstring" || !codec || codec === "base64") {
      try {
        const lz = this.getLZString();
        if (lz && typeof lz.decompressFromBase64 === "function") {
          const decoded = lz.decompressFromBase64(text);
          if (looksLikeJson(decoded)) {
            return decoded;
          }
        }
      } catch (error) {
        // 不是 LZString，继续
      }
    }

    try {
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
      );

      if (looksLikeJson(decoded)) {
        return decoded;
      }
    } catch (error) {
      console.warn(`[cheat plugin] ${label} 解码失败`, error);
    }

    return null;
  }

  // 兼容旧调用：自动探测编码
  /** @this {SaveBackupApi} */
  static decodeSaveText(text, label = null) {
    label = label || t("saveBackup.saveData");
    return this.decodePayloadText(text, null, label);
  }

  /** @this {SaveBackupApi} */
  static requireFs() {
    return require("fs");
  }
}
