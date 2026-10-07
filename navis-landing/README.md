# NAVIS Protocol — Landing Page

Single-file, dependency-free landing page for the NAVIS Protocol presale (Persian / RTL).
Everything lives in **`index.html`** — no build step, no package manager, no bundler — plus one
optional static file, `deployments/localhost.json`, that tells the page where the contracts live.

## Run locally

```bash
cd navis-landing
python3 -m http.server 8080     # then open http://localhost:8080
```

Any static server works (`npx serve .`, `php -S localhost:8080`, VS Code Live Server).
Opening `index.html` directly from the filesystem also works.

## Deploy

The folder is a plain static site; publish `index.html`, `deployments/localhost.json`
(and optional `assets/`) as-is.

The on-chain addresses are **generated, never hand-written**: they live in
`deployments/<network>.json` (`localhost.json`, `bscTestnet.json`, …) and are
rewritten by the deployer in `../navois-contracts`:

```bash
# BSC testnet, seeded test economy: MockUSDT (6 decimals) + MockDEXRouter
BOOTSTRAP_SUPPLY_NAVIS=1000000 SEED_RESERVE_USDT=250000 SEED_FLOAT_USDT=50000 \
  npx hardhat run scripts/deploy-and-record.js --network bscTestnet
```

That one command writes `navois-contracts/deployments/bscTestnet.json` **and**
`navis-landing/deployments/bscTestnet.json` with the real addresses, the
`governance` owners and `pending: false`. While `pending` is `true` (or an
address is `null`) the live reader silently keeps its demo values, so the page
is always safe to publish.

| Host | Method |
| --- | --- |
| Netlify | drag-and-drop the `navis-landing` folder, or set it as the publish directory |
| Vercel | `vercel --prod` from this folder (framework preset: *Other*) |
| GitHub Pages | push the folder, enable Pages on the branch root / `/docs` |
| Nginx / Apache | copy `index.html` into the document root |

### External dependencies (must stay reachable)

- **Tailwind CSS v4 browser build** — `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`
  (compiles utility classes in the browser; the `@theme` token block lives in `<style type="text/tailwindcss">`).
- **Google Fonts** — Vazirmatn (Persian UI text), Plus Jakarta Sans (display headings),
  Inter (numbers/`.fnum`).
- **Inline SVG** — all icons are inlined, so the page makes no icon requests. Two image requests
  remain, both transparent PNGs: `navislogo.png` — a **512×512 square** holding the gold compass +
  cyber eye, drawn in a flat rounded‑square "medal" in the header and used as the `og:image` (the
  metas declare 512×512) — and `navisprotocol.png` — a **1942×809 wordmark lockup** (the NAVIS letters
  over the gold `PROTOCOL` rule) rendered by `.hero-mark` at the top of the hero, so it sits straight
  on the plate with no white box behind it.
- **Ethers.js v6 (UMD)** — `https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js`
  (exposes `window.ethers`; only touched by the on-chain layer, which degrades to demo mode without it).

> If you need the page to work fully offline or want faster first paint, precompile Tailwind
> (`npx @tailwindcss/cli -i input.css -o tailwind.css --minify`) and self-host the fonts and Ethers,
> then replace those `<link>`/`<script>` tags in the `<head>` with local copies.

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
  `connectWallet, walletStatus, usdtAmount, tokenEstimate, toast, toastText, year`,
  `presalePrice, walletBalance, networkStatus, buyPresale` (the on-chain panel)
- classes / data attributes: `.reveal` (+`in`), `.counting` (+`data-count`/`data-decimals`),
  `[data-unit="days|hours|minutes|seconds"]` (+`flip`), `.lang-btn` (+`data-lang`/`data-label`/`aria-pressed`/`.flag`),
  `.connected` on `#connectWallet`, `.show` on `#toast`, `.hidden` on `#langMenu`/`#mobileMenu`

## Phase 1 — snap shell · "quiet plate" identity (Pass A)

Phase 1 (snap‑scroll framework, sticky header, Hero + Genesis presale widget) rebuilt the top of the
page. **Pass A** then restyled the shared tokens, the header and the hero to the "quiet plate"
language: one near‑black plate, hairline borders, no glass, no glow — with gold reserved for the CTA
and key figures. Only CSS + the header/hero markup moved; the inline script is byte‑identical, because
it only ever touches ids/classes.

