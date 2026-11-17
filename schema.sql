create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'admin')),
  student_id text unique,
  full_name text not null,
  course text,
  email text not null,
  phone text
);

create table if not exists public.applications (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  student_id text not null,
  applicant_name text not null,
  course text not null,
  email text not null,
  phone text not null,
  scholarship text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Under review', 'Approved', 'Rejected')),
  submitted_at timestamptz not null default now(),
  notes text not null default ''
);

create table if not exists public.requirement_files (
  id uuid primary key default gen_random_uuid(),
  application_id text not null references public.applications (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size >= 0),
  uploaded_at timestamptz not null default now()
);

create index if not exists applications_user_id_idx on public.applications (user_id);
create index if not exists requirement_files_application_id_idx on public.requirement_files (application_id);

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, delete on public.requirement_files to authenticated;

create or replace function public.is_iskolar_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.requirement_files enable row level security;

drop policy if exists "Profiles visible to owner and staff" on public.profiles;
create policy "Profiles visible to owner and staff"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_iskolar_admin());

drop policy if exists "Applications visible to owner and staff" on public.applications;
create policy "Applications visible to owner and staff"
  on public.applications for select to authenticated
  using (user_id = auth.uid() or public.is_iskolar_admin());

drop policy if exists "Students submit their own applications" on public.applications;
create policy "Students submit their own applications"
  on public.applications for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role = 'student' and student_id = applications.student_id
    )
  );

drop policy if exists "Staff update application decisions" on public.applications;
create policy "Staff update application decisions"
  on public.applications for update to authenticated
  using (public.is_iskolar_admin())
  with check (public.is_iskolar_admin());

drop policy if exists "Owners delete their own applications" on public.applications;
create policy "Owners delete their own applications"
  on public.applications for delete to authenticated
  using (user_id = auth.uid() or public.is_iskolar_admin());

drop policy if exists "Requirement files visible to owner and staff" on public.requirement_files;
create policy "Requirement files visible to owner and staff"
  on public.requirement_files for select to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_iskolar_admin()
  );

drop policy if exists "Students add files to their own applications" on public.requirement_files;
create policy "Students add files to their own applications"
  on public.requirement_files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.applications
      where id = requirement_files.application_id and user_id = auth.uid()
    )
  );

drop policy if exists "Owners delete their own requirement file records" on public.requirement_files;
create policy "Owners delete their own requirement file records"
  on public.requirement_files for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_iskolar_admin());

insert into storage.buckets (id, name, public)
values ('requirements', 'requirements', false)
on conflict (id) do update set public = false;

drop policy if exists "Applicants and staff read requirement files" on storage.objects;
create policy "Applicants and staff read requirement files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'requirements'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_iskolar_admin()
    )
  );

drop policy if exists "Students upload to their own application folders" on storage.objects;
create policy "Students upload to their own application folders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'requirements'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.applications
      where id = replace((storage.foldername(name))[2], 'Applicant-', '') and user_id = auth.uid()
    )
  );

drop policy if exists "Applicants and staff remove requirement files" on storage.objects;
create policy "Applicants and staff remove requirement files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'requirements'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_iskolar_admin()
    )
  );
