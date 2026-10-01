import { SITE, UserError, type Command, type Globals } from "./ctx.js";
import { catchAndReport } from "./run.js";
import { balance, dashboard, docs, plans, products, transactions } from "./commands/account.js";
import { login, logout, signup, whoami } from "./commands/auth.js";
import { generate, test } from "./commands/generate.js";
import { customers, pool } from "./commands/reseller.js";
import { subscribe, topup } from "./commands/topup.js";
import { home } from "./commands/home.js";
import { banner, c, err, gradient, isTTY, out, pad } from "./ui/index.js";

const VERSION = process.env.BUYPROXY_CLI_VERSION ?? "0.0.0";

export const COMMANDS: Command[] = [
  generate, test, plans, balance, topup, subscribe, products, transactions, customers, pool, login, logout, whoami, signup, dashboard, docs,
];

function help(topic?: string): void {
  const cmd = topic ? COMMANDS.find((x) => x.name === topic || x.aliases?.includes(topic)) : undefined;
  if (cmd) {
    out(`\n  ${c.bold(gradient(`buyproxy ${cmd.name}`))}  ${c.gray("—")} ${cmd.summary}\n`);
    out(`  ${c.gray("Usage")}\n    ${cmd.usage}\n`);
    if (cmd.aliases?.length) out(`  ${c.gray("Aliases")}\n    ${cmd.aliases.join(", ")}\n`);
    if (cmd.examples?.length) out(`  ${c.gray("Examples")}\n${cmd.examples.map((x) => `    ${c.orange("$")} ${x}`).join("\n")}\n`);
    return;
  }

  err("\n" + banner(VERSION) + "\n");
  const groups = ["Proxies", "Billing", "Reseller", "Account", "Tools"] as const;
  out(`  ${c.gray("Usage")}  ${c.bold("buyproxy")} ${c.orange("<command>")} ${c.gray("[options]")}      ${c.gray("(no command → interactive mode)")}\n`);
  for (const group of groups) {
    out(`  ${c.bold(group)}`);
    for (const cmd of COMMANDS.filter((x) => x.group === group)) out(`    ${c.orange(pad(cmd.name, 13))} ${cmd.summary}`);
    out("");
  }
  out(`  ${c.bold("Global options")}`);
  for (const [flag, desc] of [
    ["--key <key>", "Use this API key instead of the saved one"],
    ["--json", "Machine-readable output, no colours or prompts"],
    ["--no-color", "Disable colours (also honours NO_COLOR)"],
    ["-h, --help", "Help for a command: buyproxy help <command>"],
    ["-v, --version", "Print the version"],
  ] as const) out(`    ${c.orange(pad(flag, 13))} ${desc}`);
  out(`\n  ${c.gray("Environment")}  BUYPROXY_API_KEY · BUYPROXY_BASE_URL`);
  out(`  ${c.gray("Docs")}         ${SITE}/docs/api-reference/introduction\n`);
}

const COMPLETIONS: Record<string, () => string> = {
  bash: () => `_buyproxy() { COMPREPLY=($(compgen -W "${COMMANDS.map((x) => x.name).join(" ")} help completion" -- "\${COMP_WORDS[COMP_CWORD]}")); }\ncomplete -F _buyproxy buyproxy\n`,
  zsh: () => `#compdef buyproxy\n_arguments '1: :(${COMMANDS.map((x) => x.name).join(" ")} help completion)'\n`,
  fish: () => COMMANDS.map((x) => `complete -c buyproxy -n __fish_use_subcommand -a ${x.name} -d '${x.summary.replace(/'/g, "")}'`).join("\n") + "\n",
};

/** Pulls out the options every command shares and leaves the rest alone. */
export function splitGlobals(argv: string[]): { globals: Globals; rest: string[]; help: boolean; version: boolean } {
  const rest: string[] = [];
  const globals: Globals = { json: false };
  let helpFlag = false;
  let version = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") globals.json = true;
    else if (a === "--key") globals.key = argv[++i];
    else if (a.startsWith("--key=")) globals.key = a.slice(6);
    else if (a === "--no-color") continue;
    else if (a === "-h" || a === "--help") helpFlag = true;
    else if (a === "-v" || a === "--version") version = true;
    else rest.push(a);
  }
  return { globals, rest, help: helpFlag, version };
}

/** Levenshtein distance — for "did you mean". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

export async function main(argv: string[]): Promise<number> {
  const { globals, rest, help: wantsHelp, version } = splitGlobals(argv);
  const [name, ...args] = rest;

  if (version) return out(VERSION), 0;
  if (name === "help") return help(args[0]), 0;
  if (name === "completion") {
    const make = COMPLETIONS[args[0] ?? ""];
    if (!make) return err(`Usage: buyproxy completion ${Object.keys(COMPLETIONS).join("|")}`), 2;
    return out(make().trimEnd()), 0;
  }

  if (!name) {
    if (wantsHelp || !isTTY || globals.json) return help(), 0;
    return catchAndReport(() => home(globals));
  }

  const cmd = COMMANDS.find((x) => x.name === name || x.aliases?.includes(name));
  if (!cmd) {
    err(`${c.red("✖")} ${c.bold(`Unknown command "${name}"`)}`);
    const near = [...COMMANDS].sort((a, b) => distance(a.name, name) - distance(b.name, name)).find((x) => distance(x.name, name) <= 2);
    if (near) err(`  ${c.gray("Did you mean")} ${c.orange(near.name)}${c.gray("?")}`);
    err(`  ${c.gray("See all commands:")} buyproxy help`);
    return 2;
  }
  if (wantsHelp) return help(cmd.name), 0;

  return catchAndReport(() => cmd.run(args, globals));
}

export { UserError };
