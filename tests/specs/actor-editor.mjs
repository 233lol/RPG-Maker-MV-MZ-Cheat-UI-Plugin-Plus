import assert from "node:assert/strict";

export function registerActorEditor({ test, page }) {
  test("队伍面板：添加 / 移除 / 排序成员并保护最后一人", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel("party-panel", "PartyPanel");
      await api.waitFor(() => panel.partyRows.length > 0, 5000, 50);

      const originalIds = $gameParty.members().map((actor) => actor.actorId());
      const maxBattle = $gameParty.maxBattleMembers();
      // 测试游戏里可能有空名字的占位角色，优先选有名字的。
      const addedOption =
        panel.availableOptions.find(
          (option) => option.title && !option.title.startsWith("#"),
        ) ?? panel.availableOptions[0];
      const addedId = addedOption?.value ?? 0;
      const outcome = {
        originalIds,
        originalLength: originalIds.length,
        maxBattle,
        addedId,
        addedTitle: addedOption?.title ?? "",
      };

      try {
        if (!addedId) {
          throw new Error("没有可加入队伍的角色");
        }

        const before = $gameParty.members().length;
        panel.selectedAddId = addedId;
        panel.addMember();
        await api.waitFor(
          () => $gameParty.members().length === before + 1,
          5000,
          50,
        );

        const addedRow = panel.partyRows.find((row) => row.id === addedId);
        outcome.added = {
          inParty: $gameParty
            .members()
            .some((actor) => actor.actorId() === addedId),
          rowExists: !!addedRow,
          rowName: addedRow?.name ?? "",
          index: addedRow?.index ?? -1,
          length: $gameParty.members().length,
        };

        const indexBefore = addedRow.index;
        panel.moveMember(addedRow, -1);
        await api.waitFor(
          () =>
            panel.partyRows.find((row) => row.id === addedId)?.index ===
            indexBefore - 1,
          5000,
          50,
        );
        outcome.reordered = {
          indexBefore,
          indexAfter: panel.partyRows.find((row) => row.id === addedId)?.index,
          atTargetIndex:
            $gameParty.members()[indexBefore - 1]?.actorId() === addedId,
        };

        outcome.battle = {
          expected: Math.min($gameParty.members().length, maxBattle),
          flagged: panel.partyRows.filter((row) => row.battleMember).length,
          count: panel.battleMemberCount,
        };

        const removeRow = panel.partyRows.find((row) => row.id === addedId);
        panel.removeMember(removeRow);
        await api.waitFor(
          () =>
            !$gameParty.members().some((actor) => actor.actorId() === addedId),
          5000,
          50,
        );
        outcome.removed = {
          gone: !$gameParty
            .members()
            .some((actor) => actor.actorId() === addedId),
          length: $gameParty.members().length,
        };

        // 只剩一人时不允许继续移除
        $gameParty._actors = [$gameParty.members()[0].actorId()];
        panel.initializeVariables();
        panel.removeMember(panel.partyRows[0]);
        outcome.lastGuard = {
          length: $gameParty.members().length,
          canRemove: panel.canRemoveMember,
          rowCount: panel.partyRows.length,
        };
      } finally {
        $gameParty._actors = originalIds.slice();
        panel.initializeVariables();
      }

      outcome.restored = $gameParty.members().map((actor) => actor.actorId());

      return outcome;
    });

    assert.equal(result.added.inParty, true, "添加的队伍成员没有进入队伍");
    assert.equal(result.added.rowExists, true, "队伍表格没有新增成员行");
    assert.equal(
      result.added.rowName,
      result.addedTitle,
      "新增成员的名字显示不正确",
    );
    assert.equal(
      result.added.length,
      result.originalLength + 1,
      "队伍人数没有增加",
    );

    assert.equal(
      result.reordered.indexAfter,
      result.reordered.indexBefore - 1,
      "成员上移没有生效",
    );
    assert.equal(result.reordered.atTargetIndex, true, "上移后成员顺序不正确");

    assert.equal(
      result.battle.flagged,
      result.battle.expected,
      "战斗成员标记数量不正确",
    );
    assert.equal(
      result.battle.count,
      result.maxBattle,
      "战斗成员上限显示不正确",
    );

    assert.equal(result.removed.gone, true, "移除成员后角色仍在队伍里");
    assert.equal(
      result.removed.length,
      result.originalLength,
      "移除成员后队伍人数没有恢复",
    );
    assert.equal(result.lastGuard.length, 1, "最后一名成员被移除了");
    assert.equal(result.lastGuard.canRemove, false, "最后一人保护没有生效");
    assert.deepEqual(
      result.restored,
      result.originalIds,
      "队伍没有被还原到初始状态",
    );
  });

  test("属性面板：角色信息 / 职业 / 等级 / 参数 / 装备 / 状态写回游戏", async () => {
    const result = await page.evaluate(async () => {
      const api = window.__cheatTest;
      const panel = await api.openPanel(
        "stats-setting-panel",
        "StatsSettingPanel",
      );
      await api.waitFor(() => panel.actors.length > 0, 5000, 50);

      const actorId = panel.actors[0].id;
      const actor = panel.actors[0]._actor;
      const original = {
        name: actor.name(),
        nickname: actor.nickname(),
        profile: actor.profile(),
        classId: actor._classId,
        level: actor.level,
        exp: actor.currentExp(),
        paramPlus: actor._paramPlus.slice(),
        equips: actor.equips().slice(),
        states: actor._states.slice(),
      };
      const outcome = {
        actorId,
        original: {
          name: original.name,
          nickname: original.nickname,
          profile: original.profile,
          classId: original.classId,
          level: original.level,
        },
      };

      const current = () => panel.actors.find((item) => item.id === actorId);

      try {
        const newName = `${original.name}-E2E`;
        current().name = newName;
        panel.onNameChange(current());
        outcome.nameAfter = actor.name();
        outcome.nameTarget = newName;

        const newNickname = `${original.nickname || "nick"}-E2E`;
        current().nickname = newNickname;
        panel.onNicknameChange(current());
        outcome.nicknameAfter = actor.nickname();
        outcome.nicknameTarget = newNickname;

        const newProfile = `${original.profile || ""}E2E`;
        current().profile = newProfile;
        panel.onProfileChange(current());
        outcome.profileAfter = actor.profile();
        outcome.profileTarget = newProfile;

        const classTarget = panel.classOptions.find(
          (option) => option.value > 0 && option.value !== original.classId,
        )?.value;
        if (classTarget) {
          panel.onClassChange(current(), classTarget);
          outcome.classAfter = actor._classId;
          outcome.classTarget = classTarget;
        }

        const levelTarget =
          original.level >= 99 ? original.level - 1 : original.level + 1;
        current().level = levelTarget;
        panel.onLevelChange(current());
        outcome.levelAfter = actor.level;
        outcome.levelTarget = levelTarget;

        const paramId = 2;
        const paramTarget = actor.param(paramId) + 7;
        const paramItem = current();
        paramItem.param[paramId] = paramTarget;
        panel.onParamChange(paramItem, paramId);
        outcome.paramAfter = actor.param(paramId);
        outcome.paramTarget = paramTarget;

        const equipItem = current();
        const slot = equipItem.equipment.find((entry) =>
          entry.options.some(
            (option) => option.value > 0 && option.value !== entry.equipId,
          ),
        );

        if (slot) {
          const targetOption = slot.options.find(
            (option) => option.value > 0 && option.value !== slot.equipId,
          );
          const beforeEquipId = slot.equipId;

          panel.onEquipChange(equipItem, slot, targetOption.value);
          outcome.equipAfter = actor.equips()[slot.slotId]?.id ?? 0;
          outcome.equipTarget = targetOption.value;

          const unequipItem = current();
          panel.onEquipChange(
            unequipItem,
            unequipItem.equipment.find((entry) => entry.slotId === slot.slotId),
            0,
          );
          outcome.unequipAfter = actor.equips()[slot.slotId]?.id ?? 0;

          const restoreItem = current();
          panel.onEquipChange(
            restoreItem,
            restoreItem.equipment.find((entry) => entry.slotId === slot.slotId),
            beforeEquipId,
          );
          outcome.equipRestored = actor.equips()[slot.slotId]?.id ?? 0;
          outcome.equipBefore = beforeEquipId;
        }

        const stateOption = current().availableStateOptions.find(
          (option) => option.value > 0 && option.value !== 1,
        );
        if (stateOption) {
          const stateItem = current();
          stateItem.stateToAdd = stateOption.value;
          panel.onAddState(stateItem);
          outcome.stateAdded = actor.isStateAffected(stateOption.value);
          outcome.stateId = stateOption.value;

          panel.onRemoveState(current(), stateOption.value);
          outcome.stateRemoved = !actor.isStateAffected(stateOption.value);
        }
      } finally {
        actor.changeClass(original.classId, true);
        actor.setName(original.name);
        actor.setNickname(original.nickname);
        actor.setProfile(original.profile);
        actor.changeLevel(original.level, false);
        actor.changeExp(original.exp, false);
        actor._paramPlus = original.paramPlus.slice();

        for (let slotId = 0; slotId < original.equips.length; slotId++) {
          actor.changeEquip(slotId, original.equips[slotId]);
        }

        actor._states = original.states.slice();
        panel.initializeVariables();
      }

      outcome.restored = {
        name: actor.name(),
        nickname: actor.nickname(),
        profile: actor.profile(),
        classId: actor._classId,
        level: actor.level,
        equips: actor.equips().map((item) => (item ? item.id : 0)),
      };

      return outcome;
    });

    assert.equal(result.nameAfter, result.nameTarget, "角色改名没有写回游戏");
    assert.equal(
      result.nicknameAfter,
      result.nicknameTarget,
      "角色昵称没有写回游戏",
    );
    assert.equal(
      result.profileAfter,
      result.profileTarget,
      "角色简介没有写回游戏",
    );

    assert.ok(result.classTarget, "没有可切换的职业");
    assert.equal(result.classAfter, result.classTarget, "切换职业没有生效");

    assert.equal(result.levelAfter, result.levelTarget, "修改等级没有生效");
    assert.equal(result.paramAfter, result.paramTarget, "修改角色参数没有生效");

    assert.ok(result.equipTarget, "没有可更换的装备槽");
    assert.equal(result.equipAfter, result.equipTarget, "更换装备没有生效");
    assert.equal(result.unequipAfter, 0, "卸下装备没有生效");
    assert.equal(result.equipRestored, result.equipBefore, "装备没有还原");

    assert.ok(result.stateId, "没有可添加的状态");
    assert.equal(result.stateAdded, true, "添加状态没有生效");
    assert.equal(result.stateRemoved, true, "移除状态没有生效");

    assert.equal(
      result.restored.name,
      result.original.name,
      "角色名字没有还原",
    );
    assert.equal(
      result.restored.nickname,
      result.original.nickname,
      "角色昵称没有还原",
    );
    assert.equal(
      result.restored.profile,
      result.original.profile,
      "角色简介没有还原",
    );
    assert.equal(
      result.restored.classId,
      result.original.classId,
      "职业没有还原",
    );
    assert.equal(result.restored.level, result.original.level, "等级没有还原");
  });
}
