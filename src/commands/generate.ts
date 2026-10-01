import { parseArgs } from "node:util";
import { BuyProxyError, ProxyEndpoint, type BuyProxy, type GenerateParams, type Plan, type ProxyProtocol } from "buyproxy";
import { UserError, requireClient, type Command, type Globals } from "../ctx.js";
import { FORMATS, render, type Format } from "../format.js";
import { checkProxy, copyToClipboard } from "../system.js";
import { Cancelled, box, c, err, formatGb, info, input, isTTY, ok, out, select, spinner, warn, withSpinner, heading, kv } from "../ui/index.js";

export interface GenerateFlags {
  plan?: string;
  country?: string;
  state?: string;
  city?: string;
  isp?: string;
  count?: string;
  sticky?: string;
  socks5?: boolean;
  format?: string;
  copy?: boolean;
}

const OPTIONS = {
  plan: { type: "string" },
  country: { type: "string", short: "c" },
  state: { type: "string" },
  city: { type: "string" },
  isp: { type: "string" },
  count: { type: "string", short: "n" },
  sticky: { type: "string", short: "s" },
  socks5: { type: "boolean" },
  format: { type: "string", short: "f" },
  copy: { type: "boolean" },
} as const;

export function pickPlan(plans: Plan[], wanted: string | undefined, flagPlan: string | undefined): Plan | "ask" {
  if (flagPlan) {
    const found = plans.find((p) => p.id === flagPlan);
    if (!found) throw new UserError(`No plan with id ${flagPlan}.`, "See your plans with `buyproxy plans`.");
    return found;
  }
  if (wanted) {
    const w = wanted.toLowerCase();
    const found = plans.find((p) => p.productKey === w) ?? plans.find((p) => p.productKey?.startsWith(w) || p.name.toLowerCase().includes(w));
    if (!found) {
      throw new UserError(`You don't have a plan for "${wanted}".`, `You have: ${plans.map((p) => p.productKey ?? p.name).join(", ") || "nothing yet — run `buyproxy topup`"}`);
    }
    return found;
  }
  if (plans.length === 1) return plans[0]!;
  return "ask";
}

async function chooseFormat(flag: string | undefined): Promise<Format> {
  const f = (flag ?? (isTTY ? "url" : "plain")) as Format;
  if (!FORMATS.includes(f)) throw new UserError(`Unknown format "${flag}".`, `Choose one of: ${FORMATS.join(", ")}`);
  return f;
}

/** Interactive prompts for whatever the plan supports and the flags didn't already answer. */
async function wizard(plan: Plan, flags: GenerateFlags): Promise<GenerateFlags> {
  const caps = plan.generate;
  const next = { ...flags };
  if (caps?.targeting.country && flags.country === undefined) {
    const v = await input("Country code (blank = anywhere)", { placeholder: "US, DE, JP …", validate: (x) => (!x || /^[A-Za-z]{2}$/.test(x) ? undefined : "Use a 2-letter code like US.") });
    if (v) next.country = v.toUpperCase();
  }
  if (caps?.targeting.state && next.country && flags.state === undefined) {
    const v = await input("State / region (blank = any)", { placeholder: "California" });
    if (v) next.state = v;
  }
  if (caps?.targeting.city && next.country && flags.city === undefined) {
    const v = await input("City (blank = any)", { placeholder: "Los Angeles" });
    if (v) next.city = v;
  }
  if (flags.count === undefined) {
    next.count = await input("How many proxies?", { default: "1", validate: (x) => (/^\d+$/.test(x) && +x >= 1 && +x <= (caps?.maxCount ?? 1000) ? undefined : `Enter 1–${caps?.maxCount ?? 1000}.`) });
  }
  if (caps && caps.maxStickyMinutes > 0 && flags.sticky === undefined) {
    const v = await input(`Sticky session in minutes (blank = rotate every request, max ${caps.maxStickyMinutes})`, {
      validate: (x) => (!x || (/^\d+$/.test(x) && +x >= 1 && +x <= caps.maxStickyMinutes) ? undefined : `Enter 1–${caps.maxStickyMinutes}.`),
    });
    if (v) next.sticky = v;
  }
  if (caps?.protocols.includes("socks5") && caps.protocols.includes("http") && flags.socks5 === undefined) {
    next.socks5 = (await select("Protocol", [{ label: "HTTP / HTTPS", value: false }, { label: "SOCKS5", value: true }])) as boolean;
  }
  return next;
}

