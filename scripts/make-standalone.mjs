// Builds dist/buyproxy.mjs — the whole CLI in one executable file (attached to every GitHub release).
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const body = readFileSync("dist/cli.js", "utf8");
const runner = `
process.on("SIGINT", () => { process.stderr.write("\\x1b[?25h\\n"); process.exit(130); });
main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
`;
writeFileSync("dist/buyproxy.mjs", `#!/usr/bin/env node\n${body}\n${runner}`);
chmodSync("dist/buyproxy.mjs", 0o755);
console.log("dist/buyproxy.mjs written");
