import type { ProxyEndpoint } from "buyproxy";

export const FORMATS = ["url", "plain", "json", "env", "curl", "playwright", "requests"] as const;
export type Format = (typeof FORMATS)[number];

/** Renders generated proxies in the shape the user will paste them into. */
export function render(proxies: ProxyEndpoint[], format: Format): string {
  switch (format) {
    case "plain":
      return proxies.map((p) => p.toString()).join("\n");
    case "url":
      return proxies.map((p) => p.url).join("\n");
    case "json":
      return JSON.stringify(proxies.map((p) => p.toJSON()), null, 2);
    case "env":
      return Object.entries(proxies[0]!.toEnv()).filter(([k]) => k === k.toUpperCase()).map(([k, v]) => `export ${k}='${v}'`).join("\n");
    case "curl":
      return proxies.map((p) => p.toCurl()).join("\n");
    case "playwright": {
      const p = proxies[0]!;
      return `const browser = await chromium.launch({\n  proxy: ${JSON.stringify(p.toPlaywright(), null, 2).replace(/\n/g, "\n  ")},\n});`;
    }
    case "requests": {
      const p = proxies[0]!;
      return `import requests\n\nproxies = {"http": "${p.url}", "https": "${p.url}"}\nprint(requests.get("https://api.ipify.org", proxies=proxies).text)`;
    }
  }
}
