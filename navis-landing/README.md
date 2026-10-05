# NAVIS Protocol — Landing Page

Single-file, dependency-free landing page for the NAVIS Protocol presale (Persian / RTL).
Everything lives in **`index.html`** — no build step, no package manager, no bundler.

## Run locally

```bash
cd navis-landing
python3 -m http.server 8080     # then open http://localhost:8080
```

Any static server works (`npx serve .`, `php -S localhost:8080`, VS Code Live Server).
Opening `index.html` directly from the filesystem also works.

## Deploy

The folder is a plain static site; publish `index.html` (and optional `assets/`) as-is.

| Host | Method |
| --- | --- |
| Netlify | drag-and-drop the `navis-landing` folder, or set it as the publish directory |
| Vercel | `vercel --prod` from this folder (framework preset: *Other*) |
| GitHub Pages | push the folder, enable Pages on the branch root / `/docs` |
| Nginx / Apache | copy `index.html` into the document root |

### External dependencies (must stay reachable)

- **Tailwind CSS v4 browser build** — `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`
  (compiles utility classes in the browser; the `@theme` token block lives in `<style type="text/tailwindcss">`).
- **Google Fonts** — Vazirmatn (Persian UI text), Sora (display headings), JetBrains Mono (numbers).
- **Inline SVG** — all icons and the placeholder logo are inlined, so there are no image requests.

> If you need the page to work fully offline or want faster first paint, precompile Tailwind
> (`npx @tailwindcss/cli -i input.css -o tailwind.css --minify`) and self-host the fonts, then
> replace the two `<link>`/`<script>` lines in the `<head>` with local files.

## How the v2 redesign is assembled

`index.html` has exactly two regions:

| Region | Contents |
| --- | --- |
| **live shell** (top of the file) | `<head>` (meta/OG/fonts/Tailwind), the `@theme` token block, the design-system v2 `<style>` block, page chrome (`#scrollProgress`, `.skip`, `.bg-aurora/.bg-lines/.bg-noise`), header + `#langWrap`/`#mobileMenu`, every section, footer and `#toast` |
| **`<template id="legacy-page" data-legacy-inert">`** (end of the file) | the whole *previous* page (markup + its own CSS), kept inert for reference only |

The preserved inline `<script>` sits **after** `</template>`, so it keeps running byte-for-byte
against the new DOM. `<template>` content is an inert document fragment: its nodes are not in the
document, so every selector (`#countdown`, `.reveal`, `.lang-btn`, `#toast`, …) resolves to the
live shell. The redesign therefore keeps the original JS contract:

- ids: `scrollProgress, langWrap, langToggle, langMenu, langCurrentLabel, menuToggle, mobileMenu,`
  `countdown, livePrice, netInflow, tTreasury, tFloor, tRatio, tHolders, tRedeemed, tBlock, tClock,`
  `connectWallet, walletStatus, usdtAmount, tokenEstimate, toast, toastText, year`
- classes / data attributes: `.reveal` (+`in`), `.counting` (+`data-count`/`data-decimals`),
  `[data-unit="days|hours|minutes|seconds"]` (+`flip`), `.lang-btn` (+`data-lang`/`data-label`/`aria-pressed`/`.flag`),
  `.connected` on `#connectWallet`, `.show` on `#toast`, `.hidden` on `#langMenu`/`#mobileMenu`

## Validation

```bash
python3 tools/strip-legacy.py check                      # static contract (no deps)
node tools/runtime-test.cjs                              # runtime contract (no deps, ~11s)
python3 tools/strip-legacy.py script --out /tmp/navis.js && node --check /tmp/navis.js
node tools/smoke-test.cjs                                # optional: real headless Chromium
python3 tools/strip-legacy.py strip --dry-run            # report what a cleanup would remove
```

| Tool | What it proves |
| --- | --- |
| `strip-legacy.py check` | tag balance of the live shell and of the inert block, the `</template> → <script> → </body> → </html>` tail shape, and that **every** id/class the script queries (`$("#…")`, `$$(".…")`, `[data-unit]`) exists exactly once in the live shell |
| `runtime-test.cjs` | parses the live shell, **executes the shipped script bytes** in a dependency-free DOM sandbox and asserts the observable behaviour: countdown ticks, reveal + counters, market/treasury feed, toast lifecycle, mobile menu, language switch (`lang`/`dir`/flag/label), wallet connect and the estimate calculator (44 checks) |
| `smoke-test.cjs` | the same flows inside real headless Chromium via the repo's `puppeteer`; exits `2` with install hints when the browser libraries are missing (use `NAVIS_CHROME=/path/to/chrome` to point at another build) |

`check` also compares the injected script against the checksum baseline in
`tools/legacy-script.sha256.json`, which is how the "inline script stays byte-identical" guarantee
is enforced — the file currently hashes to `13f5978e3609be27…`. Re-record it only when the script
is intentionally edited (`check --record`).

When the reference copy is no longer needed:

```bash
python3 tools/strip-legacy.py strip     # writes index.html without the legacy block, keeps index.legacy.html
```

## Publishing on its own port (no Nginx / panel impact)

