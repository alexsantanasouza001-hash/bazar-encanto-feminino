begin;

-- Limpeza pontual dos registros acumulados de rate limit durante a bateria de testes em Sandbox
delete from public.checkout_rate_limits;

commit;