- **Snap scroll / page deck** — `html { scroll-snap-type: y mandatory }` plus `main > section { scroll-snap-align: start }`.
  The deck reads as a sequence of full pages: `#hero`, `#roadmap` and `#tokenomics` carry `.snap`
  (`min-height: 100svh`, vertically centred content); the tokenomics page folds the live treasury
  block in right after its counters. `#trust` also carries `.snap`.
  Tablets/phones and short windows relax to `y proximity`, and `prefers-reduced-motion: reduce`
  disables snapping entirely.
- **"Quiet plate" palette (Pass A)** — void `#05070B`, raised plate `#0B0F16`/`#0D1219`, ink
  `#EEF2FA`, muted `#8B93A7`. Two accents only: brand gold `#D4AF37`/`#FFC700` for the CTA and the
  key numbers, ice `#ADCEFF`/`#DDF0FF` for live on‑chain data. The tokens exist twice — in `@theme`
  (for Tailwind utilities) and in `:root` (plain CSS) — so the shell still renders correctly if the
  Tailwind CDN is unreachable.
- **Flat surfaces (Pass A)** — `.card`/`.glass`/`.floor-hl`/`.term` are flat plates with a 1px hairline
  border (the hero plates drop even that hairline — see *Centred emblem hero*) and **no**
  `backdrop-filter` and no coloured drop shadows; the 92px grid (`.bg-lines`) and the grain overlay
  (`.bg-noise`) are retired (`display:none`; the divs stay in the markup), leaving a
  single soft radial glow behind the hero. CTAs are pills (`border-radius: 999px`) with a translucent
  gold fill plus a 1px inset ring — no gradient sweep on hover.
- **Floating capsule header (Pass A)** — `.hdr` is sticky with `padding-top:.7rem`, and `.hdr-in` is a
  rounded capsule `min(100% - 1.5rem, 82rem)` wide, so the bar floats over the plate. Brand wordmark at
  the right, pill nav links in the middle, `BSC Testnet · 97` badge + language switcher +
  `#connectWallet` (abbreviated `0x…` address once connected) at the left; `#menuToggle` opens the
  matching rounded `#mobileMenu` panel below `lg`.
- **Genesis presale widget** — the wallet/subsale UI moved from `#presale` into `#hero`, so all nine
  on‑chain hooks sit next to the gold countdown and the `≥ $0.039` NAV‑Floor card. `#presale` now
  keeps a read‑only phase summary that links back to the widget, which is why every hook still
  appears **exactly once** in the live shell.
- **Centred emblem hero** — the hero's two‑column intro was replaced by one centred column: the
  `navisprotocol.png` wordmark (`.hero-mark`, clamped width, centred). The former `.hero-tag` headline
  and `.hero-lead` protocol lead were removed from the hero and moved into the Roadmap view (the
  headline is now its `.lead` header subtitle, the lead becomes the narrative card). Below the wordmark
  come two centred rows about half the plate wide (`.hero-half`, the gap tightened to `mt-4`): first the gold `#countdown` card, then the Genesis presale card
  (`#phaseNumber`, phase bar). Under those, the full-width `.gx-grid` holds two equal-height columns — the price/buy
  panel on the right and the NAV‑Floor card on the left. The CTA pair that used to sit under the lead
  is gone; the buy button inside the widget is the hero's only CTA. Every figure on the block still
  reads from the contracts (`.bar-head`/`.bar-foot` for the allocation, percent and sold amount). This
  is also the flattest block on the page: the eyebrow
  label is gone, and the two hero-half cards (`.no-plate`) drop their frame entirely (`#hero .glass` +
  `#hero .floor-hl` set `border: 0`) along with the chip, countdown rule and input fills. The price/buy
  and NAV-Floor cards inside `.gx-grid` are the exception: they span the full plate width, reuse the
  faint `--hair` hairline of the roadmap plates (`#hero .gx-grid .glass` + `#hero .gx-grid .floor-hl`)
  and arrange their readouts in two columns.
