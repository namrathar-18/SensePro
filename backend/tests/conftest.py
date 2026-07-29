"""Test hygiene: keep the suite deterministic regardless of a developer's local
backend/.env (which may enable insightface, Supabase, or a lowered k-floor).

These env overrides are applied at import — before pytest imports any test
module, and therefore before app.config builds its Settings singleton — so the
tests always run on the dependency-free stub backend with no network and the
production k-anonymity floor, exactly like CI.
"""

import os

os.environ["VISION_BACKEND"] = "stub"
os.environ["PROCTOR_BACKEND"] = "stub"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["ENGAGEMENT_K_MIN"] = "5"
# Never load a real (insightface, 512-d) enrolment file into the stub tests.
os.environ["ENROLLMENT_JSON"] = "tests/_no_enrollments.json"
