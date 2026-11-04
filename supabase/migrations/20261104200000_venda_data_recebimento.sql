-- Data de recebimento da venda (04/11/2026).
-- A revendedora pode informar o dia em que o dinheiro vai cair (ex.: venda por marketplace que
-- repassa em alguns dias). A peça sai do estoque na hora, mas a venda só entra nos valores
-- financeiros (vendido, comissão, acerto, devido ao bazar) a partir dessa data.
-- Sem data de recebimento = comportamento de sempre (conta na data da venda).

alter table public.revenda_vendas
  add column if not exists data_recebimento date;

comment on column public.revenda_vendas.data_recebimento is
  'Dia em que o dinheiro cai para a revendedora. Enquanto for futuro, a venda não soma no financeiro; o período do acerto usa esta data quando preenchida.';

drop function if exists public.definir_data_recebimento_venda(bigint, date);

create or replace function public.definir_data_recebimento_venda(
  p_venda_id bigint,
  p_data_recebimento date default null
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

  if p_data_recebimento is not null and v_venda.data_venda is not null
     -- data_venda chega do site como "AAAA-MM-DD" (meia-noite UTC); o site também lê a data em UTC.
     and p_data_recebimento < (v_venda.data_venda at time zone 'UTC')::date then
    raise exception 'A data de recebimento não pode ser antes da data da venda' using errcode = '22023';
  end if;

  update public.revenda_vendas
  set data_recebimento = p_data_recebimento
  where id = p_venda_id;

  return jsonb_build_object(
    'sucesso', true,
    'venda_id', p_venda_id,
    'data_recebimento', p_data_recebimento
  );
end;
$function$;

revoke all on function public.definir_data_recebimento_venda(bigint, date) from public, anon;
grant execute on function public.definir_data_recebimento_venda(bigint, date) to authenticated;
