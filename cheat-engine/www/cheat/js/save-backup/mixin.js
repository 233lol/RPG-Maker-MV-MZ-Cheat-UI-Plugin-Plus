// @ts-check
/**
 * 把拆分模块里的静态方法挂到 SaveBackupCheat 上。
 *
 * 这些方法内部大量使用 `this.xxx()` 互相调用；挂到同一个类之后再通过
 * `SaveBackupCheat.xxx()` 调用时，`this` 仍然是 SaveBackupCheat，
 * 因此行为与拆分前完全一致。
 */
export function applyStaticMethods(target, source) {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === "length" || key === "name" || key === "prototype") {
      continue;
    }

    target[key] = source[key];
  }

  return target;
}
