"""reg_no -> full_name lookup for the live UI.

Embeddings key on the register number (the enrolment id); the browser roster
and capture overlay want human names. This maps one to the other from a small
JSON (backend/data/roster.json), shipped with the class list. It is a display
convenience only: no identity decision depends on it, and a missing name simply
falls back to the register number.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger("sensepro.roster")


def load_roster_names(path: str | Path) -> dict[str, str]:
    """Load {reg_no: full_name}. Returns {} (and logs) if the file is absent or
    malformed — the pipeline must never fail because a display map is missing."""
    p = Path(path)
    if not p.exists():
        logger.info("roster names file not found at %s — showing ids only", p)
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("could not read roster names (%s): %s", p, exc)
        return {}
    return {str(k): str(v) for k, v in data.items()}
