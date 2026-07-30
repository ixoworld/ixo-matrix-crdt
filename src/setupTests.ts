// https://github.com/developit/microbundle/issues/708, otherwise vscode-lib fails
// regenerator-runtime is not a declared dependency of this package; it is only
// present when a consumer/transitive dep happens to install it. Load it when it
// exists instead of hard-failing the whole test run.
try {
  require("regenerator-runtime/runtime.js");
} catch (e) {
  // no regenerator-runtime available; modern Node/browser targets don't need it
}

const nodeCrypto = require("crypto");
const { randomFillSync } = nodeCrypto;
(global as any).Olm = require("@matrix-org/olm");

// Note: olm needs a `getRandomValues` that accepts a Node Buffer, hence the
// randomFillSync shim. `subtle` must be preserved: media snapshot encryption
// (Matrix `m.encrypted_file`) uses WebCrypto AES-CTR.
Object.defineProperty(globalThis, "crypto", {
  value: {
    getRandomValues: randomFillSync,
    subtle: nodeCrypto.webcrypto.subtle,
  },
});
