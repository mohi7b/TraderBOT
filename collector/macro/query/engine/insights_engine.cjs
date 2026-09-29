"use strict";

/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/query/engine/insights_engine.cjs
 * Description:
 *   Insights Engine — Phase 14 (Chalak / ultra-light build).
 *   Maps the Phase 13 intelligence labels into short human-readable
 *   Persian insights. Pure text mapping — no data processing.
 *
 *   Input:
 *     { inflation_trend, growth_trend, policy_stance }
 *   Output:
 *     { inflation_insight, growth_insight, policy_insight }
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const INFLATION_TEXT = {
  falling: "تورم در مسیر نزولی قرار دارد…",
  rising: "فشار تورمی در حال افزایش است…",
  stable: "تورم در وضعیت باثباتی قرار دارد…",
  unknown: "داده‌ی کافی برای تحلیل روند تورم در دسترس نیست.",
};

const GROWTH_TEXT = {
  improving: "رشد اقتصادی در حال تقویت است…",
  weakening: "رشد اقتصادی تضعیف شده…",
  flat: "رشد اقتصادی تغییر قابل‌توجهی ندارد…",
  unknown: "داده‌ی کافی برای تحلیل روند رشد در دسترس نیست.",
};

const POLICY_TEXT = {
  tight: "سیاست پولی در وضعیت انقباضی است…",
  loose: "سیاست پولی در وضعیت انبساطی قرار دارد…",
  neutral: "سیاست پولی در وضعیت خنثی قرار دارد…",
  unknown: "داده‌ی کافی برای تحلیل سیاست پولی در دسترس نیست.",
};

/**
 * Generates short Persian insights from the intelligence labels.
 *
 * @param {object} intel - { inflation_trend, growth_trend, policy_stance }
 * @returns {object}     - { inflation_insight, growth_insight, policy_insight }
 */
function generateInsights(intel) {
  const data = intel && typeof intel === "object" ? intel : {};
  return {
    inflation_insight: INFLATION_TEXT[data.inflation_trend] || INFLATION_TEXT.unknown,
    growth_insight: GROWTH_TEXT[data.growth_trend] || GROWTH_TEXT.unknown,
    policy_insight: POLICY_TEXT[data.policy_stance] || POLICY_TEXT.unknown,
  };
}

module.exports = { generateInsights };
