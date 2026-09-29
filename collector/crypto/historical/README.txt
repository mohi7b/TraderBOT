================================================================================
TraderBOT — Historical Collector
راهنمای دستورات اجرا (Run Commands)
================================================================================

این سند فقط دستورات «run» این پوشه و آرگومان‌های هرکدام را پوشش می‌دهد.
تمام دستورات از مسیر زیر اجرا می‌شوند:

    cd collector/crypto/historical

پوشه‌ی مقصد داده‌ها:
    crypto/<SYMBOL>/candles_1m.db   (یک فایل SQLite به ازای هر نماد)


--------------------------------------------------------------------------------
1) run-full.cjs — دانلود کامل «یک» بازار
--------------------------------------------------------------------------------

    node full/run-full.cjs <SYMBOL> --exchange=<EXCHANGE> --market=<MARKET> [--rewrite] [--delete]

آرگومان‌ها:
    <SYMBOL>                نماد، مثلاً BTCUSDT یا ETHUSDT (خودکار uppercase و
                            بدون خط تیره/زیرخط نرمال می‌شود: BTC-USDT == BTCUSDT)

    --exchange=<EXCHANGE>   نام صرافی: binance | bybit | okx | kucoin | bitget
    --market=<MARKET>       نوع بازار: spot | futures

    --rewrite               فقط بازنویسی کامل: از earliest صرافی تا الان را دوباره
                            دانلود می‌کند (INSERT OR IGNORE؛ داده‌ی قبلی را پاک نمی‌کند)

    --delete                فقط پاک‌کردن: همه‌ی ردیف‌های این بازار را حذف می‌کند و
                            بدون دانلود خارج می‌شود (برای پاک‌سازی جداگانه)

مثال‌ها:
    node full/run-full.cjs BTCUSDT --exchange=binance --market=spot
    node full/run-full.cjs BTCUSDT --exchange=okx --market=futures
    node full/run-full.cjs ETHUSDT --exchange=bitget --market=spot --rewrite
    node full/run-full.cjs BTCUSDT --exchange=okx --market=spot --delete

نکته: بدون --rewrite، از آخرین کندل ذخیره‌شده ادامه می‌دهد (resume) و حفره‌های
      موجود را تشخیص داده و پر می‌کند.


--------------------------------------------------------------------------------
2) run-all-markets.cjs — دانلود کامل «همه‌ی 10 بازار»
--------------------------------------------------------------------------------

    node full/run-all-markets.cjs [SYMBOL] [--rewrite] [--delete] [--fancy]

آرگومان‌ها:
    [SYMBOL]      نماد (اختیاری؛ پیش‌فرض BTCUSDT)

    --rewrite     بازنویسی کامل همه‌ی 5 صرافی × 2 بازار (بدون پاک‌کردن؛
                  ابتدا با --delete جداگانه پاک کنید)

    --delete      فقط پاک‌کردن همه‌ی 10 بازار و خروج (بدون دانلود)

    --fancy       نمایش رنگی/چندخطی (پیش‌فرض: نمایش ساده و تک‌خطی)

ترتیب اجرا (برای حفظ نرخ مجاز درخواست):
    ابتدا spot هر صرافی، سپس futures همان صرافی — پس هر صرافی در هر لحظه
    فقط «یک» درخواست دارد و از حد لیمیت عبور نمی‌کند.

جریان پیشنهادی بازنویسی کامل:
    node full/run-all-markets.cjs BTCUSDT --delete
    node full/run-all-markets.cjs BTCUSDT --rewrite

مثال‌ها:
    node full/run-all-markets.cjs BTCUSDT
    node full/run-all-markets.cjs BTCUSDT --fancy
    node full/run-all-markets.cjs ETHUSDT --rewrite


--------------------------------------------------------------------------------
3) run-update.cjs — به‌روزرسانی لحظه‌ای «یک» بازار (فقط دم)
--------------------------------------------------------------------------------

    node full/run-update.cjs <SYMBOL> --exchange=<EXCHANGE> --market=<MARKET>

آرگومان‌ها:
    <SYMBOL>                نماد (مثل بالا)
    --exchange=<EXCHANGE>   binance | bybit | okx | kucoin | bitget
    --market=<MARKET>       spot | futures

رفتار:
    فقط از «آخرین کندل ذخیره‌شده + 1 دقیقه» تا «الان» را می‌گیرد.
    اگر دیتابیس خالی باشد، هیچ کاری نمی‌کند (empty-db).
    حفره‌ی تاریخی را پر نمی‌کند (آن وظیفه‌ی run-full است).

مثال:
    node full/run-update.cjs BTCUSDT --exchange=binance --market=spot


--------------------------------------------------------------------------------
4) run-update-all.cjs — به‌روزرسانی لحظه‌ای «همه‌ی 10 بازار» (فقط دم)
--------------------------------------------------------------------------------

    node full/run-update-all.cjs [SYMBOL]

آرگومان‌ها:
    [SYMBOL]      نماد (اختیاری؛ پیش‌فرض BTCUSDT)

رفتار:
    مثل run-update ولی برای هر 10 بازار به‌صورت ترتیبی (sequential) اجرا می‌شود.
    فقط «دم‌ی جدید» هر بازار را می‌گیرد؛ حفره‌ی تاریخی پر نمی‌شود.

مثال:
    node full/run-update-all.cjs BTCUSDT


--------------------------------------------------------------------------------
جدول مقایسه‌ی سریع
--------------------------------------------------------------------------------

    دستور                  | بازارها        | حفره تاریخی | پاک‌کردن    | دم جدید
    -----------------------|----------------|-------------|-------------|---------
    run-full               | 1 بازار        | بله         | با --delete | بله
    run-all-markets        | هر 10 بازار    | بله         | با --delete | بله
    run-update             | 1 بازار        | خیر         | خیر         | بله
    run-update-all         | هر 10 بازار    | خیر         | خیر         | بله


--------------------------------------------------------------------------------
فایل‌های داخلی (معمولاً مستقیم اجرا نمی‌شوند)
--------------------------------------------------------------------------------

    worker-full.cjs       worker دانلود کامل (توسط run-all-markets spawn می‌شود)
                          node full/worker-full.cjs <SYMBOL> <EXCHANGE_KEY> [--rewrite]

    update-1m.cjs         هسته‌ی به‌روزرسانی (تابع update1m) — از run-update صدا زده می‌شود
    fetch-latest.cjs      آپدیت آخرین کندل برای یک کلید استاندارد <venue>_<marketType>


--------------------------------------------------------------------------------
صرافی‌ها و عمق تاریخچه‌ی کندل 1m (تست‌شده)
--------------------------------------------------------------------------------

    Binance   spot / futures   از ~2017 / ~2019
    Bybit     spot / futures   از ~2021 / ~2020
    OKX       spot / futures   از ~2018 / ~2019
    KuCoin    spot / futures   از ~2017 / ~2024
    Bitget    spot / futures   از ~2018 (با endpoint history-candles)

نکته: عمق دقیق به خود صرافی بستگی دارد و هنگام دانلود به‌صورت خودکار از طریق
      earliestOpenTime همان صرافی کشف می‌شود.

================================================================================
