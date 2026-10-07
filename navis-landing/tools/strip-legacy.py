#!/usr/bin/env python3
"""Helpers for navis-landing/index.html.

The redesigned page keeps the *entire* previous markup inert inside
``<template id="legacy-page" data-legacy-inert>`` while the original inline
``<script>`` lives outside the template (byte-identical, still executing).

Usage::

    python3 tools/strip-legacy.py check          # validate structure + JS contract
    python3 tools/strip-legacy.py script         # dump the inline script
    python3 tools/strip-legacy.py strip          # rewrite index.html without the legacy block

``check`` verifies:
  * the legacy template block is balanced and closes before the inline script;
  * every DOM hook the inline script relies on exists exactly once in the live shell;
  * the live shell has balanced tags;
  * the inline script matches the recorded checksum baseline (when present);
    ``check --record`` refreshes that baseline after an intentional edit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "index.html"
BASELINE = ROOT / "tools" / "legacy-script.sha256.json"

TEMPLATE_OPEN = '<template id="legacy-page" data-legacy-inert>'
TEMPLATE_OPEN_RE = re.compile(r"^" + re.escape(TEMPLATE_OPEN) + r"\s*$", re.M)
SCRIPT_OPEN = "<script>"
SCRIPT_CLOSE = "</script>"

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Every selector the preserved inline script depends on.
REQUIRED_IDS = [
    "toast", "toastText", "year", "scrollProgress",
    "menuToggle", "mobileMenu", "langWrap", "langToggle", "langMenu",
    "langCurrentLabel", "countdown", "livePrice", "netInflow",
    "tTreasury", "tFloor", "tRatio", "tHolders", "tRedeemed", "tBlock",
    "tClock", "connectWallet", "walletStatus", "usdtAmount", "tokenEstimate",
    # on-chain (Ethers v6 + MetaMask) wallet panel
    "presalePrice", "walletBalance", "networkStatus", "buyPresale",
]
REQUIRED_UNITS = ["days", "hours", "minutes", "seconds"]
REQUIRED_CLASSES = ["reveal", "counting", "lang-btn", "social-btn"]


class Balance(HTMLParser):
    """Track tag balance over a fragment."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        return

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"line {self.getpos()[0]}: stray </{tag}>")
            return
        open_tag, line = self.stack.pop()
        if open_tag != tag:
            self.errors.append(
                f"line {self.getpos()[0]}: </{tag}> closes <{open_tag}> opened on line {line}"
            )

    def leftover(self):
        return [f"unclosed <{t}> opened on line {ln}" for t, ln in self.stack]


def read_page() -> str:
    if not PAGE.exists():
        sys.exit(f"error: {PAGE} not found")
    return PAGE.read_text(encoding="utf-8")


def split_regions(html: str):
    opener = TEMPLATE_OPEN_RE.search(html)
    if not opener:
        sys.exit(f"error: {TEMPLATE_OPEN!r} not found on its own line")
    start = opener.start()
    live = html[:start]

    end = html.find("</template>", opener.end())
    if end < 0:
        sys.exit("error: legacy <template> is never closed")
    legacy = html[opener.end():end]
    tail = html[end + len("</template>"):]

    s_open = tail.find(SCRIPT_OPEN)
    s_close = tail.find(SCRIPT_CLOSE, s_open)
    if s_open < 0 or s_close < 0:
        sys.exit("error: inline <script> not found after the legacy template")
    script = tail[s_open + len(SCRIPT_OPEN):s_close]
    return live, legacy, tail, script


def check_balance(region: str, label: str, allow: tuple[str, ...] = ()) -> bool:
    parser = Balance()
    parser.feed(region)
    problems = parser.errors + [p for p in parser.leftover() if not p.startswith(tuple(f"unclosed <{t}>" for t in allow))]
    ok = not problems
    print(f"[{'ok' if ok else 'FAIL'}] {label}: tag balance")
    for problem in problems:
        print(f"        {problem}")
    return ok


def count_id(region: str, ident: str) -> int:
    return len(re.findall(rf'id="{re.escape(ident)}"', region))


