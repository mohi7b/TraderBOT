================================================================================
                TraderBOT - مستندات بخش REAL TIME (کالکتور زنده)
================================================================================
عنوان سند : معماری موجود بخش ریل‌تایم + فهرست کامل داده‌های دریافتی + طرح تست
نام فایل : collector/crypto/realtime/README.txt
تاریخ بررسی : 2026-09-26
دامنه بررسی : collector/crypto/realtime/**  (به‌همراه وابستگی‌های ورودی و خروجی آن)
روش بررسی : خواندن مستقیم کد (بدون اجرا و بدون هیچ تغییر در کد)
وضعیت کد   : هیچ فایلی از پروژه در این بررسی تغییر داده نشده است (فقط خواندن)
--------------------------------------------------------------------------------
فهرست مطالب
--------------------------------------------------------------------------------
  گام اول  : معماری بخش ریل‌تایم
     1.1  نقشهٔ کلی و نقطهٔ ورود
     1.2  لایه‌بندی سیستم (L1 / L2 / L3)
     1.3  جریان دادهٔ کامل (۹ مرحله)
     1.4  ذخیره‌سازی، state ها و لایهٔ نمایش (API)
     1.5  کلیدهای تنظیمات (Config Matrix)
     1.6  یافته‌ها و ریسک‌های مهم (Blockers)
  گام دوم  : فهرست داده‌هایی که در ریل‌تایم گرفته می‌شود
     A    دادهٔ خام (هر صرافی × هر بازار) - منبع و کانال‌ها
     B    رویدادهای نرمال‌شده (خروجی لایهٔ ۱)
     C    ماژول‌های سیگنال (لایهٔ ۲) + نام رویدادها و فیلدها
     D    داده‌هایی که واقعاً زنده/قابل‌مصرف‌اند (خروجی لایهٔ ۳)
     E    خلاصه: چه داریم / چه نداریم
  گام سوم  : طرح تست (آماده‌به‌اجرا) و موانع
  پیوست ۱  : فهرست کامل فایل‌های بخش ریل‌تایم
  پیوست ۲  : دستورهای بازبینی (تکرارپذیر) که برای این سند اجرا شد
  پیوست ۳  : جدول مرجع سریع (Quick Reference)

نکتهٔ خواندن سند: تمام اعداد و نام فیلدها از کد واقعی استخراج شده‌اند. هرجا رفتار
مشکوک یا باگ بوده، با علامت [BUG] یا [RISK] علامت‌گذاری شده است.
================================================================================

================================================================================
 گام اول: معماری بخش ریل‌تایم
================================================================================

--------------------------------------------------------------------------------
 1.1  نقشهٔ کلی و نقطهٔ ورود
--------------------------------------------------------------------------------
تنها نقطهٔ ورودِ واقعی کل سیستم، فایل زیر است:

    node orchestrator/aanode/bootstrap.cjs

زنجیرهٔ بوت (از بیرون به داخل):

    orchestrator/aanode/bootstrap.cjs
      |
      +-- CONFIG = orchestrator/aanode/config/system.cjs
      |        { mode:"debug", debugVerbose:false,
      |          trees:{ collector:true, analyzer:false, executor:false },
      |          api:{ enabled:true, port:3000 } }
      |
      +-- new Orchestrator()  ->  global.orchestrator
      |      orchestrator/core/orchestrator.cjs
      |        route(packet) -> Worker.handle() -> core/event-router -> core/system-handler
      |
      +-- new HealthMonitor(orchestrator); monitor.start()
      |      orchestrator/utils/health-monitor.cjs
      |      وظایف: global.healthEmit، marketDataQuality، liquidationObserver،
      |             global.debugTrace، global.getMarketStatus، و شمارش پکت بر ثانیه
      |
      +-- dashboardServer.start(CONFIG.api.port || 3000)
      |      orchestrator/api/server.cjs   (HTTP روی 127.0.0.1)
      |
      +-- برای هر نماد  (EXCHANGES.symbols = ["BTCUSDT","ETHUSDT"]):
             collector/aanode/bootstrap.cjs
               CONFIG = collector/aanode/config/collector.cjs
                 { realtime:true, historical:false, macro:false, sentiment:false,
                   sources.liquidity.enabled:true }
               |
               +-- realtime : collector/crypto/realtime/index.cjs  (section API)  <== موضوع این سند
               |     (aanode/bootstrap.cjs همان مسیر، شیم قدیمی برای سازگاری است)
               +-- liquidity : collector/liquidity_6markets
               |     شش بازار روی یک محور؛ برنامه‌اش بر حسب provider/instrument است نه نماد،
               |     پس یک‌بار برای کل پروسه راه می‌افتد (نه یک‌بار به ازای هر نماد) و
               |     حلقهٔ sweep آن تا stop() ادامه دارد
               +-- historical / macro / sentiment : خاموش هستند (enabled:false)

ماتریس فعال‌سازی صرافی‌ها (orchestrator/aanode/config/exchanges.cjs):

    EXCHANGE_ORDER = ["binance","bybit","bitget","kucoin","okx"]
    symbols = ["BTCUSDT","ETHUSDT"]
    ws = { binance:{futures:true,spot:true}, bybit:{...true...}, bitget:{...true...},
           kucoin:{...true...}, okx:{...true...} }

نتیجه‌گیری مهم شمارش جریان‌ها:
    5 صرافی × 2 بازار (spot + futures) × 2 نماد = 20 جریان زندهٔ هم‌زمان

--------------------------------------------------------------------------------
 1.2  لایه‌بندی سیستم (L1 / L2 / L3)
--------------------------------------------------------------------------------
سیستم 97 فایل CJS دارد و در سه لایهٔ مستقل سازمان‌دهی شده است:

  [L1] RAW VENUE ADAPTERS  (عقد اتصال و پارس پیام صرافی‌ها)
  ------------------------------------------------------------------------------
  مسیر : collector/crypto/realtime/venues/<venue>/<market>/ws.cjs
  فایل‌های کمکی:
      collector/crypto/realtime/venues/*/futures/orderbook-sync.cjs
      collector/crypto/realtime/venues/binance/futures/open-interest.cjs   (REST poller)
      collector/crypto/realtime/venues/binance/futures/market-poller.cjs   (REST poller)
  خروجی: پکت خام یکنواخت  { symbol, data:{...} }
  مسئولیت‌ها: اتصال WS، reconnect، heartbeat، نرمال‌سازی سطوح depth
              [{price, qty}]، ساختن packet با createMarketPacket()، کنترل sequence.

  [L2] SIGNAL ENGINES  (محاسبهٔ سیگنال‌های بازار)
  ------------------------------------------------------------------------------
  مسیر : collector/crypto/realtime/spot/<family>/*.cjs   (39 فایل)
          collector/crypto/realtime/futures/<family>/*.cjs (43 فایل + tree.txt)
  خانواده‌ها:
      price/ , depth/ , candles/ , spread/ , liquidity/ , orderflow/ , advanced/
      funding/ , oi/ , mark_price/ , liquidations/
  خروجی: رویدادهای in-memory با نام‌های مشخص (بخش C همین سند = 57 نام رویداد)
  ⚠ توجه: خروجی این لایه در spot فقط نام رویداد را به healthEmit می‌فرستد و
          payload دور ریخته می‌شود؛ در futures هم فقط در آرایهٔ محلی emitted[]
          جمع می‌شود. یعنی سیگنال‌های خامِ L2 عملاً ذخیره نمی‌شوند. (بخش 1.6-3)

  [L3] AGGREGATION + EXPOSURE + STATE  (تجمیع، شاخص، نمایش)
  ------------------------------------------------------------------------------
  مسیر : collector/crypto/realtime/aggregator/*.cjs   (7 فایل)
          collector/crypto/realtime/state/*.cjs       (4 فایل)
          orchestrator/api/server.cjs          (لایهٔ HTTP)
          orchestrator/utils/runtime-status.cjs (تجمیع برای API)
  خروجی: global.marketAggregates / marketVenueState / marketSymbolState /
          marketIndicators / chartSeries / chartDefinitions / marketHealth

  زیرساخت مشترک (collector/crypto/common/*):
      ws-control.cjs              کنترل اتصال و reconnect
      ws-heartbeat.cjs            ping/pong
      market-packet.cjs           اسکیمای پکت پایه (schemaVersion:1)
      canonical-market-packet.cjs نرمال‌سازی اسپات/عمومی
      canonical-futures-packet.cjs نرمال‌سازی فیوچرز + اعتبارسنجی فیلد اجباری
      open-interest-normalizer.cjs نرمال‌سازی OI به oi/oiBase/oiCcy/oiUsd/oiContracts
      cross-venue-depth-aggregator.cjs تجمیع عمق چند صرافی روی tickSize
      market-data-quality.cjs     گیت پذیرش + دِدوپ + تازگی (freshness)
      liquidation-observer.cjs    رصد لیکوئیدیشن‌ها
      source-health.cjs ، depth-book-sync.cjs ، depth-utils.cjs ،
      exchange-map.cjs ، symbol-map.cjs ، price-utils.cjs ، range-utils.cjs ،
      collector-utils.cjs ، fundamental-event.cjs ، market-packet.cjs

--------------------------------------------------------------------------------
 1.3  جریان دادهٔ کامل (۹ مرحله)
--------------------------------------------------------------------------------
  1) صرافی (WS یا REST) >>> collector/crypto/realtime/venues/*/*/ws.cjs
     پیام خام پارس می‌شود و با createMarketPacket() به پکت یکنواخت تبدیل می‌شود.

  2) >>> handler مرکزی :
        collector/crypto/realtime/aanode/spot-handler.cjs      (اسپات)
        collector/crypto/realtime/aanode/futures-handler.cjs   (فیوچرز)
     نرمال‌سازی: normalizeDepthLevels() روی bids/asks
     (پذیرش هر سه شکل: [price,qty] / {price,qty} / {price:qty}).

  3) استنتاج نوع رویداد (فقط در spot-handler) :
        bids&&asks      -> "depth"
        open&&close     -> "candle"
        qty&&side       -> "trade"
        price           -> "price"
        در غیر این صورت -> "unknown"
     در futures نوع از خود پکت می‌آید (type/event) و به canonical تبدیل می‌شود.

  4) گیت کیفیت/دِدوپلیکیشن :
        collector/crypto/common/market-data-quality.cjs  ->  accept(packet)
        fingerprint = [type, timestamp, tradeId|id, seqId|updateId|seq,
                       price, qty, rate, oi]  ؛ اگر عین همین قبلاً دیده شده بود
                       پکت کامل دور ریخته می‌شود (return).

  5) تجمیع (قلب سیستم) :
        collector/crypto/realtime/aggregator/market-aggregation-service.cjs  ingest()
          +- createCanonicalMarketPacket(input)
          +- RealtimeExchangeAggregator.ingest()   -> state هر venue (20 آیتم)
          +- VenueStateStore.upsert()              -> global.marketVenueState
          +- RealtimeSymbolAggregator.aggregate()  -> spot/futures/crossMarket
          +- SymbolStateStore.upsert()             -> global.marketSymbolState
          +- MarketIndicatorService.ingest()       -> global.marketIndicators
          +- ChartDataService.ingest()             -> global.chartSeries (1s نمونه)
          +- return { packet, aggregate, indicators, chart }

  6) سلامت و ابزار دیباگ :
        global.healthEmit({event,...})  ->  health-monitor
          +- شمارش packetsPerSecond
          +- marketDataQuality.record()  (برای lastReceivedAt/ageMs/status)
          +- liquidationObserver.observe()
          +- global.debugTrace(...)  (200 رویداد آخر در حافظه)

  7) اجرای ماژول‌های L2 بر اساس شرط‌های handler :
        data.price              -> price, price_delta, price_speed, price_trend,
                                   price_volatility (و در اسپات tick_impact)
        data.bids && data.asks  -> depth_100, depth_20/medium, depth_full,
                                   depth_delta, depth_imbalance, depth_pressure,
                                   depth_aggregator (+ liquidity* در اسپات،
                                   + cross-venue depth در فیوچرز)
        data.open && data.close -> candles, candles_aggregator, candles_multi_tf
        data.qty && data.side   -> (اسپات) orderflow, micro_trades, big_trades,
                                   imbalance, pressure, orderflow_aggregator,
                                   volume_profile
        data.type==="funding"       -> funding, funding_aggregator, funding_delta,
                                       funding_pressure, funding_trend
        data.type==="liquidation"   -> liquidation, liquidation_clusters,
                                       liquidation_pressure, liquidation_aggregator,
                                       liquidation_delta, liquidation_trend
        data.type==="mark_price"    -> mark_price, mark_price_delta,
                                       mark_price_trend, mark_price_volatility
        data.oi                     -> oi, oi_aggregator, oi_delta, oi_pressure,
                                       oi_trend, oi_volatility

  8) مسیر رویداد به ارکستریتور :
        spot-handler:  packet = { symbol, stage:1, data, emit() }
                       global.orchestrator.route(packet)
        futures-handler: emit(event) -> emitted.push(event) + global.healthEmit
        سپس: system-handler (orchestrator/core/system-handler.cjs)
             stageMap: 1,2,3 => "collector" | 4..9 => "analyzer" | 10..13 => "executor"
             چون trees.analyzer=false است، زنجیره در stage 4 متوقف می‌شود.

  9) هشدار مسیر 8 :
        collector/aanode/handler.cjs  هر پکت را با packet.stage++ دوباره
        route() می‌کند ⇒ هر رویداد 3 بار از system-handler عبور می‌کند و
        در این فایل یک console.log بی‌قید روی هر پکت اجرا می‌شود.   [RISK]

