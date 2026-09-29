#!/usr/bin/env python3\nimport pathlib
"""
ChartEngine V2 — بازبینی «پنج نسخهٔ نمایشی تمِ شهریور» (بازبینی ششم)
==================================================================
سند مرتبط: `CHART_ENGINE_V2_ARCHITECTURE.md` → §۱۳ (Responsive Screen Themes)

می‌سنجد (همه از **SSR واقعی** ✓):
  ۱) هر ۵ تم با `?theme=` بالا می‌آید ✓ و پارامترهای نمایشی‌اش **دقیقاً** همان
     جدول `lib/chart/screenProfiles.ts` است ✓ (futureMargin · barSpacing ·
     rightOffset · seriesThickness · header · legendRows · dprCap · font · عرض کشو).
  ۲) پریست (`data-chart-profile`) و داده (`data-hist-candles`) **تغییر نمی‌کنند** ✓.
  ۳) selfTest هسته سبز می‌ماند ✓ (شامل `screenProfilesSelfTest` ✓ در SSR ✓).

اجرا: python3 -u scripts/review-screen-themes.py [BASE_URL]
"""
import re
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3000/crypto/BTCUSDT/candles'

# تم → (کلاس, fm, barSpacing, rightOffset, thickness, header, legendRows, dprCap, font, drawerWidth, motion)
EXPECTED = {
    'shahrivar_mobile': ('mobile', 12, 4, 1, '1.5', 'compact', 2, '2', 10, '100%', 'normal'),
    'shahrivar_tablet': ('tablet', 16, 5, 2, '2', 'full', 3, '2', 11, 'min(20rem,70%)', 'normal'),
    'shahrivar_desktop': ('desktop', 24, 6, 2, '2', 'full', 8, '2', 11, 'max(15rem,min(22rem,34%))', 'normal'),
    'shahrivar_ultrawide': ('ultrawide', 32, 8, 3, '2', 'full', 8, '1.5', 12, '22rem', 'normal'),
    'shahrivar_tv': ('tv', 48, 10, 4, '3', 'full', 8, '1.5', 16, '28rem', 'reduced'),
}
passed = 0
failed = 0


def check(cond, label, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  ✅ {label} {extra}')
    else:
        failed += 1
        print(f'  ❌ {label} {extra}')


def fetch(theme=None, cookie=None):
    qs = 'asset=BTCUSDT&tf=1h&profile=pro'
    if theme:
        qs += f'&theme={theme}'
    req = urllib.request.Request(BASE + '?' + qs)
    if cookie:
        req.add_header('Cookie', cookie)
    return urllib.request.urlopen(req, timeout=180).read().decode()


def attr(h, name):
    m = re.search(rf'{name}="([^"]*)"', h)
    return m.group(1) if m else 'NA'


print(f'BASE = {BASE}\n=== هر ۵ نسخهٔ نمایشی ===')
for theme, (cls, fm, bs, ro, th, hdr, lr, dpr, font, drawW, motion) in EXPECTED.items():
    h = fetch(theme)
    ok = (
        attr(h, 'data-chart-theme') == theme
        and attr(h, 'data-screen-class') == cls
        and attr(h, 'data-chart-future-margin') == str(fm)
        and attr(h, 'data-chart-bar-spacing') == str(bs)
        and attr(h, 'data-chart-right-offset') == str(ro)
        and attr(h, 'data-chart-series-thickness') == th
        and attr(h, 'data-chart-header') == hdr
        and attr(h, 'data-chart-legend-rows') == str(lr)
        and attr(h, 'data-chart-dpr-cap') == dpr
        and attr(h, 'data-chart-font') == str(font)
        and attr(h, 'data-cc-drawer-width') == drawW
        and attr(h, 'data-cc-motion') == motion
    )
    check(ok, f'{theme:22s}', f'class={cls} fm={fm} bs={bs} th={th} font={font}')
    check(attr(h, 'data-chart-anchor') == 'last', f'{"":22s}  لنگر = last ✓')
    check(attr(h, 'data-engine-selftest') == 'ok:0', f'{"":22s}  selfTest = ok:0 ✓')
    check(attr(h, 'data-chart-profile') == 'pro', f'{"":22s}  پریست دست‌نخورده = pro ✓')
    check(attr(h, 'data-hist-candles') == '5000', f'{"":22s}  داده دست‌نخورده = 5000 کندل ✓')

print('=== پیش‌فرض (بدون ?theme=) ⇒ دسکتاپ = رفتار امروز ✓ ===')
h0 = fetch()
# SSR خنثی است (ScreenThemeSync منبع تشخیص در کلاینت) ⇒ تم پیش‌فرض = shahrivar_default ✓
check(attr(h0, 'data-chart-theme') == 'shahrivar_default', 'تم خنثیِ SSR', attr(h0, 'data-chart-theme'))
check(attr(h0, 'data-theme-selftest') == 'ok:0',
      'کاملیت ۷ تم خانواده (themeCompleteness)', attr(h0, 'data-theme-selftest'))
check(attr(h0, 'data-chart-future-margin') == '24' and attr(h0, 'data-chart-bar-spacing') == '6',
      'پارامترهای دسکتاپ همان امروز')
check(attr(h0, 'data-chart-series-thickness') == '2' and attr(h0, 'data-chart-font') == '11',
      'ضخامت/فونت امروز حفظ شد')

print('=== fa (تم نسخه‌دار + i18n) ===')
hf = fetch('shahrivar_tv', cookie='locale=fa')
check(attr(hf, 'data-chart-theme') == 'shahrivar_tv' and attr(hf, 'data-engine-selftest') == 'ok:0',
      'نسخهٔ TV در fa سالم')

import os

# === source-guard: حفظ پارامترهای URL در هر سه مسیر نوشتن (مرحلهٔ ۵/۹) ===
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
cc = open(
    os.path.join(ROOT, 'components/domain/historical/ControlCenter.tsx'), encoding='utf-8'
).read()
pg = open(
    os.path.join(ROOT, 'app/[market]/[pair]/[datatype]/page.tsx'), encoding='utf-8'
).read()
check('sp.toString()' in cc and 'STATE_URL_KEYS' in cc,
      'source-guard: ControlCenter.push پارامترها را حفظ می‌کند')
check('keptParams' in pg and 'type="hidden"' in pg,
      'source-guard: فرم Apply پارامترها را با hidden حفظ می‌کند')
check('state.includes("theme")' not in cc and 'encodeState(next)}`)' not in cc,
      'source-guard: هیچ router.replace بدون ادغام نمانده')

print(f'\nSUMMARY: ✅ {passed} passed · ❌ {failed} failed')
sys.exit(1 if failed else 0)
