-- ====================================================================
-- MÓDULO DE GESTÃO DE USUÁRIOS E PERMISSÕES DO ADMIN
-- BAZAR ENCANTO FEMININO
-- Data: 15/08/2026
-- ====================================================================

-- 1. TABELA DE USUÁRIOS ADMINISTRATIVOS E PERFIS
create table if not exists public.admin_usuarios (
  id bigint primary key generated always as identity,
  user_id uuid unique references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  papel text not null check (papel in ('admin', 'socio', 'operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);

-- Índices de performance e consulta rápida
create index if not exists idx_admin_usuarios_email on public.admin_usuarios (email);
create index if not exists idx_admin_usuarios_user_id on public.admin_usuarios (user_id);
create index if not exists idx_admin_usuarios_papel on public.admin_usuarios (papel);
create index if not exists idx_admin_usuarios_ativo on public.admin_usuarios (ativo);

-- 2. TABELA DE AUDITORIA DE AÇÕES ADMINISTRATIVAS
create table if not exists public.admin_usuarios_auditoria (
  id bigint primary key generated always as identity,
  usuario_alvo_id bigint references public.admin_usuarios(id) on delete set null,
  usuario_alvo_email text,
  acao text not null check (acao in ('criacao', 'alteracao_papel', 'ativacao', 'desativacao', 'remocao', 'convite', 'login')),
  detalhes jsonb default '{}'::jsonb,
  executado_por uuid references auth.users(id) on delete set null,
  executado_por_email text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_admin_auditoria_alvo on public.admin_usuarios_auditoria (usuario_alvo_id);
create index if not exists idx_admin_auditoria_criado_em on public.admin_usuarios_auditoria (criado_em desc);

-- 3. FUNÇÕES AUXILIARES DE CHECAGEM DE PERMISSÃO EM SQL / RLS

-- Helper para obter o registro do usuário admin atual
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

-- Helper para checar se é Administrador ativo (Acesso total)
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

-- Helper para checar se é Administrador ou Sócio ativo
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

-- Helper para checar se é qualquer usuário admin válido e ativo (Admin, Sócio ou Operador)
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

-- 4. POLÍTICAS RLS PARA admin_usuarios
alter table public.admin_usuarios enable row level security;

drop policy if exists admin_usuarios_select_policy on public.admin_usuarios;
create policy admin_usuarios_select_policy on public.admin_usuarios
  for select
  using (
    public.e_admin()
    or user_id = auth.uid()
  );

drop policy if exists admin_usuarios_admin_full_policy on public.admin_usuarios;
create policy admin_usuarios_admin_full_policy on public.admin_usuarios
  for all
  using (public.e_admin())
  with check (public.e_admin());

-- 5. POLÍTICAS RLS PARA admin_usuarios_auditoria
alter table public.admin_usuarios_auditoria enable row level security;

drop policy if exists admin_auditoria_select_policy on public.admin_usuarios_auditoria;
create policy admin_auditoria_select_policy on public.admin_usuarios_auditoria
  for select
  using (public.e_admin());

drop policy if exists admin_auditoria_insert_policy on public.admin_usuarios_auditoria;
create policy admin_auditoria_insert_policy on public.admin_usuarios_auditoria
  for insert
  with check (
    public.e_usuario_admin_valido()
    or auth.role() = 'service_role'
  );

-- 6. ATUALIZAÇÃO DAS POLÍTICAS RLS DE REVENDAS / CONSIGNAÇÃO (Permitir ADMIN e SÓCIO)
drop policy if exists revendas_admin_all on public.revendedoras;
create policy revendas_admin_all on public.revendedoras
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

drop policy if exists remessas_admin_all on public.revenda_remessas;
create policy remessas_admin_all on public.revenda_remessas
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

drop policy if exists remessa_itens_admin_all on public.revenda_remessa_itens;
create policy remessa_itens_admin_all on public.revenda_remessa_itens
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

drop policy if exists vendas_admin_all on public.revenda_vendas;
create policy vendas_admin_all on public.revenda_vendas
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

drop policy if exists devolucoes_admin_all on public.revenda_devolucoes;
create policy devolucoes_admin_all on public.revenda_devolucoes
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

drop policy if exists acertos_admin_all on public.revenda_acertos;
create policy acertos_admin_all on public.revenda_acertos
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

drop policy if exists pagamentos_admin_all on public.revenda_pagamentos;
create policy pagamentos_admin_all on public.revenda_pagamentos
  for all
  using (public.e_admin_ou_socio())
  with check (public.e_admin_ou_socio());

-- 7. SEED DO USUÁRIO ADMINISTRADOR ATUAL
-- Garante que todos os usuários já existentes com role admin ou registrados no auth.users
-- sejam devidamente vinculados como 'admin' ativo sem perder acesso.
insert into public.admin_usuarios (user_id, nome, email, papel, ativo)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'nome',
    split_part(u.email, '@', 1)
  ) as nome,
  lower(btrim(u.email)) as email,
  'admin' as papel,
  true as ativo
from auth.users u
where u.raw_app_meta_data->>'role' = 'admin'
   or u.email is not null
on conflict (email) do update
set
  user_id = excluded.user_id,
  papel = 'admin',
  ativo = true;

-- 8. PERMISSÕES E GRANTS
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.admin_usuarios to authenticated, service_role;
grant select, insert on table public.admin_usuarios_auditoria to authenticated, service_role;
grant execute on function public.obter_admin_usuario(uuid) to authenticated, service_role;
grant execute on function public.e_admin(uuid) to authenticated, service_role;
grant execute on function public.e_admin_ou_socio(uuid) to authenticated, service_role;
grant execute on function public.e_usuario_admin_valido(uuid) to authenticated, service_role;
