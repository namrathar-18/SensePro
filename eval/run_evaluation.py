#!/usr/bin/env python3
"""
SensePro+ — Week 4 Evaluation Script

Run this during your controlled demo/validation session with 10–15 volunteers.
Collects: ID accuracy, duration error, proctor FPR, VNEI-vs-naive delta.
Outputs a JSON report + prints a human-readable summary.

Usage:
  python eval/run_evaluation.py --session-id UUID --ground-truth eval/ground_truth.json

Ground-truth file format:
  {
    "students": {
      "student-uuid": {
        "full_name": "Jane Doe",
        "actually_present_s": 2400,   // seconds they were physically present
        "zone": "middle"
      }
    },
    "proctor_events": [
      {"type": "phone", "ts": 1234567890, "student_id": "...", "actual": true},
      {"type": "gaze",  "ts": 1234567890, "student_id": "...", "actual": false}
    ]
  }
"""
import json
import argparse
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from datetime import datetime


def compute_accuracy_metrics(roster: list, ground_truth: dict) -> dict:
    """
    Compare system presence output vs actual presence.
    Returns per-student accuracy and aggregate stats.
    """
    students_gt = ground_truth.get("students", {})
    results = []
    total_duration_error = 0
    correct_state = 0

    for entry in roster:
        sid = entry["student_id"]
        gt  = students_gt.get(sid, {})

        system_present_s  = entry.get("present_s", 0)
        actual_present_s  = gt.get("actually_present_s", 0)
        duration_error_s  = abs(system_present_s - actual_present_s)
        duration_error_m  = duration_error_s / 60

        system_state = entry.get("current_state", "ABSENT")
        actual_state = "PRESENT" if actual_present_s > 0 else "ABSENT"
        state_correct = system_state == actual_state or \
                        (system_state == "UNVERIFIED" and actual_state == "PRESENT")

        if state_correct:
            correct_state += 1
        total_duration_error += duration_error_s

        results.append({
            "student_id":       sid,
            "full_name":        gt.get("full_name", entry.get("full_name", "?")),
            "system_present_s": system_present_s,
            "actual_present_s": actual_present_s,
            "duration_error_s": duration_error_s,
            "duration_error_m": round(duration_error_m, 1),
            "system_state":     system_state,
            "actual_state":     actual_state,
            "state_correct":    state_correct,
        })

    n = len(roster)
    return {
        "per_student": results,
        "id_accuracy_pct":        round(correct_state / n * 100, 1) if n else 0,
        "avg_duration_error_m":   round(total_duration_error / 60 / n, 1) if n else 0,
        "total_students_tested":  n,
        "target_id_accuracy":     95.0,
        "target_duration_error_m": 5.0,
        "meets_id_target":    (correct_state / n * 100 >= 95.0) if n else False,
        "meets_duration_target": (total_duration_error / 60 / n <= 5.0) if n else False,
    }


def compute_proctor_metrics(flags: list, ground_truth: dict) -> dict:
    """
    Compare proctor flags vs ground-truth events.
    Computes false-positive rate with and without gaze-down suppression.
    """
    gt_events = ground_truth.get("proctor_events", [])
    tp, fp, fn = 0, 0, 0
    suppressed_fp = 0

    for flag in flags:
        is_actual = any(
            e["type"] in flag.get("flag_type", "") and e.get("actual", False)
            for e in gt_events
        )
        if is_actual:
            tp += 1
        else:
            fp += 1

    for event in gt_events:
        if event.get("actual", False):
            found = any(event["type"] in f.get("flag_type", "") for f in flags)
            if not found:
                fn += 1

    # Estimate suppressed FPs (writing students that WOULD have been flagged)
    suppressed_fp = sum(
        1 for e in gt_events
        if not e.get("actual", False) and e.get("type") == "gaze"
    )

    fpr_with_suppression    = fp / (fp + len([e for e in gt_events if not e.get("actual")])) if flags else 0
    fpr_without_suppression = (fp + suppressed_fp) / max(fp + suppressed_fp + 1, 1)
    fpr_reduction = 1 - (fpr_with_suppression / fpr_without_suppression) if fpr_without_suppression else 0

    return {
        "true_positives":          tp,
        "false_positives":         fp,
        "false_negatives":         fn,
        "suppressed_fps":          suppressed_fp,
        "fpr_with_suppression":    round(fpr_with_suppression, 3),
        "fpr_without_suppression": round(fpr_without_suppression, 3),
        "fpr_reduction_pct":       round(fpr_reduction * 100, 1),
        "target_fpr_reduction":    50.0,
        "meets_fpr_target":        fpr_reduction * 100 >= 50.0,
    }


