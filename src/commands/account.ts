import { parseArgs } from "node:util";
import type { Balance, Plan, Transaction } from "buyproxy";
import { BuyProxy } from "buyproxy";
import { requireClient, SITE, type Command, type Globals } from "../ctx.js";
import { resolveAuth } from "../config.js";
import { bar, c, formatGb, heading, kv, out, table, usd, withSpinner, box, info } from "../ui/index.js";
import { openUrl } from "../system.js";

const statusChip = (s: string): string =>
  s === "succeeded" || s === "active" ? c.green(s) : s === "pending" ? c.amber(s) : c.red(s);

export const products: Command = {
  name: "products",
  aliases: ["pricing", "prices"],
  group: "Billing",
  summary: "Product catalog with live per-GB prices",
  usage: "buyproxy products",
  async run(_argv, g) {
    const client = new BuyProxy({ apiKey: "", baseUrl: resolveAuth().baseUrl });
    const catalog = await withSpinner("Loading the catalog", () => client.products.list(), "Catalog loaded");
    if (g.json) return void out(JSON.stringify(catalog, null, 2));

    heading("Proxy products");
    out(
      table(
        ["Product", "Key", "Per GB", "Min"],
        catalog.products.map((p) => [c.bold(p.name), c.orange(p.productKey), p.pricePerGbCents ? usd(p.pricePerGbCents) : c.gray("—"), `${p.minGb} GB`]),
        ["l", "l", "r", "r"],
      ),
    );
    out("");
    info(`Buy ${catalog.volumeBonus.thresholdGb} GB or more in one top-up and get ${Math.round(catalog.volumeBonus.rate * 100)}% extra, free.`);

    heading("Plans");
    out(
      table(
        ["Plan", "Monthly", "Included"],
        catalog.plans.map((p) => [c.bold(p.plan), usd(p.monthlyPriceCents), `${p.includedGb} GB / month`]),
        ["l", "r", "r"],
      ),
    );
  },
};

/** Joins per-product balances with their plans so each row can show a usage bar. */
async function loadBalances(client: BuyProxy): Promise<{ balances: Balance[]; plans: Plan[] }> {
  const [balances, plans] = await Promise.all([client.balances.list(), client.plans.list()]);
  return { balances, plans };
}

export function renderBalances(balances: Balance[], plans: Plan[], names: Map<string, string>): string {
  const rows = balances.map((b) => {
    const plan = plans.find((p) => p.id === b.planId);
    const name = names.get(b.productId) ?? b.productKey ?? b.productId;
    if (!plan && b.totalGb === 0) return `  ${c.gray(name.padEnd(20))} ${c.gray("░".repeat(24))}  ${c.gray("not funded")}`;
    const total = plan?.dataGbTotal ?? b.totalGb;
    const left = b.activeGb;
    const pending = b.pendingGb > 0 ? c.amber(`  +${formatGb(b.pendingGb)} arriving`) : "";
    return `  ${c.bold(name.padEnd(20))} ${bar(total ? left / total : 0)}  ${formatGb(left)}${c.gray(` / ${formatGb(total)}`)}${pending}`;
  });
  return rows.join("\n");
}

export const balance: Command = {
  name: "balance",
  aliases: ["bal", "usage"],
  group: "Account",
  summary: "Bandwidth left on every product",
  usage: "buyproxy balance",
  async run(_argv, g) {
    const client = requireClient(g);
    const [catalog, data] = await withSpinner("Checking your balances", async () => {
      const pub = new BuyProxy({ apiKey: "", baseUrl: resolveAuth().baseUrl });
      return Promise.all([pub.products.list(), loadBalances(client)]);
    }, "Balances loaded");
    if (g.json) return void out(JSON.stringify(data, null, 2));

    const names = new Map(catalog.products.map((p) => [p.productId, p.name]));
    heading("Bandwidth");
    out(renderBalances(data.balances, data.plans, names));
    const soonest = data.plans.filter((p) => p.expiresAt).sort((a, b) => +new Date(a.expiresAt!) - +new Date(b.expiresAt!))[0];
    if (soonest) out(`\n  ${c.gray(`Next expiry: ${soonest.name} on ${new Date(soonest.expiresAt!).toLocaleDateString()}`)}`);
    out(`\n  ${c.gray("Need more?")} ${c.orange("buyproxy topup")}`);
  },
};

