# Live AI Evidence Notes

Date: 2026-03-03

## 1) LLM-hit capture
- Command: `npm run a3:evidence:ai`
- Output: `assignments/homework3/live-ai-evidence.json`
- Result:
  - `environmentHasLlmHit = true`
  - `policyHasLlmHit = true`

## 2) Fallback capture
- Command used: `$env:OPENAI_API_KEY='invalid'; npm run a3:evidence:ai`
- Output: `assignments/homework3/live-ai-evidence-fallback.json`
- Result:
  - `environmentHasLlmHit = false`
  - `policyHasLlmHit = false`
  - Error sample: OpenAI HTTP 401 invalid API key

## Interpretation
- The same runtime chain supports both modes:
  1. LLM mode can produce valid non-fallback decisions.
  2. Failure mode falls back deterministically without breaking simulation.
