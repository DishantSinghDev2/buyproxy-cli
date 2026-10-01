import { parseArgs } from "node:util";
import { AuthenticationError } from "buyproxy";
import { BuyProxy } from "buyproxy";
import { clearConfig, configPath, loadConfig, makeClient, maskKey, resolveAuth, saveConfig } from "../config.js";
import { SITE, UserError, type Command, type Globals } from "../ctx.js";
import { c, err, fail, heading, input, kv, ok, out, spinner, withSpinner } from "../ui/index.js";
import { openUrl } from "../system.js";

const KEY_PATTERN = /^bp_(key|live)_[0-9a-f]{20,}$/;

/** Validates a key against the API and returns who it belongs to. */
async function identify(client: BuyProxy): Promise<{ email: string; label: string }> {
  if (client.keyKind === "reseller") {
    const me = await client.reseller.me();
    return { email: me.email, label: `reseller · ${me.customerCount} customer${me.customerCount === 1 ? "" : "s"}` };
  }
  const account = await client.account.get();
  return { email: account.email, label: `${account.plan} plan` };
}

export async function loginFlow(g: Globals, provided?: string): Promise<void> {
  const key =
    provided ??
    (await input("Paste your API key", {
      mask: true,
      placeholder: "bp_key_… or bp_live_…",
      validate: (v) => (KEY_PATTERN.test(v.trim()) ? undefined : "That doesn't look like a BuyProxy key (bp_key_… or bp_live_…)."),
    })).trim();

  if (!KEY_PATTERN.test(key)) throw new UserError("That doesn't look like a BuyProxy API key.", "Keys start with bp_key_ (personal) or bp_live_ (reseller).");

  const client = new BuyProxy({ apiKey: key, baseUrl: resolveAuth().baseUrl });
  let who;
  try {
    who = await withSpinner("Checking your key", () => identify(client), "Key verified");
  } catch (e) {
    if (e instanceof AuthenticationError) throw new UserError("BuyProxy rejected that key.", "Check it was copied in full, and that it hasn't been revoked.");
    throw e;
  }
  saveConfig({ ...loadConfig(), apiKey: key });
  if (g.json) return void out(JSON.stringify({ ok: true, ...who, kind: client.keyKind }));
  ok(`Logged in as ${c.bold(who.email)} ${c.gray(`(${who.label})`)}`);
  err(c.gray(`  Saved to ${configPath()}`));
}

export const login: Command = {
  name: "login",
  group: "Account",
  summary: "Save your API key",
  usage: "buyproxy login [--key bp_key_…]",
  examples: ["buyproxy login", "buyproxy login --key bp_key_abc123…", "export BUYPROXY_API_KEY=bp_key_… # no login needed"],
  async run(argv, g) {
    const { values } = parseArgs({ args: argv, options: { key: { type: "string" } }, strict: true });
    await loginFlow(g, values.key ?? g.key);
  },
};

export const logout: Command = {
  name: "logout",
  group: "Account",
  summary: "Forget the saved API key",
  usage: "buyproxy logout",
  async run(_argv, g) {
    const removed = clearConfig();
    if (g.json) return void out(JSON.stringify({ ok: true, removed }));
    removed ? ok("Logged out — saved key removed.") : out(c.gray("Nothing to remove — no saved key."));
  },
};

export const whoami: Command = {
  name: "whoami",
  group: "Account",
  summary: "Show the account behind the current key",
  usage: "buyproxy whoami",
  async run(_argv, g) {
    const auth = resolveAuth(g.key);
    if (!auth.apiKey) throw new UserError("You're not logged in.", "Run `buyproxy login`.");
    const client = makeClient(g.key);
    const who = await withSpinner("Looking you up", () => identify(client), "Found you");
    const source = { flag: "--key flag", env: "BUYPROXY_API_KEY", config: configPath(), none: "" }[auth.source];
    if (g.json) return void out(JSON.stringify({ email: who.email, kind: client.keyKind, detail: who.label, key: maskKey(auth.apiKey) }));
    heading("Account");
    kv("Email", c.bold(who.email));
    kv("Key type", client.keyKind === "reseller" ? c.purple("reseller") : c.blue("personal"));
    kv("Details", who.label);
    kv("Key", maskKey(auth.apiKey));
    kv("Read from", c.gray(source));
  },
};

export const signup: Command = {
  name: "signup",
  group: "Account",
  summary: "Create a BuyProxy account without a browser",
  usage: "buyproxy signup",
  async run(_argv, g) {
    const client = new BuyProxy({ apiKey: "", baseUrl: resolveAuth().baseUrl });
    const email = await input("Email", { validate: (v) => (/^\S+@\S+\.\S+$/.test(v) ? undefined : "Enter a valid email address.") });
    const password = await input("Password (min 6 characters)", { mask: true, validate: (v) => (v.length >= 6 ? undefined : "At least 6 characters.") });
    const name = await input("Name", { default: email.split("@")[0] });

    await withSpinner("Sending a verification code", () => client.auth.signup({ email, password, name }), "Code sent — check your inbox");
    const code = await input("6-digit code", { validate: (v) => (/^\d{6}$/.test(v.trim()) ? undefined : "Enter the 6-digit code from the email.") });
    const result = await withSpinner("Verifying", () => client.auth.verifyOtp({ email, code: code.trim() }), "Account created");
    if (g.json) return void out(JSON.stringify(result));

    out("");
    out(`Next: create an API key in your dashboard, then run ${c.orange("buyproxy login")}.`);
    out(c.gray(`  ${SITE}/dashboard/api-keys`));
    openUrl(`${SITE}/dashboard/api-keys`);
  },
};

export { fail, spinner };
