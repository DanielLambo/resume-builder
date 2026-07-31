"""Tiny in-process rate limiter for anonymous public endpoints."""
from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_s: float):
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


# Generous enough for demos; stops quota burn / pdflatex DoS.
AI_LIMIT = RateLimiter(20, 60.0)       # 20 AI calls / min / IP
COMPILE_LIMIT = RateLimiter(30, 60.0)  # 30 compiles / min / IP
UPLOAD_LIMIT = RateLimiter(10, 60.0)   # 10 uploads / min / IP


def client_ip(request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client:
        return request.client.host or "unknown"
    return "unknown"
