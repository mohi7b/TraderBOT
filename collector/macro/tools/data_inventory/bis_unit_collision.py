import csv, collections, itertools

P = "/home/mohsen/TraderBOT/collector/macro/offline/bis/WS_LONG_CPI_csv_col/WS_LONG_CPI_csv_col.csv"

rows = []
with open(P, "r", encoding="utf-8", errors="replace", newline="") as f:
    rdr = csv.reader(f)
    header = next(rdr)
    # ستون‌های دیمنشن (بدون ستون‌های تاریخی)
    dim_cols = []
    for i, h in enumerate(header):
        if not h.strip().isdigit():
            dim_cols.append((i, h))
    print("dimension columns:", [h for _, h in dim_cols])
    for r in rdr:
        if not r or len(r) < 14:
            continue
        rows.append(r)

print("total data rows:", len(rows))

# ترکیب (FREQ, REF_AREA, UNIT_MEASURE, label)
combos = collections.Counter()
per_country_units = collections.defaultdict(set)
for r in rows:
    freq, ref, unit, ulabel = r[0], r[2], r[4], r[5]
    combos[(freq, unit, ulabel)] += 1
    per_country_units[ref].add((freq, unit, ulabel))

print("\n### ترکیب‌های (FREQ, UNIT_MEASURE, label) در کل فایل:")
for (freq, unit, ulabel), n in sorted(combos.items()):
    print(f"   {freq}  unit={unit:>5}  rows={n:4d}  label={ulabel}")

print("\n### کشورهای هدف — کدام UNIT_MEASURE(ها) دارند؟")
T = ["US", "CN", "JP", "DE", "GB", "FR", "IT", "CA", "AU", "KR", "IN", "TR", "MX", "BR", "RU", "SA", "ZA"]
for c in T:
    us = sorted(per_country_units.get(c, []))
    print(f"   {c}: {us}")

# نمونهٔ مقادیر واقعی هر UNIT برای یک کشور (US و AU)
print("\n### نمونهٔ مقادیر US (همهٔ ردیف‌ها، اولین تاریخ غیرخالی):")
def first_vals(r, n=6):
    out = []
    for i in range(14, len(r)):
        v = r[i].strip()
        if v:
            out.append((header[i], v))
        if len(out) >= n:
            break
    return out
for r in rows:
    if r[2] == "US":
        print(f"   freq={r[0]} unit={r[4]} ({r[5][:38]})  key={r[12]}  first={first_vals(r)}")
print("\n### نمونهٔ مقادیر AU:")
for r in rows:
    if r[2] == "AU":
        print(f"   freq={r[0]} unit={r[4]} ({r[5][:38]})  key={r[12]}  first={first_vals(r)}")