def cmd_check(args) -> int:
    html = read_page()
    live, legacy, tail, script = split_regions(html)

    print(f"file           : {PAGE}")
    print(f"live shell     : {live.count(chr(10))} lines / {len(live)} bytes")
    print(f"legacy block   : {legacy.count(chr(10))} lines / {len(legacy)} bytes (inert)")
    print(f"inline script  : {script.count(chr(10))} lines / {len(script)} bytes")
    print()

    ok = True


    ok &= check_balance(live, "live shell", allow=("html", "body"))
    ok &= check_balance(legacy, "legacy template content")

    tail_problems = []
    if not re.search(r"</script>\s*</body>\s*</html>\s*$", tail):
        tail_problems.append("expected </script> -> </body> -> </html> at EOF")
    if re.search(r"<script[^>]*\bsrc=", tail):
        tail_problems.append("a remote <script src> sits outside the live shell")
    if tail_problems:
        for problem in tail_problems:
            print(f"[FAIL] document tail: {problem}")
        ok = False
    else:
        print("[ok] document tail: </template> -> <script> -> </body> -> </html>")

    missing = [i for i in REQUIRED_IDS if count_id(live, i) == 0]
    duplicated = [i for i in REQUIRED_IDS if count_id(live, i) > 1]
    if missing:
        print(f"[FAIL] live shell is missing ids: {', '.join(missing)}")
        ok = False
    if duplicated:
        print(f"[FAIL] live shell has duplicated ids: {', '.join(duplicated)}")
        ok = False
    if not missing and not duplicated:
        print(f"[ok] live shell exposes all {len(REQUIRED_IDS)} script hooks exactly once")

    units = [u for u in REQUIRED_UNITS if f'data-unit="{u}"' not in live]
    if units:
        print(f"[FAIL] #countdown is missing data-unit cells: {', '.join(units)}")
        ok = False
    else:
        print("[ok] #countdown exposes all four data-unit cells")

    classes = [c for c in REQUIRED_CLASSES if not re.search(rf'class="[^"]*\b{c}\b', live)]
    if classes:
        print(f"[FAIL] live shell is missing classes: {', '.join(classes)}")
        ok = False
    else:
        print("[ok] live shell exposes reveal/counting/lang-btn/social-btn hooks")

    derived_ids = sorted(set(re.findall(r'\$\("#([A-Za-z0-9_-]+)"\)', script)))
    missing_derived = [i for i in derived_ids if count_id(live, i) == 0]
    if missing_derived:
        print(f"[FAIL] selectors used by the script but absent from the live shell: {', '.join(missing_derived)}")
        ok = False
    else:
        print(f"[ok] every $(#id) the script queries ({len(derived_ids)}) exists in the live shell")

    derived_classes = sorted(set(re.findall(r'\$\$?\("\.([A-Za-z0-9_-]+)"', script)))
    missing_classes = [c for c in derived_classes if not re.search(rf'class="[^"]*\b{c}\b', live)]
    if missing_classes:
        print(f"[FAIL] classes queried by the script but absent from the live shell: {', '.join(missing_classes)}")
        ok = False
    else:
        print(f"[ok] every $(.class) the script queries ({len(derived_classes)}) exists in the live shell")

    digest = hashlib.sha256(script.encode("utf-8")).hexdigest()
    if args.record:
        BASELINE.write_text(
            json.dumps({"sha256": digest, "bytes": len(script)}, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"[ok] baseline recorded -> {BASELINE.relative_to(ROOT)} ({digest[:16]}…)")
    elif BASELINE.exists():
        recorded = json.loads(BASELINE.read_text(encoding="utf-8"))["sha256"]
        if recorded == digest:
            print(f"[ok] inline script matches baseline sha256 {digest[:16]}…")
        else:
            print(f"[FAIL] inline script changed: {digest[:16]}… != {recorded[:16]}…")
            ok = False
    else:
        print(f"[warn] no baseline recorded; current sha256 {digest[:16]}… (use --record)")

    print()
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def cmd_script(args) -> int:
    _, _, _, script = split_regions(read_page())
    if args.out:
        Path(args.out).write_text(script, encoding="utf-8")
        print(f"wrote {args.out} ({len(script)} bytes)")
    else:
        sys.stdout.write(script)
    return 0


def cmd_strip(args) -> int:
    html = read_page()
    opener = TEMPLATE_OPEN_RE.search(html)
    end = html.find("</template>", opener.end()) if opener else -1
    if not opener or end < 0:
        sys.exit("error: legacy template block not found")
    start = opener.start()
    end += len("</template>")

    stripped = html[:start].rstrip("\n") + "\n" + html[end:].lstrip("\n")
    backup = PAGE.with_suffix(".legacy.html")
    if not args.dry_run:
        backup.write_text(html, encoding="utf-8")
        PAGE.write_text(stripped, encoding="utf-8")
    print(f"backup   : {backup.relative_to(ROOT)} ({len(html)} bytes)")
    print(f"stripped : {PAGE.relative_to(ROOT)} ({len(stripped)} bytes, -{len(html) - len(stripped)})")
    print("[note]  the page no longer carries the legacy reference markup")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_check = sub.add_parser("check", help="validate structure + JS contract")
    p_check.add_argument("--record", action="store_true", help="record the script checksum baseline")
    p_check.set_defaults(func=cmd_check)

    p_script = sub.add_parser("script", help="extract the preserved inline script")
    p_script.add_argument("--out", help="write to this path instead of stdout")
    p_script.set_defaults(func=cmd_script)

    p_strip = sub.add_parser("strip", help="remove the inert legacy block from index.html")
    p_strip.add_argument("--dry-run", action="store_true", help="report sizes without writing")
    p_strip.set_defaults(func=cmd_strip)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
