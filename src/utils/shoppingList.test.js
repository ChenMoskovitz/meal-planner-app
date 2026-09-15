import { describe, it, expect } from 'vitest';
import { batchesFor, sumWeeklyIngredients, roundAmount } from './shoppingList.js';

describe('batchesFor', () => {
    it('cooks one batch when the recipe already covers the plan', () => {
        // A recipe serving 4 planned for 2 is still cooked whole; the surplus
        // is what the day card shows as leftovers.
        expect(batchesFor(2, 4)).toBe(1);
    });

    it('cooks another batch when the plan exceeds one recipe', () => {
        // The bug this fixes: planning 5 portions of a 2-serving recipe used to
        // buy ingredients for 2.
        expect(batchesFor(5, 2)).toBe(3);
    });

    it('cooks exactly one batch when the plan matches the recipe', () => {
        expect(batchesFor(4, 4)).toBe(1);
    });

    // base_servings is nullable in the database and older recipes have no value.
    it('treats a missing serving count as a single-serving recipe', () => {
        expect(batchesFor(3, null)).toBe(3);
        expect(batchesFor(3, 0)).toBe(3);
    });

    it('never cooks less than one batch', () => {
        expect(batchesFor(0, 4)).toBe(1);
    });
});

describe('sumWeeklyIngredients', () => {
    const rows = [
        { recipe_id: 'soup', amount: 100, ingredients: { name: 'Onion', unit_type: 'g' } },
        { recipe_id: 'soup', amount: 2, ingredients: { name: 'Carrot', unit_type: '' } },
        { recipe_id: 'salad', amount: 50, ingredients: { name: 'Onion', unit_type: 'g' } }
    ];

    it('multiplies each ingredient by the batches cooked', () => {
        const totals = sumWeeklyIngredients([{ recipeId: 'soup', batches: 3 }], rows);

        expect(totals).toEqual({
            Onion: { amount: 300, unit: 'g' },
            Carrot: { amount: 6, unit: '' }
        });
    });

    it('counts a repeated recipe once per planned day', () => {
        // Same recipe on two days is two cooking occasions. The old code passed
        // duplicate ids to .in(), which returns each row once, so it bought for one.
        const totals = sumWeeklyIngredients(
            [{ recipeId: 'soup', batches: 1 }, { recipeId: 'soup', batches: 1 }],
            rows
        );

        expect(totals.Onion.amount).toBe(200);
        expect(totals.Carrot.amount).toBe(4);
    });

    it('groups the same ingredient across different recipes', () => {
        const totals = sumWeeklyIngredients(
            [{ recipeId: 'soup', batches: 1 }, { recipeId: 'salad', batches: 2 }],
            rows
        );

        expect(totals.Onion).toEqual({ amount: 200, unit: 'g' });
    });

    it('skips rows whose ingredient join came back empty', () => {
        const orphaned = [{ recipe_id: 'soup', amount: 100, ingredients: null }];

        expect(sumWeeklyIngredients([{ recipeId: 'soup', batches: 1 }], orphaned)).toEqual({});
    });

    it('ignores a planned recipe that has no ingredients', () => {
        expect(sumWeeklyIngredients([{ recipeId: 'unknown', batches: 2 }], rows)).toEqual({});
    });

    it('treats a missing amount as nothing to buy', () => {
        const missing = [{ recipe_id: 'soup', amount: null, ingredients: { name: 'Salt', unit_type: 'g' } }];
        const totals = sumWeeklyIngredients([{ recipeId: 'soup', batches: 4 }], missing);

        expect(totals.Salt.amount).toBe(0);
    });
});

describe('roundAmount', () => {
    it('trims the binary fraction left by multiplying decimals', () => {
        expect(roundAmount(0.1 * 3)).toBe(0.3);
    });

    it('leaves whole amounts alone', () => {
        expect(roundAmount(300)).toBe(300);
    });
});
