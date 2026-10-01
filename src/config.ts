import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BuyProxy } from "buyproxy";

export interface Config {
  apiKey?: string;
  baseUrl?: string;
}

export const configPath = (): string =>
  join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "buyproxy", "config.json");

export function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function clearConfig(): boolean {
  if (!existsSync(configPath())) return false;
  rmSync(configPath());
  return true;
}

export interface Resolved {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  source: "flag" | "env" | "config" | "none";
}

/** --key flag > BUYPROXY_API_KEY > saved config. */
export function resolveAuth(flagKey?: string): Resolved {
  const config = loadConfig();
  const baseUrl = process.env.BUYPROXY_BASE_URL || config.baseUrl;
  if (flagKey) return { apiKey: flagKey, baseUrl, source: "flag" };
  if (process.env.BUYPROXY_API_KEY) return { apiKey: process.env.BUYPROXY_API_KEY, baseUrl, source: "env" };
  if (config.apiKey) return { apiKey: config.apiKey, baseUrl, source: "config" };
  return { apiKey: undefined, baseUrl, source: "none" };
}

export function makeClient(flagKey?: string): BuyProxy {
  const { apiKey, baseUrl } = resolveAuth(flagKey);
  return new BuyProxy({ apiKey, baseUrl });
}

export const maskKey = (key: string): string => `${key.slice(0, 12)}${"•".repeat(8)}${key.slice(-4)}`;
