// @ts-check
import { createItemDatabasePanel } from "./ItemDatabasePanel.js";

export default createItemDatabasePanel({
  name: "ItemSettingPanel",
  stateKey: "item",
  getItems: () => $dataItems,
  descTitleKey: "items.itemDesc",
});
