import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import tls from "node:tls";
import type { ProxyEndpoint } from "buyproxy";

/** Best-effort browser open. Never throws — callers always print the URL too. */
export function openUrl(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] :
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]] :
    ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* printed URL is the fallback */
  }
}

/** Best-effort clipboard copy. Returns whether a clipboard tool accepted the text. */
export function copyToClipboard(text: string): boolean {
  const tools: [string, string[]][] =
    process.platform === "darwin" ? [["pbcopy", []]] :
    process.platform === "win32" ? [["clip", []]] :
    [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [cmd, args] of tools) {
    try {
      const r = spawnSync(cmd, args, { input: text, stdio: ["pipe", "ignore", "ignore"] });
      if (r.status === 0) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export interface ProxyCheck {
  ok: boolean;
  latencyMs: number;
  body?: { ip?: string; city?: string; region?: string; country?: string; org?: string };
  error?: string;
}

/** Fetches https://ipinfo.io/json through an HTTP proxy using a raw CONNECT tunnel — no dependencies. */
export function checkProxy(proxy: ProxyEndpoint, timeoutMs = 20_000): Promise<ProxyCheck> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const done = (r: Omit<ProxyCheck, "latencyMs">) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...r, latencyMs: Date.now() - started });
    };

    const socket = net.connect(proxy.port, proxy.host);
    socket.setTimeout(timeoutMs, () => done({ ok: false, error: "timed out" }));
    socket.on("error", (e) => done({ ok: false, error: e.message }));

    socket.once("connect", () => {
      const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64");
      socket.write(`CONNECT ipinfo.io:443 HTTP/1.1\r\nHost: ipinfo.io:443\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`);
    });

    let head = "";
    const onData = (chunk: Buffer) => {
      head += chunk.toString("latin1");
      if (!head.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1]);
      if (status !== 200) return done({ ok: false, error: status === 407 ? "proxy rejected the credentials (407)" : `proxy answered HTTP ${status || "?"}` });

      const secure = tls.connect({ socket, servername: "ipinfo.io" });
      secure.on("error", (e) => done({ ok: false, error: e.message }));
      let data = "";
      secure.on("data", (d) => (data += d.toString("utf8")));
      secure.on("end", () => {
        const json = data.slice(data.indexOf("\r\n\r\n") + 4);
        try {
          // Body may be chunked: take the outermost JSON object.
          const parsed = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1));
          done({ ok: true, body: parsed });
        } catch {
          done({ ok: false, error: "unexpected response from the test endpoint" });
        }
      });
      secure.write("GET /json HTTP/1.1\r\nHost: ipinfo.io\r\nAccept: application/json\r\nUser-Agent: buyproxy-cli\r\nConnection: close\r\n\r\n");
    };
    socket.on("data", onData);
  });
}
