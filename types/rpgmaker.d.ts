// Minimal ambient declarations for the RPG Maker MV/MZ runtime.
//
// The cheat sources are plain JavaScript checked with `// @ts-check`.
// RPG Maker injects most of these symbols at runtime, so they are not real
// imports. Keep the declarations intentionally loose: the goal is to let
// TypeScript validate the logic inside the helper modules, not to model the
// whole engine.

declare var Utils: any;
declare var DataManager: any;
declare var ConfigManager: any;
declare var StorageManager: any;
declare var SceneManager: any;
declare var BattleManager: any;
declare var SoundManager: any;
declare var ImageManager: any;
declare var AudioManager: any;
declare var TextManager: any;
declare var ColorManager: any;
declare var FontManager: any;
declare var EffectManager: any;
declare var PluginManager: any;
declare var Input: any;
declare var TouchInput: any;
declare var Graphics: any;
declare var JsonEx: any;
declare var LZString: any;
declare var pako: any;

declare var $gamePlayer: any;
declare var $gameParty: any;
declare var $gameActors: any;
declare var $gameTroop: any;
declare var $gameMap: any;
declare var $gameSystem: any;
declare var $gameSwitches: any;
declare var $gameVariables: any;
declare var $gameSelfSwitches: any;
declare var $gameTemp: any;
declare var $gameScreen: any;
declare var $dataSystem: any;
declare var $dataMap: any;
declare var $dataMapInfos: any;
declare var $dataActors: any;
declare var $dataClasses: any;
declare var $dataSkills: any;
declare var $dataItems: any;
declare var $dataWeapons: any;
declare var $dataArmors: any;
declare var $dataStates: any;
declare var $dataEnemies: any;
declare var $dataTroops: any;
declare var $dataCommonEvents: any;
declare var $dataTilesets: any;
declare var $plugins: any;

declare var Game_Actor: any;
declare var Game_Party: any;
declare var Game_System: any;
declare var Game_Player: any;
declare var Game_CharacterBase: any;
declare var Game_Interpreter: any;
declare var Game_Event: any;
declare var Game_Map: any;
declare var Game_Troop: any;
declare var Game_Variables: any;
declare var Game_Switches: any;
declare var Game_Screen: any;
declare var Scene_Title: any;
declare var Scene_Boot: any;
declare var Scene_Map: any;
declare var Scene_Battle: any;
declare var Scene_Save: any;
declare var Scene_Load: any;
declare var Scene_Base: any;
declare var Window_Message: any;
declare var Window_ScrollText: any;
declare var Window_BattleLog: any;
declare var Sprite_Character: any;
declare var Spriteset_Base: any;
