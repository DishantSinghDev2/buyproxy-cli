#!/usr/bin/env node
import { main } from "../dist/cli.js";

process.on("SIGINT", () => {
  process.stderr.write("\x1b[?25h\n");
  process.exit(130);
});

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
