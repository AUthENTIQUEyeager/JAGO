-- Jago : demandes d'inscription envoyées depuis la page d'accueil publique.
-- Additive et rejouable. À exécuter APRÈS 0001, 0002 et 0003.
--
-- Sécurité : la table n'est lisible ni modifiable par aucun client (anon et authenticated n'ont AUCUN droit, RLS forcée,
-- aucune policy). Seules les fonctions serveur /api (clé service_role) l'utilisent : l'écriture publique passe par une
-- route qui valide, limite le débit et filtre les robots ; la lecture est réservée au super admin (MFA).
create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  shop_name text not null check (char_length(shop_name) between 2 and 160),
  phone text not null check (char_length(phone) between 8 and 20),
  email text check (char_length(email) <= 200),
  country text check (char_length(country) <= 60),
  city text check (char_length(city) <= 100),
  activity text not null default 'shop' check (activity in ('shop', 'units', 'print', 'other')),
  message text check (char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'created', 'rejected')),
  admin_notes text check (char_length(admin_notes) <= 1000),
  shop_id uuid references public.shops (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists signup_requests_status_idx on public.signup_requests (status, created_at desc);
create index if not exists signup_requests_phone_idx on public.signup_requests (phone, status);

alter table public.signup_requests enable row level security;
alter table public.signup_requests force row level security;
revoke all on public.signup_requests from public, anon, authenticated;
grant select, insert, update, delete on public.signup_requests to service_role;
