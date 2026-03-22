-- Agent rollout monitoring queries (staging/prod)
-- Reference timezone: America/Lima (UTC-5 business time)

-- 1) Health summary by company in last 24 hours
select
  company_id,
  count(*) as total_queries,
  sum(case when status = 'ok' then 1 else 0 end) as ok_queries,
  sum(case when status <> 'ok' then 1 else 0 end) as error_queries,
  round(
    100.0 * sum(case when status <> 'ok' then 1 else 0 end)::numeric / nullif(count(*), 0),
    2
  ) as error_rate_pct
from public.agent_query_logs
where created_at >= now() - interval '24 hours'
group by company_id
order by total_queries desc;

-- 2) Latency p50/p95 by company in last 24 hours
select
  company_id,
  percentile_cont(0.50) within group (order by duration_ms) as p50_ms,
  percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
  max(duration_ms) as max_ms
from public.agent_query_logs
where created_at >= now() - interval '24 hours'
  and status = 'ok'
  and duration_ms is not null
group by company_id
order by p95_ms desc nulls last;

-- 3) Top errors in last 24 hours
select
  coalesce(error_message, 'SIN_MENSAJE') as error_message,
  count(*) as total
from public.agent_query_logs
where created_at >= now() - interval '24 hours'
  and status <> 'ok'
group by coalesce(error_message, 'SIN_MENSAJE')
order by total desc
limit 20;

-- 4) Adoption trend (daily) in last 7 days
select
  (created_at at time zone 'America/Lima')::date as dia_peru,
  company_id,
  count(*) as total_queries,
  count(distinct user_id) as unique_users
from public.agent_query_logs
where created_at >= now() - interval '7 days'
group by 1, 2
order by dia_peru desc, total_queries desc;

