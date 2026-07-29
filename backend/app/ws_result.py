"""Enrich the raw pipeline result into the shape the browser capture page wants.

The pipeline stays UI-agnostic: it emits face boxes, FSM transitions as
(student_id, state), and a present-id list. The browser overlay and the
"present now" rail want names, register numbers, a first-seen wall-clock time,
and enter/leave events. This adapter adds exactly that — no inference, just a
display projection — so the pipeline contract (and its tests) never change.

student_id here is the register number (the enrolment id). Names come from the
roster map; anything unmatched falls back to the id so nothing renders blank.
"""

from __future__ import annotations

import time


class WsEnricher:
    def __init__(self, names: dict[str, str]) -> None:
        self._names = names
        self._first_seen: dict[str, float] = {}  # reg_no -> epoch seconds

    def _name(self, sid: str) -> str:
        return self._names.get(sid, sid)

    def enrich(self, result: dict, frame_h: int, frame_w: int) -> dict:
        ts = result.get("ts", 0.0)
        present_ids: list[str] = result.get("present", [])
        now = time.time()

        # Record first appearance (wall clock) so the UI's "3m ago" is honest.
        for sid in present_ids:
            self._first_seen.setdefault(sid, now)
        # Drop first-seen for anyone no longer present, so a re-entry restarts it.
        present_set = set(present_ids)
        for sid in list(self._first_seen):
            if sid not in present_set:
                del self._first_seen[sid]

        present = [
            {
                "student_id": sid,
                "name": self._name(sid),
                "reg_no": sid,
                "first_seen_ts": self._first_seen.get(sid, now),
            }
            for sid in present_ids
        ]
        present.sort(key=lambda p: p["first_seen_ts"])

        transitions = []
        for tr in result.get("transitions", []):
            sid = tr.get("student_id")
            state = tr.get("state")
            if sid is None:
                continue
            kind = "enter" if state == "PRESENT" else "leave"
            transitions.append(
                {
                    "kind": kind,
                    "student_id": sid,
                    "name": self._name(sid),
                    "reg_no": sid,
                    "ts": ts,
                }
            )

        return {
            "type": "result",
            "ts": ts,
            "faces": result.get("faces", []),
            "present": present,
            "transitions": transitions,
            "proctor": result.get("proctor", {"detections": [], "flags": []}),
            "sent_size": {"w": frame_w, "h": frame_h},
        }
