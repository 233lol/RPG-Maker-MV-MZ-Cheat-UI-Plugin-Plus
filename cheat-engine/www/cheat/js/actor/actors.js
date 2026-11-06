// @ts-check
// 角色基础信息的纯逻辑。

/**
 * 职业下拉选项。
 *
 * @param {any} dataClasses
 * @returns {Array<{ title: string, value: number }>}
 */
export function getClassOptions(dataClasses) {
  const list = Array.isArray(dataClasses) ? dataClasses : [];

  return list
    .filter((item) => item && Number(item.id) > 0)
    .map((item) => ({
      title: String(item.name || `#${item.id}`),
      value: Number(item.id),
    }));
}
