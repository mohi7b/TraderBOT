/**
 * ============================================================
 * Project: Macro Engine Collector
 * File: collector/macro/utils/fetch.cjs
 * Description:
 *   Universal fetch wrapper for all macro collectors.
 *   Features:
 *     - GET / POST requests
 *     - Automatic JSON parsing
 *     - Timeout handling
 *     - Retry mechanism
 *     - Error normalization
 *     - Fully CJS (CommonJS)
 *
 * Author: Mohsen + Copilot
 * ============================================================
 */

const { setTimeout: delay } = require("timers/promises");

/**
 * Perform HTTP request with retry + timeout
 *
 * @param {string} url - API endpoint
 * @param {object} options - fetch options (method, headers, body)
 * @param {number} retries - number of retries
 * @param {number} timeoutMs - timeout in milliseconds
 *
 * @returns {object} JSON response or error object
 */
async function httpRequest(url, options = {}, retries = 3, timeoutMs = 8000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        return await response.json();
      }

      return await response.text();
    } catch (err) {
      if (attempt === retries) {
        return {
          success: false,
          error: err.message,
          url,
          attempt
        };
      }

      // Wait before retry
      await delay(300 * attempt);
    }
  }
}

/**
 * GET request helper
 */
async function get(url, headers = {}, retries = 3, timeoutMs = 8000) {
  return httpRequest(
    url,
    {
      method: "GET",
      headers: {
        "User-Agent": "MacroCollector/1.0",
        ...headers
      }
    },
    retries,
    timeoutMs
  );
}

/**
 * POST request helper
 */
async function post(url, body = {}, headers = {}, retries = 3, timeoutMs = 8000) {
  return httpRequest(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MacroCollector/1.0",
        ...headers
      },
      body: JSON.stringify(body)
    },
    retries,
    timeoutMs
  );
}

module.exports = {
  get,
  post,
  httpRequest
};
