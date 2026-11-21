-- Cartão: parcelas e taxa da maquininha nas vendas da revendedora (21/11/2026).
-- Quando a venda é no Cartão, a revendedora escolhe 1x, 2x ou 3x. A taxa da maquininha
-- (1x 4,20% | 2x 6,09% | 3x 7,01%) é calculada aqui no banco, sobre o valor final da venda,
-- e sai do LUCRO antes da divisão entre Bazar e revendedora:
--   lucro = venda - comissão - custo - taxa do cartão  →  dividido pelo percentual do cadastro.
-- Vendas antigas no Cartão (sem parcelas informadas) continuam sem taxa.

alter table public.revenda_vendas
  add column if not exists parcelas_cartao smallint,
  add column if not exists taxa_cartao_percentual numeric(5,2) not null default 0,
  add column if not exists valor_taxa_cartao numeric(10,2) not null default 0;

comment on column public.revenda_vendas.parcelas_cartao is
  'Parcelas no cartão de crédito (1 a 3). Nulo quando a venda não é no cartão ou foi lançada antes desta regra.';
comment on column public.revenda_vendas.taxa_cartao_percentual is
  'Taxa da maquininha (%) conforme as parcelas. Calculada pelo trigger calcular_taxa_cartao_revenda_venda.';
comment on column public.revenda_vendas.valor_taxa_cartao is
  'Valor da taxa da maquininha (R$) sobre o valor final da venda. Sai do lucro antes da divisão.';

-- Tabela de taxas (mantida igual a TAXAS_CARTAO_REVENDA em src/pages/portal-revendedora/portalHelpers.js)
create or replace function public.taxa_cartao_revenda_percentual(p_parcelas integer)
returns numeric
language sql
immutable
as $function$
  select case p_parcelas
    when 1 then 4.20
    when 2 then 6.09
    when 3 then 7.01
    else 0
  end::numeric
$function$;

-- Recalcula a taxa sempre que a venda é criada ou editada (valor, desconto, forma de pagamento ou parcelas).
create or replace function public.calcular_taxa_cartao_revenda_venda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_percentual numeric;
begin
  if coalesce(new.forma_pagamento, '') = 'Cartão' and new.parcelas_cartao between 1 and 3 then
    v_percentual := public.taxa_cartao_revenda_percentual(new.parcelas_cartao);
    new.taxa_cartao_percentual := v_percentual;
    new.valor_taxa_cartao := round(
      coalesce(new.total_venda, new.valor_total_bruto, 0) * v_percentual / 100.0,
      2
    );
  else
    if coalesce(new.forma_pagamento, '') <> 'Cartão' then
      new.parcelas_cartao := null;
    end if;
    new.taxa_cartao_percentual := 0;
    new.valor_taxa_cartao := 0;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_calcular_taxa_cartao_revenda_venda on public.revenda_vendas;
create trigger trg_calcular_taxa_cartao_revenda_venda
  before insert or update on public.revenda_vendas
  for each row
  execute function public.calcular_taxa_cartao_revenda_venda();

-- A revendedora (ou admin/sócio) informa as parcelas da venda no cartão.
drop function if exists public.definir_parcelas_cartao_venda(bigint, integer);

create or replace function public.definir_parcelas_cartao_venda(
  p_venda_id bigint,
  p_parcelas integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_venda public.revenda_vendas%rowtype;
  v_minha_revendedora bigint;
begin
  select * into v_venda from public.revenda_vendas where id = p_venda_id for update;
  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;

  if not public.e_admin_ou_socio() then
    v_minha_revendedora := public.obter_minha_revendedora_id();
    if v_minha_revendedora is null or v_venda.revendedora_id <> v_minha_revendedora then
      raise exception 'Você não pode alterar esta venda' using errcode = '42501';
    end if;
    if coalesce(v_venda.status, 'CONFIRMADA') <> 'CONFIRMADA' then
      raise exception 'Só é possível alterar vendas ativas' using errcode = '22023';
    end if;
  end if;

  if p_parcelas is not null and (p_parcelas < 1 or p_parcelas > 3) then
    raise exception 'Parcelamento no cartão permitido de 1x a 3x' using errcode = '22023';
  end if;

  update public.revenda_vendas
  set parcelas_cartao = case when coalesce(forma_pagamento, '') = 'Cartão' then p_parcelas else null end
  where id = p_venda_id
  returning * into v_venda;

  return jsonb_build_object(
    'sucesso', true,
    'venda_id', p_venda_id,
    'parcelas_cartao', v_venda.parcelas_cartao,
    'taxa_cartao_percentual', v_venda.taxa_cartao_percentual,
    'valor_taxa_cartao', v_venda.valor_taxa_cartao
  );
end;
$function$;

revoke all on function public.definir_parcelas_cartao_venda(bigint, integer) from public, anon;
grant execute on function public.definir_parcelas_cartao_venda(bigint, integer) to authenticated;
