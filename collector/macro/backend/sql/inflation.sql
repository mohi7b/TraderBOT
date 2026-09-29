-- backend/sql/inflation.sql

SELECT
    s.id AS series_id,
    s.country,
    s.indicator,
    s.frequency,
    s.unit,
    s.dataset,
    d.date AS latest_date,
    d.value AS latest_value
FROM series s
JOIN data d ON d.series_id = s.id
WHERE s.indicator IN ('CPI','CORE_CPI','PPI','EXPECTATIONS')
  AND s.frequency = 'M'
  AND s.valid_to IS NULL
  AND d.valid_to IS NULL
  AND d.date >= date('now','-24 months')
ORDER BY d.date DESC;
