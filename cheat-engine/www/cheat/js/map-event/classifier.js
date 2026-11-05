/**
 * 地图事件的敌人 / 宝箱识别规则。
 *
 * 从 MapEventPanel 拆出，正则和判定逻辑离开 Vue 组件，方便单独维护。
 */

const TREASURE_NAME_PATTERN =
  /treasure|chest|box|gold|coin|money|gem|jewel|diamond|ruby|emerald|loot|reward|prize|vault|safe|宝箱|宝物|金币|金钱|珠宝|财宝|奖励|宝石|钻石|红宝石|绿宝石|たからばこ|たからもの|きんか|きんせん|ほうせき|しゅほう|おうごん|ゴールド|コイン|マネー|ジェム|ジュエル|ダイヤモンド|ルビー|エメラルド|トレジャー|チェスト|ボックス|リワード|プライズ/i;

const TREASURE_IMAGE_NAME_PATTERN =
  /chest|box|treasure|gold|coin|gem|jewel|crystal|orb|artifact|vault|safe|money|diamond|ruby|emerald|宝箱|宝物|金币|金钱|珠宝|财宝|钻石|红宝石|绿宝石|宝石|たからばこ|たからもの|きんか|きんせん|ほうせき|ダイヤモンド|ルビー|エメラルド|ゴールド|コイン|ジェム|ジュエル|クリスタル|トレジャー|チェスト|ボックス/i;

const TREASURE_TEXT_PATTERN =
  /found|obtained|received|gained|treasure|gold|coin|item|reward|loot|prize|discovered|acquired|collected|发现|获得|得到|找到|宝物|金币|收集|获取|奖励|战利品|發見|入手|取得|みつけた|てにいれた|えた|かくとく|ほうしゅう|あいてむ|たからもの|きんか|ゴールド|アイテム|リワード|トレジャー|コイン|しゅうしゅう|はっけん/i;

const ENEMY_COMMENT_PATTERN =
  /enemy|敌人|monster|hostile|boss|guard|soldier|bandit|thief|assassin|villain|criminal|mercenary|outlaw|warrior|knight|敵|モンスター|敵対|ボス|ガード|兵士|盗賊|暗殺者|悪|魔物|魔獣|デーモン|鬼|妖怪|悪役|犯罪者|傭兵|戦士|騎士|アウトロー/i;

const ENEMY_IMAGE_NAME_PATTERN =
  /enemy|monster|evil|demon|beast|soldier|guard|bandit|thief|assassin|mercenary|outlaw|criminal|villain|boss|captain|samurai|ninja|ronin|hunter|archer|swordsman|mage|wizard|witch|sorcerer|priest|cleric|warrior|knight|man|woman|person|human|people|npc|char|character|sprite|敌人|敵|怪物|魔物|士兵|守卫|强盗|小偷|刺客|雇佣兵|罪犯|恶棍|老板|队长|武士|忍者|猎人|弓箭手|剑士|法师|巫师|祭司|战士|骑士|人|角色|モンスター|悪|デーモン|魔獣|兵士|ガード|盗賊|暗殺者|傭兵|犯罪者|悪役|ボス|キャプテン|サムライ|ニンジャ|浪人|ハンター|アーチャー|ソードマン|メイジ|ウィザード|魔女|ソーサラー|プリースト|クレリック|戦士|騎士|人間|キャラクター|スプライト/i;

export const MapEventClassifier = {
  isEnemyEvent(event) {
    try {
      // 传入的是 Game_Event（$gameMap._events[i]），它没有 _pages；
      // 页面 / 指令都在对应的事件数据和当前页上。
      const dataEvent =
        typeof event.event === "function" ? event.event() : null;
      const currentPage =
        typeof event.page === "function" ? event.page() : null;
      const pages =
        dataEvent && Array.isArray(dataEvent.pages)
          ? dataEvent.pages
          : currentPage
            ? [currentPage]
            : [];

      const currentList =
        currentPage && Array.isArray(currentPage.list) ? currentPage.list : [];

      // 移动类型在页上（page.moveType），不在 Game_Event 上。
      const hasMovement =
        (currentPage && Number(currentPage.moveType) > 0) ||
        pages.some((page) => page && Number(page.moveType) > 0);

      const characterName =
        (typeof event.characterName === "function"
          ? event.characterName()
          : event._characterName) ||
        currentPage?.image?.characterName ||
        dataEvent?.pages?.[0]?.image?.characterName ||
        "";

      const notPlayer =
        typeof $gamePlayer === "undefined" ||
        !$gamePlayer ||
        event._eventId !== $gamePlayer._eventId;

      // Moving characters are likely enemies
      if (hasMovement && notPlayer) {
        return true;
      }

      if (!characterName) {
        return false;
      }

      // 301（战斗处理）只会在当前页触发；注释 108/408 可能写在任意页。
      const lists = [currentList];

      pages.forEach((page) => {
        if (page && Array.isArray(page.list) && page.list !== currentList) {
          lists.push(page.list);
        }
      });

      for (const list of lists) {
        for (const command of list) {
          if (!command) continue;

          // Check for battle processing command (code 301)
          if (command.code === 301) return true;

          // Check for common enemy event patterns
          if (command.code === 108 || command.code === 408) {
            const comment = command.parameters?.[0] || "";

            // Use pre-compiled regex for efficient multi-language enemy pattern matching
            if (ENEMY_COMMENT_PATTERN.test(comment)) {
              return true;
            }
          }
        }
      }

      // Check character filename patterns using pre-compiled regex
      if (ENEMY_IMAGE_NAME_PATTERN.test(characterName)) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  },

  isTreasureEvent(event) {
    try {
      // Check if event name contains treasure-related keywords using pre-compiled regex
      if (event.name && TREASURE_NAME_PATTERN.test(event.name)) {
        return true;
      }

      // Check if event has treasure-like graphics using pre-compiled regex
      if (
        event._characterName &&
        TREASURE_IMAGE_NAME_PATTERN.test(event._characterName)
      ) {
        return true;
      }

      // Check event pages for treasure-related commands
      if (event.pages) {
        for (const page of event.pages) {
          if (!page) continue;
          if (
            page.image &&
            page.image.characterName &&
            TREASURE_IMAGE_NAME_PATTERN.test(page.image.characterName)
          ) {
            return true;
          }
          if (page && page.list) {
            for (const command of page.list) {
              if (command && command.parameters) {
                // Check for item/gold gain commands
                if (
                  command.code === 125 || // Change Gold
                  command.code === 126 || // Change Items
                  command.code === 127 || // Change Weapons
                  command.code === 128
                ) {
                  // Change Armors
                  return true;
                }

                // Check for treasure-related text in messages using pre-compiled regex
                if (command.code === 101 || command.code === 401) {
                  // Show Text
                  const text = command.parameters[0] || "";

                  // Use pre-compiled regex for efficient multi-language treasure pattern matching
                  if (TREASURE_TEXT_PATTERN.test(text)) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  },
};