```bash
bash tools/deploy.sh            # checks the port, serves it, health-checks it, prints the URL
bash tools/deploy.sh status     # who holds the port / is the server up
bash tools/deploy.sh stop       # stop the server
PORT=8088 bash tools/deploy.sh  # any other free port
FIREWALL=1 bash tools/deploy.sh # + allow the port through ufw (opt-in, OFF by default)
```

> **This host also runs the Sanaei panel + Xray (V2Ray) inbounds.** Publishing here is only safe
> because the page gets its *own free* port. Both tools therefore refuse the panel/VPN ports
> (`22 53 80 443 2053 2096 3333 8443 11111 21115‑21119 34903 54321`), `deploy.sh` never touches the
> firewall unless you ask for it (`FIREWALL=1`), and neither Nginx, the panel database nor any
> panel/VPN systemd unit is read, edited or restarted.

| Piece | Role |
| --- | --- |
| `tools/serve.cjs` | dependency-free static server bound to `0.0.0.0:8080`; publishes the landing root only — no directory listing, and `tools/`, `node_modules/` and dotfiles answer `404`. Handles `GET`/`HEAD`, `ETag`/`304`, correct MIME types. Refuses to bind a panel/VPN port unless `--force` is passed |
| `tools/deploy.sh` | port pre-flight (aborts untouched if the port is taken **or is one of the panel/VPN ports**), detached start (`setsid nohup`, pid `/tmp/navis-landing.pid`, log `/tmp/navis-landing.log`), local health check; the ufw step is **opt-in** (`FIREWALL=1`) and only ever touches the page's own port |
| `tools/nginx-landing.conf` | **optional** isolated Nginx vhost for 8080 — no `default_server`, dedicated log files, blocks `/tools/`. Copy + symlink yourself *only* if you prefer Nginx over `serve.cjs` (never both on the same port) |

Manual equivalent, if you prefer explicit steps:

```bash
ss -ltnp | grep :8088 || echo "port free"     # 1. is that port free? (never 8443/2053/2096/34903/21115-21119)
sudo ufw allow 8088/tcp                       # 2. firewall - ONLY if ufw is genuinely active
python3 -m http.server 8088 --bind 0.0.0.0 \
        --directory /home/mohsen/TraderBOT/navis-landing   # 3. serve
```

None of this reads, reloads or edits the panel's Nginx configs, its vhosts or its ports — and it
must never bind a port the panel/VPN uses, because that would take the tunnels down.

## Page structure

| Section | Anchor | Content |
| --- | --- | --- |
| Header | `#top` | logo placeholder, desktop nav, language switcher (FA/EN/DE/AR/TR), mobile menu |
| Hero | — | badges, headline, 18‑day presale countdown, trust strip |
| Platform preview | `#platform` | app chrome, node graph, candlestick chart, money‑flow panel, market ticker |
| About | `#about` | protocol summary + 4 feature cards |
| Roadmap | `#roadmap` | timeline, 4 macro phases with bullet items |
| Tokenomics | `#tokenomics` | 100B / 1B / ≥ $0.039 / 100% counters + transparency dashboard |
| Presale Phase 1 | `#presale` | 4 sub‑phases (increasing price & size, decreasing lock), staking, DEX/keepers, wallet connect |
| Treasury | `#treasury` | live on‑chain status simulation (balance, NAV floor, reserve ratio, block clock) |
| Community | `#community` | summary copy + social icons (Telegram, X, Discord, GitHub, Medium) |
| Footer | — | navigation, investment summary, disclaimer |

## JavaScript behaviour (inline `<script>`, after the legacy template)

The script is unchanged from the v1 page; only the markup around it was redesigned.

- **Countdown** — target stored in `localStorage` (`navis-presale-target`) as *now + 18 days*, so a
  returning visitor does not get a reset timer. Cells update every second with a flip animation.
- **Language switcher** — updates `aria-pressed`, the toggle label + flag, `<html lang>`/`dir`
  (FA/AR → `rtl`, others → `ltr`) and shows a toast.
- **Reveal on scroll / counters** — `IntersectionObserver`; both fall back to the final state when
  `prefers-reduced-motion: reduce` is set (the simulation intervals are also skipped).
- **Market + treasury feed** — deterministic demo data, ticked every ~2.6 s / ~3.2 s. Replace with
  real RPC/API calls after the contract is deployed.
- **Wallet connect** — uses an injected EIP‑1194 provider (`window.ethereum`) when present,
  otherwise shows a demo address; the USDT input recalculates the estimated token amount
  (current sub‑phase price `$0.010`).

## Before launch — replace the placeholders

1. `TODO` in the header: swap the inline SVG emblem for the official logo
   (`<img src="./assets/navis-logo.svg" alt="NAVIS" />`).
2. `TODO` in `#community`: point the social links to the real handles.
3. Add the deployed contract address + audit links in `#treasury`.
4. Replace the demo figures in `#platform` and `#treasury` with on‑chain reads.
5. Update the sub‑phase prices/sizes/lock periods in `#presale` if the model changes.

## Notes

- RTL-first: `dir="rtl"` on `<html>`; the market tape reverses its animation direction in RTL
  (`[dir="rtl"] .tape-track { animation-direction: reverse; }`).
- Numbers use `font-variant-numeric: tabular-nums` (`.tnum`) so digits do not jitter while ticking.
- The page is informational and is **not** financial advice; the live sections are simulations.
