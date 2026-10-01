import { parseArgs } from "node:util";
import { BuyProxy, type BillingInterval, type Catalog, type PaidPlan, type ProductKey } from "buyproxy";
import { resolveAuth } from "../config.js";
import { UserError, requireClient, requireReseller, type Command, type Globals } from "../ctx.js";
import { openUrl } from "../system.js";
import { Cancelled, box, c, confirm, err, info, input, isTTY, ok, out, select, spinner, usd, warn, withSpinner } from "../ui/index.js";
import { renderTransaction } from "./account.js";

export async function loadCatalog(): Promise<Catalog> {
  return new BuyProxy({ apiKey: "", baseUrl: resolveAuth().baseUrl }).products.list();
}

type Method = "card" | "crypto";

/** Opens the payment page and waits for the webhook to settle it. */
async function payAndWait(client: BuyProxy, url: string, transactionId: string | null, opts: { open: boolean; wait: boolean }): Promise<void> {
  out("");
  out(`  ${c.gray("Pay here:")} ${c.underline(c.orange(url))}`);
  if (opts.open) openUrl(url);

  if (!transactionId) return void info("That opened your subscription settings — changes apply as soon as you confirm there.");
  if (!opts.wait || !isTTY) return void out(`  ${c.gray(`Track it with: buyproxy tx ${transactionId} --wait`)}`);

  const s = spinner("Waiting for your payment — finish checkout in the browser (Ctrl-C to stop waiting)");
  try {
    const tx = await client.transactions.wait(transactionId, { timeoutMs: 15 * 60_000, intervalMs: 3000 });
    if (tx.status === "succeeded") {
      s.succeed("Payment received — your bandwidth is on its way");
      renderTransaction(tx);
    } else {
      s.fail("Payment didn't complete");
      warn("No charge was made. You can start again any time.");
    }
  } catch {
    s.stop();
    warn(`Still pending. Check later with: buyproxy tx ${transactionId} --wait`);
  }
}

export interface TopupFlags {
  gb?: string;
  card?: boolean;
  crypto?: boolean;
  pool?: boolean;
  "no-open"?: boolean;
  "no-wait"?: boolean;
  yes?: boolean;
}

export async function topupFlow(g: Globals, productArg: string | undefined, flags: TopupFlags): Promise<void> {
  const client = flags.pool ? requireReseller(g) : requireClient(g);
  const catalog = await withSpinner("Loading prices", loadCatalog, "Prices loaded");

  let product = catalog.products.find((p) => p.productKey === productArg?.toLowerCase());
  if (productArg && !product) throw new UserError(`Unknown product "${productArg}".`, `Choose one of: ${catalog.products.map((p) => p.productKey).join(", ")}`);
  if (!product) {
    if (!isTTY) throw new UserError("Say which product to top up.", `One of: ${catalog.products.map((p) => p.productKey).join(", ")}`);
    product = await select("Which product?", catalog.products.map((p) => ({ label: p.name, value: p, hint: p.pricePerGbCents ? `${usd(p.pricePerGbCents)}/GB · min ${p.minGb} GB` : `min ${p.minGb} GB` })));
  }

  let gb = flags.gb ? Number(flags.gb) : NaN;
  if (!Number.isFinite(gb)) {
    if (!isTTY) throw new UserError("Say how many GB with --gb.");
    gb = Number(await input(`How many GB? (min ${product.minGb})`, { default: String(Math.max(product.minGb, 10)), validate: (v) => (/^\d+$/.test(v) && +v >= product.minGb && +v <= 10000 ? undefined : `Enter a whole number from ${product.minGb} to 10 000.`) }));
  }
  if (!Number.isInteger(gb) || gb < product.minGb || gb > 10000) throw new UserError(`--gb must be a whole number from ${product.minGb} to 10 000 for ${product.name}.`);

  let method: Method | undefined = flags.card ? "card" : flags.crypto ? "crypto" : undefined;
  if (!method) {
    if (!isTTY) throw new UserError("Choose a payment method: --card or --crypto.");
    method = await select<Method>("Pay with", [{ label: "Card", value: "card", hint: "Stripe Checkout" }, { label: "Crypto", value: "crypto", hint: "BTC, ETH, USDT and more" }]);
  }

  const bonus = gb >= catalog.volumeBonus.thresholdGb ? Math.floor(gb * catalog.volumeBonus.rate) : 0;
  const total = product.pricePerGbCents ? gb * product.pricePerGbCents : null;
  if (!g.json) {
    out(
      box(
        [
          `${c.gray("Product  ")} ${c.bold(product.name)}${flags.pool ? c.purple("  → reseller pool") : ""}`,
          `${c.gray("Bandwidth")} ${gb} GB${bonus ? c.green(`  + ${bonus} GB bonus`) : ""}`,
          `${c.gray("Total    ")} ${total !== null ? c.bold(usd(total)) : c.gray("shown at checkout")}  ${c.gray(`via ${method}`)}`,
        ],
        { title: "Order", color: c.orange },
      ),
    );
  }
  if (isTTY && !flags.yes && !g.json && !(await confirm("Continue to payment?"))) throw new Cancelled();

  const body = { productKey: product.productKey as ProductKey, gb };
  const result = await withSpinner("Creating your checkout", async () => {
    if (method === "card") {
      const r = flags.pool ? await client.reseller.pool.topupCard(body) : await client.topup.card({ kind: "topup", ...body });
      return { url: r.payUrl, id: r.transactionId };
    }
    const r = flags.pool ? await client.reseller.pool.topupCrypto(body) : await client.topup.crypto(body);
    return { url: r.url, id: r.transactionId };
  }, "Checkout ready");

  if (g.json) return void out(JSON.stringify({ url: result.url, transactionId: result.id }));
  await payAndWait(client, result.url, result.id, { open: !flags["no-open"], wait: !flags["no-wait"] });
}