--------------------------------------------------------------------------------
 1.4  ذخیره‌سازی، state ها و لایهٔ نمایش (API)
--------------------------------------------------------------------------------
حقیقت مهم: کل ریل‌تایم IN-MEMORY است و هیچ DB/فایلی برای آن نوشته نمی‌شود.

  بازبینی انجام‌شده (grep روی better-sqlite3 | createWriteStream | fs.writeFile
  در مسیرهای collector/crypto/realtime ، collector/crypto/common ، collector/aanode ،
  orchestrator) تنها یک نتیجه داشت:
      orchestrator/utils/state-manager.cjs
  و این کلاس هم هیچ مصرف‌کننده‌ای ندارد (grep روی StateManager|stateManager.save|
  load|backup فقط خودِ فایل را برگرداند) ⇒ storage/state.json هرگز ساخته نمی‌شود.
  ⇒ برای چارت کندلی، تاریخچه باید از بخش historical (پورت 4000) بیاید و این
    بخش فقط تیک زندهٔ «از لحظهٔ اجرا به بعد» را در اختیار می‌گذارد.

چهار State Store (collector/crypto/realtime/state/) :

  1) rolling-window-store.cjs
       push(value, ts) / prune(now) / between(windowMs, now) / snapshot() / clear()
       استفاده‌ها: بازهٔ 60 ثانیه‌ای تریدها، بازهٔ 15 دقیقه‌ای قیمتِ technical.

  2) venue-state-store.cjs
       کلید = `${exchange}:${market}:${symbol}`  (upsert / get / values / clear)

  3) symbol-state-store.cjs
       upsert(symbol, patch) / get / values / clear

  4) fundamental-state-store.cjs
       maxEvents=2000 ، ingest() با چک تکراری بر اساس event.id ،
       active(now) با احترام به expiresAt ، values({type,horizon,symbol,region})

Registries روی global (همه فقط در حافظه) :
      global.marketAggregates        Map : symbol -> aggregate
      global.marketVenueState        VenueStateStore
      global.marketSymbolState       SymbolStateStore
      global.marketIndicators        Map : symbol -> indicators
      global.chartSeries             Map : symbol -> 5 سری زمانی
      global.chartDefinitions        CHARTS (از orchestrator/aanode/config/charts.cjs)
      global.fundamentalAggregates   Map
      global.marketHealth / global.liquidationHealth   آرایه‌های snapshot
      global.debugState / global.debugTrace

لایهٔ HTTP فعلی (orchestrator/api/server.cjs) - فقط Pull ، بدون WebSocket :

      GET /api/status/:symbol
            -> orchestrator/utils/runtime-status.cjs  getMarketStatus(symbol)
               { generatedAt, aggregate, indicators, charts, chartDefinitions,
                 fundamentals, marketHealth, liquidation }
      GET /api/charts/:symbol
            -> { symbol, definitions, charts }   (charts از global.chartSeries)
      GET /api/health
            -> { marketHealth, liquidation }
      سایر مسیرها -> سرو فایل‌های static از orchestrator/public
            (index.html, dashboard.js, styles.css)
  2.4  سرورِ مستقلِ بخشِ ری‌تایم (collector/crypto/realtime/server.cjs) — جدید :
       بدون وابستگی (فقط node:http) و تنها جایی که بخش به سوکت گوش می‌دهد :

         node collector/crypto/realtime/server.cjs [--port 4100] [--host 127.0.0.1] \
              [--markets spot,futures] [--exchanges binance,bybit] [BTCUSDT ETHUSDT]

       مسیرها :
         GET    /                    فهرست مسیرها + status
         GET    /health              realtime.status()
         GET    /state/:symbol       realtime.getState()  (هیچ جریانی استارت نمی‌شود)
         GET    /request/:symbol     realtime.request(symbol, {markets, exchanges})
         POST   /request/:symbol     همان (force=true برای ری‌استارت)
         GET    /release/:symbol     realtime.release(symbol)
         DELETE /release/:symbol     همان
         GET    /stream/:symbol      SSE ؛ دُم ۲۰ رویداد آخر + throttle از
                                     config.sseThrottleMs و heartbeat هر ۱۵s

       نکته : L1 اسپات هندلِ stop نمی‌دهد (venue-adapters/wrappers.cjs) ⇒ سوکت‌ها
       پس از release بسته نمی‌شوند ؛ بنابراین SIGINT/SIGTERM سرور را می‌بندد و
       پروسه با process.exit(0) خارج می‌شود (نه با انتظار برای drain سوکت‌ها).



پیکربندی سری‌های چارت (collector/crypto/realtime/aggregator/chart-data-service.cjs) :
      sampleMs=1000 ، maxPoints=900 ، depthBuckets=[5,25]
      پنج سری: price | volumeFlow | basis | fundingOi | liquidity

--------------------------------------------------------------------------------
 1.5  کلیدهای تنظیمات (Config Matrix)
--------------------------------------------------------------------------------
 فایل                                      مقدار فعلی                     اثر
 --------------------------------------------------------------------------------
 orchestrator/aanode/config/system.cjs      mode:"debug"                   ترِیس/داشبورد
                                            debugVerbose:false             بدون چاپ پکت خام
                                            trees.collector:true           اجرای کالکتور
                                            trees.analyzer/executor:false  توقف در stage 4
                                            api.port:3000                  [RISK] تضاد با Next
 orchestrator/aanode/config/exchanges.cjs   symbols:[BTCUSDT,ETHUSDT]      2 نماد
                                            5 صرافی × (futures+spot)=true  20 جریان
 collector/aanode/config/collector.cjs      realtime:true                  تنها منبع فعال
                                            historical/macro/sentiment:false
 orchestrator/aanode/config/charts.cjs      CHARTS                         تعریف چارت داشبورد
 collector/crypto/realtime/config/realtime.cjs     markets:[spot,futures]         منبعِ واحدِ بخشِ ری‌تایم
                                            server:{host,port}             سرورِ مستقل (۲.۴)
                                            sampleMs/maxPoints/signalHistoryMs
 collector/crypto/realtime/config/exchanges.cjs    EXCHANGE_ORDER + ws[...]       تنها مرجعِ فعال/غیرفعال بودن صرافی/بازار

 [DONE] فایل مردهٔ collector/crypto/realtime/aanode/config/realtime.cjs حذف شد :
        grep روی کل مخزن ⇒ هیچ require نداشت و محتوایش («همه false جز
        kucoin.futures») با config/exchanges.cjs در تضاد بود ⇒ گمراه‌کننده.
        اکنون collector/crypto/realtime/config/exchanges.cjs تنها مرجع است و
        orchestrator/aanode/config/exchanges.cjs همان را re-export می‌کند.

 [DONE] collector/aanode/config/collector.cjs دیگر types/exchanges را هاردکد
        نمی‌کند ؛ از REALTIME.markets و EXCHANGES.EXCHANGE_ORDER می‌خواند ⇒
        «پلنِ کالکتور» و «جریان‌هایی که سرویس ری‌تایم استارت می‌زند» از هم
        جدا نمی‌افتند (منبع واحد).

--------------------------------------------------------------------------------
 1.6  یافته‌ها و ریسک‌های مهم (Blockers) - اینها برای تست و اتصال به چارت حیاتی‌اند
