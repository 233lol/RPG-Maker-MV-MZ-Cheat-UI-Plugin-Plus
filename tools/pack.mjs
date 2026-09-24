import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const [type, outfile] = process.argv.slice(2);
if (type !== "mv" && type !== "mz") {
  console.error("usage: node tools/pack.mjs <mv|mz> <output.zip>");
  process.exit(1);
}

// MV games keep their files inside a top-level www/ directory, MZ games don't.
const prefix = type === "mv" ? "www/" : "";
const entries = {};

// Files that must never ship: the git placeholder, Finder/Explorer junk and VCS
// metadata. Everything else — including other dotfiles — is packed on purpose.
const JUNK = new Set([
  ".gitkeep", // placeholder keeping an empty dir in git
  ".ds_store", // macOS Finder metadata
  "thumbs.db", // Windows Explorer thumbnail cache
  "desktop.ini", // Windows folder config
  ".git", // VCS metadata, should never be inside the game dir anyway
  ".svn",
  ".hg",
]);
const isJunk = (name) => JUNK.has(name.toLowerCase());

function addDir(dir, archiveDir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isJunk(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const archivePath = archiveDir + entry.name;
    if (entry.isDirectory()) {
      addDir(fullPath, archivePath + "/");
    } else if (entry.isFile()) {
      entries[archivePath] = readFileSync(fullPath);
    }
  }
}

addDir(path.join(rootDir, "cheat-engine", "www", "cheat"), `${prefix}cheat/`);
entries[`${prefix}js/main.js`] = readFileSync(
  path.join(rootDir, "cheat-engine", "www", "_cheat_initialize", type, "js", "main.js"),
);

writeFileSync(outfile, zipSync(entries, { level: 9 }));
console.log(`Packed ${Object.keys(entries).length} files into ${outfile}`);
