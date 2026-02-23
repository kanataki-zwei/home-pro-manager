-- Users table (mirrors Supabase auth.users)
create table users (
    id uuid primary key references auth.users(id) on delete cascade,
    email varchar(255) not null unique,
    name varchar(255),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Auto-create user record when someone signs up via Supabase auth
create or replace function handle_new_user()
returns trigger as $$
begin
    insert into public.users (id, email, name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- Updated at trigger
create trigger users_updated_at
    before update on users
    for each row execute function update_updated_at();