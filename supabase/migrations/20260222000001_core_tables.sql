-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Households
create table households (
    id uuid primary key default uuid_generate_v4(),
    name varchar(255) not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Member Types (dynamic, per household)
create table member_types (
    id uuid primary key default uuid_generate_v4(),
    household_id uuid not null references households(id) on delete cascade,
    name varchar(100) not null,
    created_at timestamptz default now()
);

-- Household Members
create table household_members (
    id uuid primary key default uuid_generate_v4(),
    household_id uuid not null references households(id) on delete cascade,
    member_type_id uuid not null references member_types(id),
    user_id uuid references auth.users(id) on delete set null, -- nullable for non-login members
    name varchar(255) not null,
    date_of_birth date,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Accounts
create table accounts (
    id uuid primary key default uuid_generate_v4(),
    household_id uuid not null references households(id) on delete cascade,
    household_member_id uuid references household_members(id) on delete set null, -- null if joint
    name varchar(255) not null,
    account_type varchar(50) not null check (account_type in ('checking', 'savings', 'cash', 'investment', 'credit')),
    ownership varchar(20) not null check (ownership in ('joint', 'individual')),
    current_balance decimal(15,2) default 0.00,
    currency varchar(10) default 'KES',
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Seed default member types when a household is created
create or replace function seed_member_types()
returns trigger as $$
begin
    insert into member_types (household_id, name) values
        (new.id, 'Husband'),
        (new.id, 'Wife'),
        (new.id, 'Child'),
        (new.id, 'Househelp'),
        (new.id, 'Family Member');
    return new;
end;
$$ language plpgsql;

create trigger on_household_created
    after insert on households
    for each row execute function seed_member_types();

-- Updated at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger households_updated_at
    before update on households
    for each row execute function update_updated_at();

create trigger household_members_updated_at
    before update on household_members
    for each row execute function update_updated_at();

create trigger accounts_updated_at
    before update on accounts
    for each row execute function update_updated_at();