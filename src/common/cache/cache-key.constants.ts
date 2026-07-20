export const CacheKeys = {
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  CASE_DETAIL: (caseId: string) => `case:detail:${caseId}`,
  NOTIFICATION_COUNT: (userId: string) => `notification:count:${userId}`,
  DASHBOARD: (userId: string) => `dashboard:${userId}`,
};

export const CacheTTL = {
  SHORT: 60,
  MEDIUM: 300,
  LONG: 3600,
} as const;
