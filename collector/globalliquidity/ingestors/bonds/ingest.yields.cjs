const httpGet = require('../../utils/httpClient.cjs');
const logger = require('../../utils/logger.cjs');
const apiConfig = require('../../config/api.config.cjs');

module.exports = async function ingestBondYields() {
    try {
        const url = apiConfig.bonds.yields;
        const data = await httpGet(url);

        if (data.error) {
            logger.error(`ingestBondYields failed: ${data.message}`);
            return { error: true };
        }

        return {
            timestamp: new Date().toISOString(),
            type: "bond_yields",
            raw: data
        };

    } catch (err) {
        logger.error(`ingestBondYields exception: ${err.message}`);
        return { error: true };
    }
};