--------------------------------------------------------------------------------
[RISK-1] تضاد پورت 3000 بین API آنود و Next.js
        orchestrator/aanode/config/system.cjs => api.port:3000
        در حال حاضر (زمان بررسی) : http://127.0.0.1:3000  => 307 (Next dev)  و
                                    http://127.0.0.1:4000/health => 200 (historical API)
        هیچ پروسهٔ ریل‌تایمی در حال اجرا نیست.
        اگر bootstrap اجرا شود، server.listen(3000) خطای EADDRINUSE می‌دهد و
        چون در orchestrator/api/server.cjs هندلر error ثبت نشده، احتمال
        کرش کامل پروسه وجود دارد. ⇒ قبل از تست باید یکی از این دو کار شود:
        (الف) Next موقتاً خاموش شود، یا (ب) پورت api در system.cjs عوض شود.

[RISK-2] تکثیر پکت و لاگ بی‌قید
        collector/aanode/handler.cjs :
            packet.stage++;
            global.orchestrator.route(packet);
            console.log("CollectorHandler → Packet received", packet);
        ⇒ هر رویداد 3 بار از system-handler می‌گذرد (stage 1,2,3 = collector)
          و برای هر عبور، کل پکت روی stdout چاپ می‌شود.
          با 20 جریان زنده، این یعنی بار CPU و حجم لاگِ بالا.

[RISK-3] سیگنال‌های لایهٔ L2 عملاً ذخیره نمی‌شوند
        در spot-handler : packet.emit(obj) فقط event?.event را به healthEmit
        می‌فرستد ⇒ فیلدهای محاسبه‌شده (speed/delta/pressure/imbalance/heatmap/
        volume_profile/market_maker_activity) دور ریخته می‌شوند.
        در futures-handler : emit(event) => emitted.push(event) ؛ فقط در یک
        آرایهٔ محلی و در return تابع؛ هیچ مصرف‌کنندهٔ بیرونی ندارد.
        ⇒ دادهٔ پایدارِ قابل‌اتکا همان خروجی‌های لایهٔ L3 (بخش D) است.

[BUG-4] state مشترک بین نمادها در چند ماژول module-scope
        collector/crypto/realtime/futures/candles/candles_multi_tf.cjs :
            const frames = { "1m": [], "5m": [], "15m": [], "1h": [] };
        این آرایه‌ها بر اساس symbol کلید نخورده‌اند ⇒ کندل BTC و ETH قاطی می‌شود.
        همچنین collector/crypto/realtime/futures/price/price_speed.cjs (و مشابه‌های
        delta/trend) از let last / let lastTs در سطح ماژول استفاده می‌کنند ⇒
        با دو نماد، محاسبهٔ سرعت/دلتا اشتباه می‌شود.
        (نسخهٔ اسپات درست است: buckets[symbol][tf] و last[symbol])

[RISK-5] پایداری داده صفر است
        هیچ جایی دادهٔ ریل‌تایم persist نمی‌شود ⇒ بعد از restart، تمام
        global.chartSeries و global.marketAggregates خالی می‌شوند.
        معماری پیشنهادی برای چارت کندلی :
            تاریخچه  <==  collector/crypto/historical (پورت 4000)
            تیک زنده <==  همین بخش ریل‌تایم (از لحظهٔ اجرا)

[RISK-6] نبود version control
        git در این دایرکتوری مقدار "fatal: not a git repository" می‌دهد ⇒
        هیچ بازگردانی/تاریخچه‌ای وجود ندارد و هر تغییر باید با نسخه‌پشتیبان
        دستی یا patch قابل‌عقب‌گردی انجام شود.

[RISK-7] پوشش ناقص لیکوئیدیشن
        orchestrator/utils/health-monitor.cjs :
            capabilities = { binance:true, bybit:true, bitget:true,
                             kucoin:false, okx:false }
        و در عمل هم فقط binance (forceOrder)، bybit (tickers/streams) و
        bitget (channel liquidation) رویداد liquidation تولید می‌کنند.

[NOTE-8] نبود تست خودکار برای این بخش
        پوشهٔ test/ فقط این‌ها را دارد:
            chart-data-service.test.cjs
            fundamental-aggregation.test.cjs
            futures-seven-step-exchanges.test.cjs
            market-aggregation.test.cjs
            market-indicator-service.test.cjs
            spot-five-exchanges.test.cjs
        و بقیهٔ (depth/orderflow/liquidations/…) تست ندارند.


================================================================================
 گام دوم: فهرست داده‌هایی که در بخش ریل‌تایم گرفته می‌شود
================================================================================
این بخش در پنج سطح داده را فهرست می‌کند:
    A) دادهٔ خام ورودی از هر صرافی و هر بازار (کانال‌ها و آدرس‌ها)
    B) رویدادهای نرمال‌شدهٔ لایهٔ ۱ (خروجی یکنواخت)
    C) سیگنال‌های لایهٔ ۲ (ماژول‌ها + نام رویداد + فیلدها)
    D) داده‌هایی که واقعاً زنده و قابل‌مصرف‌اند (خروجی لایهٔ ۳ = آنچه به چارت وصل می‌شود)
    E) خلاصه: چه داریم / چه نداریم

--------------------------------------------------------------------------------
 A)  دادهٔ خام (هر صرافی × هر بازار) - 20 جریان
--------------------------------------------------------------------------------
خلاصهٔ شمارش: 5 صرافی × 2 بازار × 2 نماد (BTCUSDT, ETHUSDT) = 20 اتصال هم‌زمان

ماتریس پوشش (✓ دارد / - ندارد / R یعنی از طریق REST):
 ------------------------------------------------------------------------------------
 صرافی / بازار        trade  depth  candle  mark_price  funding  oi       liquidation
 ------------------------------------------------------------------------------------
 binance / spot         ✓      ✓      ✓        -          -      -           -
 binance / futures      ✓      ✓      ✓        ✓          ✓     ✓ (R)       ✓ forceOrder
 bybit   / spot         ✓      ✓      ✓        -          -      -           -
 bybit   / futures      ✓      ✓      ✓        ✓          ✓     ✓           ✓
 bitget  / spot         ✓      ✓      ✓        -          -      -           -
 bitget  / futures      ✓      ✓      ✓        ✓          ✓     ✓           ✓
 kucoin  / spot         ✓      ✓      ✓        -          -      -           -
 kucoin  / futures      ✓      ✓      ✓        ✓          ✓     ✓ (R)       -
 okx     / spot         ✓      ✓      ✓ (R)    -          -      -           -
 okx     / futures      ✓      ✓      ✓        ✓          ✓     ✓           -
 ------------------------------------------------------------------------------------

جزئیات کانال‌ها و آدرس‌ها (استخراج‌شده از کد) :

  [1] Binance / Spot        collector/crypto/realtime/venues/binance/spot/ws.cjs
      URL : wss://stream.binance.com:9443/stream?streams=
            <sym>@trade / <sym>@depth20@100ms / <sym>@kline_1m
      داده: ترید (price,qty,side,timestamp)، عمق 20 سطح با 100ms، کندل 1m (OHLCV)

  [2] Binance / Futures     ws.cjs + orderbook-sync.cjs + open-interest.cjs
                            + market-poller.cjs
      URL : wss://fstream.binance.com/stream?streams=
            <sym>@depth20@100ms / <sym>@depth@100ms / <sym>@trade /
            <sym>@markPrice@1s / <sym>@forceOrder / <sym>@kline_1m
      REST-SYNC(یک‌بار) : fapi/v1/depth?limit=1000  (تا 1000 سطح + lastUpdateId)
      REST-POLL(5s)     : fapi/v1/openInterest  => openInterest, oiBase, oiUsd
                          fapi/v1/premiumIndex  => markPrice, indexPrice,
                                                   lastFundingRate, nextFundingTime
                          fapi/v1/klines 1m/1   => closeTime, isClosed
      داده: mark_price، funding، oi، لیکوئیدیشن (forceOrder)، عمق کامل، ترید، کندل

  [3] Bybit / Spot          collector/crypto/realtime/venues/bybit/spot/ws.cjs
      URL : wss://stream.bybit.com/v5/public/spot
      اشتراک: publicTrade.<sym>, orderbook.50.<sym>, kline.1.<sym>

  [4] Bybit / Futures       collector/crypto/realtime/venues/bybit/futures/ws.cjs
                            (+ orderbook-sync.cjs)
      URL : wss://stream.bybit.com/v5/public/linear
      اشتراک: orderbook.50.<sym>, publicTrade.<sym>, tickers.<sym>, kline.1.<sym>
      REST-SYNC : v5/market/orderbook?limit=200  و  v5/market/kline 1m limit=1
      داده: از tickers => markPrice، fundingRate، openInterest، openInterestValue
            (openInterestValue مستقیماً oiUsd را می‌دهد)
            به‌علاوه عمق، ترید، کندل، لیکوئیدیشن

  [5] Bitget / Spot         collector/crypto/realtime/venues/bitget/spot/ws.cjs
      URL : wss://ws.bitget.com/v2/ws/public
      اشتراک: { instType:"SPOT", channel:"trade"|"books"|"candle1m", instId:<sym> }

  [6] Bitget / Futures      collector/crypto/realtime/venues/bitget/futures/ws.cjs
      URL : wss://ws.bitget.com/v2/ws/public
      اشتراک: { instType:"USDT-FUTURES",
                channel:"books"|"trade"|"ticker"|"liquidation", instId:<sym> }
      داده: ticker => mark_price + funding + oi (همراه با price)،
            liquidation => سفارش لیکوئیدشده، books => عمق (depth_full + sequence)

  [7] KuCoin / Spot         collector/crypto/realtime/venues/kucoin/spot/ws.cjs
      Host : api.kucoin.com  (WebSocket v2 ، با token و connectId)
      اشتراک: /market/ticker:<sym>
              /market/match:<sym>                  (تریدها)
              /spotMarket/level2Depth50:<sym>      (عمق 50 سطح)
              /market/candles:<sym>_1min           (کندل 1m)

  [8] KuCoin / Futures      collector/crypto/realtime/venues/kucoin/futures/ws.cjs
                            (+ orderbook-sync.cjs)
      اشتراک: /contractMarket/level2:<sym>, /contractMarket/ticker:<sym>,
              /contractMarket/execution:<sym>   (تریدها)
      REST-SYNC : api-futures.kucoin.com/api/v1/level2/depth20
      REST-POLL : api-futures.kucoin.com/api/v1/kline/query?granularity=1
                  + contract info => markPrice, fundingFeeRate, openInterest
                    (oiUsd = oi × multiplier × markPrice)
      توجه : لیکوئیدیشن ندارد (kucoin در capability ها false است)

  [9] OKX / Spot            collector/crypto/realtime/venues/okx/spot/ws.cjs
      URL : wss://ws.okx.com:8443/ws/v5/public
      اشتراک: tickers, books, trades
      نکته: کندل اسپات از WS نمی‌آید؛ با polling از REST گرفته می‌شود:
            www.okx.com/api/v5/market/candles?bar=1m&limit=1

  [10] OKX / Futures        collector/crypto/realtime/venues/okx/futures/ws.cjs
      URL : wss://ws.okx.com:8443/ws/v5/public
      اشتراک: books, trades, tickers, candle1m
      داده: tickers => mark/funding/oi ، candle1m => کندل 1m
      توجه: لیکوئیدیشن ندارد (okx در capability ها false است)

