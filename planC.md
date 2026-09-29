🏛️ طبقه بندی جامع منابع داده قابل دریافت (Data Sources Taxonomy)
برای اینکه مطمئن شویم هیچ دادهٔ ارزشمندی را از دست نداده‌ایم، تمام ورودی‌های تأثیرگذار پیش از فاز هوش مصنوعی را در ۶ دامنه‌ی اصلی (Domains) طبقه‌بندی می‌کنیم:

Plaintext
                               ┌──────────────────────────────────────────┐
                               │   DATA INGESTION & PROCESSING PLATFORM   │
                               └────────────────────┬─────────────────────┘
                                                    │
     ┌──────────────────┬───────────────────┼───────────────────┬───────────────────┐
     ▼                  ▼                   ▼                   ▼                   ▼
1. Market Data    2. On-Chain &       3. Social & Trend   4. News & Macro    5. Cross-Market &
  (Spot/Futures)     Whale Tracker       Sentiments          Events            Liquidity (6 Markets)
۱. داده‌های مستقیم بازار (Market Data - Microstructure)
داده‌های استاندارد: Orderbook Depth، Ticker، Candles (1m/1s)، Trades Stream.

داده‌های مشتقات: Open Interest (OI)، Funding Rates (حالی و پیش‌بینی‌شده)، Long/Short Ratios، Liquidation Streams.

۲. داده‌های درون‌شبکه‌ای و رفتار نهنگ‌ها (On-Chain & Whale Intelligence)
رصد کیف پول نهنگ‌ها: تغییرات موجودی (Netflow) کیف‌پول‌های بزرگ روی شبکه‌های مختلف (Ethereum, Solana, Bitcoin, TRON, BSC).

خروج/ورود به صرافی‌ها (Exchange Flows): میزان انتقال استیبل‌کوین‌ها به صرافی‌ها (آمادگی برای خرید) یا خروج کوین‌ها به ولت‌های سرد (انباشت).

ترافیک شبکه و کارمزدها: Gas Tracker، تعداد تراکنش‌های فعال، نرخ سوزانده شدن توکن‌ها، و تغییرات Total Value Locked (TVL) در پروتکل‌های DeFi.

۳. داده‌های ترند، محبوبیت و احساسات (Social & Trend Metrics)
ترندها و سرچ‌ها: Google Trends API (محبوبیت واژگانی مثل BTC, Altcoins, Solana)، میزان جستجوی نام توکن‌ها.

شاخص‌های شبکه‌های اجتماعی:

میزان اشاره (Social Volume) و انگیزش (Social Sentiment) در X/Twitter, Reddit, Telegram.

رصد کانال‌های سیگنال و گروه‌های تلگرامی (با Scraping/Bot API).

Fear & Greed Index و سایر شاخص‌های سنتیمنت آماده.

۴. اخبار، رویدادها و داده‌های ماکرو (News & Macro Events)
اخبار متنی هوشمند: دریافت لحظه‌ای اخبار از Bloomberg, Reuters, CoinDesk, Cointelegraph, CryptoPanther و سورس‌های RSS.

انلاک توکن‌ها (Token Unlocks): تقویم آزادسازی توکن‌ها و فشار فروش احتمالی.

داده‌های ماکرو: تقویم اقتصادی (CPI, FED Rates, NFP, PPI) و نرخ شاخص‌های جهانی (DXY, Yields).

۵. جریان نقدینگی در ۶ بازار اصلی (Cross-Market Liquidity)
پوشش بازارها: کریپتو، فارکس، کامودیتی‌ها (طلا/نفت)، شاخص‌های بورس جهانی (S&P500, Nasdaq)، اوراق قرضه، و بازار مسکن/اعتبارات.

شاخص‌های جریانی: CVD تجمعی، Orderbook Imbalance و Cross-Exchange Spreads.

۶. توکن‌ها و شبکه‌های جدید (New Listings & Memecoins)
DEX/New Pair Launch Tracker: رصد استخرهای جدید نقدینگی در DEXها (Raydium, Uniswap) به محض ایجادتوسط Factory Contracts.

🧩 اصول معماری ماژولار، کپسوله‌شده و Hot-Pluggable
برای دستیابی به هدف شما (امکان افزودن صرافی/منبع جدید بدون قطعی سیستم و قابلیت انتقال هر بخش به سرور مجزا)، کلکتورها طبق اصول زیر طراحی می‌شوند:

Plaintext
collectors/
├── crypto/
│   ├── spot/
│   │   ├── binance/         <── کپسوله‌شده (کانفیگ + تست + سوکت + نرمال‌سازی)
│   │   ├── kucoin/
│   │   └── new_exchange/   <── [Hot-Plug]: اضافه شدن صرافی جدید بدون ریستارت کلکتورهای دیگر
│   │
│   ├── onchain/             <── کپسوله‌شده: رصد ولت‌های نهنگ‌ها و شبکه
│   └── derivatives/
│
├── sentiment/                <── کپسوله‌شده: اخبار، X/Twitter، Google Trends
├── macro/                    <── کپسوله‌شده: تقویم اقتصادی و شاخص‌ها
└── liquidity_6markets/       <── کپسوله‌شده: فارکس، طلا، شاخص‌ها و...
الگوی Plugin-Based (Hot-Swappable Providers):
هر صرافی یا منبع داده فقط یک کلاس/ماژول استاندارد طبق یک Interface مشخص (مثلاً BaseCollector) پیاده‌سازی می‌کند. سیستم اصلی (Orchestrator) به صورت dynamic و بدون نیاز به خاموش شدن، صرافی یا منبع جدید را بارگذاری (require/import) و Start می‌کند.

ارتباط بر پایه Event Bus / Message Broker (مستقل از سرور):
تمام ماژول‌ها داده‌های خود را در قالب Standard Envelope تولید کرده و روی یک Event Bus متمرکز (مانند Redis Pub/Sub, NATS یا RabbitMQ) می‌فرستند.

مزیت: اگر فردا بخواهید بخش sentiment/ یا onchain/ را روی یک سرور مجزای اختصاصی منتقل کنید، نیازی به تغییر یک خط از منطق برنامه نیست؛ فقط همان پوشه روی سرور جدید اجرا شده و پیام‌ها را به همان Message Broker ارسال می‌کند.

عدم وجود وابستگی متقاطع (Zero Cross-Module Dependency):
هیچ کلکتوری به کلکتور دیگر require مستقیم نمی‌زند. تنها راه ارتباطی، Message Bus و سرویس توزیع‌شده است.

🗺️ نقشه راه کلان فاز داده‌ها (Data Layer Master Roadmap)
با ترکیب تمام موارد بالا، نقشه راه لایه افقی داده‌ها به ۴ زیرفاز عملیاتی تقسیم می‌شود:

Plaintext
[زیرفاز ۲.۱: تثبیت داده‌های مستقیم و مشتقات کریپتو]
   │
   ├───> [زیرفاز ۲.۲: موتور نقدینگی ۶ بازار و داده‌های تاریخی ۱ دقیقه‌ای]
   │
   ├───> [زیرفاز ۲.۳: موتور داده‌های On-Chain، رفتار نهنگ‌ها و توکن‌های جدید]
   │
   └───> [زیرفاز ۲.۴: موتور احساسات، اخبار متنی، ترندها و ماکرو]
📌 زیرفاز ۲.۱: تثبیت مشتقات کریپتو و معماری Hot-Plug (گام جاری)
ساخت لایهٔ تعویض‌پذیر صرافی‌ها (Hot-Plug Registry) برای افزودن بدون قطعی.

پیاده‌سازی کلکتور مشتقات کریپتو (OI, Funding Rate, Liquidations, Long/Short Ratio).

ایجاد پوشه collectors/crypto/derivatives/.

📌 زیرفاز ۲.۲: موتور نقدینگی ۶ بازار و تکمیل داده‌های تاریخی
آرشیو کامل کندل‌های ۱ دقیقه‌ای تمام نمادها برای بک‌تست.

پیاده‌سازی کلکتورهای ۵ بازار دیگر (فارکس، طلا/نفت، شاخص‌های بورس، اوراق قرضه، اعتبارات) در collectors/liquidity_6markets/.

محاسبه زنده CVD، Imbalance و Spreads.

📌 زیرفاز ۲.۳: هوش آن‌چین و رصد نهنگ‌ها (On-Chain & Whale Intelligence)
ایجاد پوشه collectors/crypto/onchain/.

رصد تراکنش‌های سنگین کیف پول‌ها (Whale Alert Mechanisms) رو شبکه‌های اصلی.

محاسبه خروج/ورود استیبل‌کوین‌ها به صرافی‌ها و رصد DEX Pairهای تازه ایجاد شده.

📌 زیرفاز ۲.۴: پردازش اخبار، ترندها، سنتیمنت و ماکرو
ایجاد پوشه collectors/sentiment_news/ و collectors/macro/.

دریافت زنده Google Trends، میزان اشاره در شبکه‌های اجتماعی (Social Volume) و RSS اخبار.

ساخت پاک‌ساز متنی برای استخراج کلمات کلیدی و اماده‌سازی جهت Feed به AI.