export const plans: Command = {
  name: "plans",
  group: "Proxies",
  summary: "Your plans and what each can generate",
  usage: "buyproxy plans",
  async run(_argv, g) {
    const client = requireClient(g);
    const list = await withSpinner("Loading your plans", () => client.plans.list(), "Plans loaded");
    if (g.json) return void out(JSON.stringify(list, null, 2));
    if (list.length === 0) return void info(`No plans yet — run ${c.orange("buyproxy topup")} to buy your first GB.`);

    heading("Your plans");
    out(
      table(
        ["Plan", "ID", "Left", "Protocols", "Targeting", "Sticky"],
        list.map((p) => {
          const caps = p.generate;
          const targeting = caps ? (["country", "state", "city", "isp"] as const).filter((k) => caps.targeting[k]).join("/") : "—";
          return [
            c.bold(p.name),
            c.gray(p.id),
            formatGb(p.dataGbRemaining),
            caps?.protocols.join("/") ?? "—",
            targeting || "—",
            caps?.maxStickyMinutes ? `${caps.maxStickyMinutes} min` : "—",
          ];
        }),
      ),
    );
  },
};

export const transactions: Command = {
  name: "transactions",
  aliases: ["tx", "payments"],
  group: "Billing",
  summary: "Payment history, or one payment's status",
  usage: "buyproxy transactions [id] [-n 10] [--wait]",
  examples: ["buyproxy transactions", "buyproxy tx st_9f2a… --wait"],
  async run(argv, g) {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { limit: { type: "string", short: "n", default: "10" }, wait: { type: "boolean", default: false } },
      allowPositionals: true,
      strict: true,
    });
    const client = requireClient(g);

    if (positionals[0]) {
      const id = positionals[0];
      const tx = values.wait
        ? await withSpinner("Waiting for the payment to settle", () => client.transactions.wait(id), "Payment settled")
        : await withSpinner("Looking up the payment", () => client.transactions.get(id), "Found it");
      if (g.json) return void out(JSON.stringify(tx, null, 2));
      return void renderTransaction(tx);
    }

    const list = await withSpinner("Loading payments", () => client.transactions.list({ limit: Number(values.limit) || 10 }), "Payments loaded");
    if (g.json) return void out(JSON.stringify(list, null, 2));
    if (list.length === 0) return void info("No payments yet.");
    heading("Payments");
    out(
      table(
        ["Date", "Item", "Method", "Amount", "Status", "ID"],
        list.map((t) => [
          new Date(t.createdAt).toLocaleDateString(),
          describe(t),
          t.paymentMethod,
          usd(t.amountCents),
          statusChip(t.status),
          c.gray(t.id),
        ]),
        ["l", "l", "l", "r", "l", "l"],
      ),
    );
  },
};

const describe = (t: Transaction): string =>
  t.kind === "topup" ? `${t.gb ?? "?"} GB ${t.productKey ?? ""}${t.resellerPool ? " (pool)" : ""}`.trim() : `${t.plan} plan${t.interval === "year" ? " (yearly)" : ""}`;

export function renderTransaction(tx: Transaction): void {
  out(
    box(
      [
        `${c.gray("Item     ")} ${describe(tx)}`,
        `${c.gray("Amount   ")} ${usd(tx.amountCents)} ${tx.currency.toUpperCase()} via ${tx.paymentMethod}`,
        `${c.gray("Status   ")} ${statusChip(tx.status)}`,
        `${c.gray("Date     ")} ${new Date(tx.createdAt).toLocaleString()}`,
        `${c.gray("ID       ")} ${tx.id}`,
      ],
      { title: "Payment", color: tx.status === "succeeded" ? c.green : tx.status === "failed" ? c.red : c.amber },
    ),
  );
}

export const dashboard: Command = {
  name: "dashboard",
  aliases: ["open"],
  group: "Tools",
  summary: "Open your BuyProxy dashboard",
  usage: "buyproxy dashboard",
  async run() {
    out(`${c.gray("Opening")} ${SITE}/dashboard`);
    openUrl(`${SITE}/dashboard`);
  },
};

export const docs: Command = {
  name: "docs",
  group: "Tools",
  summary: "Open the API & SDK documentation",
  usage: "buyproxy docs",
  async run() {
    out(`${c.gray("Opening")} ${SITE}/docs/api-reference/introduction`);
    openUrl(`${SITE}/docs/api-reference/introduction`);
  },
};

export { kv, type Globals };
