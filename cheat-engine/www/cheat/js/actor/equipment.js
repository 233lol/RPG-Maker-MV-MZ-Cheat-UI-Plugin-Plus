// @ts-check
// 角色装备槽 / 可选装备的纯逻辑，方便脱离 Vue 与游戏运行时做单测。

/**
 * @param {number} value
 * @param {string} fallback
 */
function toLabel(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/**
 * 槽位对应的装备类型 ID（1 = 武器，2/3/... = 盾 / 头 / 身体 / 饰品）。
 *
 * @param {any} actor
 * @param {number} slotId
 * @returns {number}
 */
export function getEquipTypeId(actor, slotId) {
  try {
    if (actor && typeof actor.equipSlots === "function") {
      return Number(actor.equipSlots()[slotId]) || 0;
    }
  } catch (error) {
    // 装备槽数据损坏时按未知槽处理
  }

  return 0;
}

/**
 * 装备槽名称。RPG Maker 的 equipSlots 存的是 equipTypeId，
 * `$dataSystem.equipTypes` 才是给玩家看的名字。
 *
 * @param {any} system
 * @param {any} actor
 * @param {number} slotId
 * @returns {string}
 */
export function getEquipSlotName(system, actor, slotId) {
  const equipTypes =
    system && Array.isArray(system.equipTypes) ? system.equipTypes : [];
  const typeId = getEquipTypeId(actor, slotId);

  return toLabel(equipTypes[typeId] ?? equipTypes[slotId + 1], "");
}

/**
 * 可选装备。0 号槽是武器，其余槽按防具处理；是否真的能装备交给
 * 引擎自己的 actor.canEquip() 判断，兼容插件改过的装备规则。
 *
 * @param {any} actor
 * @param {number} slotId
 * @param {any} weapons
 * @param {any} armors
 * @returns {Array<{ title: string, value: number }>}
 */
export function getEquipOptions(actor, slotId, weapons, armors) {
  const slotTypeId = getEquipTypeId(actor, slotId);
  const isWeaponSlot = slotTypeId === 1 || (slotTypeId === 0 && slotId === 0);
  const source = isWeaponSlot ? weapons : armors;
  const list = Array.isArray(source) ? source : [];
  const canEquip =
    actor && typeof actor.canEquip === "function"
      ? (item) => actor.canEquip(item)
      : () => true;

  return list
    .filter((item) => item && Number(item.id) > 0)
    .filter((item) => {
      // canEquip 只判断「职业能否装备这个类型」，不区分具体槽位。
      // 例如身体防具在盾槽也会返回 true，必须再按槽位类型过滤。
      if (!isWeaponSlot && slotTypeId > 0) {
        if (Number(item.etypeId) !== slotTypeId) {
          return false;
        }
      }

      try {
        return canEquip(item);
      } catch (error) {
        return true;
      }
    })
    .map((item) => ({
      title: toLabel(item.name, `#${item.id}`),
      value: Number(item.id),
    }));
}

/**
 * 按槽位取装备对象。id 为 0 / 空时返回 null（表示卸下）。
 *
 * @param {number} slotId
 * @param {number} id
 * @param {any} weapons
 * @param {any} armors
 * @param {number} [slotTypeId]
 * @returns {any}
 */
export function getEquipItem(slotId, id, weapons, armors, slotTypeId) {
  const numericId = Number(id) || 0;
  if (numericId <= 0) {
    return null;
  }

  const typeId = Number(slotTypeId) || (slotId === 0 ? 1 : 0);
  const source = typeId === 1 ? weapons : armors;
  return source && source[numericId] ? source[numericId] : null;
}

/**
 * 生成界面用的装备行：槽位名、当前装备、可选列表。
 *
 * @param {any} actor
 * @param {any} system
 * @param {any} weapons
 * @param {any} armors
 * @returns {Array<{
 *   slotId: number,
 *   slotTypeId: number,
 *   slotName: string,
 *   equipId: number,
 *   options: Array<{ title: string, value: number }>
 * }>}
 */
export function getEquipmentRows(actor, system, weapons, armors) {
  let equips = [];
  try {
    if (actor && typeof actor.equips === "function") {
      equips = actor.equips() || [];
    }
  } catch (error) {
    equips = [];
  }

  if (!Array.isArray(equips)) {
    return [];
  }

  return equips.map((equip, slotId) => {
    const options = getEquipOptions(actor, slotId, weapons, armors);
    const equipId = equip ? Number(equip.id) || 0 : 0;

    // 当前装备可能因为职业/插件规则变化已经不在 canEquip 列表里，
    // 仍然要显示出来，否则下拉框会看似「空装备」。
    if (equipId > 0 && !options.some((option) => option.value === equipId)) {
      options.unshift({
        title: toLabel(equip.name, `#${equipId}`),
        value: equipId,
      });
    }

    return {
      slotId,
      slotTypeId: getEquipTypeId(actor, slotId),
      slotName: getEquipSlotName(system, actor, slotId),
      equipId,
      options,
    };
  });
}
