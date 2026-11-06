/**
 * 把 Vue 的 errorCaptured / app.config.errorHandler 参数整理成可展示的文本。
 * 单独抽出来便于在不启动 Vue 的情况下做单元测试。
 *
 * @param {unknown} error
 * @param {unknown} info
 * @returns {{ message: string, stack: string, info: string, text: string }}
 */
export function formatPanelError(error, info = "") {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error ?? "unknown");
  const stack =
    error && typeof error === "object" && "stack" in error && error.stack
      ? String(error.stack)
      : "";
  const infoText = info ? String(info) : "";
  const text = [message, infoText, stack].filter((part) => !!part).join("\n\n");

  return {
    message,
    stack,
    info: infoText,
    text,
  };
}
