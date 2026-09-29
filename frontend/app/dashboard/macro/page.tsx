import { getTranslations, getLocale, getMessages } from "next-intl/server";
import {
  fetchMacroGroup,
  fetchCountryMeta,
} from "@/lib/server/upstream";
import { groupByKey, mergeGroups } from "@/lib/server/macro";
import { countriesFromSeries } from "@/lib/macro/countries";
import { getCpiTarget, toCpiTarget } from "@/lib/macro/targets";
import { CpiYoyChart } from "@/components/domain/macro/CpiYoyChart";
import { PolicyRateChart } from "@/components/domain/macro/PolicyRateChart";
import { GrowthChart } from "@/components/domain/macro/GrowthChart";
import { FinancialChart } from "@/components/domain/macro/FinancialChart";
import { CountrySelect } from "@/components/domain/macro/CountrySelect";
import type { ApiError, CountryMeta, Group } from "@/lib/types/series";

export const dynamic = "force-dynamic";

/**
 * Macro Dashboard — چارت CPI YoY (Headline vs Core).
 *
 * دو درخواست **از پروکسی خودمان** انجام می‌شود و ادغام می‌گردد:
 *   1) `?mode=countries` → انتخاب country-first بک‌اند ⇒ **هر ۱۷ کشور**
 *   2) payload پیش‌فرض  → سری‌های مکمل (Core برای USA و PPI)
 * چرا ادغام: `mode=countries` سری Core را از دست می‌دهد و payload پیش‌فرض
 * فقط ۶ کشور دارد؛ ادغام این دو، «۱۷ کشور + Core» را هم‌زمان می‌دهد
 * (بدون نیاز به تغییر بک‌اند — `mode=canon` در بک‌اند وجود ندارد).
 */
