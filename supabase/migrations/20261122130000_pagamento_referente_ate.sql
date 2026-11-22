-- Período de referência do pagamento da revendedora (22/11/2026).
-- Um pagamento feito no começo de uma quinzena geralmente quita a quinzena ANTERIOR.
-- Com "referente_ate" preenchido, o painel e o portal filtram o pagamento pela data de referência
-- (e não pela data em que o dinheiro foi pago). Sem ela, continua valendo a data do pagamento.

alter table public.revenda_pagamentos
  add column if not exists referente_ate date;

comment on column public.revenda_pagamentos.referente_ate is
  'Último dia das vendas que este pagamento quita (ex.: 2026-10-31 para a 2ª quinzena de outubro). Usado nos filtros de período no lugar de data_pagamento.';

drop function if exists public.definir_referencia_pagamento_revenda(bigint, date);

create or replace function public.definir_referencia_pagamento_revenda(
  p_pagamento_id bigint,
  p_referente_ate date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.e_admin_ou_socio() then
    raise exception 'Acesso restrito a administradores e sócios' using errcode = '42501';
  end if;

  update public.revenda_pagamentos
  set referente_ate = p_referente_ate
  where id = p_pagamento_id;

  if not found then
    raise exception 'Pagamento não encontrado' using errcode = 'P0002';
  end if;

  return jsonb_build_object('sucesso', true, 'pagamento_id', p_pagamento_id, 'referente_ate', p_referente_ate);
end;
$function$;

revoke all on function public.definir_referencia_pagamento_revenda(bigint, date) from public, anon;
grant execute on function public.definir_referencia_pagamento_revenda(bigint, date) to authenticated;

-- PIX de R$ 4.473,70 pago em 09/11/2026 quita a 2ª quinzena de outubro.
update public.revenda_pagamentos
set referente_ate = date '2026-10-31'
where id = 5 and referente_ate is null;
