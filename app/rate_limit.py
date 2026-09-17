"""Tiny in-process rate limiter for anonymous public endpoints."""
from __future__ import annotations

import time
from collections import defaultdict, deque

_SWEEP_EVERY = 1000  # calls between stale-key sweeps, across all limiter instances


class RateLimiter:
    def __init__(self, limit: int, window_s: float):
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._calls = 0

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)

        self._calls += 1
        if self._calls >= _SWEEP_EVERY:
            self._calls = 0
            self._sweep(now)
        return True

    def _sweep(self, now: float) -> None:
        """Drop keys whose queue has fully expired, so IPs that stop
        hitting the endpoint don't linger in memory for the server's
        lifetime."""
        stale = [
            k for k, q in self._hits.items()
            if not q or now - q[-1] > self.window
        ]
        for k in stale:
            del self._hits[k]


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
