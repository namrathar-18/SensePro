-- SensePro+ auth role delivery · Custom Access Token Hook
--
-- The RLS policies in 0002 read the role from the JWT as (auth.jwt() ->> 'app_role').
-- This migration makes that claim real: a user_roles table holds each auth user's
-- role, and a Supabase Access Token Hook injects it as a top-level claim on every
-- token issued. The claim therefore lives in the signed JWT, not just user_metadata
-- (which a client could try to influence at signup).
--
-- After applying, enable the hook in the dashboard OR via config:
--   Authentication > Hooks > Customize Access Token (JWT) > select public.custom_access_token_hook
-- (done via the Management API in this project's setup).

create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_role text not null check (app_role in ('teacher','management','admin','student')),
  created_at timestamptz not null default now()
);

-- The hook runs as supabase_auth_admin; it must read user_roles.
alter table user_roles enable row level security;

revoke all on table user_roles from anon, authenticated;
grant select on table user_roles to supabase_auth_admin;

drop policy if exists "auth admin reads roles" on user_roles;
create policy "auth admin reads roles" on user_roles
  for select to supabase_auth_admin using (true);

-- Access Token Hook: merge app_role into the event's claims.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $fn$
declare
  claims jsonb;
  role_text text;
begin
  select app_role into role_text
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  if role_text is not null then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(role_text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$fn$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from anon, authenticated, public;
