# Incident Report: Instagram Feed Video Upload Failure

- Date: 2026-05-01
- Severity: High
- Scope: `web` (Instagram Feed upload path), Meta upload integration
- User impact: Instagram carousel video upload failures and repeated unstable behavior during hotfixes

## 1) Summary

The intended outcome was stable Instagram **video** carousel upload from `Instagram > Feed`.
During emergency response, multiple speculative fixes were shipped before root cause was fully isolated, which increased blast radius and caused additional regressions (type mismatch, duration schema conflict, confusing URL handling).

## 2) Primary User Impact

1. Carousel upload failed repeatedly with Meta container error (`2207076`).
2. Non-goal changes were introduced while user requirement was fixed (`video upload must stay video`).
3. Debugging time and operational trust were degraded.

## 3) What Went Wrong

### A. Root-cause isolation failure

- Two distinct axes were mixed:
  1. URL accessibility / authorization behavior
  2. Meta video validation / processing failure (`2207076`)
- Changes were applied across both axes simultaneously before hard evidence closed one axis.

### B. Requirement lock failure

- User requirement ("keep video upload path") was temporarily violated by introducing image-path fallback logic.
- This was a process error, not a user-requested behavior.

### C. Contract validation gap

- Duration clamping changed to below engine schema minimum (`targetDurationSec >= 10`), causing 422.
- Upstream contract should have been validated before deploy.

### D. Media-type inference fragility

- Type inference depended on URL shape in some path transitions.
- Proxy URL introduction increased risk of image/video type mismatch when path lost extension semantics.

## 4) Technical Timeline (Condensed)

1. Meta upload failures observed (`carousel-child`, `2207076`).
2. Error observability improved (payload/status diagnostics).
3. Temporary non-goal workaround paths introduced during investigation (later rolled back).
4. Duration clamp conflict introduced (4s) -> engine 422 -> corrected to `10~55s`.
5. Upload path normalized back to real final S3 URL delivery to Meta.

## 5) Final Corrective Direction

1. Preserve video upload path as invariant.
2. Pass actual final reachable media URL for Meta upload flow.
3. Keep strict engine contract compliance (`targetDurationSec >= 10`).
4. Separate observability-only changes from behavioral changes.

## 6) Preventive Actions (Must Keep)

### P0. Response Guardrails

1. Never switch media class (video -> image) without explicit user approval.
2. If root cause is not proven, ship **observability patch only** first.
3. One hypothesis per deploy in incident mode.

### P1. Pre-deploy Contract Checks

1. Validate upstream schema constraints (duration, required fields, enum values).
2. Validate media kind mapping source (state-driven, not path-shape-driven).

### P2. Incident Change Checklist (Required)

Before each emergency deploy:

1. Requirement lock checked (`video path invariant`)
2. Single hypothesis statement written
3. Upstream contract check passed
4. Build passed
5. Rollback condition defined
6. Expected log signature documented

### P3. Rollback Policy

- Immediate rollback trigger:
  - Any change violates primary user goal
  - New class of runtime error introduced (e.g., schema rejection, type mismatch)

## 7) Reusable Incident Template

Use this section for next incidents.

```md
# Incident: <title>
- Date:
- Severity:
- User impact:

## Symptom
-

## Proven root cause
-

## Non-causes eliminated
-

## Fix
-

## Validation evidence
-

## Preventive action
-
```

## 8) Accountability Note

This incident expanded because speculative fixes were applied before proof gates were satisfied. Future response will follow the guardrails above: requirement lock first, observability second, single-cause fix third.
