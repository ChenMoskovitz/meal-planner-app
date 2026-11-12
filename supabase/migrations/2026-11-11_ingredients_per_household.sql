-- Ingredients are already scoped to the signed-in account via `user_id` +
-- row-level security, same as recipes/plan_recipes/shopping_list/user_goals.
-- The one piece that wasn't household-scoped: the UNIQUE constraint on
-- ingredients.name is global, so two different accounts can't both have an
-- ingredient called "Onion" — the second insert collides with the first
-- account's row before RLS ever gets a say.
--
-- Written idempotently so it's safe to run whether or not user_id/RLS were
-- already in place.

-- 1. Make sure the owning column exists, defaulting to whoever is signed in.
alter table public.ingredients
    add column if not exists user_id uuid references auth.users default auth.uid();

-- 2. Backfill any pre-existing rows that predate the column.
update public.ingredients
set user_id = (select id from auth.users where email = 'chen.mosko.cm@gmail.com')
where user_id is null;

alter table public.ingredients
    alter column user_id set not null;

-- 3. Row-level security: every operation scoped to the owning account.
alter table public.ingredients enable row level security;

drop policy if exists "ingredients_select_own" on public.ingredients;
create policy "ingredients_select_own" on public.ingredients
    for select using (auth.uid() = user_id);

drop policy if exists "ingredients_insert_own" on public.ingredients;
create policy "ingredients_insert_own" on public.ingredients
    for insert with check (auth.uid() = user_id);

drop policy if exists "ingredients_update_own" on public.ingredients;
create policy "ingredients_update_own" on public.ingredients
    for update using (auth.uid() = user_id);

drop policy if exists "ingredients_delete_own" on public.ingredients;
create policy "ingredients_delete_own" on public.ingredients
    for delete using (auth.uid() = user_id);

-- 4. The actual fix: drop the global unique constraint on `name` now that
-- ingredients_user_id_name_key (user_id, name) exists alongside it. The old
-- constraint's actual name on this project is `unique_ingredient_name`;
-- ingredients_name_key is dropped too in case another environment named it
-- the default way. To check a given project directly:
--   select conname from pg_constraint
--   where conrelid = 'public.ingredients'::regclass and contype = 'u';
alter table public.ingredients drop constraint if exists unique_ingredient_name;
alter table public.ingredients drop constraint if exists ingredients_name_key;
-- ingredients_user_id_name_key (user_id, name) already exists at this point.
