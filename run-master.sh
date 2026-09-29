#!/bin/bash

# فایل مادر: مسئول اجرای حلقه‌ها و کارهای مختلف
#  sudo systemctl daemon-reload
#  sudo systemctl enable traderbot-master.service
#  sudo systemctl start traderbot-master.service

#  sudo systemctl stop traderbot-master.service
#  sudo systemctl disable traderbot-master.service



#!/bin/bash

###############################################
# TraderBOT Master Runner
# مدیریت اجرای تمام بخش‌های سیستم
###############################################

# تنظیمات زمانی
CRYPTO_INTERVAL=60            # هر 1 دقیقه
MACRO_INTERVAL=$((60 * 120))   # هر 2 ساعت

# زمان آخرین اجرا
LAST_CRYPTO_RUN=0
LAST_MACRO_RUN=0


###############################################
# توابع اجرای بخش‌های مختلف
###############################################

run_crypto_update() {
    echo "[CRYPTO] Running update-all..."
    node collector/crypto/historical/full/run-update-all.cjs BTCUSDT
}

run_macro_update() {
    echo "[MACRO] Running macro update..."
    node collector/macro/update/update_live.cjs
}


###############################################
# حلقهٔ اصلی
###############################################

while true; do
    NOW=$(date +%s)

    # --- اجرای کریپتو ---
    if (( NOW - LAST_CRYPTO_RUN >= CRYPTO_INTERVAL )); then
        run_crypto_update
        LAST_CRYPTO_RUN=$NOW
    fi

    # --- اجرای ماکرو ---
    if (( NOW - LAST_MACRO_RUN >= MACRO_INTERVAL )); then
        run_macro_update
        LAST_MACRO_RUN=$NOW
    fi

    sleep 1
done
