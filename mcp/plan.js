/**
 * Writing to the weekly meal plan.
 *
 * Mirrors what MealPlan.jsx's saveWeeklyPlan does to plan_recipes, but one
 * slot at a time rather than the whole week in one delete-then-insert: a
 * model reasoning about a request like "two dinners with chicken" fills the
 * plan slot by slot, so this is the granularity that fits a tool call.
 */
import { findRecipe } from './ingredients.js';

export const SLOTS = ['main', 'side', 'veg'];

// Mirrors the type filtering the web app's own dropdowns already apply per
// slot, so a tool call can be refused before it ever reaches the database.
const TYPES_FOR_SLOT = {
    main: ['main_dish', 'full_meal'],
    side: ['side'],
    veg: ['vegetable_side']
};

// Pure calendar-date arithmetic on the YYYY-MM-DD string itself, via Date.UTC —
// the same bug #12 class (a local Date silently landing on the wrong day) that
// getWeekDaysFromSunday.js was fixed for, avoided here by never touching a
// local Date at all.
function addDays(day, n) {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + n)).toISOString().slice(0, 10);
}

function weekdayLabel(day) {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: 'UTC'
    });
}

/**
 * Reads the 7 days from startDay (meant to be a Sunday, matching the web
 * app's own week model), each with whatever is planned for its three slots.
 *
 * Exists so a model can be asked to "fill the empty days" without first
 * overwriting days that already have something — plan_meal only writes, it
 * has no way on its own to tell an empty slot from a filled one.
 */
export async function getWeekPlan(client, { startDay }) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDay, i));
    const daySet = new Set(days);

    const { data: planned, error: planError } = await client
        .from('plan_recipes')
        .select('day_of_week, slot_type, recipe_id');

    if (planError) throw new Error(`Could not read the plan: ${planError.message}`);

    // Fetched unfiltered and matched up here rather than joined in the query:
    // the fake client backing the mcp test suite has no range or "in" filter,
    // only eq/ilike, and a week's worth of rows is too few to matter either way.
    const { data: recipes, error: recipeError } = await client
        .from('recipes')
        .select('id, name');

    if (recipeError) throw new Error(`Could not read recipes: ${recipeError.message}`);

    const nameById = new Map((recipes ?? []).map(recipe => [recipe.id, recipe.name]));

    const bySlot = new Map();
    for (const row of planned ?? []) {
        if (!daySet.has(row.day_of_week)) continue;
        bySlot.set(`${row.day_of_week}|${row.slot_type}`, nameById.get(row.recipe_id) ?? 'unknown recipe');
    }

    return days.map(day => ({
        day,
        weekday: weekdayLabel(day),
        slots: Object.fromEntries(SLOTS.map(slot => [slot, bySlot.get(`${day}|${slot}`) ?? null]))
    }));
}

/**
 * Renders a week's plan as text for a tool result: one line per day, empty
 * slots spelled out rather than left blank, so "fill the empty days" has
 * something unambiguous to act on.
 */
export function formatWeekPlan(weekPlan) {
    const lines = weekPlan.map(({ day, weekday, slots }) => {
        const parts = SLOTS.map(slot => `${slot}: ${slots[slot] ?? 'empty'}`);
        return `${day} (${weekday}): ${parts.join(', ')}`;
    });

    return lines.join('\n');
}

export async function planMeal(client, { day, slot, recipe: recipeName, servings }) {
    const found = await findRecipe(client, recipeName);

    if (!found.ok) return { ok: false, message: found.reason };

    const { recipe } = found;
    const allowedTypes = TYPES_FOR_SLOT[slot];

    if (!allowedTypes.includes(recipe.type)) {
        const kind = recipe.type ? recipe.type.replace(/_/g, ' ') : 'untyped';
        return {
            ok: false,
            message: `"${recipe.name}" is ${kind}, which can't go in the ${slot} slot. Use update_recipe to change its type, or pick a different recipe.`
        };
    }

    // Replaces whatever was already planned for this day and slot, rather
    // than erroring — the web app can only do that via "Remove All", but a
    // model fixing one slot should not have to redo the whole day.
    const { error: deleteError } = await client
        .from('plan_recipes')
        .delete()
        .eq('day_of_week', day)
        .eq('slot_type', slot);

    if (deleteError) throw new Error(`Could not update the plan: ${deleteError.message}`);

    const plannedServings = servings ?? recipe.base_servings ?? 1;

    const { error: insertError } = await client
        .from('plan_recipes')
        .insert([{ day_of_week: day, recipe_id: recipe.id, slot_type: slot, planned_servings: plannedServings }]);

    if (insertError) {
        throw new Error(`Could not add "${recipe.name}" to the plan: ${insertError.message}`);
    }

    return {
        ok: true,
        message: `Planned "${recipe.name}" as the ${slot} for ${day}, serving ${plannedServings}.`
    };
}
