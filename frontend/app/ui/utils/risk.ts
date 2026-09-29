/** پرچم ریسک از payload بک‌اند — شکل حداقلی و مستند (بدون `any`). */
export const hasRisk = (riskFlags?: { has_risk?: boolean } | null) =>
  riskFlags?.has_risk === true;
