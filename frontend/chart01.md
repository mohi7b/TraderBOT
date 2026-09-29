DeepSeek Prompt — CPI YoY Chart + Macro Event Timeline + TimeShift Engine

یک کامپوننت چارت تورم بساز که اولین چارت مهم ماکرو باشد:
CPI YoY Time‑Series Chart  
با استفاده از TradingView Lightweight Charts و معماری زیر:

1) ورودی دادهٔ تورم
Code
{
  country: string,
  date: string,          // YYYY-MM
  yoy: number,
  core_yoy?: number,
  mom?: number,
  annualized_3m?: number
}
2) ورودی دادهٔ تقویم اقتصادی
Code
{
  date: string,          // YYYY-MM-DD HH:mm (UTC)
  country: string,
  event: string,
  importance: "low" | "medium" | "high",
  forecast?: number,
  previous?: number
}
3) TimeShift Engine (بخش بسیار مهم)
از یک تابع مرکزی استفاده کن:

Code
TimeShift(utcTimestamp)
این تابع:

زمان را از UTC → NY Close تبدیل می‌کند

DST را مدیریت می‌کند

برای تمام چارت‌های پلتفرم قابل استفاده است

در آینده قابل تنظیم توسط کاربر خواهد بود

باید کاملاً ماژولار و مقیاس‌پذیر باشد

محور X چارت باید از خروجی TimeShift استفاده کند.

4) ساختار چارت
محور X = تاریخ ماهانه (با TimeShift)

محور Y = درصد تورم YoY

سری اصلی: Headline CPI

سری دوم: Core CPI

خط هدف بانک مرکزی

shading دوره‌های رکود

5) لایهٔ تقویم رویدادها
Event markers

Event bands

Forecast lines

Tooltip کامل

رنگ بر اساس اهمیت

6) فاکتورهای تکمیلی
deviation از هدف

trend direction

annotation نقاط مهم

خط 3M Annualized

7) تم واحد
یک سیستم تم قابل‌گسترش طراحی کن که در آینده برای تمام چارت‌های ماکرو، مارکت، ریل‌تایم، تاریخی، احساسات خبری و نقدینگی قابل استفاده باشد.

8) مقیاس‌پذیری
چارت باید برای هر کشور قابل ساخت باشد

پیش‌بینی کن که در آینده ده‌ها چارت مشابه در بخش ماکرو ساخته خواهند شد

ساختار کامپوننت باید خوانا، ماژولار و قابل‌گسترش باشد

مسیر فایل‌ها را بر اساس ساختار درختی فعلی پروژه خودت تعیین کن

9) هدف
چارت باید زیبا، خوانا، تحلیلی، سیگنال‌محور، و کاملاً هماهنگ با چارت‌های مارکت باشد.