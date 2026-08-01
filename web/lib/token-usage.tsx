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
  warning: string | null;
  refresh: () => Promise<void>;
  applyUsage: (used: number, remaining?: number, limit?: number) => void;
};

const TokenUsageContext = createContext<TokenUsageState | null>(null);

export function TokenUsageProvider({ children }: { children: ReactNode }) {
  const [used, setUsed] = useState(0);
  const [limit, setLimit] = useState(DAILY_AI_TOKEN_LIMIT);
  const [remaining, setRemaining] = useState(DAILY_AI_TOKEN_LIMIT);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/usage", { cache: "no-store" });
      if (res.status === 401) {
        setUsed(0);
        setRemaining(DAILY_AI_TOKEN_LIMIT);
        setLimit(DAILY_AI_TOKEN_LIMIT);
        setWarning(null);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        used?: number;
        remaining?: number;
        limit?: number;
        warning?: string;
        unavailable?: boolean;
      };
      if (!res.ok || data.unavailable) {
        setUsed(Number(data.used ?? 0));
        setLimit(Number(data.limit ?? DAILY_AI_TOKEN_LIMIT));
        setRemaining(Number(data.remaining ?? 0));
        setWarning("Quota unavailable");
        return;
      }
      setUsed(Number(data.used ?? 0));
      setLimit(Number(data.limit ?? DAILY_AI_TOKEN_LIMIT));
      setRemaining(
        Number(
          data.remaining ??
            Math.max(0, Number(data.limit ?? DAILY_AI_TOKEN_LIMIT) - Number(data.used ?? 0)),
        ),
      );
      setWarning(typeof data.warning === "string" ? data.warning : null);
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
      setWarning(null);
    },
    [limit],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ used, limit, remaining, loading, warning, refresh, applyUsage }),
    [used, limit, remaining, loading, warning, refresh, applyUsage],
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
