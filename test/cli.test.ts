import net from "node:net";
import { describe, expect, it } from "vitest";
import { ProxyEndpoint } from "buyproxy";
import { splitGlobals } from "../src/cli.js";
import { render } from "../src/format.js";
import { checkProxy } from "../src/system.js";
import { bar, formatGb, strip, table, width, box } from "../src/ui/index.js";
import { pickPlan, toParams } from "../src/commands/generate.js";
import type { Plan } from "buyproxy";

const plan = (id: string, productKey: Plan["productKey"], name: string): Plan => ({
  id, productId: `${productKey}-x`, productKey, name, label: null, dataGbRemaining: 5, dataGbTotal: 10, expiresAt: null, createdAt: "", generate: null,
});

describe("splitGlobals", () => {
  it("pulls --json / --key / -h / -v out and leaves command args", () => {
    const r = splitGlobals(["generate", "--json", "-c", "US", "--key", "bp_key_x", "-h"]);
    expect(r.rest).toEqual(["generate", "-c", "US"]);
    expect(r.globals).toEqual({ json: true, key: "bp_key_x" });
    expect(r.help).toBe(true);
    expect(splitGlobals(["--key=abc", "balance"]).globals.key).toBe("abc");
    expect(splitGlobals(["-v"]).version).toBe(true);
  });
});

describe("render", () => {
  const proxies = [ProxyEndpoint.parse("u-country-us:p@ss@gw.buyproxy.org:6969")];
  it("formats for pasting", () => {
    expect(render(proxies, "plain")).toBe("u-country-us:p@ss@gw.buyproxy.org:6969");
    expect(render(proxies, "url")).toBe("http://u-country-us:p%40ss@gw.buyproxy.org:6969");
    expect(render(proxies, "env")).toContain("export HTTPS_PROXY='http://u-country-us:p%40ss@gw.buyproxy.org:6969'");
    expect(JSON.parse(render(proxies, "json"))[0].host).toBe("gw.buyproxy.org");
    expect(render(proxies, "playwright")).toContain('"server": "http://gw.buyproxy.org:6969"');
  });
});

describe("toParams", () => {
  it("normalises and validates flags", () => {
    expect(toParams({ country: "us", count: "5", sticky: "10", socks5: true })).toEqual({ country: "US", count: 5, stickyMinutes: 10, protocol: "socks5" });
    expect(() => toParams({ country: "usa" })).toThrow(/2-letter/);
    expect(() => toParams({ count: "0" })).toThrow(/count/);
  });
});

describe("pickPlan", () => {
  const plans = [plan("a", "residential", "Core Residential"), plan("b", "premium", "Premium Residential")];
  it("resolves by id, product key or prefix; asks when ambiguous", () => {
    expect((pickPlan(plans, undefined, "b") as Plan).id).toBe("b");
    expect((pickPlan(plans, "prem", undefined) as Plan).id).toBe("b");
    expect(pickPlan(plans, undefined, undefined)).toBe("ask");
    expect((pickPlan([plans[0]!], undefined, undefined) as Plan).id).toBe("a");
    expect(() => pickPlan(plans, "mobile", undefined)).toThrow(/don't have a plan/);
  });
});

describe("ui kit", () => {
  it("formats bandwidth", () => {
    expect(formatGb(0)).toBe("0 GB");
    expect(formatGb(0.5)).toBe("512 MB");
    expect(formatGb(8.5)).toBe("8.50 GB");
    expect(formatGb(120)).toBe("120.0 GB");
  });
  it("draws a bar of fixed width and clamps", () => {
    expect(strip(bar(0.5, 10))).toBe("█████░░░░░");
    expect(strip(bar(2, 4))).toBe("████");
    expect(strip(bar(-1, 4))).toBe("░░░░");
  });
  it("aligns tables and boxes", () => {
    const t = table(["A", "Bee"], [["x", "yy"], ["longer", "z"]]).split("\n").map(strip);
    expect(new Set(t.filter((l) => l.trim()).map((l) => width(l.trimEnd().padEnd(20)))).size).toBe(1);
    const lines = box(["hi", "there you"], { title: "T" }).split("\n").map(strip);
    expect(new Set(lines.map(width)).size).toBe(1);
  });
});

describe("checkProxy", () => {
  it("reports a rejected credential (407) without hanging", async () => {
    const server = net.createServer((s) => s.on("data", () => s.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n")));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as net.AddressInfo;
    const r = await checkProxy(new ProxyEndpoint("127.0.0.1", port, "u", "bad"), 3000);
    server.close();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/407/);
  });
  it("reports a closed port", async () => {
    const r = await checkProxy(new ProxyEndpoint("127.0.0.1", 1, "u", "p"), 3000);
    expect(r.ok).toBe(false);
  });
});
