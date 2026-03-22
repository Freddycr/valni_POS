# Phase 3 - Klisk Agent

Implemented in this project:

- System prompt with business and security guardrails in `src/main.py`.
- Tools in `src/tools/semantic.py`:
  - `plan_semantic_query`
  - `execute_semantic_query` (expects `dsl_json`, optional `user_id` + `question` for observability)
  - `explain_semantic_result` (expects `execution_result_json`)
- Ambiguity handling:
  - asks for missing metric
  - asks for missing date range
- Response traceability payload:
  - metric(s), date range, filters, company_id, row_count, duration_ms

## Required environment variables

- `OPENROUTER_API_KEY` (recommended with default model `openrouter/google/gemini-2.0-flash-001`)
  - Alternatively: `OPENAI_API_KEY` if you switch `AGENT_MODEL` to an OpenAI model.
- `SEMANTIC_SERVICE_URL` (default `http://127.0.0.1:8787/semantic-query`)
- `DEFAULT_COMPANY_ID` (optional but recommended)
- `BUSINESS_TIMEZONE` (default `America/Lima`)
- `AGENT_MODEL` (optional, defaults to `openrouter/google/gemini-2.0-flash-001`)

## Run locally

1. Start semantic service in the repo:

```bash
npm run semantic:server
```

2. Start Klisk agent in this project:

```bash
klisk start . --port 8080
```

