import { describe, it, expect } from 'vitest';
import {
    formatIngredientNutrition,
    sumIngredientNutrition,
    perServing
} from './nutritionHelper.js';

describe('formatIngredientNutrition', () => {
    it('converts Edamam per-100g figures to per-gram', () => {
        const result = formatIngredientNutrition({
            ENERC_KCAL: 52,
            PROCNT: 0.3,
            FAT: 0.2,
            FIBTG: 2.4
        });

        expect(result).toEqual({
            calories: 0.52,
            protein: 0.003,
            fat: 0.002,
            fiber: 0.024
        });
    });

    // The callers pass whatever the API returned, which is sometimes nothing.
    it('returns null when given no data', () => {
        expect(formatIngredientNutrition(null)).toBeNull();
        expect(formatIngredientNutrition(undefined)).toBeNull();
    });
});

describe('sumIngredientNutrition', () => {
    const ingredient = (overrides = {}) => ({
        amount: 100,
        ingredients: {
            calories_per_unit: 0,
            protein_per_unit: 0,
            fat_per_unit: 0,
            fiber_per_unit: 0,
            ...overrides
        }
    });

    // The scale is the bug that has bitten this app before: the columns hold
    // Edamam's per-100g figures, so 200g of a 52 kcal/100g food is 104, not 10400.
    it.each([
        { amount: 100, per100g: 52, expected: 52 },
        { amount: 200, per100g: 52, expected: 104 },
        { amount: 50, per100g: 52, expected: 26 },
        { amount: 0, per100g: 52, expected: 0 }
    ])('scales $amount g at $per100g kcal/100g to $expected kcal', ({ amount, per100g, expected }) => {
        const rows = [{ amount, ingredients: { calories_per_unit: per100g } }];

        expect(sumIngredientNutrition(rows).calories).toBeCloseTo(expected);
    });

    it('adds up every ingredient in the recipe', () => {
        const rows = [
            { amount: 100, ingredients: { calories_per_unit: 52, protein_per_unit: 0.3 } },
            { amount: 200, ingredients: { calories_per_unit: 89, protein_per_unit: 1.1 } }
        ];

        const totals = sumIngredientNutrition(rows);

        expect(totals.calories).toBeCloseTo(52 + 178);
        expect(totals.protein).toBeCloseTo(0.3 + 2.2);
    });

    it('treats missing nutrient columns as zero', () => {
        const totals = sumIngredientNutrition([ingredient({ calories_per_unit: null })]);

        expect(totals).toEqual({ calories: 0, protein: 0, fat: 0, fiber: 0 });
    });

    it('treats a missing amount as zero', () => {
        const rows = [{ amount: null, ingredients: { calories_per_unit: 52 } }];

        expect(sumIngredientNutrition(rows).calories).toBe(0);
    });

    // Not reachable today: the foreign key blocks deleting an ingredient that a
    // recipe uses, and no recipe references another user's row. But the embed can
    // return null if either of those settings changes, and MealPlan.jsx already
    // guards the same case, so the totals should not throw.
    it('skips a row whose ingredient is missing', () => {
        const rows = [
            { amount: 100, ingredients: { calories_per_unit: 52 } },
            { amount: 200, ingredients: null }
        ];

        expect(sumIngredientNutrition(rows).calories).toBeCloseTo(52);
    });

    it('returns zeros for a recipe with no ingredients', () => {
        expect(sumIngredientNutrition([])).toEqual({ calories: 0, protein: 0, fat: 0, fiber: 0 });
    });
});

describe('perServing', () => {
    const totals = { calories: 800, protein: 40, fat: 20, fiber: 10 };

    it('divides the totals across the servings', () => {
        expect(perServing(totals, 4)).toEqual({ calories: 200, protein: 10, fat: 5, fiber: 2.5 });
    });

    // base_servings is nullable in the database and older recipes have no value.
    it.each([null, undefined, 0])('falls back to one portion when servings is %s', (servings) => {
        expect(perServing(totals, servings)).toEqual(totals);
    });
});
