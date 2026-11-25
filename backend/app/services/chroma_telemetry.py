"""No-op Chroma product telemetry.

Chroma 0.5.0 calls ``posthog.capture`` with an obsolete signature and logs a
stack trace on every client construction. We do not send product telemetry;
this client exists so the setting can point at a quiet, valid implementation.
"""

from chromadb.telemetry.product.posthog import Posthog
from overrides import override


class QuietPosthog(Posthog):
    @override
    def capture(self, event) -> None:  # noqa: D401 - deliberately silent
        """Discard the event instead of calling the broken posthog SDK."""
        return None
