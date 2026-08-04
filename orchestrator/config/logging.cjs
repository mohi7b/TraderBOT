/**
 * ============================================================
 *  File: logging.cjs
 *  Path: orchestrator/config/logging.cjs
 *  Version: 5.0.0
 *  Description:
 *      Logging configuration for TraderBOT Enterprise.
 *      Controls console/file logging, verbosity levels,
 *      and maximum file size for log rotation.
 *
 *  Author: Mohsen + Copilot (Microsoft)
 *  Created: 2025-02-17
 *  Last Updated: 2025-02-17
 * ============================================================
 */

module.exports = {

    /* Logging Level
     * ------------------------------------------------------------
     * debug   → verbose logs for development
     * info    → standard operational logs
     * warn    → warnings only
     * error   → errors only
     */
    level: "debug",

    /* Console Logging
     * ------------------------------------------------------------
     * true  → print logs to terminal
     * false → silent console
     */
    console: true,

    /* File Logging
     * ------------------------------------------------------------
     * true  → write logs to file
     * false → disable file logging
     */
    file: false,

    /* Maximum Log File Size (MB)
     * ------------------------------------------------------------
     * When file logging is enabled, log rotation will occur
     * once the file exceeds this size.
     */
    maxFileSizeMB: 50
};
