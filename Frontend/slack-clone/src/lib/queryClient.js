import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the server on every focus/reconnect for real-time data
      // (socket events keep the stores fresh)
      staleTime: 30_000,       // 30 s
      gcTime: 5 * 60 * 1_000, // 5 min
      retry: (failureCount, error) => {
        // Don't retry on 401/403/404 — those are deterministic failures
        if (error?.status && [401, 403, 404].includes(error.status)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Surface errors to the caller — don't swallow them globally
      throwOnError: false,
    },
  },
});
