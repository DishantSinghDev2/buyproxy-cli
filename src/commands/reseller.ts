import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import type { BuyProxy, Customer, ProductKey } from "buyproxy";
import { UserError, requireReseller, type Command, type Globals } from "../ctx.js";
import { Cancelled, bar, box, c, formatGb, heading, info, input, isTTY, kv, ok, out, select, table, withSpinner } from "../ui/index.js";
import { generateFlow, type GenerateFlags } from "./generate.js";
import { topupFlow } from "./topup.js";

const chip = (s: string): string => (s === "active" ? c.green("● active") : c.amber("● suspended"));

async function pickCustomer(client: BuyProxy, given: string | undefined, label: string): Promise<string> {
  if (given) return given;
  if (!isTTY) throw new UserError(`Say which customer to ${label}.`, "List them with `buyproxy customers`.");
  const list = await withSpinner("Loading customers", () => client.reseller.customers.list(), "Customers loaded");
  if (list.length === 0) throw new UserError("You have no customers yet.", "Create one with `buyproxy customers new <label>`.");
  return select(`Which customer to ${label}?`, list.map((x) => ({ label: x.label, value: x.username, hint: x.username })));
}

export function renderPool(pool: { label: string; gb: number }[]): string {
  const max = Math.max(1, ...pool.map((p) => p.gb));
  return pool.map((p) => `  ${(p.gb > 0 ? c.bold : c.gray)(p.label.padEnd(20))} ${bar(p.gb / max)}  ${p.gb > 0 ? formatGb(p.gb) : c.gray("empty")}`).join("\n");
}

export const pool: Command = {
  name: "pool",
  group: "Reseller",
  summary: "Your unallocated reseller bandwidth (and top it up)",
  usage: "buyproxy pool [topup [product] [--gb N] [--card|--crypto]]",
  async run(argv, g) {
    const client = requireReseller(g);
    if (argv[0] === "topup") {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: { gb: { type: "string", short: "g" }, card: { type: "boolean" }, crypto: { type: "boolean" }, yes: { type: "boolean", short: "y" }, "no-open": { type: "boolean" }, "no-wait": { type: "boolean" } },
        allowPositionals: true,
        strict: true,
      });
      return topupFlow(g, positionals[0], { ...values, pool: true });
    }
    const entries = await withSpinner("Loading your pool", () => client.reseller.pool.get(), "Pool loaded");
    if (g.json) return void out(JSON.stringify(entries, null, 2));
    heading("Reseller pool");
    out(renderPool(entries));
    out(`\n  ${c.gray("Fill it:")} ${c.orange("buyproxy pool topup")}   ${c.gray("Give it out:")} ${c.orange("buyproxy customers allocate")}`);
  },
};

async function list(client: BuyProxy, g: Globals, status?: "active" | "suspended"): Promise<void> {
  const customers = await withSpinner("Loading customers", () => client.reseller.customers.list({ status }), "Customers loaded");
  if (g.json) return void out(JSON.stringify(customers, null, 2));
  if (customers.length === 0) return void info(`No customers yet — create one with ${c.orange("buyproxy customers new <label>")}.`);
  heading(`Customers (${customers.length})`);
  out(table(["Label", "Username", "Status", "Created"], customers.map((x: Customer) => [c.bold(x.label), c.gray(x.username), chip(x.status), new Date(x.createdAt).toLocaleDateString()])));
}

async function show(client: BuyProxy, g: Globals, username: string): Promise<void> {
  const d = await withSpinner("Loading the customer", () => client.reseller.customers.get(username), "Customer loaded");
  if (g.json) return void out(JSON.stringify(d, null, 2));
  const lines = [`${c.gray("Username ")} ${d.username}`, `${c.gray("Status   ")} ${chip(d.status)}`, `${c.gray("Created  ")} ${new Date(d.createdAt).toLocaleDateString()}`];
  out(box(lines, { title: d.label, color: d.status === "active" ? c.purple : c.amber }));
  heading("Plans");
  if (d.plans.length === 0) out(`  ${c.gray("No bandwidth yet — allocate some with")} ${c.orange(`buyproxy customers allocate ${d.username}`)}`);
  for (const p of d.plans) out(`  ${c.bold(p.name.padEnd(20))} ${bar(p.dataGbTotal ? p.remainingGb / p.dataGbTotal : 0)}  ${formatGb(p.remainingGb)}${c.gray(` / ${formatGb(p.dataGbTotal)}`)}`);
  for (const p of d.pending) out(`  ${c.amber("＋")} ${formatGb(p.gb)} ${p.productKey ?? p.productId} ${c.amber("arriving shortly")}`);
}

