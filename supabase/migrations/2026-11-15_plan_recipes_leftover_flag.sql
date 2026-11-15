-- "Use Leftovers" button: tomorrow's main can point at the same recipe as
-- today's, flagged so the UI shows it as a leftover and the shopping list
-- doesn't buy it again (it's not a new purchase).
alter table public.plan_recipes
    add column if not exists is_leftover boolean not null default false;