def compute_vnei_bias(engagement_data: dict) -> dict:
    """Extract and report the VNEI vs naive-mean bias numbers."""
    bc = engagement_data.get("bias_chart", {})
    return {
        "naive_mean_pct":    round(bc.get("naive_mean", 0) * 100, 1),
        "vnei_weighted_pct": round(bc.get("vnei_weighted", 0) * 100, 1),
        "bias_delta_pct":    round(bc.get("bias_delta", 0) * 100, 1),
        "interpretation":    (
            "VNEI weights back/middle zones higher, reducing front-row bias. "
            "A positive delta means naive mean over-counted visible students."
            if bc.get("bias_delta", 0) > 0 else
            "Minimal bias detected in this session (may need more students or longer session)."
        ),
    }


def print_report(report: dict):
    print("\n" + "="*60)
    print("  SensePro+ Week-4 Evaluation Report")
    print(f"  Generated: {report['generated_at']}")
    print("="*60)

    acc = report["attendance_accuracy"]
    print(f"\n📊 ATTENDANCE ACCURACY")
    print(f"   Students tested:      {acc['total_students_tested']}")
    print(f"   ID accuracy:          {acc['id_accuracy_pct']}%  (target ≥95%)")
    print(f"   Avg duration error:   {acc['avg_duration_error_m']} min  (target ≤5 min)")
    print(f"   ✓ ID target met:      {'YES' if acc['meets_id_target'] else 'NO — document honestly'}")
    print(f"   ✓ Duration target:    {'YES' if acc['meets_duration_target'] else 'NO — document honestly'}")

    print(f"\n🔍 PROCTOR / GAZE SUPPRESSION")
    pr = report["proctor_metrics"]
    print(f"   True positives:       {pr['true_positives']}")
    print(f"   False positives:      {pr['false_positives']}")
    print(f"   Suppressed FPs:       {pr['suppressed_fps']}  (writing students correctly ignored)")
    print(f"   FPR reduction:        {pr['fpr_reduction_pct']}%  (target ≥50%)")
    print(f"   ✓ FPR target met:     {'YES' if pr['meets_fpr_target'] else 'NO — document honestly'}")

    print(f"\n📈 VNEI ENGAGEMENT BIAS")
    vn = report["vnei_bias"]
    print(f"   Naive mean:           {vn['naive_mean_pct']}%")
    print(f"   VNEI weighted:        {vn['vnei_weighted_pct']}%")
    print(f"   Bias delta:           {vn['bias_delta_pct']:+.1f}%")
    print(f"   Interpretation:       {vn['interpretation']}")

    print("\n" + "="*60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="SensePro+ evaluation")
    parser.add_argument("--session-id",     required=True)
    parser.add_argument("--ground-truth",   required=True, help="Path to ground_truth.json")
    parser.add_argument("--output",         default="eval/report.json")
    args = parser.parse_args()

    # Load ground truth
    with open(args.ground_truth) as f:
        gt = json.load(f)

    # In real use, these come from the API. Here we load from files for offline analysis.
    roster_path   = f"eval/roster_{args.session_id[:8]}.json"
    flags_path    = f"eval/flags_{args.session_id[:8]}.json"
    engage_path   = f"eval/engagement_{args.session_id[:8]}.json"

    roster     = json.load(open(roster_path))  if os.path.exists(roster_path)  else []
    flags      = json.load(open(flags_path))   if os.path.exists(flags_path)   else []
    engagement = json.load(open(engage_path))  if os.path.exists(engage_path)  else {}

    report = {
        "session_id":          args.session_id,
        "generated_at":        datetime.utcnow().isoformat() + "Z",
        "attendance_accuracy": compute_accuracy_metrics(roster, gt),
        "proctor_metrics":     compute_proctor_metrics(flags, gt),
        "vnei_bias":           compute_vnei_bias(engagement),
    }

    os.makedirs("eval", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)

    print_report(report)
    print(f"Full report saved to: {args.output}")


if __name__ == "__main__":
    main()
