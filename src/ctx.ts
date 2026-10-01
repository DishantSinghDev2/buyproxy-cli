import type { BuyProxy } from "buyproxy";
import { makeClient, resolveAuth } from "./config.js";

export interface Globals {
  json: boolean;
  key?: string;
}

/** An error whose message is meant for the user as-is. */
export class UserError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

export function requireClient(g: Globals): BuyProxy {
  if (!resolveAuth(g.key).apiKey) {
    throw new UserError("You're not logged in.", "Run `buyproxy login`, or set BUYPROXY_API_KEY.");
  }
  return makeClient(g.key);
}

export function requireReseller(g: Globals): BuyProxy {
  const client = requireClient(g);
  if (client.keyKind !== "reseller") {
    throw new UserError(
      "This needs a reseller API key (bp_live_…).",
      "Create one under Reseller → API keys in your dashboard (Business plan or higher), then `buyproxy login`.",
    );
  }
  return client;
}

export interface Command {
  name: string;
  aliases?: string[];
  group: "Proxies" | "Billing" | "Reseller" | "Account" | "Tools";
  summary: string;
  usage: string;
  examples?: string[];
  run(argv: string[], g: Globals): Promise<void>;
}

export const SITE = "https://www.buyproxy.org";
