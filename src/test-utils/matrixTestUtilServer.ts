import * as cp from "child_process";
import fetch from "cross-fetch";

/**
 * Point the integration tests at an already-running homeserver (e.g. the
 * ixo-testing-harness Synapse) instead of the legacy bundled test-server:
 *
 *   MATRIX_TEST_BASEURL=http://localhost:34008 \
 *   MATRIX_TEST_HOMESERVER=ixo.test \
 *   pnpm test
 *
 * MATRIX_TEST_HOMESERVER is the server_name (used in room aliases and user
 * ids); MATRIX_TEST_BASEURL is the client API endpoint. When
 * MATRIX_TEST_BASEURL is set, the docker-compose autostart of the legacy
 * test-server is skipped and the tests simply wait for the given server.
 */
const EXTERNAL_BASEURL = process.env.MATRIX_TEST_BASEURL;

export const HOMESERVER_NAME =
  process.env.MATRIX_TEST_HOMESERVER ??
  (EXTERNAL_BASEURL ? new URL(EXTERNAL_BASEURL).host : "localhost:8888");

export const matrixTestConfig = {
  baseUrl: EXTERNAL_BASEURL ?? "http://localhost:8888",
  // idBaseUrl: "https://vector.im",
};

export const MATRIX_HOME_URL = new URL(
  matrixTestConfig.baseUrl + "/_matrix/static/"
);

let matrixStarted = false;

async function hasMatrixStarted() {
  try {
    await fetch(MATRIX_HOME_URL.toString());
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForMatrixStart() {
  while (true) {
    console.log("Waiting for Matrix to start...");
    if (await hasMatrixStarted()) {
      console.log("Matrix has started!");
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
}

export async function ensureMatrixIsRunning() {
  if (!matrixStarted) {
    if (await hasMatrixStarted()) {
      matrixStarted = true;
    }
  }

  if (
    !matrixStarted &&
    !EXTERNAL_BASEURL &&
    (!process.env.CI || process.env.CI === "vscode-jest-tests")
  ) {
    matrixStarted = true;
    console.log("Starting matrix using docker-compose");
    const ret = cp.execSync("docker compose up -d", {
      cwd: "../../test-server/",
    });
    console.log(ret.toString("utf-8"));
  }

  await waitForMatrixStart();
}
