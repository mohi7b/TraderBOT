#!/bin/bash

TARGET_DIR="/root/TraderBOT/collector/macro/offline/bis"
mkdir -p "$TARGET_DIR"

echo "=============================================="
echo "   BIS SDMX Downloader (No Browser Needed)"
echo "=============================================="

DATASETS=(
    "WS_LBS_D_PUB"
    "WS_CBS_PUB"
    "WS_CNF_PUB"
    "WS_CG_PUB"
    "WS_DSR_PUB"
    "WS_DSS_PUB"
    "WS_IDS_PUB"
    "WS_GLI_PUB"
    "WS_ETD_PUB"
    "WS_OTC_PUB"
    "WS_TS_PUB"
    "WS_RPP_PUB"
    "WS_CPP_PUB"
    "WS_CPI_PUB"
    "WS_BER_PUB"
    "WS_EER_PUB"
    "WS_CBTA_PUB"
    "WS_CBPR_PUB"
    "WS_RP_PUB"
    "WS_FMI_PUB"
)

for dataset in "${DATASETS[@]}"; do
    echo ""
    echo "Downloading SDMX for: $dataset"

    URL="https://stats.bis.org/api/v1/${dataset}?format=sdmx-json&detail=full"
    OUT="${TARGET_DIR}/${dataset}.json"

    wget -O "$OUT" "$URL"
done

echo ""
echo "=============================================="
echo "   BIS SDMX Download Completed"
echo "=============================================="
