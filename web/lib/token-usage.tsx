"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DAILY_AI_TOKEN_LIMIT } from "@/lib/ratelimit-constants";

export type TokenUsageState = {
  used: number;
  limit: number;
  remaining: number;
  loading: boolean;
  refresh: () => Promise<void>;
  applyUsage: (used: number, remaining?: number, limit?: number) => void;
};

const TokenUsageContext = createContext<TokenUsageState | null>(null);

export function TokenUsageProvider({ children }: { children: ReactNode }) {
  const [used, setUsed] = useState(0);
  const [limit, setLimit] = useState(DAILY_AI_TOKEN_LIMIT);
  const [remaining, setRemaining] = useState(DAILY_AI_TOKEN_LIMIT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/usage", { cache: "no-store" });
      if (res.status === 401) {
        setUsed(0);
        setRemaining(DAILY_AI_TOKEN_LIMIT);
        setLimit(DAILY_AI_TOKEN_LIMIT);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        used?: number;
        remaining?: number;
        limit?: number;
      };
      setUsed(Number(data.used ?? 0));
      setLimit(Number(data.limit ?? DAILY_AI_TOKEN_LIMIT));
      setRemaining(
        Number(
          data.remaining ??
            Math.max(0, Number(data.limit ?? DAILY_AI_TOKEN_LIMIT) - Number(data.used ?? 0)),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const applyUsage = useCallback(
    (nextUsed: number, nextRemaining?: number, nextLimit?: number) => {
      const lim = nextLimit ?? limit;
      setUsed(nextUsed);
      setLimit(lim);
      setRemaining(
        typeof nextRemaining === "number"
          ? nextRemaining
          : Math.max(0, lim - nextUsed),
      );
    },
    [limit],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ used, limit, remaining, loading, refresh, applyUsage }),
    [used, limit, remaining, loading, refresh, applyUsage],
  );

  return (
    <TokenUsageContext.Provider value={value}>{children}</TokenUsageContext.Provider>
  );
}

export function useTokenUsage(): TokenUsageState {
  const ctx = useContext(TokenUsageContext);
  if (!ctx) {
    throw new Error("useTokenUsage must be used within TokenUsageProvider");
  }
  return ctx;
}
