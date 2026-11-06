// @ts-check
import { createItemDatabasePanel } from "./ItemDatabasePanel.js";

export default createItemDatabasePanel({
  name: "ArmorSettingPanel",
  stateKey: "armor",
  getItems: () => $dataArmors,
  descTitleKey: "items.armorDesc",
});
