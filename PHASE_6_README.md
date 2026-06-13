# Helio Phase 6 Roadmap (Deferred)

Status: Deferred intentionally while Phase 1-5 core autonomous functionality is validated in real use.

This document is the handoff point for resuming Phase 6 once core functionality is verified.

## Why Deferred

Phase 6 is primarily scale, reliability-hardening, and enterprise maturity work.  
Current priority is proving Helio's core autonomous SEO/GEO/AEO behavior on real connected domains.

## Entry Criteria (When to Start Phase 6)

Start Phase 6 only after all of the following are true:

1. Core modules produce stable real outputs on live integrations for at least 2 organizations.
2. Autonomy runs complete on schedule without manual recovery for at least 14 days.
3. Execution queue forecasts show acceptable calibration trend (improving realization ratios).
4. Rollback and auto-stop paths are exercised in real scenarios and confirmed reliable.
5. Production readiness checklist remains >= 85% for target organizations.

## Phase 6 Scope

### 6.1 Multi-Domain Portfolio per Organization

Goal: Allow each org to manage multiple websites/domains under one org account.

- Domain registry model per org
- Domain-scoped integrations and data partitions
- Domain switcher in UI
- Cross-domain reporting and prioritization

### 6.2 Native Execution Connectors

Goal: Replace generic webhook bridge with direct platform integrations.

- WordPress connector
- Shopify connector
- Webflow connector
- GitHub PR automation for code-backed sites
- Connector-level rollback metadata

### 6.3 Task-Level Attribution and Causal Tracking

Goal: Strongly tie actions to measured outcomes.

- Pre/post metric snapshots by action
- Attribution confidence scoring per task
- Baseline controls to reduce false attribution
- Impact timeline per executed change

### 6.4 Team Workflow and Governance

Goal: Enable teams to operate Helio safely at scale.

- Roles and permissions
- Approval chains by policy risk level
- Immutable audit export
- Organization activity feed

### 6.5 Runtime Reliability and Queue Hardening

Goal: Make autonomy robust in production environments.

- Durable background queue (retry, backoff, DLQ)
- Idempotency keys for action execution
- Worker heartbeats and stuck-run recovery
- Failure budget and auto-throttle

### 6.6 Observability and Alerting

Goal: Detect and respond to issues early.

- Structured logs by org/domain/run/action
- Error-rate, run-success, and latency dashboards
- Alerting on run failures/degradation spikes
- SLOs for autonomy success paths

### 6.7 Security and Compliance Hardening

Goal: Enterprise-safe operation.

- Secret vault and rotation policy
- Tenant isolation checks and tests
- Access audit trails
- Optional compliance-ready export paths

### 6.8 Experimentation Layer (SEO Change Testing)

Goal: Move from heuristic change rollout to controlled experimentation.

- Experiment definitions by page/query cluster
- Variant assignment and holdouts
- Win criteria and stop conditions
- Auto-promotion of winning variants

## Suggested Execution Order

1. 6.5 Runtime Reliability and Queue Hardening
2. 6.6 Observability and Alerting
3. 6.2 Native Execution Connectors
4. 6.3 Task-Level Attribution and Causal Tracking
5. 6.1 Multi-Domain Portfolio per Organization
6. 6.4 Team Workflow and Governance
7. 6.7 Security and Compliance Hardening
8. 6.8 Experimentation Layer

Rationale: stability first, then execution depth, then scale and governance.

## Phase 6 Exit Criteria

Phase 6 is complete when:

1. Helio can execute low-risk changes directly on at least 2 native platforms.
2. Every executed action has verifiable post-change attribution metadata.
3. Autonomy uptime and success SLOs are met for 30 consecutive days.
4. Multi-domain workflows are production-ready per organization.
5. Team governance and audit requirements are fully operational.

## Notes

- Keep core behavior deterministic-first; AI remains enhancement, not source of truth.
- Preserve rollback safety and auto-stop as non-negotiable guardrails.
- Do not expand scope if entry criteria are not met.
