import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planMeal, getWeekPlan, formatWeekPlan } from './plan.js';
import { fakeSupabase } from './fake-supabase.js';

const RECIPES = [
    { id: 'soup', name: 'Chicken soup', type: 'main_dish', base_servings: 4 },
    { id: 'rice', name: 'Rice', type: 'side', base_servings: 2 },
    { id: 'broc', name: 'Broccoli', type: 'vegetable_side', base_servings: null }
];

const database = (extra = {}) => fakeSupabase({ recipes: structuredClone(RECIPES), ...extra });

describe('planMeal', () => {
    test('plans a meal for a day and slot', async () => {
        const db = database();

        const result = await planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Chicken soup' });

        assert.equal(result.ok, true);
        assert.match(result.message, /Planned "Chicken soup" as the main for 2026-10-19/);
        assert.equal(db.tables.plan_recipes.length, 1);
        assert.equal(db.tables.plan_recipes[0].day_of_week, '2026-10-19');
        assert.equal(db.tables.plan_recipes[0].slot_type, 'main');
        assert.equal(db.tables.plan_recipes[0].recipe_id, 'soup');
    });

    test('defaults servings to the recipe\'s own base_servings', async () => {
        const db = database();

        await planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Chicken soup' });

        assert.equal(db.tables.plan_recipes[0].planned_servings, 4);
    });

    test('defaults to one serving when base_servings is unset', async () => {
        const db = database();

        await planMeal(db, { day: '2026-10-19', slot: 'veg', recipe: 'Broccoli' });

        assert.equal(db.tables.plan_recipes[0].planned_servings, 1);
    });

    test('uses the given servings over the recipe default', async () => {
        const db = database();

        await planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Chicken soup', servings: 6 });

        assert.equal(db.tables.plan_recipes[0].planned_servings, 6);
    });

    test('replaces whatever was already planned for that day and slot', async () => {
        const db = database({
            plan_recipes: [{ id: 'old', day_of_week: '2026-10-19', slot_type: 'side', recipe_id: 'rice' }]
        });

        await planMeal(db, { day: '2026-10-19', slot: 'side', recipe: 'Rice', servings: 3 });

        assert.equal(db.tables.plan_recipes.length, 1);
        assert.equal(db.tables.plan_recipes[0].planned_servings, 3);
    });

    test('leaves other days and slots alone', async () => {
        const db = database({
            plan_recipes: [{ id: 'mon', day_of_week: '2026-10-19', slot_type: 'main', recipe_id: 'soup' }]
        });

        await planMeal(db, { day: '2026-10-20', slot: 'side', recipe: 'Rice' });

        assert.equal(db.tables.plan_recipes.length, 2);
    });

    test('rejects a recipe whose type does not match the slot', async () => {
        const db = database();

        const result = await planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Rice' });

        assert.equal(result.ok, false);
        assert.match(result.message, /can't go in the main slot/);
        assert.equal(db.tables.plan_recipes.length, 0);
    });

    test('accepts a full_meal recipe in the main slot', async () => {
        const db = database({
            recipes: [{ id: 'bowl', name: 'Buddha Bowl', type: 'full_meal', base_servings: 2 }]
        });

        const result = await planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Buddha Bowl' });

        assert.equal(result.ok, true);
    });

    test('says which tool to use when the recipe does not exist', async () => {
        const db = database();

        const result = await planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Beef wellington' });

        assert.equal(result.ok, false);
        assert.match(result.message, /list_recipes/);
    });

    test('throws when the database reports an error', async () => {
        const db = database({ error: { message: 'JWT expired' } });

        await assert.rejects(
            () => planMeal(db, { day: '2026-10-19', slot: 'main', recipe: 'Chicken soup' }),
            /JWT expired/
        );
    });
});

describe('getWeekPlan', () => {
    test('returns all 7 days from startDay, with their weekday labels', async () => {
        const db = database();

        const week = await getWeekPlan(db, { startDay: '2026-10-18' });

        assert.deepEqual(
            week.map(d => d.day),
            ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
        );
        assert.deepEqual(
            week.map(d => d.weekday),
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        );
    });

    test('reports every slot as empty when nothing is planned', async () => {
        const db = database();

        const week = await getWeekPlan(db, { startDay: '2026-10-18' });

        for (const { slots } of week) {
            assert.deepEqual(slots, { main: null, side: null, veg: null });
        }
    });

    test('fills in planned slots by recipe name, leaving the rest empty', async () => {
        const db = database({
            plan_recipes: [
                { id: 'a', day_of_week: '2026-10-19', slot_type: 'main', recipe_id: 'soup' },
                { id: 'b', day_of_week: '2026-10-19', slot_type: 'veg', recipe_id: 'broc' }
            ]
        });

        const week = await getWeekPlan(db, { startDay: '2026-10-18' });
        const monday = week.find(d => d.day === '2026-10-19');

        assert.deepEqual(monday.slots, { main: 'Chicken soup', side: null, veg: 'Broccoli' });
    });

    test('ignores plan rows outside the 7-day window', async () => {
        const db = database({
            plan_recipes: [{ id: 'a', day_of_week: '2026-10-25', slot_type: 'main', recipe_id: 'soup' }]
        });

        const week = await getWeekPlan(db, { startDay: '2026-10-18' });

        for (const { slots } of week) {
            assert.deepEqual(slots, { main: null, side: null, veg: null });
        }
    });

    test('reports an orphaned plan row as an unknown recipe rather than dropping it', async () => {
        const db = database({
            plan_recipes: [{ id: 'a', day_of_week: '2026-10-19', slot_type: 'main', recipe_id: 'gone' }]
        });

        const week = await getWeekPlan(db, { startDay: '2026-10-18' });
        const monday = week.find(d => d.day === '2026-10-19');

        assert.equal(monday.slots.main, 'unknown recipe');
    });

    test('throws when the database reports an error', async () => {
        const db = database({ error: { message: 'JWT expired' } });

        await assert.rejects(() => getWeekPlan(db, { startDay: '2026-10-18' }), /JWT expired/);
    });
});

describe('formatWeekPlan', () => {
    test('renders one line per day, naming empty slots', () => {
        const week = [
            {
                day: '2026-10-18',
                weekday: 'Sun',
                slots: { main: 'Chicken soup', side: null, veg: 'Broccoli' }
            }
        ];

        assert.equal(
            formatWeekPlan(week),
            '2026-10-18 (Sun): main: Chicken soup, side: empty, veg: Broccoli'
        );
    });
});
