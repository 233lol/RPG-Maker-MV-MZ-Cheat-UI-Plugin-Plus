// 面板搜索的公共实现。
//
// 各面板参与搜索的字段不同，但「trim + 转小写 + includes」的规则一致。
// 统一放在这里，避免每个面板各写一份 String(x ?? "").toLowerCase()
// （改版游戏数据里 description 等字段可能是 undefined / null）。

/**
 * @param {unknown} keyword
 * @returns {string}
 */
export function normalizeKeyword(keyword) {
  return String(keyword ?? "")
    .trim()
    .toLowerCase();
}

/**
 * 关键词为空时视为全部命中；任一字段包含关键词即命中。
 *
 * @param {unknown} keyword
 * @param {...unknown} values
 * @returns {boolean}
 */
export function matchesKeyword(keyword, ...values) {
  const needle = normalizeKeyword(keyword);

  if (!needle) {
    return true;
  }

  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}

/**
 * @param {Array<unknown>} items
 * @param {unknown} keyword
 * @param {(item: any) => Array<unknown>} pick 返回该行参与搜索的字段
 * @returns {Array<unknown>}
 */
export function filterByKeyword(items, keyword, pick) {
  const list = Array.isArray(items) ? items : [];
  const needle = normalizeKeyword(keyword);

  if (!needle) {
    return list;
  }

  return list.filter((item) =>
    pick(item).some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(needle),
    ),
  );
}
