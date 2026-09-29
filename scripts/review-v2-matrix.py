#!/usr/bin/env python3
"""
ChartEngine V2 — ماتریس بازبینی معماری سه‌لایه (Presets / Themes / Library)
frontend/../../scripts/review-v2-matrix.py  →  TraderBOT/scripts/review-v2-matrix.py
=============================================================================
سند مرتبط: `CHART_ENGINE_V2_ARCHITECTURE.md` → **§۱۲ Architecture Overview**
(نسخه 2.0.0-alpha · تاریخ 2026-09-25 ✓)

چه چیزی را می‌سنجد؟ (همه از **SSR واقعی** ✓ · هیچ دادهٔ ساختگی ✗)
  A) هر ۶ پریست روی `tf=1h` ⇒ HTTP · data-chart-profile · selfTest · تب‌های روشن
  B) پریست `pro` روی **همهٔ** تایم‌فریم‌های رجیستری ⇒ صفر وابستگی به تایم‌فریم
  C) هماهنگی رنگ/مقدار بین **چارت ↔ لجند ↔ کشو**
  D) چند-نمونه (`ema:2`) · حفظ پارامتر در URL (`p=`) · **تومبستون** (حذف ماندگار)
  E) زبان `fa` (کل متن‌ها از i18n)

پیش‌نیاز: فرانت روی `:3000` و سرویس تاریخی روی `:4000` بالا باشند ✓
اجرا:  python3 -u scripts/review-v2-matrix.py [BASE_URL]
"""
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3000/crypto/BTCUSDT/candles'
PRESETS = ['classic', 'micro', 'flow', 'ai', 'hybrid', 'pro']
TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '5d', '1w', '1mo', '1y']
passed = 0
failed = 0


def get(qs, cookie=None):
    """یک درخواست SSR + استخراج اتریبیوت‌های بازرسی ✓"""
    req = urllib.request.Request(BASE + '?' + qs)
    if cookie:
        req.add_header('Cookie', cookie)
    t0 = time.time()
    try:
        h = urllib.request.urlopen(req, timeout=180).read().decode()
    except Exception as e:  # noqa: BLE001 — گزارش ساده برای اپراتور
        return {'err': str(e)[:80], 'ms': int((time.time() - t0) * 1000)}

    def g(pat):
        m = re.search(pat, h)
        return m.group(1) if m else 'NA'

    return {
        'ms': int((time.time() - t0) * 1000),
        'profile': g(r'data-chart-profile="([^"]*)"'),
        'selftest': g(r'data-engine-selftest="([^"]*)"'),
        'candles': g(r'data-hist-candles="([^"]*)"'),
        'service': 'down' if 'data-hist-service="down"' in h else 'up',
        'tabs_on': len(re.findall(r'data-cc-tab-on="1"', h)),
        'items': ','.join(re.findall(r'data-cc-item="([^"]*)"', h)),
        'lib': ','.join(f'{k}:{c}' for k, c in
                        re.findall(r'data-cc-lib-item="([^"]*)" data-cc-lib-count="([^"]*)"', h)),
        'legend': ','.join(re.findall(r'data-chart-legend-item="([^"]*)"', h)),
        'legend_colors': ','.join(re.findall(r'data-chart-legend-color="([^"]*)"', h)),
        'cc_colors': ','.join(re.findall(r'data-cc-item-color="([^"]*)"', h)),
        'legend_values': ','.join(re.findall(r'data-chart-legend-value="([^"]*)"', h)),
        'ema_attr': g(r'data-hist-ema21="([^"]*)"'),
        'sma_attr': g(r'data-hist-sma50="([^"]*)"'),
        'cc_icons': len(re.findall(r'data-cc-icon="', h)),
        'engine_first': g(r'data-engine-selftest-first="([^"]*)"'),
    }


def ok(cond, label, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  ✅ {label} {extra}')
    else:
        failed += 1
        print(f'  ❌ {label} {extra}')


print(f'BASE = {BASE}\n')
print('=== A) پریست‌ها روی tf=1h ===')
for p in PRESETS:
    r = get(f'asset=BTCUSDT&tf=1h&profile={p}')
    if 'err' in r:
        ok(False, f'{p}: {r["err"]}')
        continue
    ok(r['profile'] == p and r['selftest'] == 'ok:0' and r['service'] == 'up',
       f'{p:8s}', f'tabs_on={r["tabs_on"]:>2} candles={r["candles"]} {r["ms"]}ms')
    if p == 'pro':
        ok(r['tabs_on'] == 10, 'pro = همهٔ ۱۰ ماژول روشن')

print('=== B) پریست pro روی همهٔ تایم‌فریم‌ها ===')
for tf in TIMEFRAMES:
    r = get(f'asset=BTCUSDT&tf={tf}&profile=pro')
    if 'err' in r:
        ok(False, f'{tf:4s}: {r["err"]}')
        continue
    ok(r['selftest'] == 'ok:0' and r['tabs_on'] == 10, f'{tf:4s}',
       f'candles={r["candles"]:>5s} {r["ms"]}ms')

print('=== C) هماهنگی چارت ↔ لجند ↔ کشو ===')
r = get('asset=BTCUSDT&tf=1h&profile=pro')
ok(r['legend'] == r['items'], 'کلیدهای لجند و کشو یکی‌اند', f'({r["legend"]})')
ok(r['legend_colors'] == r['cc_colors'],
   'رنگ لجند = رنگ آیتم‌ها', f'({r["legend_colors"]})')
ok(bool(r['legend_values']) and r['ema_attr'].startswith(r['legend_values'].split(',')[0][:6]),
   'مقدار لجند = مقدار واقعی چارت', f'(legend={r["legend_values"]} ema={r["ema_attr"][:12]})')
ok(r['cc_icons'] == 10, 'ریل ۱۰ آیکون (هدر بدون آیکون)', '')

print('=== D) چند-نمونه · URL · تومبستون ===')
q = urllib.parse.quote('indicators.ema:1~period=21|1~period=55;signals.cross:1')
m = get(f'asset=BTCUSDT&tf=1h&profile=pro&p={q}')
ok(m['items'] == 'ema,ema,sma', 'پارامترها/نمونه‌ها از URL بازگشتند', f'(items={m["items"]})')
ok('ema:2' in m['lib'], 'شمارش نمونه‌ها = ۲', f'({m["lib"]})')
d = get('asset=BTCUSDT&tf=1h&profile=pro&p=' + urllib.parse.quote('indicators.sma:'))
ok(d['items'] == 'ema' and 'sma:0' in d['lib'], 'تومبستون: حذف ماندگار', f'(items={d["items"]})')

print('=== E) زبان fa ===')
f = get('asset=BTCUSDT&tf=1h&profile=pro', cookie='locale=fa')
ok(f['selftest'] == 'ok:0' and f['items'] == 'ema,sma', 'fa سالم', '')

print(f'\nSUMMARY: ✅ {passed} passed · ❌ {failed} failed')
sys.exit(1 if failed else 0)
