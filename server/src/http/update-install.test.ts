import { describe, expect, test } from "bun:test";
import { createUpdateHandlers } from "./update";
import { shQuote } from "../utils/process-utils";

describe("web update installation", () => {
  test("refuses installation and directs the user to the CLI", async () => {
    let processInvoked = false;
    const handlers = createUpdateHandlers({
      appVersion: "9.8.6",
      runProcessWithCodeTimeout: async () => {
        processInvoked = true;
        throw new Error("web updater must fail closed");
      },
      shQuote,
      runtime: {
        platform: process.platform,
        arch: process.arch,
        execPath: "/tmp/roamgate",
        argv: ["/tmp/roamgate"],
      },
      environment: { HERDR_GUI_RESTART_SUPERVISOR: "1" },
    });

    const response = await handlers.handleUpdateInstall(
      new Request("http://localhost/api/update/install", {
        method: "POST",
        headers: { "x-herdr-gui-update": "1" },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error:
        "Web installation is disabled for custom builds; run `roamgate update` in the CLI to build and install this update.",
    });
    expect(processInvoked).toBe(false);
  });
});
