# SuiScope — Project

## One-line summary

SuiScope is a public benchmarking platform for Sui infrastructure providers, measuring the real-world latency, freshness, uptime, and reliability of gRPC, GraphQL, and Archival endpoints from multiple geographic regions.

**Subtitle:** Sui Provider Bench  
**By:** Ruby Nodes

---

## Problem

It is hard to objectively compare Sui infrastructure providers. Builders rely on reputation and anecdotal experience, even though service quality differs significantly by region, endpoint type, and workload. There is no neutral, continuous, production-grade benchmark for the Sui ecosystem.

---

## Goals

- Continuously probe public Sui provider endpoints from multiple regions
- Publish comparable, precise metrics: latency, freshness, uptime, error rate, stream stability
- Give builders objective data to choose infrastructure
- Give operators a transparent quality target to optimize against
- Be a neutral party — not affiliated with any provider

---

## Non-goals

- Not a block explorer
- Not an RPC business or provider
- Not a generic uptime/status page
- No composite scoring (raw metrics only, unless an ADR approves otherwise)
- No private/authenticated endpoint benchmarking in the public leaderboard
- No validator or consensus-layer monitoring

---

## Users

**Builders and developers**
- Need to choose a Sui data provider for their app
- Want real regional performance data, not marketing claims
- Want historical trends, not one-off tests

**Infrastructure operators / providers**
- Want a neutral benchmark to measure against
- Want public proof of service quality
- Want visibility into regressions and regional weak spots

---

## Positioning

> SuiScope is a neutral infrastructure quality layer for the Sui ecosystem.

It is not competing with any provider. Its credibility depends on methodological transparency and provider-independence. The probe code is open source and the measurement definitions are public.

---

## Success criteria

- M3 complete: public leaderboard with ≥ 5 providers, 3 regions, gRPC + GraphQL metrics live
- Methodology page published before any public promotion
- No provider disputes the measurement definitions at launch
