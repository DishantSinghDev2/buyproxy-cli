import { c, cols, cursor, gradient, pad, padStart, strip, width, colorEnabled, palette } from "./ansi.js";

export const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
export const out = (s = ""): void => void process.stdout.write(s + "\n");
export const err = (s = ""): void => void process.stderr.write(s + "\n");

// --- Banner ---------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  B: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝ "],
  U: ["██╗   ██╗", "██║   ██║", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  Y: ["██╗   ██╗", "╚██╗ ██╔╝", " ╚████╔╝ ", "  ╚██╔╝  ", "   ██║   ", "   ╚═╝   "],
  P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
  R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  X: ["██╗  ██╗", "╚██╗██╔╝", " ╚███╔╝ ", " ██╔██╗ ", "██╔╝ ██╗", "╚═╝  ╚═╝"],
};

export function banner(version: string, tagline = "Residential, mobile, ISP & datacenter proxies"): string {
  const word = [..."BUYPROXY"];
  const lines: string[] = [];
  if (cols() >= 72) {
    for (let row = 0; row < 6; row++) {
      const raw = word.map((ch) => GLYPHS[ch]![row]!).join("");
      lines.push("  " + gradient(raw));
    }
  } else {
    lines.push("  " + c.bold(gradient("◆ B U Y P R O X Y")));
  }
  lines.push("");
  lines.push("  " + c.light(tagline) + c.gray(`  ·  v${version}`));
  lines.push("  " + c.gray("www.buyproxy.org  ·  docs: buyproxy docs"));
  return lines.join("\n");
}

// --- Status lines ---------------------------------------------------------

export const ok = (msg: string): void => out(`${c.green("✔")} ${msg}`);
export const info = (msg: string): void => out(`${c.blue("ℹ")} ${msg}`);
export const warn = (msg: string): void => err(`${c.amber("⚠")} ${msg}`);
export const fail = (msg: string, hint?: string): void => {
  err(`${c.red("✖")} ${c.bold(msg)}`);
  if (hint) err(`  ${c.gray(hint)}`);
};
export const heading = (title: string): void => out(`\n${c.bold(gradient(title))}`);
export const kv = (key: string, value: string, keyWidth = 14): void => out(`  ${c.gray(pad(key, keyWidth))} ${value}`);

// --- Box ------------------------------------------------------------------

export function box(body: string[], opts: { title?: string; color?: (s: string) => string; minWidth?: number } = {}): string {
  const color = opts.color ?? c.gray;
  const inner = Math.min(
    cols() - 4,
    Math.max(opts.minWidth ?? 0, opts.title ? width(opts.title) + 4 : 0, ...body.map((l) => width(l))),
  );
  const top = opts.title
    ? color("╭─ ") + c.bold(opts.title) + color(" " + "─".repeat(Math.max(0, inner - width(opts.title) - 1)) + "╮")
    : color("╭" + "─".repeat(inner + 2) + "╮");
  const rows = body.map((l) => `${color("│")} ${pad(l, inner)} ${color("│")}`);
  return [top, ...rows, color("╰" + "─".repeat(inner + 2) + "╯")].join("\n");
}

// --- Table ----------------------------------------------------------------

export function table(head: string[], rows: string[][], align: ("l" | "r")[] = []): string {
  const widths = head.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i] ?? ""))));
  const cell = (s: string, i: number) => (align[i] === "r" ? padStart(s, widths[i]!) : pad(s, widths[i]!));
  const header = "  " + head.map((h, i) => c.gray(cell(h, i))).join("   ");
  const rule = "  " + c.gray(widths.map((w) => "─".repeat(w)).join("───"));
  const body = rows.map((r) => "  " + r.map((s, i) => cell(s, i)).join("   "));
  return [header, rule, ...body].join("\n");
}

// --- Progress bar ---------------------------------------------------------

export function bar(fraction: number, size = 24): string {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(f * size);
  const color = f > 0.4 ? c.green : f > 0.15 ? c.amber : c.red;
  return color("█".repeat(filled)) + c.gray("░".repeat(size - filled));
}

export function formatGb(gb: number): string {
  if (!gb || gb <= 0) return "0 GB";
  if (gb < 1) return `${Math.round(gb * 1024)} MB`;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

export const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// --- Spinner --------------------------------------------------------------

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
}

export function spinner(text: string): Spinner {
  const tty = Boolean(process.stderr.isTTY) && colorEnabled;
  let i = 0;
  let current = text;
  let timer: NodeJS.Timeout | undefined;

  const draw = () => process.stderr.write(`\r\x1b[2K${c.orange(FRAMES[i++ % FRAMES.length]!)} ${current}`);
  if (tty) {
    cursor.hide();
    draw();
    timer = setInterval(draw, 80);
  }
  const restore = () => cursor.show();
  process.once("exit", restore);

  const end = (symbol: string, msg: string | undefined) => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (tty) {
      process.stderr.write(`\r\x1b[2K`);
      cursor.show();
    }
    // Piped/CI output stays clean: progress lines are for people at a terminal.
    if (msg !== undefined && tty) err(`${symbol} ${msg}`);
    process.removeListener("exit", restore);
  };

  return {
    update: (t) => {
      current = t;
      if (!tty) return;
      draw();
    },
    succeed: (t) => end(c.green("✔"), t ?? current),
    fail: (t) => end(c.red("✖"), t ?? current),
    stop: () => end("", undefined),
  };
}

/** Runs `fn` behind a spinner; marks it done or failed. */
export async function withSpinner<T>(text: string, fn: () => Promise<T>, done?: string): Promise<T> {
  const s = spinner(text);
  try {
    const result = await fn();
    s.succeed(done ?? text);
    return result;
  } catch (e) {
    s.fail(text);
    throw e;
  }
}

export { c, colorEnabled, palette, strip, width, pad, gradient };
