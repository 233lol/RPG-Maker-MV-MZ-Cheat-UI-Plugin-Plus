// @ts-check
/**
 * 存档快照的格式化与 ID 生成（静态方法，运行时挂到 SaveBackupCheat 上）。
 */

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

  static formatRelative(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const diff = Date.now() - value;
    if (diff < 0) {
      return "刚刚";
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return "刚刚";
    }

    if (diff < hour) {
      return `${Math.floor(diff / minute)} 分钟前`;
    }

    if (diff < day) {
      return `${Math.floor(diff / hour)} 小时前`;
    }

    return `${Math.floor(diff / day)} 天前`;
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
