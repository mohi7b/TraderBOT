#!/bin/bash

echo "🚀 Force pushing to GitHub..."

# اضافه کردن همه تغییرات
git add .

# ساخت کامیت اتوماتیک با تاریخ
git commit -m "Auto force push: $(date '+%Y-%m-%d %H:%M:%S')" || echo "ℹ️ No changes to commit"

# پوش با فورس
git push origin master --force

echo "✅ Force push completed."