export function toParams(flags: GenerateFlags): GenerateParams {
  const params: GenerateParams = {};
  if (flags.country) params.country = flags.country.toUpperCase();
  if (flags.state) params.state = flags.state;
  if (flags.city) params.city = flags.city;
  if (flags.isp) params.isp = flags.isp;
  if (flags.count) params.count = Number(flags.count);
  if (flags.sticky) params.stickyMinutes = Number(flags.sticky);
  if (flags.socks5) params.protocol = "socks5" as ProxyProtocol;
  if (params.count !== undefined && (!Number.isInteger(params.count) || params.count < 1)) throw new UserError("--count must be a whole number ≥ 1.");
  if (params.country && !/^[A-Z]{2}$/.test(params.country)) throw new UserError("--country takes a 2-letter ISO code like US or DE.");
  return params;
}

export function present(proxies: ProxyEndpoint[], format: Format, flags: GenerateFlags, g: Globals, params: GenerateParams): void {
  if (g.json) return void out(JSON.stringify(proxies.map((p) => p.toJSON()), null, 2));
  const text = render(proxies, format);

  if (!isTTY) {
    out(text);
  } else {
    const where = [params.city, params.state, params.country].filter(Boolean).join(", ") || "worldwide";
    const shown = text.split("\n");
    const clipped = shown.length > 12 ? [...shown.slice(0, 12), c.gray(`… and ${shown.length - 12} more (use --copy or pipe to a file)`)] : shown;
    out(box(clipped.map((l) => c.light(l)), { title: `${proxies.length} ${proxies.length === 1 ? "proxy" : "proxies"} · ${where}${params.stickyMinutes ? ` · sticky ${params.stickyMinutes}m` : " · rotating"}`, color: c.orange }));
  }
  if (flags.copy) {
    copyToClipboard(text) ? err(`${c.green("✔")} Copied to clipboard`) : warn("Couldn't find a clipboard tool — output is above.");
  }
}

/** Shared by `generate`, `customers generate`, and the interactive menu. */
export async function generateFlow(
  client: BuyProxy,
  g: Globals,
  opts: { product?: string; flags: GenerateFlags; customer?: string; interactive: boolean },
): Promise<void> {
  const { flags } = opts;
  const plans: Plan[] = opts.customer
    ? (await withSpinner("Loading the customer's plans", () => client.reseller.customers.get(opts.customer!), "Plans loaded")).plans
    : await withSpinner("Loading your plans", () => client.plans.list(), "Plans loaded");

  if (plans.length === 0) {
    throw new UserError(opts.customer ? "This customer has no bandwidth yet." : "You don't have any bandwidth yet.", opts.customer ? "Give them some with `buyproxy customers allocate`." : "Buy some with `buyproxy topup`.");
  }

  let plan = pickPlan(plans, opts.product, flags.plan);
  if (plan === "ask") {
    if (!isTTY) throw new UserError("You have several plans — say which one.", `Pass a product (${plans.map((p) => p.productKey).join(", ")}) or --plan <id>.`);
    plan = await select("Which plan?", plans.map((p) => ({ label: p.name, value: p, hint: `${formatGb(p.dataGbRemaining)} left` })));
  }
  if (plan.dataGbRemaining <= 0) warn(`${plan.name} has no bandwidth left — new connections will fail until you top up.`);

  const answered = opts.interactive ? await wizard(plan, flags) : flags;
  const params = toParams(answered);
  const format = await chooseFormat(flags.format);

  const result = await withSpinner(
    "Generating",
    () => (opts.customer ? client.reseller.customers.generate(opts.customer, { planId: plan.id, ...params }) : client.plans.generate(plan.id, params)),
    "Generated",
  );
  present(result.proxies, format, answered, g, params);
}

