revoke all on sequence public.secretary_audit_logs_id_seq from public,anon,authenticated;
grant usage,select on sequence public.secretary_audit_logs_id_seq to service_role;
