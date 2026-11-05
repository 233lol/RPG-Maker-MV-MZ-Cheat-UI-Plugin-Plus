// @ts-check
/**
 * 存档快照的格式化与 ID 生成（静态方法，运行时挂到 SaveBackupCheat 上）。
 */

import { t } from "../strings.js";

export class SaveBackupFormat {
  static formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }

    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  // 存档头部记录的时间用本地格式展示（比 toLocaleString 更紧凑、跨平台一致）
  static formatDateTime(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    return this.formatTime(value).slice(5); // 去掉年份：10-01 19:50:55
  }

  // 快照列表 / 还原确认框用的「存档时间」文案，兼容几种历史字段
  static getSaveTimeText(item) {
    if (!item) {
      return "";
    }

    return (
      item.savefileTimeText ||
      this.formatDateTime(item.savefileTime) ||
      item.saveTime ||
      ""
    );
  }

  static formatTime(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }

    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds(),
    )}`;
  }

  // 快照大小按 UTF-8 字节算。String.length 是 UTF-16 代码单元，
  // 中文 / 日文存档会被明显低估。
  static getTextByteLength(text) {
    const value = String(text ?? "");

    try {
      if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(value).length;
      }
    } catch (error) {
      // 回退到字符数
    }

    return value.length;
  }

  // 导出 / 复制文件名用：精确到毫秒，避免同一秒内重复操作互相覆盖。
  static formatFileTimestamp(ms = Date.now()) {
    const value = Number(ms);
    const safe = Number.isFinite(value) && value > 0 ? value : Date.now();
    const millis = String(new Date(safe).getMilliseconds()).padStart(3, "0");

    return `${this.formatTime(safe)}-${millis}`.replace(/[: ]/g, "-");
  }

  static formatRelative(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const diff = Date.now() - value;
    if (diff < 0) {
      return t("time.justNow");
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return t("time.justNow");
    }

    if (diff < hour) {
      return t("time.minutesAgo", { count: Math.floor(diff / minute) });
    }

    if (diff < day) {
      return t("time.hoursAgo", { count: Math.floor(diff / hour) });
    }

    return t("time.daysAgo", { count: Math.floor(diff / day) });
  }

  static generateId(kind, slot, existingIds) {
    let id = "";

    for (let i = 0; i < 5; i++) {
      id = `${kind}-s${slot}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      if (!existingIds || !existingIds.has(id)) {
        return id;
      }
    }

    return id;
  }
}
