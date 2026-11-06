import test from "node:test";
import assert from "node:assert/strict";

import { applyStaticMethods } from "../../cheat-engine/www/cheat/js/save-backup/mixin.js";

test("applyStaticMethods：复制静态方法并跳过类保留字段", () => {
  class Source {
    static alpha() {
      return this.value;
    }

    static beta(value) {
      return `beta:${value}`;
    }
  }

  class Target {
    static value = "target";
  }

  const result = applyStaticMethods(Target, Source);

  assert.equal(result, Target);
  assert.equal(typeof Target.alpha, "function");
  assert.equal(typeof Target.beta, "function");
  assert.equal(Target.alpha(), "target");
  assert.equal(Target.beta(1), "beta:1");

  // 不覆盖函数自身的 length / name / prototype
  assert.equal(Target.name, "Target");
  assert.equal(typeof Target.prototype, "object");
});

test("applyStaticMethods：方法内部通过 this 调用目标类的其它静态方法", () => {
  class Source {
    static double(value) {
      return this.base(value) * 2;
    }
  }

  class Target {
    static base(value) {
      return value + 1;
    }
  }

  applyStaticMethods(Target, Source);

  assert.equal(Target.double(3), 8);
});

test("applyStaticMethods：源没有可复制方法时保持目标不变", () => {
  class Target {
    static keep = 1;
  }

  applyStaticMethods(Target, class {});

  assert.equal(Target.keep, 1);
});