--------------------------------------------------------------------------------
 B)  رویدادهای نرمال‌شدهٔ لایهٔ ۱ (اسکیمای یکنواخت)
--------------------------------------------------------------------------------
دو اسکیما وجود دارد:

  (ب-۱) پکت مارکت عمومی - collector/crypto/common/market-packet.cjs
        schemaVersion: 1
        {
          schemaVersion : 1,
          exchange      : "binance" | "bybit" | "bitget" | "kucoin" | "okx",
          market        : "spot" | "futures",
          symbol        : "BTCUSDT" | "ETHUSDT",
          eventType     : (نام رویداد ، جدول پایین),
          source        : "websocket" | "rest",
          timestamp     : ms (زمان صرافی)،
          receiveTimestamp : ms (زمان دریافت محلی)،
          sequence      : شماره ترتیب یا null,
          payload       : { ...داده خام }
        }
        و در مسیر canonical (canonical-market-packet.cjs) این فیلدها به payload
        اضافه/نرمال می‌شوند:
            price, qty, side, open, high, low, close, volume,
            rate, oi, oiContracts, oiBase, oiUsd,
            bids:[[price,qty],...], asks:[[price,qty],...]
        به‌همراه دو فیلد سطح بالا : sourceSymbol ، sequenceStatus

  (ب-۲) پکت فیوچرز - collector/crypto/common/canonical-futures-packet.cjs
        {
          exchange, market, symbol, sourceSymbol,
          type, event, depthType, source,
          exchangeTimestamp, receiveTimestamp, timestamp,
          sequence, sequenceStatus,
          bids, asks, payload,
          valid   (boolean : همهٔ REQUIRED_FIELDS غیر null باشند)
        }
        REQUIRED_FIELDS = [ "exchange", "market", "symbol", "type", "timestamp" ]

انواع رویداد (eventType / type) که آداپتورهای L1 تولید می‌کنند:
      price                   تغییر قیمت از ticker (bitget/okx/kucoin)
      trade                   ترید
      candle                  کندل (عمدتاً 1m)
      mark_price              قیمت مارک (binance, bybit, bitget, kucoin, okx)
      funding                 نرخ فاندینگ
      oi                      اوپن اینترست
      liquidation             لیکوئیدیشن
      depth_partial           عمق snapshot محدود (20/50 سطح)
      depth_full_snapshot     عکس کامل دفتر (بعد از REST-SYNC)
      depth_full_diff         دلتای دفتر (بعد از sync)
      subscribe / ping        پیام‌های کنترل (دور ریخته می‌شوند)

فیلدهای تکمیلی که فقط در بعضی صرافی‌ها پر می‌شوند:
      sequenceStatus : "ok" | ... برای کنترل هم‌ترتیبی depth (binance/kucoin/bybit)
      depthType      : snapshot | diff
      oiContracts / oiBase / oiUsd : برای یکنواخت‌سازی OI
توجه: نرمال‌سازی OI در collector/crypto/common/open-interest-normalizer.cjs انجام
      می‌شود و خروجی آن همیشه oi / oiBase / oiCcy / oiUsd / oiContracts است.

--------------------------------------------------------------------------------
 C)  سیگنال‌های لایهٔ ۲ (ماژول‌ها + شرط اجرا + نام رویداد)
--------------------------------------------------------------------------------
ساختار مشترک همهٔ ماژول‌های L2:
    module.exports = function (packet) { ... }
    خروجی را با packet.emit({ event:"<نام>", ...fields }) اعلام می‌کنند.
    در اسپات packet.emit فقط نام رویداد را به healthEmit می‌دهد (payload دور ریخته
    می‌شود) و در فیوچرز رویداد در آرایهٔ محلی emitted[] جمع می‌شود. (بخش 1.6-3)

  C-1)  بازار اسپات - 39 فایل ، ماژول‌های فراخوانی‌شده از spot-handler.cjs

  شرط اجرا                     ماژول‌ها (نام فایل = نام رویداد به‌جز موارد ذکرشده)
  ------------------------------------------------------------------------------
  data.price                   price ، price_delta ، price_speed ، price_trend ،
                               price_volatility
                               + tick_impact  (advanced)
  data.bids && data.asks        depth_20 ، depth_100 ، depth_full ، depth_delta ،
                                depth_imbalance ، depth_pressure ، depth_aggregator
                               + liquidity ، liquidity_heatmap ، liquidity_delta ،
                                 liquidity_pressure
  data.open && data.close       candles ، candles_aggregator ، candles_multi_tf
  data.qty && data.side         orderflow ، micro_trades ، big_trades ، imbalance ،
                                pressure ، orderflow_aggregator
                               + volume_profile  (advanced)
  data.bids && data.asks
    && data.qty                 market_maker_activity  (advanced)
  ------------------------------------------------------------------------------

  ⚠ یافتهٔ مهم (کدِ مرده): در خانوادهٔ depth این فایل‌ها هرگز اجرا نمی‌شوند:
        spot/depth/depth_router.cjs
        spot/depth/depth_engine.cjs
        spot/depth/depth_history.cjs
        spot/depth/dynamic_grid.cjs
        spot/depth/master_grid.cjs
        spot/depth/liquidity_score.cjs
        spot/depth/ticksize.cjs
     و همین ۷ فایل در فیوچرز هم عیناً مرده‌اند (جمعاً 14 فایل).
     دلیل: زنجیرهٔ require این است:
        depth_engine.cjs -> { dynamic_grid, master_grid, depth_history,
                              liquidity_score, ticksize }
        depth_router.cjs -> depth_engine
        و depth_router خودش هیچ‌جا require نمی‌شود (grep صفر نتیجه).
     یعنی «موتور عمق» و «گرید پویا/مستر گرید» نوشته شده ولی به مدار اجرا
     وصل نشده است. اگر انتظار دارید heatmap/grid داده بدهد، فعلاً داده‌ای
     تولید نمی‌شود.                                                       [BUG]

  ⚠ یافتهٔ دوم (require بی‌استفاده): خانوادهٔ spread در بالای spot-handler
     require شده است (خطوط 37..40) ولی در بدنهٔ تابع هیچ‌جا فراخوانی نمی‌شود:
        spot/spread/spread.cjs            => event "spread"           اجرا نمی‌شود
        spot/spread/spread_delta.cjs      => event "spread_delta"     اجرا نمی‌شود
        spot/spread/spread_trend.cjs      => event "spread_trend"     اجرا نمی‌شود
        spot/spread/spread_pressure.cjs   => event "spread_pressure"  اجرا نمی‌شود
     (grep روی 'spread(' و 'spreadDelta(' در handler ⇒ صفر مورد)       [BUG]
     ⇒ اسپرد در ریل‌تایم محاسبه نمی‌شود؛ فقط market-indicator-service
       به‌صورت مستقل spreadBps را از bestBid/bestAsk می‌سازد (در L3).

  نام دقیق رویدادهای اسپات (استخراج‌شده با grep روی event:"..."):
        ماژول                       رویداد ارسالی
        ---------------------------  ----------------------
        price.cjs                    price
        price_delta.cjs              price_delta
        price_speed.cjs              price_speed
        price_trend.cjs              price_trend
        price_volatility.cjs         price_volatility
        depth_20.cjs                 depth_20
        depth_100.cjs                depth_100
        depth_full.cjs               depth_full
        depth_delta.cjs              depth_delta
        depth_imbalance.cjs          depth_imbalance
        depth_pressure.cjs           depth_pressure
        depth_aggregator.cjs         depth_aggregator
        liquidity.cjs                liquidity
        liquidity_heatmap.cjs        liquidity_heatmap
        liquidity_delta.cjs          liquidity_delta
        liquidity_pressure.cjs       liquidity_pressure
        candles.cjs                  candle            (مفرد!)
        candles_aggregator.cjs       candle_aggregator (مفرد!)
        candles_multi_tf.cjs         candle_multi_tf   (مفرد!)
        orderflow.cjs                orderflow
        micro_trades.cjs             micro_trades
        big_trades.cjs               big_trades
        imbalance.cjs                orderflow_imbalance
        pressure.cjs                 orderflow_pressure
        orderflow_aggregator.cjs     orderflow_aggregator
        volume_profile.cjs           volume_profile
        tick_impact.cjs              tick_impact
        market_maker_activity.cjs    market_maker_activity
        ---------------------------  ----------------------
        جمع: 28 رویدادِ اجراشدنی در اسپات + 4 رویداد spread که اجرا نمی‌شود
        (5 قیمت + 7 عمق + 3 کندل + 4 لیکوییدیتی + 6 اوردر‌فلو + 3 advanced)

  C-2)  بازار فیوچرز - 43 فایل ، ماژول‌های فراخوانی‌شده از futures-handler.cjs

  شرط اجرا در futures-handler        ماژول‌ها
  ------------------------------------------------------------------------------
  data.price
      + emitHealth("price")          price ، price_delta ، price_speed ،
                                     price_trend ، price_volatility
  data.bids && data.asks
      + emitHealth("depth")          depth_100 ، depth_medium ، depth_full ،
                                     depth_delta ، depth_imbalance ،
                                     depth_pressure ، depth_aggregator
      + اگر data.type یکی از
        depth_full_diff |
        depth_full_snapshot |
        depth_full باشد             crossVenueDepth.update(canonicalPacket)
                                     و در صورت نتیجه => emitHealth("depth_cross_venue")
  data.open && data.close
      + emitHealth("candles")        candles ، candles_aggregator ، candles_multi_tf
  data.type === "funding"
      + emitHealth("funding")        funding ، funding_aggregator ، funding_delta ،
                                     funding_pressure ، funding_trend
  data.type === "liquidation"
      + emitHealth("liquidation")    liquidation ، liquidation_clusters ،
                                     liquidation_pressure ، liquidation_aggregator ،
                                     liquidation_delta ، liquidation_trend
  data.type === "mark_price"
      + emitHealth("markPrice")      mark_price ، mark_price_delta ،
                                     mark_price_trend ، mark_price_volatility
  data.oi
      + emitHealth("oi")             oi ، oi_aggregator ، oi_delta ، oi_pressure ،
                                     oi_trend ، oi_volatility
  ------------------------------------------------------------------------------

  نام دقیق رویدادهای فیوچرز (مقدار event در emit):
        price.cjs                     price
        price_delta.cjs               price_delta
        price_speed.cjs               price_speed
        price_trend.cjs               price_trend
        price_volatility.cjs          price_volatility
        depth_100.cjs                 depth_100
        depth_medium.cjs              depth_medium
        depth_full.cjs                depth_full
        depth_delta.cjs               depth_delta
        depth_imbalance.cjs           depth_imbalance
        depth_pressure.cjs            depth_pressure
        depth_aggregator.cjs          depth_aggregated      (نه depth_aggregator)
        candles.cjs                   candle                (مفرد)
        candles_aggregator.cjs        candles_aggregated
        candles_multi_tf.cjs          candles_multi_tf
        funding.cjs                   funding
        funding_delta.cjs             funding_delta
        funding_aggregator.cjs        funding_aggregated
        funding_pressure.cjs          funding_pressure
        funding_trend.cjs             funding_trend
        liquidation.cjs               liquidation
        liquidation_delta.cjs         liquidation_delta
        liquidation_clusters.cjs      liquidation_clusters
        liquidation_trend.cjs         liquidation_trend
        liquidation_aggregator.cjs    liquidation_aggregated
        liquidation_pressure.cjs      liquidation_pressure
        mark_price.cjs                mark_price
        mark_price_delta.cjs          mark_price_delta
        mark_price_trend.cjs          mark_price_trend
        mark_price_volatility.cjs     mark_price_volatility
        oi.cjs                        oi
        oi_delta.cjs                  oi_delta
        oi_aggregator.cjs             oi_aggregated
        oi_trend.cjs                  oi_trend
        oi_pressure.cjs               oi_pressure
        oi_volatility.cjs             oi_volatility
        + رویداد شرطی depth_cross_venue (از CrossVenueDepthAggregator)

  جمع: 36 رویدادِ اجراشدنی در فیوچرز (+1 رویداد شرطی cross-venue).
  ⚠ همان 7 فایل مردهٔ depth در اسپات، در فیوچرز هم مرده‌اند (بخش C-1).

  نکتهٔ پوشش منبع رویداد (mark_price / funding / oi) :
     این سه خانواده فقط زمانی اجرا می‌شوند که data.type دقیقاً برابر
     "mark_price" / "funding" / "oi" باشد، و مقدار data.oi برای خانوادهٔ oi
     باید truthy باشد. با grep تأیید شد که این رویدادها از این مسیرها می‌آیند:
        binance futures : @markPrice@1s (mark_price) ، premiumIndex (funding)
                          و open-interest.cjs R​EST (oi)
        bitget  futures : کانال ticker (mark_price ، funding ، oi)
        bybit   futures : tickers.<sym> (mark_price ، funding ، oi)
        kucoin  futures : REST poll (mark_price ، funding ، oi)
        okx     futures : REST/WS (funding ، mark_price ، oi)

