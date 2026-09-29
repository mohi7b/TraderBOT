۱. ساختار قیمت و روندهای چندبازه‌ای (Market Structure & Multi-Timeframe Trends)
این بخش ساختار روندها، سطوح کلیدی و جهت کلی حرکتی بازار را بر اساس دیتای کندلی تعریف می‌کند.

میانگین‌های متحرک کلیدی (Key Moving Averages):

Bull Market Support Band: ترکیب ۲۱ EMA و ۲۰ SMA در تایم‌فریم هفتگی (بازسازی‌شده از aggregation کندل‌های ۱m).

Institutional Moving Averages: محاسبه EMA/SMA دوره‌های ۵۰، ۱۰۰ و ۲۰۰ در تایم‌فریم‌های ۴ ساعته و روزانه برای تشخیص حمایت/مقاومت‌های نهادی.

HMA Trend Signals (Hull Moving Average): استفاده از HMA با تاخیر نزدیک به صفر برای تشخیص سریع نقاط چرخش روند در تایم‌فریم‌های ۱۵m و ۱h.

ساختار پرایس اکشن و تغییر روند (Price Action & Structure):

BOS / CHoCH Detection: شناسایی شکست ساختار (Break of Structure) و تغییر ماهیت بازار (Change of Character) بر اساس ردیابی سقف‌ها و کف‌های اصلی (Swing Highs / Swing Lows).

Fair Value Gaps (FVG): شناسایی و ذخیرهٔ نواحی ناکارآمدی قیمتی (گپ‌های سه کندلی) در تایم‌فریم‌های مختلف و بررسی میزان پر شدن (Mitigation) آن‌ها.

نوسان‌پذیری تاریخی و سطوح دامنه (Volatility & Range Dynamics):

ATR & Volatility Compression (Squeeze): محاسبه Average True Range و باندهای بولینگر جهت شناسایی فازهای فشردگی شدید قیمت قبل از شکست‌های بزرگ.

High/Low Anchors: استخراج ریل‌تایم سقف/کف روزانه (PDH/PDL)، هفتگی (PWH/PWL) و ماهانه برای سنجش جارو ساختن نقدینگی (Liquidity Sweeps).

۲. پروفایل حجم و توزیع نقدینگی (Volume Profile & Auction Market Theory)
با تجمیع داده‌های Volume از ۵ صرافی، می‌توانید ساختار واقعی توزیع نقدینگی بر اساس قیمت را محاسبه کنید.

پروفایل حجم ترکیبی چندصرافی (Aggregated Volume Profile - AVP):

POC (Point of Control): سطح قیمتی که بیشترین حجم معاملات در یک بازه (روزانه/هفتگی/سسشن) در آن رخ داده است.

Value Area (VAH / VAL): محدودهٔ قیمتی که ۷۰٪ از حجم معاملات کل بازار در آن بازه انجام شده است (کف و سقف ارزش منصفانه).

HVN & LVN (High/Low Volume Nodes): شناسایی گره‌های پرحجم (حمایت/مقاومت سنگین) و کم‌حجم (نواحی حرکت سریع قیمت).

حجم‌های شرطی و وزن‌دار (Volume-Weighted Metrics):

Anchored VWAP (AVWAP): محاسبهٔ VWAP متصل‌شده به رویدادهای کلیدی (مثل کف/سقف‌های تاریخی، شروع سال یا زمان اعلام نرخ بهره).

Session VWAP Bands: انحراف معیارهای مثبت و منفی VWAP روزانه برای شناسایی شرایط خرید/فروش هیجانی (Overbought/Oversold).

۳. نابرابری و واگرایی‌های بین‌صرافی (Cross-Exchange Anomalies & Relative Strength)
با داشتن داده‌های کندلی جداگانه از ۵ صرافی، می‌توانید عدم تعادل‌های محلی و رفتارهای انحرافی را تحلیل کنید.

واگرایی حجم و قیمت بین صرافی‌ها (Cross-Exchange Divergence):

Exchange Volume Share Shift: محاسبه تغییرات سهم حجم ۱m هر صرافی از کل بازار (مثلاً جهش ناگهانی سهم Bitget نسبت به Binance نشان‌دهنده ورود نقدینگی خاص است).

Arbitrage Spread History: ثبت تاریخی انحرافات قیمتی بین صرافی‌ها در کندل‌های ۱m جهت سنجش میزان کارایی نقدینگی.

قدرت نسبی اسپات به فیوچرز (Spot vs Futures Relative Strength Index):

Volume Ratio (Spot/Futures): نسبت مجموع حجم اسپات به مجموع حجم فیوچرز در هر کندل ۱ دقیقه جهت تعیین سوخت حرکت (سرمایه‌گذاری واقعی vs اهرم).

۴. آمار آنومالی‌ها و الگوهای تکرارشونده (Quantitative Anomalies & Seasonality)
استفاده از پایگاه داده تاریخی ۱m برای استخراج رفتارهای الگووار زمان‌بندی‌شده.

سسشن‌های معاملاتی و نقدینگی زمانی (Session Liquidity Metrics):

Session Open Breakouts: سنجش رفتار قیمت نسبت به قیمت بازگشایی سسشن‌های آسیا، لندن و نیویورک.

Time-based Volatility Patterns: استخراج میانگین نوسانات و حجم معاملات در ساعات مشخصی از شبانه‌روز (مثلاً دقیقه ۳۰ قبل و بعد از بازگشایی بازار نیویورک).

توزیع آماری بازدهی (Return Distribution & Tail Risk):

Historical Z-Score of Price/Volume: سنجش میزان انحراف حجم یا تغییرات قیمت در کندل جاری نسبت به میانگین تاریخی ۱۰۰ کندل گذشته (تشخیص رویدادهای بی‌سابقه یا Black Swanهای محلی).