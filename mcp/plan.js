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