export const generate: Command = {
  name: "generate",
  aliases: ["gen", "g"],
  group: "Proxies",
  summary: "Generate proxies — rotating or sticky, geo-targeted",
  usage: "buyproxy generate [product] [-c US] [--city Austin] [-n 5] [-s 10] [--socks5] [-f url|plain|json|env|curl|playwright|requests] [--copy]",
  examples: [
    "buyproxy generate                         # guided",
    "buyproxy generate residential -c US -n 10",
    "buyproxy g premium -c DE --city Berlin -s 30 --copy",
    "buyproxy g -f env | source /dev/stdin     # export HTTP(S)_PROXY",
    "buyproxy g -n 100 -f plain > proxies.txt",
  ],
  async run(argv, g) {
    const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    const interactive = isTTY && !g.json && argv.length === 0;
    try {
      await generateFlow(requireClient(g), g, { product: positionals[0], flags: values as GenerateFlags, interactive });
    } catch (e) {
      if (e instanceof Cancelled) return;
      throw e;
    }
  },
};

export const test: Command = {
  name: "test",
  group: "Tools",
  summary: "Generate a proxy and prove it works — shows exit IP, location and latency",
  usage: "buyproxy test [product] [-c US]",
  examples: ["buyproxy test", "buyproxy test premium -c JP"],
  async run(argv, g) {
    const { values, positionals } = parseArgs({ args: argv, options: { country: OPTIONS.country, plan: OPTIONS.plan }, allowPositionals: true, strict: true });
    const client = requireClient(g);
    const plans = await withSpinner("Loading your plans", () => client.plans.list(), "Plans loaded");
    if (plans.length === 0) throw new UserError("You don't have any bandwidth yet.", "Buy some with `buyproxy topup`.");
    let plan = pickPlan(plans, positionals[0], values.plan);
    if (plan === "ask") plan = isTTY ? await select("Test which plan?", plans.map((p) => ({ label: p.name, value: p }))) : plans[0]!;

    const params = toParams({ country: values.country, count: "1" });
    const { proxies } = await withSpinner("Generating a proxy", () => client.plans.generate(plan.id, { ...params, protocol: "http" }), "Proxy generated");
    const proxy = proxies[0]!;

    const s = spinner(`Connecting through ${c.gray(proxy.host + ":" + proxy.port)}`);
    const result = await checkProxy(proxy);
    result.ok ? s.succeed("Connected") : s.fail("Connection failed");

    if (g.json) {
      out(JSON.stringify(result, null, 2));
      // A failed check must fail the command, or `buyproxy test --json || alert` could never fire.
      if (!result.ok) throw new BuyProxyError(`The proxy didn't answer: ${result.error}`);
      return;
    }
    if (!result.ok) throw new UserError(`The proxy didn't answer: ${result.error}`, "Check you have bandwidth left (`buyproxy balance`) and that the country is supported by this product.");

    const b = result.body ?? {};
    out(
      box(
        [
          `${c.gray("Exit IP   ")} ${c.bold(c.green(b.ip ?? "?"))}`,
          `${c.gray("Location  ")} ${[b.city, b.region, b.country].filter(Boolean).join(", ") || "?"}`,
          `${c.gray("Network   ")} ${b.org ?? "?"}`,
          `${c.gray("Latency   ")} ${result.latencyMs < 1500 ? c.green(result.latencyMs + " ms") : c.amber(result.latencyMs + " ms")}`,
          `${c.gray("Product   ")} ${plan.name}`,
        ],
        { title: "Proxy check", color: c.green },
      ),
    );
  },
};

export { heading, info, kv, ok };
