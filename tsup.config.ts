import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

// The SDK is bundled in, so the published CLI has zero runtime dependencies —
// `npm i -g`, Homebrew and the install script all stay fast and lock-file-proof.
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  sourcemap: false,
  noExternal: ["buyproxy"],
  define: { "process.env.BUYPROXY_CLI_VERSION": JSON.stringify(version) },
});
