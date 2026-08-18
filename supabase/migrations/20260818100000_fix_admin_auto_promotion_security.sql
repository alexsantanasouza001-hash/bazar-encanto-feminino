-- ====================================================================
-- MIGRATION: CORREÇÃO DE SEGURANÇA — REMOVER PROMOÇÃO INDEVIDA DE ADMIN
-- BAZAR ENCANTO FEMININO
-- ====================================================================

begin;

-- 1. LIMPAR REGISTROS INDEVIDOS NA TABELA ADMIN_USUARIOS
-- Preserva administradores legítimos (com role 'admin' no auth.users)
-- e registros atribuídos explicitamente (como sócio ou operador).
-- Remove usuários que foram inseridos indevidamente pela regra ampla 'email is not null'.
delete from public.admin_usuarios
where user_id not in (
  select id
  from auth.users
  where coalesce(raw_app_meta_data->>'role', '') in ('admin', 'socio', 'operador')
)
and criado_por is null
and papel not in ('socio', 'operador');

-- 2. REAFIRMAR AS FUNÇÕES AUXILIARES DE CHECAGEM DE PERMISSÃO
create or replace function public.obter_admin_usuario(p_user_id uuid default auth.uid())
returns public.admin_usuarios
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.admin_usuarios
  where user_id = p_user_id
    and ativo = true
  limit 1;
$$;

create or replace function public.e_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_usuarios
    where user_id = p_user_id
      and papel = 'admin'
      and ativo = true
  ) or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );
$$;

create or replace function public.e_admin_ou_socio(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_usuarios
    where user_id = p_user_id
      and papel in ('admin', 'socio')
      and ativo = true
  ) or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
  );
$$;

create or replace function public.e_usuario_admin_valido(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_usuarios
    where user_id = p_user_id
      and ativo = true
  ) or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'operador')
  );
$$;

-- 3. PERMISSÕES E GRANTS
grant execute on function public.obter_admin_usuario(uuid) to authenticated, service_role;
grant execute on function public.e_admin(uuid) to authenticated, service_role;
grant execute on function public.e_admin_ou_socio(uuid) to authenticated, service_role;
grant execute on function public.e_usuario_admin_valido(uuid) to authenticated, service_role;

commit;
