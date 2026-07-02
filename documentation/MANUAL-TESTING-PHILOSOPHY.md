# Manual Testing Philosophy

_When and why a human is asked to test — and when they are not._ ESRI-01. One of the most
important operating rules of the ecosystem.

## The rule

> **Human manual testing is the FINAL validation step, not part of engineering verification.**
> A human is asked to validate only **after** every automated gate is green and the
> [Release Readiness Checklist](RELEASE-READINESS-CHECKLIST.md) is fully satisfied.

Do not ask a person to verify something engineering can verify first. Their time is the
scarcest resource in the loop; spend it on judgment, not on catching bugs a test would catch.

## Why

- **Engineering correctness is machine-verifiable** — tests, fitness, conformance, CI, a
  self-verifying container, and independent review already prove the code is correct,
  architecture-legal, deployable, and provider-independent.
- **Human judgment is not machine-verifiable** — whether the product *feels* calm, clear,
  trustworthy, and worth using; whether the experience is right. That is what a human should
  spend attention on.

## What engineering must exhaust first (before asking)

Architecture review · unit + integration + E2E tests · fitness · conformance · CI · container
build · deployment-package render · provider-independence · recovery/upgrade/rollback ·
security · performance · health · accessibility · independent review — **all green** (the
checklist). If any of these can catch it, engineering catches it — not the human.

## What the human validates (experience, not correctness)

- Does the product do what it promises, and does it *feel* right end to end?
- Is the pipeline transparent and the trust honest?
- Are failures explained in a way a real user would understand?
- Is anything confusing, jarring, or missing from a **product** standpoint?
- Would you use it every day?

## The handoff

Engineering provides a short, **experience-focused** manual-validation script — a few real
scenarios to walk through — not a list of assertions engineering already automated. The human
gives product feedback; engineering does not ask them to re-run the test suite by hand.

## For agents

When you (an AI engineer) complete work: run and report the automated gates, build/verify the
container and deployment package, complete the checklist, and only **then** present a concise
manual-validation script. Never ask the human to verify engineering correctness you could have
verified yourself.
