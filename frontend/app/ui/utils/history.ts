/** آخرین n ماه از یک سری تاریخ‌دار (ژنریک ⇒ بدون `any`). */
export const getLastMonths = <T,>(history: T[], months: number) => history.slice(-months);
