import { BuyProxy } from "buyproxy";
import { resolveAuth } from "../config.js";
import { SITE, type Globals } from "../ctx.js";
import { openUrl } from "../system.js";
import { Cancelled, waitForEnter, banner, box, c, err, formatGb, info, isTTY, out, select, spinner, strip } from "../ui/index.js";
import { whoami, loginFlow, signup, logout } from "./auth.js";
import { balance, plans, transactions } from "./account.js";
import { generate, test } from "./generate.js";
import { subscribe, topup } from "./topup.js";
import { customers, pool } from "./reseller.js";
import { catchAndReport } from "../run.js";

const VERSION = process.env.BUYPROXY_CLI_VERSION ?? "0.0.0";

/** A one-glance summary shown above the menu. */
async function summary(client: BuyProxy): Promise<string[]> {
  if (client.keyKind === "reseller") {
    const [me] = await Promise.all([client.reseller.me()]);
    const pooled = me.pool.reduce((sum, p) => sum + p.gb, 0);
    return [
      `${c.gray("Signed in  ")} ${c.bold(me.email)}  ${c.purple("reseller")}`,
      `${c.gray("Customers  ")} ${me.customerCount} ${c.gray(`(${me.activeCustomerCount} active)`)}`,
      `${c.gray("Pool       ")} ${pooled > 0 ? c.green(formatGb(pooled)) : c.amber("empty")} ${c.gray("unallocated")}`,
    ];
  }
  const [account, balances] = await Promise.all([client.account.get(), client.balances.list()]);
  const live = balances.reduce((sum, b) => sum + b.activeGb, 0);
  const pending = balances.reduce((sum, b) => sum + b.pendingGb, 0);
  return [
    `${c.gray("Signed in  ")} ${c.bold(account.email)}  ${c.blue(account.plan)}`,
    `${c.gray("Bandwidth  ")} ${live > 0 ? c.green(formatGb(live)) : c.amber("none yet")}${pending ? c.amber(`  +${formatGb(pending)} arriving`) : ""}`,
  ];
}

type Action = "generate" | "balance" | "topup" | "subscribe" | "plans" | "tx" | "test" | "customers" | "pool" | "dashboard" | "whoami" | "logout" | "quit";

async function pause(): Promise<void> {
  await waitForEnter().catch(() => undefined);
}

/** `buyproxy` with no arguments, in a terminal. */
export async function home(g: Globals): Promise<void> {
  err("\n" + banner(VERSION) + "\n");
  const auth = resolveAuth(g.key);

  if (!auth.apiKey) {
    const choice = await select("Welcome — let's get you set up", [
      { label: "Log in with an API key", value: "login", hint: "keys live under Dashboard → API keys" },
      { label: "Create a new account", value: "signup", hint: "no browser needed" },
      { label: "Open the dashboard", value: "dashboard" },
      { label: "Quit", value: "quit" },
    ] as const);
    if (choice === "login") await catchAndReport(() => loginFlow(g));
    else if (choice === "signup") await catchAndReport(() => signup.run([], g));
    else if (choice === "dashboard") openUrl(`${SITE}/dashboard`);
    if (choice !== "login") return;
  }

  const client = new BuyProxy({ apiKey: resolveAuth(g.key).apiKey, baseUrl: resolveAuth(g.key).baseUrl });
  const isReseller = client.keyKind === "reseller";

  for (;;) {
    const s = spinner("Loading your account");
    let lines: string[];
    try {
      lines = await summary(client);
      s.stop();
    } catch (e) {
      s.fail("Couldn't load your account");
      return void (await catchAndReport(async () => { throw e; }));
    }
    out(box(lines.map((l) => l), { title: "BuyProxy", color: isReseller ? c.purple : c.orange, minWidth: 48 }));
    out("");

    let action: Action;
    try {
      action = await select<Action>("What would you like to do?", [
        ...(isReseller
          ? ([
              { label: "Customers", value: "customers", hint: "create, fund, suspend, generate" },
              { label: "Reseller pool", value: "pool", hint: "your unallocated bandwidth" },
              { label: "Buy bandwidth into the pool", value: "topup" },
            ] as const)
          : ([
              { label: "Generate proxies", value: "generate", hint: "rotating or sticky, geo-targeted" },
              { label: "Bandwidth & plans", value: "balance", hint: "what's left on each product" },
              { label: "Buy bandwidth", value: "topup", hint: "card or crypto" },
              { label: "Subscribe to a plan", value: "subscribe", hint: "Pro · Business · Advanced" },
              { label: "Test a proxy", value: "test", hint: "exit IP, location, latency" },
            ] as const)),
        { label: "Payment history", value: "tx" },
        { label: "Open dashboard", value: "dashboard" },
        { label: "Account", value: "whoami" },
        { label: "Log out", value: "logout" },
        { label: "Quit", value: "quit" },
      ] as never);
    } catch (e) {
      if (e instanceof Cancelled) return;
      throw e;
    }

    if (action === "quit") return void err(c.gray("See you. ") + c.orange("buyproxy.org"));

    const run = async (): Promise<void> => {
      switch (action) {
        case "generate": return generate.run([], g);
        case "balance": await balance.run([], g); return plans.run([], g);
        case "topup": return topup.run(isReseller ? ["--pool"] : [], g);
        case "subscribe": return subscribe.run([], g);
        case "test": return test.run([], g);
        case "tx": return transactions.run([], g);
        case "customers": return customers.run([], g);
        case "pool": return pool.run([], g);
        case "whoami": return whoami.run([], g);
        case "dashboard": return void openUrl(`${SITE}/dashboard`);
        case "logout": return logout.run([], g);
        default: return;
      }
    };
    await catchAndReport(run);
    if (action === "logout") return;
    out("");
    await pause();
    out("");
  }
}

export { info, isTTY, strip };