export const customers: Command = {
  name: "customers",
  aliases: ["customer", "c"],
  group: "Reseller",
  summary: "Manage your reseller customers — create, fund, suspend, generate",
  usage: "buyproxy customers [list|new|show|rename|suspend|activate|usage|allocate|generate] …",
  examples: [
    "buyproxy customers new \"Acme Inc\"",
    "buyproxy customers allocate bp_acme_1a2b premium 10",
    "buyproxy customers generate bp_acme_1a2b -c DE -n 5",
    "buyproxy customers suspend bp_acme_1a2b",
  ],
  async run(argv, g) {
    const client = requireReseller(g);
    const [sub = "list", ...rest] = argv;

    switch (sub) {
      case "list":
      case "ls": {
        const { values } = parseArgs({ args: rest, options: { status: { type: "string" } }, strict: true });
        if (values.status && values.status !== "active" && values.status !== "suspended") throw new UserError("--status is active or suspended.");
        return list(client, g, values.status as "active" | "suspended" | undefined);
      }
      case "new":
      case "create": {
        const label = rest.join(" ").trim() || (isTTY ? await input("Customer name or reference") : "");
        if (!label) throw new UserError("Give the customer a label.", "buyproxy customers new \"Acme Inc\"");
        const created = await withSpinner("Creating the customer", () => client.reseller.customers.create({ label }), "Customer created");
        if (g.json) return void out(JSON.stringify(created, null, 2));
        kv("Username", c.bold(created.username));
        out(`\n  ${c.gray("Next:")} ${c.orange(`buyproxy customers allocate ${created.username}`)}`);
        return;
      }
      case "show":
      case "get":
        return show(client, g, await pickCustomer(client, rest[0], "show"));
      case "rename": {
        const username = await pickCustomer(client, rest[0], "rename");
        const label = rest.slice(1).join(" ").trim() || (await input("New label"));
        const updated = await withSpinner("Renaming", () => client.reseller.customers.update(username, { label }), "Renamed");
        if (g.json) out(JSON.stringify(updated, null, 2));
        return;
      }
      case "suspend":
      case "activate": {
        const username = await pickCustomer(client, rest[0], sub);
        const updated = await withSpinner(sub === "suspend" ? "Suspending" : "Reactivating", () => client.reseller.customers.update(username, { status: sub === "suspend" ? "suspended" : "active" }), sub === "suspend" ? "Customer suspended" : "Customer reactivated");
        if (g.json) out(JSON.stringify(updated, null, 2));
        else if (sub === "suspend") info("They can't generate new proxies. Lines already handed out may work until they rotate.");
        return;
      }
      case "usage": {
        const username = await pickCustomer(client, rest[0], "inspect");
        const usage = await withSpinner("Loading usage", () => client.reseller.customers.usage(username), "Usage loaded");
        if (g.json) return void out(JSON.stringify(usage, null, 2));
        heading("Usage");
        if (usage.plans.length === 0) out(`  ${c.gray("No plans yet.")}`);
        for (const p of usage.plans) out(`  ${c.bold((p.productKey ?? p.productId).padEnd(14))} ${bar(p.totalGb ? p.remainingGb / p.totalGb : 0)}  ${formatGb(p.usedGb)} used ${c.gray(`of ${formatGb(p.totalGb)}`)}`);
        return;
      }
      case "allocate": {
        const username = await pickCustomer(client, rest[0], "fund");
        let productKey = rest[1];
        let gbText = rest[2];
        if (!productKey) {
          if (!isTTY) throw new UserError("Usage: buyproxy customers allocate <username> <product> <gb>");
          const pool = await withSpinner("Checking your pool", () => client.reseller.pool.get(), "Pool loaded");
          productKey = await select("Allocate which product?", pool.map((p) => ({ label: p.label, value: p.productKey as string, hint: `${formatGb(p.gb)} in pool`, disabled: p.gb <= 0 })));
        }
        if (!gbText) gbText = await input("How many GB?", { validate: (v) => (/^\d+$/.test(v) && +v >= 1 ? undefined : "Enter a whole number of GB.") });
        const gb = Number(gbText);
        const result = await withSpinner(
          `Allocating ${gb} GB`,
          () => client.reseller.customers.allocate(username, { productKey: productKey as ProductKey, gb, idempotencyKey: randomUUID() }),
          "Allocated",
        );
        if (g.json) return void out(JSON.stringify(result, null, 2));
        ok(`${gb} GB of ${result.productKey} → ${c.bold(username)}   ${c.gray(`(${formatGb(result.poolRemainingGb)} left in your pool)`)}`);
        return;
      }
      case "generate": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: { plan: { type: "string" }, country: { type: "string", short: "c" }, state: { type: "string" }, city: { type: "string" }, isp: { type: "string" }, count: { type: "string", short: "n" }, sticky: { type: "string", short: "s" }, socks5: { type: "boolean" }, format: { type: "string", short: "f" }, copy: { type: "boolean" } },
          allowPositionals: true,
          strict: true,
        });
        const username = await pickCustomer(client, positionals[0], "generate for");
        try {
          await generateFlow(client, g, { product: positionals[1], flags: values as GenerateFlags, customer: username, interactive: isTTY && !g.json && rest.length <= 1 });
        } catch (e) {
          if (!(e instanceof Cancelled)) throw e;
        }
        return;
      }
      default:
        throw new UserError(`Unknown customers command "${sub}".`, "Try: list, new, show, rename, suspend, activate, usage, allocate, generate");
    }
  },
};
