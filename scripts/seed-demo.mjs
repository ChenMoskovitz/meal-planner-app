// Creates the demo account on first run; on every run (including the daily
// scheduled one — see .github/workflows/reset-demo.yml) it wipes everything
// the account owns and rebuilds it from scratch. That's deliberate: it's the
// one account anyone can sign into and write to, so nothing about it should
// depend on what a previous visitor left behind. The week is recomputed from
// today's date each time, so the plan rolls forward on its own once Sunday
// comes around.
//
// Run with: node --env-file=.env scripts/seed-demo.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@mealplanner.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'MealPlannerDemo2026!';

if (!SUPABASE_URL || !ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

function sundayOfThisWeek() {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function toLocalDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = sundayOfThisWeek();
    d.setDate(d.getDate() + i);
    return toLocalDateString(d);
});

const INGREDIENTS = [
    { name: 'Chicken Breast', unit_type: 'g', calories_per_unit: 165, protein_per_unit: 31, fat_per_unit: 3.6, fiber_per_unit: 0 },
    { name: 'Salmon', unit_type: 'g', calories_per_unit: 208, protein_per_unit: 20, fat_per_unit: 13, fiber_per_unit: 0 },
    { name: 'Ground Beef', unit_type: 'g', calories_per_unit: 215, protein_per_unit: 26, fat_per_unit: 11, fiber_per_unit: 0 },
    { name: 'Ground Turkey', unit_type: 'g', calories_per_unit: 203, protein_per_unit: 27, fat_per_unit: 10, fiber_per_unit: 0 },
    { name: 'Spaghetti (cooked)', unit_type: 'g', calories_per_unit: 157, protein_per_unit: 5.8, fat_per_unit: 0.9, fiber_per_unit: 2.5 },
    { name: 'White Rice (cooked)', unit_type: 'g', calories_per_unit: 130, protein_per_unit: 2.7, fat_per_unit: 0.3, fiber_per_unit: 0.4 },
    { name: 'Potato', unit_type: 'g', calories_per_unit: 93, protein_per_unit: 2, fat_per_unit: 0.1, fiber_per_unit: 2.2 },
    { name: 'Broccoli', unit_type: 'g', calories_per_unit: 34, protein_per_unit: 2.8, fat_per_unit: 0.4, fiber_per_unit: 2.6 },
    { name: 'Spinach', unit_type: 'g', calories_per_unit: 23, protein_per_unit: 2.9, fat_per_unit: 0.4, fiber_per_unit: 2.2 },
    { name: 'Garlic', unit_type: 'g', calories_per_unit: 149, protein_per_unit: 6.4, fat_per_unit: 0.5, fiber_per_unit: 2.1 },
    { name: 'Onion', unit_type: 'g', calories_per_unit: 40, protein_per_unit: 1.1, fat_per_unit: 0.1, fiber_per_unit: 1.7 },
    { name: 'Olive Oil', unit_type: 'g', calories_per_unit: 884, protein_per_unit: 0, fat_per_unit: 100, fiber_per_unit: 0 },
    { name: 'Kidney Beans', unit_type: 'g', calories_per_unit: 127, protein_per_unit: 8.7, fat_per_unit: 0.5, fiber_per_unit: 6.4 },
    { name: 'Canned Tomatoes', unit_type: 'g', calories_per_unit: 18, protein_per_unit: 0.9, fat_per_unit: 0.2, fiber_per_unit: 1.2 },
    { name: 'Parmesan', unit_type: 'g', calories_per_unit: 431, protein_per_unit: 38, fat_per_unit: 29, fiber_per_unit: 0 }
];

const RECIPES = [
    { name: 'Grilled Chicken Breast', type: 'main_dish', base_servings: 2, description: 'Simple grilled chicken with garlic and olive oil.',
        items: [['Chicken Breast', 300], ['Olive Oil', 15], ['Garlic', 10]] },
    { name: 'Baked Salmon', type: 'main_dish', base_servings: 2, description: 'Oven-baked salmon with garlic and olive oil.',
        items: [['Salmon', 300], ['Olive Oil', 10], ['Garlic', 5]] },
    { name: 'Beef Stir Fry', type: 'full_meal', base_servings: 4, description: 'Quick stir-fried beef with onion and garlic.',
        items: [['Ground Beef', 500], ['Onion', 100], ['Garlic', 15], ['Olive Oil', 20]] },
    { name: 'Veggie Pasta Primavera', type: 'full_meal', base_servings: 4, description: 'Spaghetti with parmesan, garlic and onion.',
        items: [['Spaghetti (cooked)', 400], ['Parmesan', 50], ['Olive Oil', 20], ['Garlic', 10], ['Onion', 50]] },
    { name: 'Turkey Chili', type: 'full_meal', base_servings: 6, description: 'A big pot of turkey chili — makes plenty for leftovers.',
        items: [['Ground Turkey', 600], ['Kidney Beans', 400], ['Canned Tomatoes', 400], ['Onion', 100], ['Garlic', 15]] },
    { name: 'Garlic Rice', type: 'side', base_servings: 4, description: 'White rice sauteed with garlic and olive oil.',
        items: [['White Rice (cooked)', 400], ['Garlic', 20], ['Olive Oil', 15]] },
    { name: 'Roasted Potatoes', type: 'side', base_servings: 4, description: 'Oven-roasted potatoes with garlic and olive oil.',
        items: [['Potato', 600], ['Olive Oil', 20], ['Garlic', 10]] },
    { name: 'Steamed Broccoli', type: 'vegetable_side', base_servings: 4, description: 'Lightly steamed broccoli.',
        items: [['Broccoli', 400]] },
    { name: 'Sauteed Spinach', type: 'vegetable_side', base_servings: 4, description: 'Spinach sauteed with garlic and olive oil.',
        items: [['Spinach', 300], ['Olive Oil', 10], ['Garlic', 5]] }
];

