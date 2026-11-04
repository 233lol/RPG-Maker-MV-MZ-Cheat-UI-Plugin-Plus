// ESLint flat config.
//
// RPG Maker injects a large number of globals at runtime ($gamePlayer,
// DataManager, Game_Actor, ...). Enumerating them all would be brittle and
// would fail on every new engine/plugin symbol, so `no-undef` is disabled for
// the cheat sources. Real mistakes (unused variables, duplicate keys,
// unreachable code, ...) are still reported.
import js from "@eslint/js";
import globals from "globals";

const commonRules = {
  // Catch accidental leftovers without blocking intentional placeholders
  // (prefix an unused binding with `_` to silence it).
  "no-unused-vars": [
    "error",
    {
      args: "none",
      caughtErrors: "none",
      varsIgnorePattern: "^_",
      argsIgnorePattern: "^_",
    },
  ],
};

export default [
  {
    ignores: [
      "node_modules/**",
      "mv/**",
      "mz/**",
      "*.zip",
      "cheat-engine/www/cheat/libs/**",
      "cheat-engine/www/cheat/css/**",
      "cheat-engine/www/cheat/fonts/**",
      "cheat-engine/www/cheat/version.js",
      "assets/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: commonRules,
  },
  {
    files: ["cheat-engine/www/_cheat_initialize/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["cheat-engine/www/cheat/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        // RPG Maker runtime globals are intentionally not listed: see the
        // header comment.
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["tools/**/*.mjs", "*.mjs", "eslint.config.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Tests run inside the game page through CDP and intentionally reference
    // browser / RPG Maker globals from serialized functions.
    files: ["tests/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
