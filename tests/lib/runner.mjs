import assert from "node:assert/strict";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRunner(title) {
  const tests = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    tests.push({ name, fn });
  }

  async function run() {
    console.log(`\n=== ${title} ===`);

    for (const entry of tests) {
      const started = Date.now();

      try {
        await entry.fn();
        passed++;
        console.log(`[PASS] ${entry.name} (${Date.now() - started} ms)`);
      } catch (error) {
        failed++;
        console.error(`[FAIL] ${entry.name} (${Date.now() - started} ms)`);
        console.error(indent(error && error.stack ? error.stack : String(error)));
      }
    }

    return { passed, failed, total: tests.length };
  }

  return { test, run, assert, sleep };
}

function indent(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => `       ${line}`)
    .join("\n");
}
