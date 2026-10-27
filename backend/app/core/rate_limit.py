"""Per-user ceilings on AI calls: a short burst window and a daily cap.

In-memory on purpose (no extra infrastructure), so the numbers are per server
process. Behind several workers/instances each one counts separately — move
this to Redis if the API is ever scaled out.
"""

import time
from collections import defaultdict, deque
from collections.abc import Callable

MINUTE = 60
DAY = 24 * 60 * 60


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int, scope: str):
        super().__init__(scope)
        self.retry_after = retry_after
        self.scope = scope


class UserRateLimiter:
    def __init__(self, per_minute: int, per_day: int, clock: Callable[[], float] = time.monotonic):
        self.per_minute = per_minute
        self.per_day = per_day
        self._clock = clock
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def check(self, user_id: str) -> None:
        """Counts one call for the user, or raises RateLimitExceeded without counting it."""
        now = self._clock()
        calls = self._calls[user_id]
        while calls and now - calls[0] > DAY:
            calls.popleft()

        if len(calls) >= self.per_day:
            raise RateLimitExceeded(int(DAY - (now - calls[0])) + 1, "day")
        recent = [moment for moment in calls if now - moment <= MINUTE]
        if len(recent) >= self.per_minute:
            raise RateLimitExceeded(int(MINUTE - (now - recent[0])) + 1, "minute")

        calls.append(now)
