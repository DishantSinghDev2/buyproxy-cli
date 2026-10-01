import readline from "node:readline";
import { c, cursor, pad, strip } from "./ansi.js";
import { err } from "./kit.js";

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

function keypresses(): { next: () => Promise<readline.Key & { sequence?: string }>; done: () => void } {
  const stdin = process.stdin;
  readline.emitKeypressEvents(stdin);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  stdin.resume();

  const queue: (readline.Key & { sequence?: string })[] = [];
  let waiter: ((k: readline.Key & { sequence?: string }) => void) | null = null;
  const onKey = (str: string | undefined, key: readline.Key) => {
    const k = { ...key, sequence: key?.sequence ?? str };
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(k);
    } else queue.push(k);
  };
  stdin.on("keypress", onKey);

  return {
    next: () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise((resolve) => (waiter = resolve))),
    done: () => {
      stdin.off("keypress", onKey);
      stdin.setRawMode?.(wasRaw ?? false);
      stdin.pause();
    },
  };
}

export interface Choice<T> {
  label: string;
  value: T;
  hint?: string;
  disabled?: boolean;
}

/** Arrow-key (or j/k) list. Enter selects, q/Esc/Ctrl-C cancels. */
export async function select<T>(message: string, choices: Choice<T>[], opts: { initial?: number } = {}): Promise<T> {
  const enabled = choices.map((ch, i) => (ch.disabled ? -1 : i)).filter((i) => i >= 0);
  if (enabled.length === 0) throw new Cancelled();
  let index = enabled.includes(opts.initial ?? enabled[0]!) ? (opts.initial ?? enabled[0]!) : enabled[0]!;
  const labelWidth = Math.max(...choices.map((ch) => strip(ch.label).length));

  const render = (): string[] => [
    `${c.purple("?")} ${c.bold(message)} ${c.gray("(↑/↓ move · enter select · q quit)")}`,
    ...choices.map((ch, i) => {
      const hint = ch.hint ? "  " + c.gray(ch.hint) : "";
      if (ch.disabled) return `  ${c.gray("  " + pad(ch.label, labelWidth) + hint)}`;
      return i === index
        ? `  ${c.orange("❯")} ${c.orange(c.bold(pad(ch.label, labelWidth)))}${hint}`
        : `    ${pad(ch.label, labelWidth)}${hint}`;
    }),
  ];

  const keys = keypresses();
  cursor.hide();
  let drawn = 0;
  const paint = () => {
    if (drawn) process.stderr.write(`\x1b[${drawn}A\x1b[0J`);
    const lines = render();
    process.stderr.write(lines.join("\n") + "\n");
    drawn = lines.length;
  };

  try {
    paint();
    for (;;) {
      const key = await keys.next();
      if ((key.ctrl && key.name === "c") || key.name === "escape" || key.name === "q") throw new Cancelled();
      const step = key.name === "down" || key.name === "j" || key.name === "tab" ? 1 : key.name === "up" || key.name === "k" ? -1 : 0;
      if (step) {
        const pos = enabled.indexOf(index);
        index = enabled[(pos + step + enabled.length) % enabled.length]!;
        paint();
      } else if (key.name === "return") {
        process.stderr.write(`\x1b[${drawn}A\x1b[0J`);
        err(`${c.green("✔")} ${message} ${c.orange(strip(choices[index]!.label).trim())}`);
        return choices[index]!.value;
      }
    }
  } finally {
    keys.done();
    cursor.show();
  }
}

export interface InputOptions {
  default?: string;
  mask?: boolean;
  validate?: (value: string) => string | undefined;
  placeholder?: string;
}

/** Single-line input with optional masking and validation. */
export async function input(message: string, opts: InputOptions = {}): Promise<string> {
  const keys = keypresses();
  let value = "";
  let error: string | undefined;
  let drawn = 0;

  const paint = () => {
    if (drawn) process.stderr.write(`\x1b[${drawn}A\x1b[0J`);
    const shown = opts.mask ? "•".repeat(value.length) : value;
    const placeholder = !value && (opts.default || opts.placeholder) ? c.gray(opts.default ?? opts.placeholder ?? "") : "";
    const lines = [`${c.purple("?")} ${c.bold(message)} ${shown}${placeholder}${c.orange("▌")}`];
    if (error) lines.push(`  ${c.red(error)}`);
    process.stderr.write(lines.join("\n") + "\n");
    drawn = lines.length;
  };

  try {
    paint();
    for (;;) {
      const key = await keys.next();
      if (key.ctrl && key.name === "c") throw new Cancelled();
      if (key.name === "escape") throw new Cancelled();
      if (key.name === "return") {
        const final = value || opts.default || "";
        const problem = opts.validate?.(final);
        if (problem) {
          error = problem;
          paint();
          continue;
        }
        process.stderr.write(`\x1b[${drawn}A\x1b[0J`);
        err(`${c.green("✔")} ${message} ${c.orange(opts.mask ? "•".repeat(Math.min(final.length, 12)) : final)}`);
        return final;
      }
      if (key.name === "backspace") value = value.slice(0, -1);
      else if (key.ctrl && key.name === "u") value = "";
      else if (key.sequence && !key.ctrl && !key.meta && key.sequence >= " " && key.sequence !== "\x7f") value += key.sequence;
      error = undefined;
      paint();
    }
  } finally {
    keys.done();
  }
}

export async function confirm(message: string, initial = true): Promise<boolean> {
  const answer = await select(message, [
    { label: "Yes", value: true },
    { label: "No", value: false },
  ], { initial: initial ? 0 : 1 });
  return answer;
}

/** "Press enter to continue" — used between menu actions so output isn't wiped by the next repaint. */
export async function waitForEnter(message = "Press enter to go back to the menu"): Promise<void> {
  err(c.gray(`  ${message}`));
  const keys = keypresses();
  try {
    for (;;) {
      const key = await keys.next();
      if (key.ctrl && key.name === "c") throw new Cancelled();
      if (key.name === "return" || key.name === "escape" || key.name === "q" || key.name === "space") return;
    }
  } finally {
    keys.done();
  }
}
