import {
  AuthenticationError, BuyProxyError, ConnectionError, InsufficientBandwidthError, NotFoundError, PermissionError, RateLimitError, TimeoutError, ValidationError,
} from "buyproxy";
import { UserError } from "./ctx.js";
import { Cancelled, c, fail } from "./ui/index.js";

/** Prints an error the way a person wants to read it, with a next step. Returns the exit code. */
export function report(e: unknown): number {
  if (e instanceof Cancelled) return 130;
  if (e instanceof UserError) return fail(e.message, e.hint), 2;
  if (e instanceof AuthenticationError) return fail(e.message, "Run `buyproxy login` with a fresh key."), 1;
  if (e instanceof InsufficientBandwidthError) return fail(e.message, "Top up with `buyproxy topup` (reseller: `buyproxy pool topup`)."), 1;
  if (e instanceof PermissionError) return fail(e.message, "Reseller features need a Business plan or higher; suspended accounts can't use the API."), 1;
  if (e instanceof NotFoundError) return fail(e.message), 1;
  if (e instanceof ValidationError) return fail(e.message, "Run the command with --help to check the options."), 1;
  if (e instanceof RateLimitError) return fail(e.message, `Limit is 60 requests/minute per key${e.retryAfterSeconds ? ` — retry in ${e.retryAfterSeconds}s` : ""}.`), 1;
  if (e instanceof TimeoutError || e instanceof ConnectionError) return fail(e.message, "Check your connection — status: https://www.buyproxy.org/status"), 1;
  if (e instanceof BuyProxyError) return fail(e.message, e.status && e.status >= 500 ? "That's on our side — try again in a moment." : undefined), 1;
  if (e instanceof TypeError && /Unknown option|Unexpected argument|argument/i.test((e as Error).message)) return fail((e as Error).message.split(/\. To specify|\n/)[0]!, "See `buyproxy help <command>`."), 2;
  fail((e as Error)?.message ?? String(e));
  if (process.env.BUYPROXY_DEBUG) console.error(c.gray((e as Error)?.stack ?? ""));
  return 1;
}

export async function catchAndReport(fn: () => Promise<void>): Promise<number> {
  try {
    await fn();
    return 0;
  } catch (e) {
    return report(e);
  }
}
