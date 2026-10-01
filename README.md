# BuyProxy CLI — Generate Residential Proxies from Your Terminal

[![npm](https://img.shields.io/npm/v/buyproxy-cli?logo=npm&color=cb3837)](https://www.npmjs.com/package/buyproxy-cli)
[![downloads](https://img.shields.io/npm/dm/buyproxy-cli)](https://www.npmjs.com/package/buyproxy-cli)
[![CI](https://github.com/DishantSinghDev2/buyproxy-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/DishantSinghDev2/buyproxy-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

The official command-line tool for [BuyProxy](https://www.buyproxy.org): generate **residential, mobile, ISP and datacenter proxies**, check bandwidth, buy more by card or crypto, and run a **proxy reseller** business — from a polished interactive terminal UI, or from scripts with `--json`.

**Keywords:** proxy CLI · residential proxy generator · rotating proxies · SOCKS5 · web scraping tools · proxy reseller · BuyProxy command line

## Install

Pick whichever you like — they all give you the same `buyproxy` command.

```bash
# Homebrew (macOS & Linux)
brew install DishantSinghDev2/tap/buyproxy

# npm
npm install -g buyproxy-cli

# try it without installing
npx buyproxy-cli

# one-line installer (uses npm if present, otherwise drops a single file in ~/.local/bin)
curl -fsSL https://raw.githubusercontent.com/DishantSinghDev2/buyproxy-cli/main/install.sh | sh
```

Prefer a single file? Every [release](https://github.com/DishantSinghDev2/buyproxy-cli/releases) includes `buyproxy.mjs` — an executable with the whole CLI and **no dependencies**. Requires Node.js 18+.

## Get started

```bash
buyproxy login          # paste your API key (Dashboard → API keys)
buyproxy                # interactive mode
```

Don't have an account yet? `buyproxy signup` creates one without leaving the terminal.

## Interactive mode

Run `buyproxy` with no arguments for a guided experience — arrow keys to move, enter to choose, `q` to quit:

```text
  ██████╗ ██╗   ██╗██╗   ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗
  ██╔══██╗██║   ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝
  ██████╔╝██║   ██║ ╚████╔╝ ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝
  ██╔══██╗██║   ██║  ╚██╔╝  ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝
  ██████╔╝╚██████╔╝   ██║   ██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║
  ╚═════╝  ╚═════╝    ╚═╝   ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝

  Residential, mobile, ISP & datacenter proxies  ·  v1.0.0
  www.buyproxy.org  ·  docs: buyproxy docs

╭─ BuyProxy ───────────────────────────────────────╮
│ Signed in   you@example.com  pro                 │
│ Bandwidth   8.50 GB                              │
╰──────────────────────────────────────────────────╯

? What would you like to do? (↑/↓ move · enter select · q quit)
  ❯ Generate proxies     rotating or sticky, geo-targeted
    Bandwidth & plans    what's left on each product
    Buy bandwidth        card or crypto
    Subscribe to a plan  Pro · Business · Advanced
    Test a proxy         exit IP, location, latency
    Payment history
    Open dashboard
    Account
    Log out
    Quit
```

Gradient banner, spinners, usage bars, boxed results and colour that respects `NO_COLOR`. Reseller keys get a reseller-specific menu (customers, pool).

## Commands

| Command | What it does |
|---|---|
| `buyproxy generate [product]` | Generate proxies — rotating or sticky, geo-targeted (`-c US --city Austin -n 5 -s 10`) |
| `buyproxy test` | Generate a proxy and **prove it works**: exit IP, location, network, latency |
| `buyproxy balance` | Bandwidth left on every product, with usage bars |
| `buyproxy plans` | Your plans and what each one can generate |
| `buyproxy topup [product]` | Buy bandwidth by card or crypto, opens checkout and waits for the payment |
| `buyproxy subscribe [plan]` | Subscribe to Pro / Business / Advanced, monthly or yearly |
| `buyproxy products` | Catalog with live per-GB prices |
| `buyproxy transactions` | Payment history (or `buyproxy tx <id> --wait`) |
| `buyproxy customers …` | **Reseller:** `new`, `show`, `rename`, `suspend`, `activate`, `usage`, `allocate`, `generate` |
| `buyproxy pool [topup]` | **Reseller:** your unallocated bandwidth |
| `buyproxy login` / `logout` / `whoami` / `signup` | Account |
| `buyproxy dashboard` / `docs` | Open the dashboard or API docs |
| `buyproxy completion bash\|zsh\|fish` | Shell completions |

Every command accepts `--json` (machine-readable, no colour, no prompts), `--key <key>` and `--help`. Run `buyproxy help <command>` for examples.

## Recipes

**Export a proxy into your shell** — every tool that honours `HTTP_PROXY` now uses it:

```bash
eval "$(buyproxy generate residential -c US -f env)"
curl https://api.ipify.org
```

**Dump 100 sticky German proxies to a file:**

```bash
buyproxy generate premium -c DE -n 100 -s 30 -f plain > proxies.txt
```

**Paste straight into code:**

```bash
buyproxy generate -c US -f playwright --copy   # Playwright launch options on your clipboard
buyproxy generate -f requests                  # Python `requests` snippet
buyproxy generate -f curl                      # ready-to-run curl command
```

Formats: `url` (default in a terminal), `plain`, `json`, `env`, `curl`, `playwright`, `requests`.

**Check the network is healthy before a big job:**

```bash
buyproxy test premium -c JP
```

**Run a reseller business from the terminal:**

```bash
buyproxy pool topup residential --gb 500 --card
buyproxy customers new "Acme Inc"
buyproxy customers allocate bp_acme_1a2b premium 20
buyproxy customers generate bp_acme_1a2b -c DE -n 5
buyproxy customers suspend bp_acme_1a2b
```

**Script it:**

```bash
buyproxy balance --json | jq '.balances[] | select(.activeGb < 1)'
```

When stdout isn't a terminal the CLI prints data only — no banners, no colour — so pipes just work.

## Configuration

| Setting | How |
|---|---|
| API key | `buyproxy login` (stored in `~/.config/buyproxy/config.json`, mode `0600`), `BUYPROXY_API_KEY`, or `--key` |
| Alternate API host | `BUYPROXY_BASE_URL` |
| Disable colour | `NO_COLOR=1` or `--no-color` |
| Debug stack traces | `BUYPROXY_DEBUG=1` |

Key precedence: `--key` → `BUYPROXY_API_KEY` → saved config. Personal keys (`bp_key_…`) and reseller keys (`bp_live_…`) are detected automatically.

## Exit codes

`0` success · `1` API or network error · `2` usage error (bad flag, missing login) · `130` cancelled.

## FAQ

**Where do I get an API key?** Create a free account at [buyproxy.org](https://www.buyproxy.org/signup), then **Dashboard → API keys**.

**What does it cost?** The CLI is free and MIT-licensed. Proxy bandwidth starts at **$1.99/GB** — see `buyproxy products` for live prices.

**What does `buyproxy test` contact?** It generates one proxy and requests `https://ipinfo.io/json` *through it* to show the exit IP, location and network — a few kilobytes of your bandwidth. Nothing else is sent anywhere.

**Does it work on Windows?** Yes — anywhere Node.js 18+ runs. Install with npm.

**Is the SDK available in my language?** Yes: [Node.js](https://github.com/DishantSinghDev2/buyproxy-node) · [Python](https://github.com/DishantSinghDev2/buyproxy-python) · [Go](https://github.com/DishantSinghDev2/buyproxy-go) · [PHP](https://github.com/DishantSinghDev2/buyproxy-php) · [Ruby](https://github.com/DishantSinghDev2/buyproxy-ruby) · [Java](https://github.com/DishantSinghDev2/buyproxy-java) · [.NET](https://github.com/DishantSinghDev2/buyproxy-dotnet) · [Rust](https://github.com/DishantSinghDev2/buyproxy-rust).

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
node bin/buyproxy.js --help
```

The CLI is built on the [`buyproxy`](https://github.com/DishantSinghDev2/buyproxy-node) SDK, bundled into a single dependency-free file at build time. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Links

- Website: <https://www.buyproxy.org> · Docs: <https://www.buyproxy.org/docs/sdks> · Support: <support@buyproxy.org>

## License

[MIT](LICENSE) © BuyProxy
