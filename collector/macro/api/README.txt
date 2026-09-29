================================================================================
TraderBOT — Macro API
راهنمای راه‌اندازی و پرسش‌وپاسخ (Endpoints)
================================================================================

فایل: collector/macro/api/server.cjs
یک HTTP server سبک (بدون فریم‌ورک، فقط ماژول built-in `http`).
این سرور فقط «موتور ماکرو» را فراخوانی می‌کند و هیچ پردازش سطحی ندارد.
دیتابیس مرجع = core (core_db/core.db) — دیتابیس اصلی هرگز لمس نمی‌شود.


--------------------------------------------------------------------------------
۱) راه‌اندازی (شروع سرور)
--------------------------------------------------------------------------------

از ریشه‌ی پروژه (TraderBOT):

    node -e "require('./collector/macro/api/server.cjs').start(4000)"

یا با پورت دلخواه:

    node -e "require('./collector/macro/api/server.cjs').start(8080)"

سرور روی 127.0.0.1 و پورت انتخابی (پیش‌فرض 4000) گوش می‌دهد.
اگر دیتابیس core (core_db/core.db) وجود نداشته باشد، باید اول آن را بسازید:

    cd collector/macro/core_db/build
    npm install
    node build_core_db.cjs


--------------------------------------------------------------------------------
۲) فرم پرس‌وجو
--------------------------------------------------------------------------------

دو شکل ورودی پشتیبانی می‌شود:

  1) فرم DSL (پارامتر q):
       ?q=USA:CPI
       ?q=USA:CPI&frequency=Q
       ?q=USA:CPI_YOY:M&from=2019&to=2024

  2) فرم مستقیم موتور (country + indicator):
       ?country=USA&indicator=CPI_YOY&frequency=M&from=2019&to=2024

پارامترهای رایج:
    q            عبارت DSL (فرم یک)
    country      کد کشور (فرم دو)
    indicator    نام اندیکاتور (فرم دو)
    frequency    A | Q | M  (همچنین accept: ANNUAL/YEARLY ← A، QUARTER ← Q، MONTHLY ← M)
    from / to    بازه‌ی زمانی


--------------------------------------------------------------------------------
۳) Endpoint های پرسش‌وپاسخ (Query & Chart)
--------------------------------------------------------------------------------

    GET /macro/query?q=USA:CPI            → خروجی Parser (تجزیه‌ی DSL)
    GET /macro/chart?q=...&frequency=Q    → داده‌ی نمودار (ChartEngine)
    GET /macro/dashboard?q=...            → { card, table, summary }
    GET /macro/card?q=...                 → { card }
    GET /macro/table?q=...                → { table }
    GET /macro/summary?q=...              → { summary }
    GET /macro/full?q=...                 → کل پایپ خط ماکرو
    GET /macro/assistant?q=...            → پاسخ Macro Assistant


--------------------------------------------------------------------------------
۴) Endpoint های متادیتا (Meta)
--------------------------------------------------------------------------------

    GET /macro/meta/health                → { ok: 1, db: "core" }
    GET /macro/meta/countries             → [ ...کد کشورها ]
    GET /macro/meta/indicators            → [ ...نام اندیکاتورها ]
    GET /macro/meta/series?country=USA    → لیست سری‌های کشور (یا همه بدون پارامتر)
    GET /macro/errors                     → { "errors": [ ... ] }  (خطاهای ثبت‌شده)
    GET /macro/errors?source=FRED&limit=50→ فیلتر بر اساس منبع + حداکثر تعداد


--------------------------------------------------------------------------------
۵) نمونه‌ها (پرسش‌وپاسخ)
--------------------------------------------------------------------------------

پس از روشن بودن سرور روی 4000:

    # ۱) تجزیه‌ی فرمول
    curl "http://127.0.0.1:4000/macro/query?q=USA:CPI"

    # ۲) نمودار CPI آمریکا (فصلی)
    curl "http://127.0.0.1:4000/macro/chart?q=USA:CPI&frequency=Q"

    # ۳) کارت + جدول + خلاصه برای یک سری
    curl "http://127.0.0.1:4000/macro/dashboard?q=USA:CPI_YOY:M"

    # ۴) فقط خلاصه
    curl "http://127.0.0.1:4000/macro/summary?q=USA:CPI_YOY:M"

    # ۵) فراخوانی کل پایپ خط ماکرو
    curl "http://127.0.0.1:4000/macro/full?q=USA:CPI"

    # ۶) سلامتی + کشورها + اندیکاتورها
    curl "http://127.0.0.1:4000/macro/meta/health"
    curl "http://127.0.0.1:4000/macro/meta/countries"
    curl "http://127.0.0.1:4000/macro/meta/indicators"

    # ۷) لیست سری‌های یک کشور
    curl "http://127.0.0.1:4000/macro/meta/series?country=USA"


--------------------------------------------------------------------------------
۶) کدهای وضعیت و خطا
--------------------------------------------------------------------------------

    200  موفقیت
    400  پارامتر ناقص/نامعتبر (مثلاً بدون q یا فرمت DSL اشتباه)
    404  مسیر شناخته‌نشده (Not found) یا meta ناموجود
    500  خطای درونی موتور (ChartEngine / QueryExecutor)

خطای رایج:
    Provide "q" (DSL) or "country" + "indicator"
        → باید درخواست با q، یا با country+indicator باشد.


================================================================================