/** Tiny zero-dependency terminal styling kit. Respects NO_COLOR / FORCE_COLOR and non-TTY output. */
const env = process.env;

export const colorEnabled = (() => {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
  return Boolean(process.stdout.isTTY) && env.TERM !== "dumb";
})();

const trueColor = colorEnabled && (/truecolor|24bit/i.test(env.COLORTERM ?? "") || Boolean(env.WT_SESSION) || env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "vscode");

export type RGB = [number, number, number];

export const palette = {
  orange: [255, 122, 26] as RGB,
  amber: [251, 191, 36] as RGB,
  purple: [139, 92, 246] as RGB,
  blue: [59, 130, 246] as RGB,
  green: [34, 197, 94] as RGB,
  red: [239, 68, 68] as RGB,
  gray: [115, 115, 125] as RGB,
  light: [229, 229, 235] as RGB,
};

// Nearest xterm-256 colour for terminals without truecolor.
function to256([r, g, b]: RGB): number {
  const c = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * c(r) + 6 * c(g) + c(b);
}

export const fg = (rgb: RGB) => (s: string): string =>
  !colorEnabled ? s : trueColor ? `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[39m` : `\x1b[38;5;${to256(rgb)}m${s}\x1b[39m`;

const wrap = (open: number, close: number) => (s: string): string => (colorEnabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  orange: fg(palette.orange),
  amber: fg(palette.amber),
  purple: fg(palette.purple),
  blue: fg(palette.blue),
  green: fg(palette.green),
  red: fg(palette.red),
  gray: fg(palette.gray),
  light: fg(palette.light),
};

/** Orange → purple gradient across a string (per character). */
export function gradient(text: string, from: RGB = palette.orange, to: RGB = palette.purple): string {
  if (!colorEnabled) return text;
  const chars = [...text];
  const last = Math.max(1, chars.length - 1);
  return chars
    .map((ch, i) => (ch === " " ? ch : fg(from.map((v, k) => Math.round(v + ((to[k]! - v) * i) / last)) as RGB)(ch)))
    .join("");
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
export const strip = (s: string): string => s.replace(ANSI, "");
export const width = (s: string): number => [...strip(s)].length;
export const pad = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - width(s)));
export const padStart = (s: string, n: number): string => " ".repeat(Math.max(0, n - width(s))) + s;

export const cols = (): number => Math.min(process.stdout.columns || 80, 110);

export const cursor = {
  hide: () => process.stderr.write("\x1b[?25l"),
  show: () => process.stderr.write("\x1b[?25h"),
};
