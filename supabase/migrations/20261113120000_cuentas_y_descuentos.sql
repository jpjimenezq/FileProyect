-- FileProyect: perfiles, cuotas de uso, códigos de descuento y registro de acciones de administración.
-- El servidor usa la service role key (salta RLS); el navegador solo puede leer lo suyo y cambiar su nombre.

-- ── Perfiles ──────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_until timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_customer_idx on public.profiles (stripe_customer_id);
create index profiles_created_idx on public.profiles (created_at desc);

-- Crea el perfil al registrarse un usuario (correo+contraseña o Google)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el correo del perfil al día si el usuario lo cambia
create function public.sync_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.sync_user_email();

alter table public.profiles enable row level security;

create policy "perfil propio: lectura" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "perfil propio: editar nombre" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Desde el cliente solo se puede escribir full_name; plan, rol, bloqueo, etc. los cambia el servidor
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ── Uso (cuotas) ──────────────────────────────────────────────────────
-- Igual que en SQLite: actor = 'u:<id de usuario>' o 'ip:<ip>' (invitados); kind = 'jobs' | 'ai';
-- period = 'd:AAAA-MM-DD' (conversiones del día) o 'm:AAAA-MM' (caracteres de IA del mes)
create table public.usage (
  actor text not null,
  kind text not null,
  period text not null,
  amount bigint not null default 0,
  primary key (actor, kind, period)
);
create index usage_period_idx on public.usage (period);

alter table public.usage enable row level security;
create policy "uso propio: lectura" on public.usage
  for select to authenticated using (actor = 'u:' || auth.uid()::text);
revoke insert, update, delete on public.usage from anon, authenticated;

-- Suma atómica al contador (equivale al INSERT ... ON CONFLICT de SQLite)
create function public.add_usage(p_actor text, p_kind text, p_period text, p_amount bigint) returns void
language sql security definer set search_path = public as $$
  insert into public.usage (actor, kind, period, amount) values (p_actor, p_kind, p_period, p_amount)
  on conflict (actor, kind, period) do update set amount = public.usage.amount + excluded.amount;
$$;
revoke execute on function public.add_usage(text, text, text, bigint) from public, anon, authenticated;

-- ── Códigos de descuento ──────────────────────────────────────────────
create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  kind text not null check (kind in ('percent', 'amount', 'grant')),
  -- percent: 1-100; amount: importe en la moneda (p. ej. euros); grant: no se usa
  value numeric not null default 0 check (value >= 0),
  currency text not null default 'eur',
  duration text not null default 'once' check (duration in ('once', 'repeating', 'forever')),
  duration_months integer check (duration_months is null or duration_months > 0),
  -- kind = 'grant': regala Pro durante estos días sin pasar por el pago
  grant_days integer check (grant_days is null or grant_days > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'grant' or grant_days is not null),
  check (duration <> 'repeating' or duration_months is not null)
);
create unique index discount_codes_code_key on public.discount_codes (upper(code));

create table public.redemptions (
  code_id uuid not null references public.discount_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code_id, user_id)
);
create index redemptions_user_idx on public.redemptions (user_id);

-- Canje atómico: un canje por usuario y código, sin pasar del máximo. Devuelve 'ok' | 'already' | 'unavailable'
create function public.redeem_discount(p_code_id uuid, p_user_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.redemptions (code_id, user_id) values (p_code_id, p_user_id) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return 'already'; end if;
  update public.discount_codes set redeemed = redeemed + 1
   where id = p_code_id and active
     and (max_redemptions is null or redeemed < max_redemptions)
     and (expires_at is null or expires_at > now());
  get diagnostics n = row_count;
  if n = 0 then
    delete from public.redemptions where code_id = p_code_id and user_id = p_user_id;
    return 'unavailable';
  end if;
  return 'ok';
end $$;
revoke execute on function public.redeem_discount(uuid, uuid) from public, anon, authenticated;

alter table public.discount_codes enable row level security;
alter table public.redemptions enable row level security;
create policy "canjes propios: lectura" on public.redemptions
  for select to authenticated using (user_id = auth.uid());
revoke all on public.discount_codes from anon, authenticated;
revoke insert, update, delete on public.redemptions from anon, authenticated;

-- ── Auditoría de acciones de administración ───────────────────────────
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit (created_at desc);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

-- El servidor (service role) necesita acceso explícito a las tablas creadas por esta migración
grant all on public.profiles, public.usage, public.discount_codes, public.redemptions, public.admin_audit to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.add_usage(text, text, text, bigint), public.redeem_discount(uuid, uuid) to service_role;