--------------------------------------------------------------------------------
 D)  داده‌هایی که واقعاً زنده و قابل‌مصرف‌اند (خروجی لایهٔ ۳)
--------------------------------------------------------------------------------
این تنها بخشی است که «ماندگار در طول عمر پروسه» است و API از آن سرو می‌دهد.

  D-1)  state هر وِنو  (global.marketVenueState)
        کلید : "<exchange>:<market>:<symbol>"   مثال : "binance:futures:BTCUSDT"
        تعداد مورد انتظار : 5 صرافی × 2 بازار × 2 نماد = 20
        ساختار (realtime-exchange-aggregator.cjs) :
        {
          exchange, market, symbol,
          updatedAt,                    receiveTimestamp آخرین پکت
          source,                       "websocket" | "rest"
          quality: { sequenceStatus, depthLevels },
          price,                         آخرین قیمت
          priceTimestamp, priceSource,
          lastTrade: { price, qty, side, timestamp },
          trades: [ ... ],              پنجرهٔ 60 ثانیه‌ای تریدها
          depth: { bids, asks, timestamp },
          candle: { open, high, low, close, volume, timestamp },
          funding: { rate, timestamp },
          markPrice: { price, timestamp },
          oi: { oi, oiBase, oiCcy, oiUsd, oiContracts, timestamp },
          lastLiquidation: { ...payload, timestamp }
        }

  D-2)  تجمیع نماد  (global.marketAggregates / global.marketSymbolState)
        ساختار : { symbol, updatedAt, spot, futures, crossMarket }
        هر یک از spot و futures :
        {
          venues: { binance:{...}, bybit:{...}, bitget:{...}, kucoin:{...}, okx:{...} },
          aggregate: {
            price      : { median, weightedMedian },   rest با وزن 0.5
            markPrice  : { median },
            funding    : { averageRate },
            oi         : { totalUsd, normalizedVenues, rawByVenue:{...} },
            depth      : { bestBid, bestAsk, bidLiquidity, askLiquidity,
                           bucketsBps: { 5:{bidLiquidity,askLiquidity,imbalance},
                                        10:{...}, 25:{...}, 50:{...} } },
            trades     : { "1s":{buyVolume,sellVolume,deltaVolume,imbalance,vwap,tradeCount},
                           "5s":{...}, "1m":{...} },
            candle     : { "1m":{openTime,open,high,low,close,volume,tradeCount} },
            venuesHealthy, venuesExcluded
          }
        }
        crossMarket : { basis, basisBps }
        ⚠ قاعدهٔ سلامت وِنو : وِنویی که quality.sequenceStatus==="invalid" باشد یا
          updatedAt آن بیش از 30 ثانیه قدیمی باشد از تجمیع حذف می‌شود
          (venuesExcluded شمارش این‌هاست). کندل 1m اینجا از تریدهای 60 ثانیهٔ
          آخر ساخته می‌شود، نه از کندل صرافی.

  D-3)  شاخص‌ها  (global.marketIndicators)
        {
          symbol, updatedAt,
          orderFlow : { spotCvd1m, futuresCvd1m, divergence },
          basis     : { value, bps, trend },
          fundingOi : { fundingRate, oiUsd, oiDeltaUsd },
          liquidity : { spotImbalance5Bps, futuresImbalance5Bps,
                        spotSpreadBps, spotDepthImbalance },
          technical : { sma20, ema9, ema21, return1 }
        }
        منبع : price/price-indicators.cjs (ema, sma, returns) و
               orderbook/orderbook-indicators.cjs (spreadBps, depthImbalance)
        تاریخچهٔ قیمت : RollingWindowStore با پنجرهٔ 15 دقیقه

  D-4)  سری‌های زمانی چارت  (global.chartSeries) - مهم‌ترین بخش برای چارت
        نمونه‌برداری : هر 1000ms (sampleMs) ، سقف 900 نقطه در هر سری
        ساختار کلی : { symbol, updatedAt, price[], volumeFlow[], basis[],
                       fundingOi[], liquidity[] }

        price[]      هر نقطه : { time, spot, futures, mark, ema9, ema21, sma20 }
        volumeFlow[] هر نقطه : { time, spotVwap, futuresVwap, spotDelta,
                                 futuresDelta, spotImbalance, futuresImbalance }
        basis[]      هر نقطه : { time, value, bps, trend }
        fundingOi[]  هر نقطه : { time, fundingRate, oiUsd, oiDeltaUsd }
        liquidity[]  هر نقطه : { time, spotSpreadBps, spotImbalance5Bps,
                                 futuresImbalance5Bps, spotBidLiquidity,
                                 spotAskLiquidity, futuresBidLiquidity,
                                 futuresAskLiquidity }
        تعریف چارت‌ها : global.chartDefinitions = CHARTS
                       (orchestrator/aanode/config/charts.cjs)
        ⚠ این سری‌ها OHLC کامل نیستند: فقط «نقطه در زمان» (line/point) هستند.
          یعنی برای رسم کندل واقعی (open/high/low/close هر تایم‌فریم) باید یا
          از خروجی candle در D-2 استفاده شود یا از بخش historical.

  D-5)  چه چیزی از این داده‌ها بیرون ریخته می‌شود (API)
        GET /api/status/:symbol  -> runtime-status.cjs getMarketStatus(symbol) :
             { generatedAt, aggregate, indicators, charts, chartDefinitions,
               fundamentals, marketHealth, liquidation }
             (aggregate همان D-2 ، indicators همان D-3 ، charts همان D-4)
        GET /api/charts/:symbol  -> { symbol, definitions, charts }
        GET /api/health          -> { marketHealth, liquidation }
        transport : HTTP معمولی (بدون WebSocket/SSE). یعنی کلاینت باید polling کند.

  D-6)  چه چیزی «زنده» است ولی از API بیرون نمی‌آید
        - هیچ‌کدام از 64 رویداد لایهٔ ۲ (price_speed, depth_pressure, oi_pressure,
          liquidation_clusters, orderflow, …) در پاسخ API نیست.
          در حالت debug فقط 200 رویداد آخر در global.debugState.events
          (به‌همراه کل پکت) نگه داشته می‌شود و داشبورد متنی debug هر 15 ثانیه
          آن را روی کنسول چاپ می‌کند (debug-dashboard.renderCompact).
        - spread / spread_delta / spread_trend / spread_pressure (اجرا نمی‌شوند)
        - liquidity_heatmap ، volume_profile ، tick_impact ، market_maker_activity
          ، depth_delta ، depth_pressure ، depth_imbalance ، depth_full
          (محاسبه می‌شوند ولی خروجی‌شان به API وصل نیست)
        - graveyard modules (depth_engine و …) که کلاً اجرا نمی‌شوند
        - هیچ دادهٔ تاریخی/DB ای وجود ندارد ⇒ بعد از restart همه چیز صفر می‌شود.

--------------------------------------------------------------------------------
 E)  خلاصه: چه داریم / چه نداریم