// day index (0=Sun..6=Sat) -> { main, side, veg }, by recipe name.
const PLAN = [
    { main: 'Turkey Chili', side: 'Garlic Rice' },
    { main: 'Grilled Chicken Breast', side: 'Roasted Potatoes', veg: 'Steamed Broccoli' },
    { main: 'Baked Salmon', veg: 'Sauteed Spinach' },
    { main: 'Veggie Pasta Primavera' },
    { main: 'Beef Stir Fry', side: 'Garlic Rice' },
    { main: 'Grilled Chicken Breast', veg: 'Steamed Broccoli' },
    { main: 'Baked Salmon', side: 'Roasted Potatoes', veg: 'Sauteed Spinach' }
];

const PLANNED_SERVINGS = 4; // a household, not a solo diner

async function main() {
    console.log(`Signing up/in as ${DEMO_EMAIL} ...`);
    let { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

    if (signUpError && !/already registered|already been registered/i.test(signUpError.message)) {
        throw signUpError;
    }

    if (!signUpData?.session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        if (signInError) throw signInError;
        signUpData = signInData;
    }
    console.log('Signed in as', signUpData.user.id);

    // Wipe everything the account owns. recipe_ingredients has no column of
    // its own to scope by — it cascades away when its parent recipe is
    // deleted, same as the E2E suite's cleanup relies on.
    console.log('Clearing the account...');
    for (const table of ['plan_recipes', 'shopping_list', 'recipes', 'ingredients', 'user_goals']) {
        const { error } = await supabase.from(table).delete().not('id', 'is', null);
        if (error) throw new Error(`clearing ${table}: ${error.message}`);
    }

    console.log('Seeding ingredients...');
    const ingredientIdByName = {};
    for (const ing of INGREDIENTS) {
        const { data: inserted, error } = await supabase
            .from('ingredients')
            .insert([{ ...ing, stock_quantity: 1000 }])
            .select('id')
            .single();
        if (error) throw new Error(`ingredient "${ing.name}": ${error.message}`);
        ingredientIdByName[ing.name] = inserted.id;
    }

    console.log('Seeding recipes...');
    const recipeIdByName = {};
    for (const recipe of RECIPES) {
        const { data: inserted, error } = await supabase
            .from('recipes')
            .insert([{ name: recipe.name, type: recipe.type, base_servings: recipe.base_servings, description: recipe.description }])
            .select('id')
            .single();
        if (error) throw new Error(`recipe "${recipe.name}": ${error.message}`);
        const recipeId = inserted.id;
        recipeIdByName[recipe.name] = recipeId;

        const links = recipe.items.map(([ingName, amount]) => ({
            recipe_id: recipeId, ingredient_id: ingredientIdByName[ingName], amount
        }));
        const { error: linkError } = await supabase.from('recipe_ingredients').insert(links);
        if (linkError) throw new Error(`linking ingredients for "${recipe.name}": ${linkError.message}`);
    }

    console.log('Setting nutrition goals...');
    {
        const { error } = await supabase.from('user_goals')
            .insert([{ user_id: signUpData.user.id, target_calories: 2000, min_protein: 100, min_fiber: 25, max_fat: 70 }]);
        if (error) throw new Error(`user_goals: ${error.message}`);
    }

    console.log(`Writing the plan for ${weekDates[0]}..${weekDates[6]}...`);
    {
        const rows = [];
        PLAN.forEach((day, i) => {
            const dayOfWeek = weekDates[i];
            if (day.main) rows.push({ day_of_week: dayOfWeek, recipe_id: recipeIdByName[day.main], slot_type: 'main', planned_servings: PLANNED_SERVINGS });
            if (day.side) rows.push({ day_of_week: dayOfWeek, recipe_id: recipeIdByName[day.side], slot_type: 'side', planned_servings: PLANNED_SERVINGS });
            if (day.veg) rows.push({ day_of_week: dayOfWeek, recipe_id: recipeIdByName[day.veg], slot_type: 'veg', planned_servings: PLANNED_SERVINGS });
        });

        const { error: insertError } = await supabase.from('plan_recipes').insert(rows);
        if (insertError) throw new Error(`inserting plan_recipes: ${insertError.message}`);
    }

    console.log('Done. Demo account is ready:');
    console.log('  email:   ', DEMO_EMAIL);
    console.log('  password:', DEMO_PASSWORD);
}

main().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