const TOPUP_OPTIONS = {
  gb: { type: "string", short: "g" },
  card: { type: "boolean" },
  crypto: { type: "boolean" },
  pool: { type: "boolean" },
  yes: { type: "boolean", short: "y" },
  "no-open": { type: "boolean" },
  "no-wait": { type: "boolean" },
} as const;

export const topup: Command = {
  name: "topup",
  aliases: ["buy"],
  group: "Billing",
  summary: "Buy bandwidth by card or crypto",
  usage: "buyproxy topup [product] [--gb 25] [--card|--crypto] [--pool] [-y]",
  examples: ["buyproxy topup", "buyproxy topup residential --gb 100 --card", "buyproxy topup premium -g 20 --crypto --no-open", "buyproxy topup residential -g 500 --card --pool   # reseller pool"],
  async run(argv, g) {
    const { values, positionals } = parseArgs({ args: argv, options: TOPUP_OPTIONS, allowPositionals: true, strict: true });
    try {
      await topupFlow(g, positionals[0], values as TopupFlags);
    } catch (e) {
      if (e instanceof Cancelled) return void err(c.gray("Cancelled — nothing was charged."));
      throw e;
    }
  },
};

export const subscribe: Command = {
  name: "subscribe",
  aliases: ["upgrade"],
  group: "Billing",
  summary: "Subscribe to a plan (Pro, Business, Advanced), monthly or yearly",
  usage: "buyproxy subscribe [pro|business|advanced] [--yearly]",
  examples: ["buyproxy subscribe", "buyproxy subscribe business --yearly"],
  async run(argv, g) {
    const { values, positionals } = parseArgs({ args: argv, options: { yearly: { type: "boolean" }, yes: { type: "boolean", short: "y" }, "no-open": { type: "boolean" }, "no-wait": { type: "boolean" } }, allowPositionals: true, strict: true });
    const client = requireClient(g);
    const catalog = await withSpinner("Loading plans", loadCatalog, "Plans loaded");
    try {
      let plan = catalog.plans.find((p) => p.plan === positionals[0]?.toLowerCase());
      if (positionals[0] && !plan) throw new UserError(`Unknown plan "${positionals[0]}".`, `Choose one of: ${catalog.plans.map((p) => p.plan).join(", ")}`);
      if (!plan) {
        if (!isTTY) throw new UserError("Say which plan to subscribe to.", catalog.plans.map((p) => p.plan).join(", "));
        plan = await select("Which plan?", catalog.plans.map((p) => ({ label: p.plan[0]!.toUpperCase() + p.plan.slice(1), value: p, hint: `${usd(p.monthlyPriceCents)}/mo · ${p.includedGb} GB included` })));
      }
      let interval: BillingInterval = values.yearly ? "year" : "month";
      if (!values.yearly && isTTY && !values.yes) {
        interval = await select<BillingInterval>("Billing", [{ label: `Monthly  ${usd(plan.monthlyPriceCents)}/mo`, value: "month" }, { label: `Yearly   ${usd(Math.round(plan.monthlyPriceCents * 12 * 0.9))}/yr  (~10% off)`, value: "year" }]);
      }
      if (isTTY && !values.yes && !g.json && !(await confirm(`Subscribe to ${plan.plan} (${interval === "year" ? "yearly" : "monthly"})?`))) throw new Cancelled();

      const r = await withSpinner("Creating your checkout", () => client.topup.card({ kind: "plan", plan: plan!.plan as PaidPlan, interval }), "Checkout ready");
      if (g.json) return void out(JSON.stringify(r));
      await payAndWait(client, r.payUrl, r.transactionId, { open: !values["no-open"], wait: !values["no-wait"] });
    } catch (e) {
      if (e instanceof Cancelled) return void err(c.gray("Cancelled — nothing was charged."));
      throw e;
    }
  },
};

export { ok };