- **CDN‑independent responsive visibility** — the shell's own `.hidden { display: none }` would
  otherwise out‑rank Tailwind's `lg:flex` / `sm:inline` (same specificity, later in the cascade), so
  the header uses explicit classes with their own media queries instead: `.nav-desk`, `.menu-btn`,
  `.lang-label`, `.net-badge`, `.term-chips`, `.brand-sub`, plus `#mobileMenu { display: none }` at
  `lg`. This is what keeps the desktop nav visible and the burger hidden at ≥1024 px.

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
| `strip-legacy.py check` | tag balance of the live shell and of the inert block, the `</template> → <script> → </body> → </html>` tail shape, and that **every** id/class the script queries (`$("#…")`, `$$(".…")`, `[data-unit]`) exists exactly once in the live shell — including the four on-chain wallet hooks (`#presalePrice`, `#walletBalance`, `#networkStatus`, `#buyPresale`) |
| `runtime-test.cjs` | parses the live shell, **executes the shipped script bytes** in a dependency-free DOM sandbox and asserts the observable behaviour: countdown ticks, reveal + counters, market/treasury feed, toast lifecycle, mobile menu, language switch (`lang`/`dir`/flag/label), wallet connect, the estimate calculator and the on-chain panel's demo fallback (52 checks) |
| `smoke-test.cjs` | the same flows inside real headless Chromium via the repo's `puppeteer`; exits `2` with install hints when the browser libraries are missing (use `NAVIS_CHROME=/path/to/chrome` to point at another build) |
| `phase1-shots.cjs` | desktop + mobile viewport shots of the phase‑1 anchors (`#trust`, `#presale`, `#treasury`, `#genesis`) into `preview/`; on this host run it with `LD_LIBRARY_PATH=$HOME/navis-libs/root/usr/lib/x86_64-linux-gnu` |

`check` also compares the injected script against the checksum baseline in
`tools/legacy-script.sha256.json`, which is how the "inline script stays byte-identical" guarantee
is enforced — the file currently hashes to `35bfdfc34a60b873…`. Re-record it whenever the script
is intentionally edited (`check --record`, which always rewrites the baseline).

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
| Header (sticky) | `#top` | `navislogo.png` medal + brand, desktop nav, `BSC Testnet · 97` badge, language switcher (FA/EN/DE/AR/TR), **`#connectWallet`**, mobile menu |
| Hero · **page 1** | `#hero` | centred `navisprotocol.png` wordmark, then two centred `.hero-half` rows — the gold `#countdown` card and the Genesis presale card (`#phaseNumber`, phase bar) — above the `.gx-grid` pair: the price/buy panel (`#presalePrice`, `#usdtAmount`, `#tokenEstimate`, `#walletBalance`, `#buyPresale`, `#walletStatus`, `#networkStatus`) on the right and the gold NAV‑Floor column on the left |
| Roadmap · **page 2** | `#roadmap` | `#about` anchor + `.lead` header subtitle (`آیندهٔ چارت‌های مالی و مسیریابی هوشمند بازار`), protocol narrative and 4 feature cards, then the 4‑phase timeline with its bullet items, laid out as two equal columns on wide screens — phases 1‑2 stacked down the right column and phases 3‑4 down the left — with a hairline connector linking the stacked phases of each column (full `.snap` page) |
| Tokenomics · **page 3** | `#tokenomics` | 100B / 1B / ≥ $0.039 / 100% counters + transparency dashboard, then the live on‑chain treasury block folded in below (`#treasury`: `#tBlock`, `#tClock`, `#tTreasury`, `#tFloor`, `#tRatio`, `#tHolders`, `#tRedeemed`) |
| Trust band | `#trust` | live `#livePrice` market card, verified / liquidity‑lock / treasury cards, RTL fact tape |
| Platform preview | `#platform` | app chrome, node graph, candlestick chart, money‑flow panel, market ticker |
| Phase‑1 tokenomics | `#presale` | “توکنومیکس فاز اول”: four stage cards (`#sp1…sp4` × `Price`/`Supply`/`Lock`/`Bar`) painted live from the presale contract’s `subPhases`/`phasePrice`, the increasing price‑and‑size card, the decreasing redemption‑lock card, staking, DEX/keepers and the participation summary |
| Genesis governance | `#genesis` | Genesis governance summary + live on‑chain voting status |
| Community | `#community` | summary copy + social icons (Telegram, X, Discord, GitHub, Medium) |
| Footer | — | navigation, investment summary, disclaimer |

## JavaScript behaviour (inline `<script>`, after the legacy template)

