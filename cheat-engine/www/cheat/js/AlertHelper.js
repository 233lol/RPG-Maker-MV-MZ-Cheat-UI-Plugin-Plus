// @ts-check
const MAX_PENDING = 20;

export class Alert {
  // 由 AlertSnackbar 挂载时安装；在此之前使用控制台 + 队列，
  // 不再调用阻塞的原生 alert()（启动期读配置失败会卡住整个游戏）。
  static handler = null;
  static pending = [];

  static setHandler(handler) {
    this.handler = typeof handler === "function" ? handler : null;

    if (!this.handler || this.pending.length === 0) {
      return;
    }

    const pending = this.pending.slice();
    this.pending = [];

    for (const item of pending) {
      try {
        this.handler(item.level, item.msg, item.err, item.timeout);
      } catch (error) {
        console.error("[cheat plugin] 显示提示失败", error);
      }
    }
  }

  static clearHandler(handler) {
    if (this.handler === handler) {
      this.handler = null;
    }
  }

  static alertInternal(level, msg, err = null, timeout = 1500) {
    if (this.handler) {
      this.handler(level, msg, err, timeout);
      return;
    }

    const text = `[cheat plugin ${level}] ${msg}`;

    if (err) {
      console.error(text, err);
    } else if (level === "error" || level === "warn") {
      console.warn(text);
    } else {
      console.log(text);
    }

    this.pending.push({ level, msg, err, timeout });

    if (this.pending.length > MAX_PENDING) {
      this.pending.shift();
    }
  }

  static success(msg, err = null, timeout = 1500) {
    this.alertInternal("success", msg, err, timeout);
  }

  static info(msg, err = null, timeout = 1500) {
    this.alertInternal("info", msg, err, timeout);
  }

  static warn(msg, err = null, timeout = 1500) {
    this.alertInternal("warn", msg, err, timeout);
  }

  static error(msg, err = null, timeout = 1500) {
    this.alertInternal("error", msg, err, timeout);
  }
}