export default async function MacroDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; country?: string }>;
}) {
  const tm = await getTranslations("macro");
  const locale = await getLocale();
  const { group, country } = await searchParams;

  const key = group ?? "1A_inflation";
  const path = groupByKey(key)?.path;

  const [wideRes, fullRes, coreRes, policyRes, yieldRes, growthRes, marketRes] = path
    ? await Promise.all([
        // limit=60: سقف پیش‌فرض picker (12) و mode=countries (29) جا برای
        // CORE_CPI کشورهای دیگر ندارد؛ با ۶۰ سری همهٔ CPI + CORE + GDP_DEFL
        // در یک payload می‌آیند (سقف مجاز پروکسی هم همان ۶۰ است).
        fetchMacroGroup(path, { mode: "countries", limit: 60 }),
        fetchMacroGroup(path),
        // P5 (2026-09-20): Core اختصاصی همهٔ کشورها (رسمی + مشتق تازه).
        // چرا لازم است: payload سقف ۶۰ سری دارد و بدون این فراخوانی، Core
        // کشورهایی مثل JPN/CAN/MEX/ZAF روی سری کهنهٔ OECD می‌ماند؛ این‌جا
        // هر ۱۷ کشور یک Core با «تازه‌ترین as-of» می‌گیرند.
        fetchMacroGroup(path, { canon: "CORE_CPI", limit: 24 }),
        // P3-Policy (2026-09-22): نرخ سیاستی بانک مرکزی (BIS WS_CBPOL) برای
        // چارت «Policy Rate vs CPI» که زیر چارت تورمی نمایش داده می‌شود.
        // گروه `1D_monetary` (canon = POLICY_RATE) — ۱۷ کشور + XM (منطقهٔ یورو).
        fetchMacroGroup("monetary", { mode: "countries", canon: "POLICY_RATE", limit: 60 }),
        // P3-Signals (2026-09-22): بازدهی اوراق ۱۰ساله (FRED/OECD IRLTLT01) برای
        // سیگنال `Yld` چارت نرخ بهره. همان گروه monetary ⇒ با
        // `lib/macro/macroSignals.ts` ساخته می‌شود. (۴ کشور منبع ندارند ⇒ بج
        // `N/A —` سفید بدون فلش.)
        fetchMacroGroup("monetary", { canon: "YIELD_10Y", limit: 60 }),
        // P4-Growth (2026-09-22): رشد فصلی/سالانهٔ GDP برای چارت «GDP Growth».
        // گروه `1E_growth_core` (canon اختصاصی = GDP_GROWTH) ⇒ OECD
        // `GDP_VPV_YOY`/`GDP_VPV_QOQ` + Eurostat `GDP_CLV_PCH_SM` + FRED GDPC1.
        fetchMacroGroup("growth-core", { mode: "countries", canon: "GDP_GROWTH", limit: 60 }),
        // P5-Financial (2026-09-23): شاخص‌های بازار جهانی برای چارت «شرایط مالی».
        // گروه `1F_market` (canon = MARKET_GLOBAL) ⇒ VIX · DXY · S&P500 ·
        // اسپرد اعتباری · M2 (همه ماهانه؛ منبع FRED). کشوری نیستند و برای
        // همهٔ کشورها همان‌ها خوانده می‌شوند (مستند در FinancialChart).
        fetchMacroGroup("market", { mode: "countries", canon: "MARKET_GLOBAL", limit: 60 }),
      ])
    : [null, null, null, null, null, null, null];

  const wide = wideRes?.ok ? (wideRes.body as Group) : null;
  const full = fullRes?.ok ? (fullRes.body as Group) : null;
  const coreOnly = coreRes?.ok ? (coreRes.body as Group) : null;
  const policyOnly = policyRes?.ok ? (policyRes.body as Group) : null;
  /** P3-Signals: فقط سری‌های YIELD_10Y (سیگنال `Yld` چارت نرخ بهره). */
  const yieldOnly = yieldRes?.ok ? (yieldRes.body as Group) : null;
  /** P4-Growth: فقط سری‌های GDP_GROWTH (چارت رشد اقتصادی). */
  const growthOnly = growthRes?.ok ? (growthRes.body as Group) : null;
  /** P5-Financial: شاخص‌های بازار جهانی (چارت شرایط مالی). */
  const marketOnly = marketRes?.ok ? (marketRes.body as Group) : null;
  const data = mergeGroups(
    mergeGroups(
      mergeGroups(
        mergeGroups(mergeGroups(mergeGroups(wide, full), coreOnly), policyOnly),
        yieldOnly,
      ),
      growthOnly,
    ),
    marketOnly,
  );

  /**
   * مقاوم‌سازی (تجربهٔ واقعی 2026-09-20): وقتی بک‌اند برای چند ثانیه
   * ری‌استارت می‌شود، یکی از سه فراخوانی بالا fail می‌شد و کل صفحه به
   * «BackendError» می‌رفت (چارت لود نمی‌شد). حالا خطا فقط وقتی نشان داده
   * می‌شود که **هر سه** فراخوانی شکست خورده باشند؛ در غیر این صورت با
   * همان داده‌ای که رسیده چارت رسم می‌شود.
   */
  const attempts = [wideRes, fullRes, coreRes, policyRes, yieldRes, growthRes, marketRes].filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );
  const failed = attempts.filter((r) => !r.ok);
  const hasData = (data?.series?.length ?? 0) > 0;
  const err = !hasData && failed.length > 0 ? (failed[0]!.body as ApiError) : null;
  /** P4: بریدگی‌های شناخته‌شدهٔ منبع (مثل 2025-10 آمریکا) از meta بک‌اند. */
  const knownGaps =
    wide?.meta?.known_gaps ??
    full?.meta?.known_gaps ??
    coreOnly?.meta?.known_gaps ??
    policyOnly?.meta?.known_gaps ??
    yieldOnly?.meta?.known_gaps ??
    growthOnly?.meta?.known_gaps ??
    marketOnly?.meta?.known_gaps ??
    [];

  // کشورها: فقط آن‌هایی که سری CPI معتبر دارند (گزینهٔ A)
  const countries = countriesFromSeries(data?.series ?? [], "CPI");
  const selectedCountry =
    country && countries.some((c) => c.code === country)
      ? country
      : countries[0]?.code;

  // متادیتای کشور (هدف تورمی) از MAIN DB
  const metaRes = selectedCountry ? await fetchCountryMeta(selectedCountry) : null;
  const meta = metaRes && metaRes.ok ? (metaRes.body as CountryMeta) : null;

  const countryName = selectedCountry
    ? countries.find((c) => c.code === selectedCountry)?.name
    : undefined;

  // متن‌های چارت از i18n (هیچ متن سخت‌کدی در کامپوننت‌ها نیست)
  /**
   * v3 (Chart Engine v3): قالب‌های ترجمهٔ tooltipهای سیگنال.
   * ⚠️ **دادهٔ سریالایزپذیر** است (نه تابع): طبق Next نمی‌توان تابع را به
   * Client Component پاس داد — همان باگی که اول باعث خطای ۵۰۰ صفحه شد.
   * سیگنال‌های دامنه فقط `hintKey`+`hintParams` می‌دهند و موتور با
   * `resolveHint()` متن نهایی را می‌سازد (هیچ متن ثابتی در دامنه نمی‌ماند).
   */
  const signalHints =
    ((await getMessages()) as { macro?: { signals?: Record<string, unknown> } })?.macro
      ?.signals ?? {};
  const labels = {
    title: tm("charts.cpi_yoy_title"),
    asOf: tm("charts.as_of"),
    coreAsOf: tm("charts.as_of"),
    yoyAxis: tm("charts.yoy_axis"),
    source: tm("charts.source"),
    frequency: tm("charts.frequency"),
    headline: tm("charts.legend.headline"),
    core: tm("charts.legend.core"),
    annualized3m: tm("charts.legend.annualized3m"),
    empty: tm("charts.empty_cpi"),
    error: tm("series.no_data"),
    target: tm("meta.inflation_target"),
    modeRaw: tm("charts.mode.raw"),
    modeComputed: tm("charts.mode.computed"),
    cadencePadded: tm("charts.cadence_padded"),
    signalHints,
  };

  // متن‌های چارت سیاست پولی (نرخ بهره در برابر تورم) — ردیف توضیحات عیناً مثل چارت تورمی
  const policyLabels = {
    title: tm("charts.policy_title"),
    legendRate: tm("charts.policy_legend.rate"),
    euroPolicy: tm("charts.policy_legend.ecb"),
    legendInflation: tm("charts.policy_legend.inflation"),
    target: tm("meta.inflation_target"),
    empty: tm("charts.empty_policy"),
    error: tm("series.no_data"),
    asOf: tm("charts.as_of"),
    unit: tm("charts.policy_unit"),
    frequency: tm("charts.frequency"),
    source: tm("charts.source"),
    modeRaw: tm("charts.mode.raw"),
    modeComputed: tm("charts.mode.computed"),
    signalHints,
  };

  // متن‌های چارت رشد اقتصادی (GDP Growth) — ردیف توضیحات عیناً مثل دو چارت قبلی
  const growthLabels = {
    title: tm("charts.growth_title"),
    legendYoy: tm("charts.growth_legend.yoy"),
    legendQoq: tm("charts.growth_legend.qoq"),
    legendTrend: tm("charts.growth_legend.trend"),
    empty: tm("charts.empty_growth"),
    error: tm("series.no_data"),
    asOf: tm("charts.as_of"),
    unit: tm("charts.growth_unit"),
    frequency: tm("charts.frequency"),
    source: tm("charts.source"),
    modeRaw: tm("charts.mode.raw"),
    modeComputed: tm("charts.mode.computed"),
    signalHints,
  };

  // متن‌های چارت شرایط مالی (Financial Conditions / FAS) — مثل سه چارت قبلی
  const financialLabels = {
    title: tm("charts.financial_title"),
    legendFci: tm("charts.financial_legend.fci"),
    legendYield: tm("charts.financial_legend.y10"),
    empty: tm("charts.empty_financial"),
    error: tm("series.no_data"),
    asOf: tm("charts.as_of"),
    unit: tm("charts.financial_unit"),
    frequency: tm("charts.frequency"),
    source: tm("charts.source"),
    modeRaw: tm("charts.mode.raw"),
    modeComputed: tm("charts.mode.computed"),
    signalHints,
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">{tm("title")}</h1>
        <span className="text-xs text-muted">
          {tm("charts.countries_available", { count: countries.length })}
        </span>
      </header>

      {!path ? (
        <BackendError title={tm("series.no_data")} status={404} detail={key} />
      ) : err ? (
        <BackendError
          title={tm("series.no_data")}
          error={err.error}
          status={err.status}
          detail={err.detail}
        />
      ) : (
        <>
          {/* هدف تورمی و نام کشور بیرون از چارت نمایش داده نمی‌شوند:
              نام کشور داخل چارت و هدف در ردیف لجند است (درخواست 2026-09-21).
              MetaPanel عمداً حذف شد؛ برای بازگشت کافی است دوباره رندر شود. */}
          <CpiYoyChart
            series={data?.series ?? []}
            country={selectedCountry}
            gapEvents={knownGaps}
            /* هدف تورمی از منبع حقیقت (MAIN DB) — fallback استاتیک در چارت */
            target={toCpiTarget(meta) ?? getCpiTarget(selectedCountry ?? "")}
            targetNote={meta?.note ?? undefined}
            locale={locale}
            labels={labels}
            subtitle={
              countryName
                ? `${countryName} (${selectedCountry ?? ""})`
                : undefined
            }
            right={
              countries.length > 1 ? (
                <CountrySelect
                  countries={countries}
                  value={selectedCountry ?? ""}
                  includeKey={key}
                />
              ) : null
            }
          />
          {/* P3-Policy (2026-09-22): چارت نرخ بهرهٔ رسمی در برابر تورم کل —
              عیناً زیر چارت تورمی تا کاربر بتواند دو سیگنال (ISS و PAS) را
              کنار هم مقایسه کند. ظاهر/چینش از قالب `shahrivar_policy`. */}
          <PolicyRateChart
            series={data?.series ?? []}
            country={selectedCountry}
            target={toCpiTarget(meta) ?? getCpiTarget(selectedCountry ?? "")}
            locale={locale}
            labels={policyLabels}
            /* نام کشور داخل چارت (مثل چارت تورمی) */
            subtitle={
              countryName ? `${countryName} (${selectedCountry ?? ""})` : undefined
            }
            /* لیست کشورها — مثل چارت تورمی (هر چارت کنترل خودش را دارد) */
            right={
              countries.length > 1 ? (
                <CountrySelect
                  countries={countries}
                  value={selectedCountry ?? ""}
                  includeKey={key}
                />
              ) : null
            }
          />
          {/* P4-Growth (2026-09-22): چارت «رشد اقتصادی» (GDP Growth) —
              سومین چارت اصلی اقتصاد کشور: رشد سالانه + رشد فصلی SAAR + روند،
              با سیگنال اصلی GAS و شش سیگنال رشد. ظاهر/چینش از تم
              `shahrivar_growth` (هم‌خانوادهٔ دو چارت بالا). */}
          <GrowthChart
            series={data?.series ?? []}
            country={selectedCountry}
            locale={locale}
            labels={growthLabels}
            subtitle={
              countryName ? `${countryName} (${selectedCountry ?? ""})` : undefined
            }
            /* لیست کشورها — مثل دو چارت دیگر */
            right={
              countries.length > 1 ? (
                <CountrySelect
                  countries={countries}
                  value={selectedCountry ?? ""}
                  includeKey={key}
                />
              ) : null
            }
          />
          {/* P5-Financial (2026-09-23): چارت «شرایط مالی» (FAS) — چهارمین چارت
              اصلی: شاخص ترکیبی FCI + بازدهی ۱۰سالهٔ کشوری، با سیگنال اصلی FAS
              و شش سیگنال (Y10/Credit/DXY/Equity/Liquidity/Vol). ظاهر/چینش از
              تم `shahrivar_financial` (هم‌خانوادهٔ سه چارت بالا). */}
          <FinancialChart
            series={data?.series ?? []}
            country={selectedCountry}
            locale={locale}
            labels={financialLabels}
            subtitle={
              countryName ? `${countryName} (${selectedCountry ?? ""})` : undefined
            }
            /* لیست کشورها — مثل سه چارت دیگر */
            right={
              countries.length > 1 ? (
                <CountrySelect
                  countries={countries}
                  value={selectedCountry ?? ""}
                  includeKey={key}
                />
              ) : null
            }
          />
        </>
      )}
    </section>
  );
}

function BackendError({
  title,
  error,
  status,
  detail,
}: {
  title: string;
  error?: string;
  status: number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-medium text-warn">{title}</p>
      <p className="mt-1 text-sm text-muted">
        {error ?? "unknown"} (status {status})
        {detail ? ` — ${detail}` : ""}
      </p>
    </div>
  );
}