--------------------------------------------------------------------------------
  داریم (زنده، در حافظه)                                        وضعیت
  ------------------------------------------------------------------------------
  قیمت لحظه‌ای 5 صرافی در 2 بازار برای BTC و ETH                 ✅ کامل
  عمق بازار (bestBid/bestAsk و liquidity در بسته‌های 5/10/25/50 bps) ✅
  تریدها با پنجره‌های 1s/5s/1m و CVD (deltaVolume) و VWAP        ✅
  کندل 1m تجمیعی از تریدها + کندل 1m صرافی در venue state        ✅
  basis بین اسپات و فیوچرز (value و bps)                        ✅
  فاندینگ (averageRate) و OI (totalUsd و oiDeltaUsd)            ✅
  mark price (median)                                            ✅
  شاخص‌های تکنیکال ساده : sma20, ema9, ema21, return1           ✅
  سری‌های زمانی برای چارت (900 نقطه، 5 سری)                      ✅
  market health / data quality (سن داده، دِدوپ، PPS)             ✅
  لیکوئیدیشن (فقط binance/bybit/bitget)                          ⚠ ناقص
  مشاهدهٔ 200 رویداد آخر لایهٔ ۲ (فقط در حالت debug و درون‌پروسه) ⚠ محدود
  ------------------------------------------------------------------------------

  نداریم                                                         جایگزین پیشنهادی
  ------------------------------------------------------------------------------
  ذخیره‌سازی/تاریخچه ریل‌تایم (DB یا فایل)                       استفاده از historical (:4000)
  WebSocket/SSE برای پوش زنده به کلاینت                          polling دوره‌ای روی /api/*
  کندل OHLC چند تایم‌فریمی (5m/15m/1h) واقعی در L3              candles_multi_tf (L2، دور ریخته)
                                                                 یا historical
  volume profile / heatmap / spread / orderflow در API          وصل‌کردن L2 به L3 (بخش گام سوم)
  لیکوئیدیشن kucoin و okx                                        پوشش داده‌ای صرافی وجود ندارد
  پایداری پس از restart                                          افزودن persist لایهٔ ۳
  ------------------------------------------------------------------------------

================================================================================
 گام سوم: طرح تست (آماده‌به‌اجرا) و موانع
================================================================================
هدف : اثبات این‌که دادهٔ زنده از 10 منبع به لایهٔ ۳ می‌رسد و می‌تواند به چارت
       وصل شود، بدون تغییر در کد بخش ریل‌تایم.

--------------------------------------------------------------------------------
 3.0  وضعیت محیط در زمان نوشتن این سند (اندازه‌گیری‌شده)
--------------------------------------------------------------------------------
    - پورت 3000 : اشغال است ⇒ Next dev روی 0.0.0.0:3000 در LISTEN و GET / کد 307.
                  توجه: orchestrator/api/server.cjs با server.listen(port,"127.0.0.1")
                  به 127.0.0.1:3000 بایند می‌شود و چون Next کل 0.0.0.0:3000 را گرفته،
                  این بایند هم با EADDRINUSE شکست می‌خورد.                     ⚠
    - پورت 4000 : سرور historical در حال اجرا (node server.cjs) و /health = 200
    - ریل‌تایم : هیچ پروسه‌ای در حال اجرا نیست (طبیعی؛ چون اجرای کل سیستم
                 هم‌زمان API را روی 3000 می‌خواهد ⇒ برخورد)
    - تست‌های آفلاین : 14 فایل مرتبط با ریل‌تایم اجرا شد => 14/14 پاس (پیوست ۲)
    - هارنس آفلاین L1→L3 : ساخته و اجرا شد => HARNESS PASS (بخش 3.3)

--------------------------------------------------------------------------------
 3.1  مانع اصلی و راه‌حل‌ها (ابتدا این باید حل شود)
--------------------------------------------------------------------------------
    در orchestrator/aanode/bootstrap.cjs خط 51 :
        dashboardServer.start(CONFIG.api.port || 3000);
    و در orchestrator/api/server.cjs هندلر خطای listen وجود ندارد ⇒ اگر پورت
    اشغال باشد، خطای EADDRINUSE به‌صورت استثنای بدون catch بالا می‌آید و
    bootstrap نیمه‌کاره می‌ماند (WS ها وصل می‌شوند ولی API سالم نیست).  [RISK]

    سه راه (فقط یکی لازم است ؛ پیشنهاد من گزینهٔ الف) :
      الف) تغییر موقت پورت API در orchestrator/aanode/config/system.cjs :
              api: { enabled: true, port: 3100 }     // به‌جای 3000
           سپس بازگشت به 3000 بعد از تست. (کوچک‌ترین و بی‌خطرترین تغییر)
      ب)  توقف Next dev (که پورت 3000 را گرفته) و اجرای ریل‌تایم روی 3000 :
              pkill -f "next dev -p 3000"
      پ)  اگر فقط پایداری داده مهم است (نه API) : api.enabled = false
           و مانیتورینگ از کنسول debug انجام شود.
    ⚠ توصیه: قبل از گزینهٔ «ب» مطمئن شوید چیزی روی پورت 3000 به آن وابسته نیست
      (frontend/next). در وضعیت فعلی frontend در حال اجرا است.

--------------------------------------------------------------------------------
 3.2  سطح ۱ - تست‌های آفلاین موجود (بدون شبکه ، بدون تغییر کد) ✅ انجام شد
--------------------------------------------------------------------------------
    cd /home/mohsen/TraderBOT
    for t in chart-data-service market-aggregation market-indicator-service \
             market-data-quality canonical-depth runtime-status \
             liquidation-observer open-interest-normalizer; do
        node test/$t.test.cjs
    done
    node test/spot-five-exchanges.test.cjs
    node test/futures-seven-step-exchanges.test.cjs
    node test/depth-pilot.test.cjs
    node test/configured-market-e2e.test.cjs
    node test/exchange-plan.test.cjs
    node test/collector-plan.test.cjs

    خروجی واقعی (خلاصه) :
        chart data validation passed
        market aggregation validation passed
        market indicator validation passed
        market data quality validation passed
        canonical depth aggregation tests passed
        runtime status validation passed
        liquidation observer validation passed
        open interest normalization validation passed
        spot stage validation passed: 5 exchanges × 3 core packet types
        exchange stage validation passed: 5 exchanges × 7 stages = 35 checks
        depth pilot offline tests passed
        configured market E2E validation passed: 5 exchanges × 2 markets
        exchange plan valid: 10 tasks for 5 exchanges × 2 symbols
        collector plan valid: 10 tasks for BTCUSDT
    نتیجه : 14/14 پاس ، همه exit code = 0
    محدودیت : این‌ها فقط قرارداد پکت‌ها/پلن را چک می‌کنند؛ هیچ اتصال شبکه‌ای
    و هیچ دادهٔ زنده‌ای را تأیید نمی‌کنند. (فایل‌های depth/orderflow/liquidations
    و خود WS ها تست ندارند.)
--------------------------------------------------------------------------------
 3.2-ب  سطح ۱.۵ - هارنسِ سلامتِ زندهٔ per-venue (test/realtime-live-health.test.cjs)
--------------------------------------------------------------------------------
 هدف : برای هر (صرافی ، بازار) جداگانه ، با اتصال شبکه‌ای واقعی و فقط از طریق API
        عمومیِ بخش ، ۹ فاز را در همین ترتیب بررسی می‌کند :

   [1] plan      جریان‌های ثبت‌شده == جریان‌هایی که واقعاً استارت شدند
   [2] streams   همهٔ جریان‌ها به running رسیدند
   [3] packets   پکت‌ها از گیتِ market-data-quality.cjs عبور کردند
   [4] channels  رویدادهای جریانی/مارکرهای همان بازار روی bus منتشر شدند
   [5] data      اعداد payload سالم‌اند (اسپات: tuple ، فیوچرز: {price,qty})
   [6] pipeline  ماژول‌های L2 اجرا شدند و هیچ‌کدام fail نشد
   [7] state     aggregate / indicators / charts پر شده‌اند (چک‌لیست 3.6)
   [8] errors    در طول پنجرهٔ جمع‌آوری خطایی لاگ نشد
   [9] release   release(symbol) رجیستریِ اتصال و bus را خالی می‌کند

 اجرا (یک جفت) :
   REALTIME_LIVE_HEALTH=1 node test/realtime-live-health.test.cjs \
       --exchange binance --market spot [--symbol BTCUSDT] [--seconds 20] [--verbose]

 اجرا (هر ۱۰ جفت ، سری و پشت‌سرهم - هرگز موازی) :
   bash test/run-realtime-live-health.sh           # spot+futures × ۵ صرافی
   bash test/run-realtime-live-health.sh --only binance:spot --seconds 20 --verbose

   --exchange binance|all|a,b   --market spot|futures|both   --seconds 5..300
   --min-packets 10             --verbose (یک خط وضعیت در ثانیه)

 کدهای خروج : 0 = PASS/SKIP ، 1 = FAIL ، 2 = آرگومان اشتباه ، 4 = تایم‌اوت هارنس.
   بدون REALTIME_LIVE_HEALTH=1 (و بدون --exchange) فقط خطِ skip چاپ می‌شود (exit 0).

 سیاستِ شدت (severity) :
   FAIL فقط برای نقض‌های ناممکن : عدد غیرمتناهی/منفی ، کندل ناسازگار ، سطحِ
     غیرقابل‌تفسیر ، کتابِ «مرتبِ بدون حذف» که cross شده ، bestBid > bestAsk
     در یک payload.
   WARN برای چیزهای قانونی ولی قابل‌توجه : پچ‌های افزایشی (سطح بی‌ترتیب یا cross
     داخل پچ) ، پکت تکراری ، cross لحظه‌ای در aggregateِ چند-صرافی ، رویداد جریانی
     که فقط health context دارد ، واحدِ زمانِ اشتباه ، سوکت‌های باقی‌ماندهٔ پس از
     release ، sma20 با نمونه‌های ناکافی.

 لاگ هر جفت : /tmp/realtime-live-health/<exchange>-<market>.log
   (هارنس در پایان عمداً process.exit می‌کند تا درایور منتظر سوکت‌های
   بسته‌نشدهٔ L1 نماند.)

 یافته‌های اجرای واقعی (۱۰ جفت ، BTCUSDT ، پنجرهٔ ۲۵s) :
   - نتیجه : ۹ از ۱۰ جفت PASS (فقط WARN) ؛ kucoin:futures در پنجرهٔ ۲۵s فقط
     ۸ پکت گرفت (فیدِ کم‌نرخ) ⇒ با --seconds 60 هم PASS شد (۳۴ گروه سبز).
       bash test/run-realtime-live-health.sh --only kucoin:futures --seconds 60
   - [FIXED] collector/crypto/realtime/spot/price/price_speed.cjs و
     spot/advanced/tick_impact.cjs در اولین تیک (Δt=0) مقدار NaN منتشر می‌کردند ؛
     نسخهٔ فیوچرز گارد داشت ⇒ همان گارد (elapsed > 0 ? ... : 0) اضافه شد.
   - [DONE] آینهٔ مردهٔ `global.marketSignals` حذف شد (خریدار نداشت و در هر رویداد
     کل snapshot را بازمی‌ساخت) ؛ جای آن realtime.signals() / getState().signals
     از خودِ bus می‌خواند و سرویس دیگر subscriber دائمی نگه نمی‌دارد.
     test/realtime-section.test.cjs پس از حذف همچنان PASS است.
   - [KNOWN] سوکت‌های L1 اسپات پس از release بسته نمی‌شوند (WARN release.handles)
     چون فکتوری‌های اسپات هیچ handle برنمی‌گردانند (venue-adapters/wrappers.cjs
     خودش این را best-effort و مورد پیگیری ثبت کرده است).
   - [WARN] bitget/spot زمانِ پکت را ~۸ ساعت جلوتر از ساعت ماشین می‌فرستد
     (timestamp.unit x8) ⇒ نیاز به بررسی واحد/منبع زمان در آن ماژول.
   - [WARN] kucoin/futures در پنجرهٔ ۲۰–۲۵s به sma20 (۲۰ نمونه) نمی‌رسد.
   - [WARN] depth.order / depth.crossed.patch روی bybit و okx = پچ‌های افزایشی
     b/a ، نه کتاب کامل. شاهد : orderedBook=true اما hasRemoval=true و
     bidCount=19 / askCount=34 ⇒ همان پچ‌ها به aggregate هم می‌رسند و
     cross لحظه‌ای در aggregate (aggregate.spread) می‌سازند ⇒ ارزش بررسی :
     آیا depth_partial باید در depth-book-sync اعمال شود و نه به‌عنوان کتاب؟
   - [FIXED/HARNESS] هارنس ابتدا bids/asks را در health context با null اشتباه
     FAIL می‌کرد (canonical-futures-packet.cjs عمداً null می‌گذارد) و هر cross را
     FAIL می‌گرفت ⇒ هر دو قاعده تصحیح شد.

  فاز ۰ - اصلاح دادهٔ زندهٔ عمق (۴ اصلاح + تست) :

   - [FIXED #3] منبعِ واحدِ عمق : ماژول مشترک collector/crypto/common/depth-source.cjs
     یک allow-list و یک انتخاب‌گرِ منبع برای هر کلید exchange:market:symbol دارد.
     کتابِ همگام (depth_full*) تا وقتی sequenceStatus != "invalid" برنده است ؛
     فیدِ native تا وقتی کتابِ همگام تازه است (< 5s) حذف می‌شود ؛ بعد از TTL فقط
     کتابِ top-N بومی معتبر می‌شود. هر پکت با depthKind / depthSource /
     depthAuthoritative / depthSourceReason برچسب می‌خورد و step جدید
     futures.depth.source (priority 202) رویدادِ depth_source را فقط روی تغییرِ
     منبعِ *معتبر* منتشر می‌کند (پکت‌های حذف‌شده churn نمی‌سازند).
     شاهدِ زنده (۵ صرافی ، ۶۰s ، BTCUSDT فیوچرز) : ۴۴۹۴ خروجیِ تحلیلی با
     depthSource=synced_book ، ۱۸ خروجیِ native (فقط در پنجرهٔ fail-over) ،
     fallbacks=18 ، crossed=0 ، pipeline.failed=0 ، registrySize=73.
   - [FIXED #4] پاسخِ پرسشِ depth.order/depth.crossed.patch : تولیدکنندگان دوباره
     برچسب خوردند ⇒ depth_partial + depthType="native_patch" برای deltas
     (bybit/okx/bitget/kucoin) و depthType="native_top_n" فقط برای پُشِ کاملِ کتاب
     (binance @depth20 و snapshot های صرافی). پس کتابِ native هرگز از پچِ افزایشی
     ساخته نمی‌شود (روی همان اجرا : nativePatch=4549 ، nativeBook=18).
     همهٔ ماژول‌های تحلیلی هم depthSource را در خروجی می‌گذارند ⇒
     analyticsWithoutProvenance = 0.
   - [FIXED #5] گاردِ کتابِ تقاطعی در موتور همگام‌سازی : emitBook پیش از انتشار
     با isCrossed بررسی می‌کند ؛ یک تقاطع drop + گزارش می‌شود و ۳ تقاطعِ پشت‌سرهم
     به resync ارتقا می‌یابد (crossedSkips / crossedStreak در stats()).
   - [FIXED #6] حلقهٔ resync هنگام راه‌اندازی : اگر همهٔ آپدیت‌های بافرشده از seed
     قدیمی‌تر باشند (همان bookState < partialSeq) دیگر onStateChange("invalid")
     تکرار نمی‌شود ؛ آپدیتِ زندهٔ بعدی لنگرِ جدید است (anchorRecoveries/lastAnchor).
     بافرِ خالی همچنان زنجیرهٔ سخت‌گیرانه را نگه می‌دارد و گپِ واقعی را رد می‌کند.
   - [TEST] test/depth-source.test.cjs و test/depth-book-sync.test.cjs اضافه شدند
     و گیت‌های depth.sync.progress / depth.sync.resyncs / depth.single-source /
     depth.single-source.fallback / depth.crossed.published به فاز [4b] هارنسِ
     سلامتِ زنده (test/realtime-live-health.test.cjs) پیوستند.
   - [FIXED #7] یک‌سان‌سازی ساعت در market-data-quality.cjs : تازگی (freshness) فقط
     بر پایهٔ receiveTimestamp محلی حساب می‌شود ، یک stamp بیرونی/غیرمنطقی نادیده
     گرفته می‌شود و اختلاف به‌صورت clockSkewMs گزارش می‌گردد. record(packet, now)
     هم تزریق ساعت در تست را ممکن می‌کند.
   - [FIXED #8] آستانه‌های نوشنال : ماژول جدید
     collector/crypto/common/notional-thresholds.cjs مقدارِ نهنگ/خرد را با price × qty
     (ارز مظنه) تعیین می‌کند ؛ big_trades (qty > 5000) و micro_trades (qty < 50)
     به آن منتقل شدند و notional / notionalThreshold را هم منتشر می‌کنند.
     override از طریق global.CONFIG.orderflow (شامل symbols برای هر نماد).
   - [FIXED #9] ترتیب سطوح depth_full : کلیدهای عددیِ آبجکت همیشه صعودی پیمایش
     می‌شوند ، پس bids باید صریحاً نزولی مرتب شود (بهترین سطح اول). پیش از این
     depth_full بهترین bid را آخر می‌داد و تنها در پنجرهٔ ۲۵s روی bybit/futures
     ۹۵۰ هشدار depth.order تولید می‌کرد.
   - [FIXED #10] funding.nextFundingTime دیگر NaN نیست (null در صورت نامعلوم بودن) ؛
     همین مورد، دلیلِ FAIL شدنِ numbers.finite در اجرای زندهٔ bybit/futures بود.



--------------------------------------------------------------------------------
 3.3  سطح ۲ - هارنس آفلاین L1→L3 (اجرا شد ✅ / بدون شبکه / بدون تغییر کد)
--------------------------------------------------------------------------------
هدف : اثبات این‌که یک پکت دستی از هر 5 صرافی × 2 بازار، از handler ها عبور می‌کند
       و وضعیت L3 (venue state ، aggregate ، indicators ، charts) ساخته می‌شود.

فایل موقت : /tmp/rt-l3-harness.cjs  (بیرون از مخزن ، بعد از تست قابل حذف)
     cat > /tmp/rt-l3-harness.cjs <<'EOF'
     const assert = require("node:assert/strict");
     global.CONFIG = { mode: "test", debugVerbose: false };
     const events = [];
     global.healthEmit = (packet) => events.push(packet);
     global.orchestrator = { route: () => {} };
     const ROOT = "/home/mohsen/TraderBOT";
     const spotHandler = require(ROOT + "/collector/crypto/realtime/aanode/spot-handler.cjs");
     const futuresHandler = require(ROOT + "/collector/crypto/realtime/aanode/futures-handler.cjs");
     const { chartDataService } = require(ROOT + "/collector/crypto/realtime/aggregator/chart-data-service.cjs");
     const marketIndicators = require(ROOT + "/collector/crypto/realtime/aggregator/market-indicator-service.cjs");
     const EXCHANGES = ["binance", "bybit", "bitget", "kucoin", "okx"];
     const now = Date.now();
     const bids = [[100, 1], [99, 2]];
     const asks = [[101, 1.5], [102, 2]];
     for (const exchange of EXCHANGES) {
         spotHandler({ symbol: "BTCUSDT", data: { exchange, market: "spot", symbol: "BTCUSDT",
             price: 100.5, qty: 0.5, side: "buy", open: 100, high: 101, low: 99, close: 100.5,
             volume: 12, bids, asks, timestamp: now } });
         for (const packet of [
             { type: "trade", price: 101, qty: 0.4, side: "sell" },
             { type: "mark_price", price: 101.2 },
             { type: "funding", rate: 0.0001 },
             { type: "oi", oi: 1000, oiUsd: 101000 },
             { type: "depth_full_snapshot", bids, asks }
         ]) {
             futuresHandler({ symbol: "BTCUSDT",
                 data: { exchange, market: "futures", symbol: "BTCUSDT", timestamp: now, ...packet } });
         }
     }
     const venues = global.marketVenueState.values({ symbol: "BTCUSDT" });
     const charts = chartDataService.snapshot("BTCUSDT");
     console.log("healthEmit events             =", events.length);
     console.log("venueState.values(symbol)     =", venues.length);
     console.log("symbolState.states.size       =", global.marketSymbolState.states.size);
     console.log("marketAggregates.size         =", global.marketAggregates.size);
     console.log("venue binance:futures price   =", venues.find(v => v.exchange === "binance" && v.market === "futures").price);
     console.log("aggregate.spot.price          =", JSON.stringify(global.marketAggregates.get("BTCUSDT").spot.aggregate.price));
     console.log("aggregate.futures.price       =", JSON.stringify(global.marketAggregates.get("BTCUSDT").futures.aggregate.price));
     console.log("indicators.technical          =", JSON.stringify(marketIndicators.get("BTCUSDT").technical));
     console.log("charts price[0]               =", JSON.stringify(charts.price[0]));
     assert.equal(venues.length, 10);
     assert.equal(global.marketAggregates.size, 1);
     console.log("HARNESS PASS");
     EOF
     node /tmp/rt-l3-harness.cjs

خروجی واقعی :
     healthEmit events             = 310
     venueState.values(symbol)     = 10
     symbolState.states.size       = 1
     marketAggregates.size         = 1
     venue binance:futures price   = 101.2   (آخرین trade=101 ، mark_price=101.2)
     aggregate.spot.price          = {"median":100.5,"weightedMedian":100.5}
     aggregate.futures.price       = {"median":101.2,"weightedMedian":101.2}
     indicators.technical          = {"sma20":100.5,"ema9":100.5,"ema21":100.5,"return1":0}
     charts price[0]               = {"time":...,"spot":100.5,"futures":0,"mark":0,
                                      "ema9":0,"ema21":0,"sma20":0}
     HARNESS PASS   (exit=0)

--------------------------------------------------------------------------------
 3.4  سطح ۳ - تست اتصال خام WS (اختیاری ، نیازمند شبکه و اجازهٔ کاربر)
--------------------------------------------------------------------------------
هدف : جدا کردن مشکل «شبکه/صرافی» از مشکل «کد L3». این تست کل سیستم را بالا
       نمی‌آورد و پورت 3000 را اشغال نمی‌کند.

     cat > /tmp/rt-ws-probe.cjs <<'EOF'
     const ROOT = "/home/mohsen/TraderBOT";
     global.CONFIG = { mode: "test", debugVerbose: false };
     const counts = {};
     const handler = (packet) => {
         const t = (packet && packet.data && (packet.data.type || packet.data.event)) || "unknown";
         counts[t] = (counts[t] || 0) + 1;
     };
     const WS = require(ROOT + "/collector/crypto/realtime/venues/binance/futures/ws.cjs");
     const ws = new WS({ symbol: "BTCUSDT", handler, onCritical: (e) => console.error("CRIT", e) });
     ws.connect();
     setTimeout(() => {
         console.log("binance futures packet types:", JSON.stringify(counts));
         console.log("total:", Object.values(counts).reduce((a, b) => a + b, 0));
         process.exit(0);
     }, 20000);
     EOF
     node /tmp/rt-ws-probe.cjs

معیار قبولی : در 20 ثانیه باید دست‌کم این کلیدها دیده شوند :
     trade, depth_partial یا depth_full_diff/depth_full_snapshot, mark_price, funding,
     candle, oi (برای binance مقدار oi از REST poll هر 5 ثانیه می‌آید)
اگر تعداد کل صفر شد ⇒ مشکل در دسترسی شبکه/فیلترینگ است، نه در L3.

--------------------------------------------------------------------------------
 3.5  سطح ۴ - اجرای کامل واقعی (نیازمند انتخاب مسیر پورت از بخش 3.1)
--------------------------------------------------------------------------------
    الف) گزینهٔ پیشنهادی (پورت 3100) :
         1) در orchestrator/aanode/config/system.cjs پورت را به 3100 تغییر دهید
         2) اجرای سیستم در پس‌زمینه با لاگ :
              cd /home/mohsen/TraderBOT
              setsid node orchestrator/aanode/bootstrap.cjs \
                 > /tmp/rt-live.log 2>&1 < /dev/null &
              echo $! > /tmp/rt-live.pid
         3) صبر 90 ثانیه (زمان لازم برای: sync دفترها، poll های REST، پر شدن پنجره‌ها)
         4) شاهدها :
              grep -c "CRITICAL ERROR\\|Error" /tmp/rt-live.log
              grep -i "connected\\|subscribe" /tmp/rt-live.log | head
              curl -s http://127.0.0.1:3100/api/health | head -c 600
              curl -s http://127.0.0.1:3100/api/status/BTCUSDT | head -c 1200
              curl -s http://127.0.0.1:3100/api/charts/BTCUSDT | head -c 1200
         5) بررسی ساختاری با اسکریپت :
              curl -s http://127.0.0.1:3100/api/charts/BTCUSDT > /tmp/rt-charts.json
              node -e "const j=require('/tmp/rt-charts.json');console.log('series:',Object.keys(j.charts));console.log('price points:',j.charts.price.length);console.log('last:',JSON.stringify(j.charts.price.at(-1)))"
         6) توقف و بازگشت :
              kill $(cat /tmp/rt-live.pid)
              و پورت system.cjs را به 3000 برگردانید.

    ب) اجرا روی پورت 3000 : ابتدا Next را متوقف کنید (بخش 3.1 گزینهٔ ب)
    پ) اجرای بدون API (api.enabled=false) : فقط لاگ و داشبورد debug ملاک است

    ⚠ نکته دربارهٔ لاگ : طبق بخش 1.6، در هر پکت یک console.log بدون گارد اجرا
      می‌شود (collector/aanode/handler.cjs) و هم‌چنین packet.stage++ باعث می‌شود
      هر رویداد 3 بار مسیردهی شود. بنابراین حجم لاگ می‌تواند چند ده مگابایت در
      دقیقه باشد. پیشنهاد: قبل از اجرا مطمئن شوید فضای /tmp کافی است و بعد از
      تست فایل لاگ را پاک کنید.

--------------------------------------------------------------------------------
 3.6  معیارهای قبولی/رد (Checklist) - پس از اجرای سطح ۴
--------------------------------------------------------------------------------
    ردیف  شاهد                                                       قبولی
    ------------------------------------------------------------------------------
    1     /api/health پاسخ 200 بدهد و marketHealth طول > 0 باشد          ☐
    2     /api/status/BTCUSDT مقدار aggregate.spot.aggregate.price.median
          یک عدد نزدیک قیمت واقعی باشد (نه null و نه 0)                  ☐
    3     aggregate.futures.aggregate.depth.bestBid/bestAsk پر باشد      ☐
    4     aggregate.spot.aggregate.trades["1m"].tradeCount > 0            ☐
    5     crossMarket.basis عدد غیر null و منطقی (چند دلار)               ☐
    6     indicators.technical.sma20/ema9 عدد باشند (بعد از ≥ 20 نمونه)   ☐
    7     /api/charts/BTCUSDT سری price با ≥ 60 نقطه (بعد از 90 ثانیه)    ☐
    8     در price[] حداقل یکی از spot/futures مقدار non-zero داشته باشد  ☐
          (اگر 0 باشد ⇒ همان باگ finite() بخش 3.3-3)                     ☐
    9     در لاگ، تعداد خطاهای CRITICAL صفر یا بسیار کم باشد              ☐
    10    venue state ها : 20 مورد برای 2 نماد در 2 بازار × 5 صرافی        ☐
    ------------------------------------------------------------------------------
    رد شدن هر یک از ردیف‌های 2، 3، 7 ⇒ مشکل در مسیر داده است و باید پیش از
    وصل‌کردن به چارت رفع شود.

--------------------------------------------------------------------------------
 3.7  ریسک‌های زمان اجرا (چه چیزی می‌تواند خراب شود)
--------------------------------------------------------------------------------
    R1  EADDRINUSE روی پورت ⇒ کرش bootstrap (بدون هندلر خطا). راه‌حل: بخش 3.1
    R2  حجم بالای لاگ (console.log هر پکت + stage++ سه‌باره). اثر: پر شدن سریع
        دیسک و کندی سیستم. راه‌حل: اجرا با لاگ در /tmp و پاک‌کردن پس از تست،
        یا کوتاه کردن مدت تست به 90-120 ثانیه.
    R3  بار شبکه : 10 اتصال WS هم‌زمان به 5 صرافی + poll های REST هر 5 ثانیه
        (binance OI/markPrice/klines و okx/kucoin). اگر IP ایران باشد احتمال
        بلاک شدن یا محدودیت (429) وجود دارد.
    R4  نبود ذخیره‌سازی ⇒ پس از هر restart همهٔ L3 صفر می‌شود. تست را باید
        «در یک اجرا» ارزیابی کنید.
    R5  باگ cross-symbol در candles_multi_tf و price_speed فیوچرز (بخش 1.6-6):
        دادهٔ BTC و ETH در ماژول‌های فیوچرز روی هم می‌افتد. برای تست تک‌نمادی
        مشکلی دیده نمی‌شود ولی با دو نماد هم‌زمان نتیجهٔ آن ماژول‌ها معتبر نیست.
    R6  ماژول‌های dead code و spread خانوادهٔ اسپرد همیشه خالی‌اند ⇒ اگر
        انتظار دارید این سیگنال‌ها در چارت بیاید، ناامیدی ایجاد می‌کند.

--------------------------------------------------------------------------------
 3.8  توقف و بازگشت به وضعیت اولیه (Rollback)
--------------------------------------------------------------------------------
    1) kill $(cat /tmp/rt-live.pid)                # یا pkill -f aanode/bootstrap
    2) بازگرداندن پورت در orchestrator/aanode/config/system.cjs به 3000
       (اگر گزینهٔ 3.1-الف را انتخاب کردید)
    3) راه‌اندازی مجدد Next در صورت توقف آن :
          cd /home/mohsen/TraderBOT/frontend && setsid npm exec next dev -p 3000 \
             > /tmp/next-live.log 2>&1 < /dev/null &
    4) rm -f /tmp/rt-live.log /tmp/rt-live.pid /tmp/rt-charts.json
    5) اگر می‌خواهید هارنس یا probe را هم پاک کنید :
          rm -f /tmp/rt-l3-harness.cjs /tmp/rt-ws-probe.cjs
    ⚠ هیچ فایلی از collector/crypto/realtime تغییر نکرده است؛ بنابراین rollback فقط
      شامل پورت و پروسه‌هاست. این پروژه git نیست ، پس اگر تغییری در کد دادید
      باید دستی برگردانید.

--------------------------------------------------------------------------------
 3.9  نقطهٔ توقف: تصمیم لازم از سمت شما
--------------------------------------------------------------------------------
    اجرای سطح ۲ (هارنس آفلاین) انجام شد، اما سطح ۳ و سطح ۴ تا زمانی که شما مسیر
    پورت را انتخاب نکنید شروع نمی‌شود. سه انتخاب ممکن :
        (الف) تغییر موقت پورت API به 3100 و اجرای کامل واقعی   [پیشنهاد]
        (ب) توقف Next و اجرای کامل روی پورت 3000
        (پ) فقط تست اتصال خام WS (سطح ۳) بدون بالا آوردن کل سیستم



نتیجه‌های مهمی که همین هارنس آشکار کرد :
  1) 10 وِنو و 1 aggregate درست ساخته می‌شود ⇒ مسیر L1→L2→L3 سالم است.
  2) مقدار state.price در وِنو با «آخرین پکتی که price دارد» بازنویسی می‌شود؛
     یعنی پکت mark_price (و کندل) قیمت وِنو را عوض می‌کند و در نتیجه
     aggregate.futures.price در عمل «مارک پرایس» است نه «آخرین قیمت ترید».
     ⇒ چارت فیوچرز روی mark حرکت می‌کند نه last.                        [RISK]
  3) در ChartDataService تابع finite() این‌گونه است :
        Number.isFinite(Number(value)) ? Number(value) : null
     و چون Number(null) === 0 است، مقدارهای null به 0 تبدیل می‌شوند
     (نه null). شاهد: در اولین نمونهٔ زمانی که هنوز دادهٔ فیوچرز نبوده،
     point به‌صورت futures:0, mark:0, ema9:0 ثبت شده است.
     ⇒ اگر چارت این سری را خطی رسم کند، خط در ابتدای کار تا صفر سقوط می‌کند. [BUG]















