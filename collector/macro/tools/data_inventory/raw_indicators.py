import sqlite3, collections

RAW = "/home/mohsen/TraderBOT/collector/macro/db/macro.db"
T17 = ["USA","CHN","JPN","DEU","GBR","FRA","ITA","CAN","AUS","KOR","IND","TUR","MEX","BRA","RUS","SAU","ZAF"]
ISO2 = {"USA":"US","CHN":"CN","JPN":"JP","DEU":"DE","GBR":"GB","FRA":"FR","ITA":"IT","CAN":"CA",
        "AUS":"AU","KOR":"KR","IND":"IN","TUR":"TR","MEX":"MX","BRA":"BR","RUS":"RU","SAU":"SA","ZAF":"ZA"}
raw = sqlite3.connect(f"file:{RAW}?mode=ro", uri=True)

CPI_LIKE = ("%CPI%", "%HICP%", "%PRICE%", "%INFL%", "%PCORE%", "%PPI%", "%DEFL%")

for ds in ("OECD", "BIS", "IMF", "EUROSTAT", "FRED", "OWID", "WB"):
    inds = raw.execute(
        "SELECT indicator, COUNT(*) n, COUNT(DISTINCT country) c FROM series "
        "WHERE dataset=? GROUP BY indicator ORDER BY n DESC", (ds,)).fetchall()
    print("=" * 110)
    print(f"### {ds} — {len(inds)} اندیکاتور در دیتابیس خام")
    # کشورهای حاضر در دیتابیس خام (برای BIS کد دوحرفی است)
    if ds != "WB":   # WB کامل لیست می‌شود ولی فقط خلاصه
        for ind, n, c in inds:
            rows = raw.execute(
                "SELECT country, frequency FROM series WHERE dataset=? AND indicator=?",
                (ds, ind)).fetchall()
            have17 = []
            for iso, iso2 in ISO2.items():
                if any((r[0] or "").upper() in (iso, iso2) for r in rows):
                    have17.append(iso)
            iscpi = any(p.replace("%", "") in ind.upper() for p in CPI_LIKE)
            flag = "  <<< CPI-family" if iscpi else ""
            freqs = collections.Counter(f for _, f in rows)
            print(f"  {ind:26} series={n:5d} ctry={c:4d} of17={len(have17):2d} {dict(freqs)}{flag}")
            if iscpi:
                print(f"        → 17-country coverage: {','.join(have17) if have17 else 'NONE'}")
    else:
        hits = [(i, n, c) for i, n, c in inds if any(p.replace("%", "") in i.upper() for p in ("CPI", "PPI", "DEFL", "PRICE"))]
        print(f"  (WB: {len(inds)} کد — فقط کدهای CPI/PPI/PRICE/Deflator نشان داده می‌شود)")
        for ind, n, c in hits:
            rows = raw.execute("SELECT country FROM series WHERE dataset='WB' AND indicator=?", (ind,)).fetchall()
            have17 = [iso for iso in T17 if any((r[0] or "").upper() == iso for r in rows)]
            print(f"  {ind:24} series={n:5d} ctry={c:4d} of17={len(have17):2d}")
