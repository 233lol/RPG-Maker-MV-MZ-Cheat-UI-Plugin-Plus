// Minimal NW.js declarations used by the cheat plugin.
//
// NW.js runs the game as a Chromium window with Node.js integration enabled,
// so `require`, `process` and `nw` are available as globals. The project does
// not depend on @types/node / nw.js typings; declare only what the cheat code
// touches.

declare var require: (id: string) => any & { resolve?: (id: string) => string };
declare var process: {
  cwd: () => string;
  pid?: number;
  platform?: string;
  env?: Record<string, string | undefined>;
  versions: Record<string, string | undefined>;
  mainModule?: { filename?: string };
};

// `require("fs")` is used behind NW.js guards. TypeScript resolves string
// literals passed to require(), so provide loose module declarations instead
// of pulling in @types/node (which would also add Node globals to the DOM code).
declare module "fs" {
  const fs: any;
  export = fs;
}

declare module "path" {
  const path: any;
  export = path;
}

// Flags installed by init/import.js for automated tests / duplicate-load guards.
interface Window {
  __CHEAT_RESIZE_OBSERVER_GUARD__?: any;
  __CHEAT_APPLIED__?: any;
}

declare var nw: {
  App?: {
    startPath?: string;
    quit?: () => void;
    dataPath?: string;
  };
  Shell?: {
    openExternal?: (url: string) => void;
  };
  Window?: {
    get?: () => any;
  };
};
