-- =========================================================
--  FACTURA DE INTERVENCIÓN — Esquema de base de datos
--  Ejecuta este script UNA VEZ en:
--  Supabase → tu proyecto → SQL Editor → "New query" → pegar → Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- EMPRESAS (una fila por empresa/equipo) ----------
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nombre text default '',
  profesion text default '',
  nif text default '',
  direccion text default '',
  telefono text default '',
  email text default '',
  iban text default '',
  logo text default '',
  prefijo text default '',
  siguiente int default 1,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

-- ---------- PROFILES (un perfil por usuario, ligado a una empresa) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  email text,
  nombre text,
  role text default 'tecnico' check (role in ('admin', 'tecnico')),
  created_at timestamptz default now()
);

-- ---------- CLIENTES ----------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nombre text,
  nif text,
  telefono text,
  direccion text,
  email text,
  created_at timestamptz default now()
);

-- ---------- FACTURAS ----------
create table if not exists facturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  numero text,
  tipo text default 'Factura de intervención',
  fecha date,
  estado text default 'pendiente' check (estado in ('pendiente', 'pagada')),
  notas text,
  cliente jsonb,
  items jsonb,
  subtotal numeric default 0,
  iva_pct numeric default 21,
  iva numeric default 0,
  total numeric default 0,
  created_by uuid references auth.users(id),
  creado_por_nombre text,
  created_at timestamptz default now()
);

-- =========================================================
--  Funciones auxiliares (evitan recursión infinita en RLS)
-- =========================================================
create or replace function get_my_empresa_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select empresa_id from profiles where id = auth.uid();
$$;

create or replace function get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- Une al usuario autenticado a la empresa correspondiente a un código de invitación.
-- security definer: se ejecuta con permisos elevados para poder leer la tabla
-- "empresas" por código antes de que el usuario tenga perfil (y por tanto RLS propio).
create or replace function join_empresa_by_code(code text, p_nombre text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  result profiles;
begin
  select id into emp_id from empresas where invite_code = code;
  if emp_id is null then
    raise exception 'invalid_invite_code';
  end if;

  insert into profiles (id, empresa_id, email, nombre, role)
  values (auth.uid(), emp_id, (select email from auth.users where id = auth.uid()), p_nombre, 'tecnico')
  returning * into result;

  return result;
end;
$$;

grant execute on function join_empresa_by_code(text, text) to authenticated;
grant execute on function get_my_empresa_id() to authenticated;
grant execute on function get_my_role() to authenticated;

-- =========================================================
--  Row Level Security: cada empresa ve solo sus propios datos
-- =========================================================
alter table empresas enable row level security;
alter table profiles enable row level security;
alter table clientes enable row level security;
alter table facturas enable row level security;

-- EMPRESAS
drop policy if exists empresas_select on empresas;
create policy empresas_select on empresas for select
  using (id = get_my_empresa_id() or owner_id = auth.uid());

drop policy if exists empresas_insert on empresas;
create policy empresas_insert on empresas for insert
  with check (owner_id = auth.uid());

drop policy if exists empresas_update on empresas;
create policy empresas_update on empresas for update
  using (id = get_my_empresa_id() and get_my_role() = 'admin');

-- PROFILES
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or empresa_id = get_my_empresa_id());

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid() or (empresa_id = get_my_empresa_id() and get_my_role() = 'admin'))
  with check (id = auth.uid() or get_my_role() = 'admin');

-- CLIENTES
drop policy if exists clientes_all on clientes;
create policy clientes_all on clientes for all
  using (empresa_id = get_my_empresa_id())
  with check (empresa_id = get_my_empresa_id());

-- FACTURAS
drop policy if exists facturas_all on facturas;
create policy facturas_all on facturas for all
  using (empresa_id = get_my_empresa_id())
  with check (empresa_id = get_my_empresa_id());

-- =========================================================
--  Fin del script. Ya puedes usar la app con estas tablas.
-- =========================================================