The original script is preserved and still runs; the on-chain layer from
[below](#on-chain-layer-ethers-v6--metamask) is appended to it.

- **Countdown** — target stored in `localStorage` (`navis-presale-target`) as *now + 18 days*, so a
  returning visitor does not get a reset timer. Cells update every second with a flip animation.
- **Language switcher** — updates `aria-pressed`, the toggle label + flag, `<html lang>`/`dir`
  (FA/AR → `rtl`, others → `ltr`) and shows a toast.
- **Reveal on scroll / counters** — `IntersectionObserver`; both fall back to the final state when
  `prefers-reduced-motion: reduce` is set (the simulation intervals are also skipped).
- **Market + treasury feed** — demo data ticked every ~2.6 s / ~3.2 s. Both tickers stop writing as
  soon as a real read succeeds (`chainLive`), so live reserve/floor/price values are never
  overwritten by the simulation; when no node answers, the simulation keeps the panel alive.
- **Wallet connect** — with an injected EIP‑1194 provider (`window.ethereum`) it switches to chain
  31337 and reads the protocol on-chain; without one it shows a demo address and the USDT input
  still recalculates the estimate (sub‑phase price `$0.010`).

## On-chain layer (Ethers v6 + MetaMask)

`deployments/localhost.json` pins the local stack (`chainId` 31337 / `0x7a69`, RPC + fallback and
every contract address: `navToken`, `presale`, `treasury`, `marketMaker`, `usdtToken`, `router`).
The page fetches it at runtime — `deployments/localhost.json` first, then
`../navois-contracts/deployments/localhost.json` — and falls back to the addresses inlined in the
script when neither is reachable (e.g. opening the file over `file://`, where `fetch` is blocked).
Reads go through a plain `JsonRpcProvider` (no wallet required, so the panel hydrates on load and
re-reads every 15 s once a wallet is connected); writes go through
`ethers.BrowserProvider(window.ethereum)`.

| Action | What happens |
| --- | --- |
| `#connectWallet` | `eth_requestAccounts` → `wallet_switchEthereumChain` (only when the wallet is on another chain; `wallet_addEthereumChain` if the chain is unknown) → live Treasury reserve / NAV floor / presale price, ERC‑20 symbol+decimals |
| `#buyPresale` | readable USDT amount → `approve(presale, amount)` when the allowance is short → `presale.buyTokens(amount)` → balance + reserve refresh, tx hash in `#networkStatus` |
| no wallet / no Ethers / RPC down | every branch above is skipped, the buttons keep their original demo behaviour and the panel shows *شبکه: متصل نیست* |

Everything is progressive enhancement: the page never throws when `window.ethereum` is missing, so
the demo experience is byte-for-byte the v1 one. Verified end-to-end against a local Hardhat node
(1000 USDT → 4000 NAVIS at the 4× sub-phase multiplier).

### Phase‑1 tokenomics cards (`#presale`)

The four stage cards are positional — `#sp1…sp4` each exposing `Price`, `Supply`, `Lock` and `Bar` —
and the same reader paints them from the presale contract:

- `phasePrice(i)` → the per‑stage USDT price, rendered with the on‑chain USDT decimals (`—` while the
  NAV floor is still zero, i.e. before the treasury holds a reserve);
- `subPhases(i)` → `tokenSupply` (compacted to `400M`), the meter’s sale progress
  (`tokensSold / tokenSupply`) and the exclusive redemption lock (`lockPeriod`, printed as months when
  it is a whole number of 30‑day months, otherwise as days).

Only the sub‑phases the contract actually reports are touched: a card whose sub‑phase is missing — or a
chain with `subPhaseCount() == 0` — keeps the illustrative value in the markup, exactly like the rest
of the panel. The same values are restored whenever the reader falls back to demo mode.

## Before launch — replace the placeholders

1. ~~Header emblem~~ — done: `./navislogo.png` (512×512, transparent) is the header medal + `og:image`,
   and `./navisprotocol.png` (1942×809, transparent) is the hero wordmark. Both came out of
   `navislogo1.png` and the wordmark art with the background flood‑filled to alpha and the artwork
   trimmed. Swap either file to change the branding — keep the alpha, and keep the header file square,
   because the medal is a rounded square with no mask (`object-fit: cover`) and the `og:image` metas
   are pinned to 512×512.
2. `TODO` in `#community`: point the social links to the real handles.
3. Point `deployments/localhost.json` at the production deployment (chain id, RPC URLs, addresses)
   and refresh the inlined fallback addresses in the script to match.
4. Add the audit links in `#treasury` — the reserve / NAV floor / price reads are already on-chain
   whenever a node (or wallet) is reachable.
5. The `#presale` stage cards read price / supply / sale progress / redemption lock straight from the
   presale contract, so they follow the model on their own; only the *illustrative* fallback numbers in
   the markup (what a visitor sees before a node answers) need editing. The inline script is untouched
   by that, so the recorded baseline stays valid.

## Notes

- RTL-first: `dir="rtl"` on `<html>`; the market tape reverses its animation direction in RTL
  (`[dir="rtl"] .tape-track { animation-direction: reverse; }`).
- Numbers use `font-variant-numeric: tabular-nums` (`.tnum`) so digits do not jitter while ticking.
- The page is informational and is **not** financial advice; anything the chain cannot be read for
  falls back to a simulation (`#platform` is always simulated, `#treasury` only while offline).
