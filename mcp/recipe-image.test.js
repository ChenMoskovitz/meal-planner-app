/**
 * Unit tests for setting a recipe's photo.
 *
 * The fake fetch stands in for the image host: these tests care about what the
 * function does with a response, not about network behaviour, which is already
 * out of scope the same way nutrition.js's own fetch is tested separately.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setRecipeImage, IMAGE_BUCKET } from './recipe-image.js';
import { fakeSupabase } from './fake-supabase.js';

const RECIPES = [{ id: 'soup', name: 'Chicken soup', image_url: null }];

const database = (extra = {}) => fakeSupabase({ recipes: structuredClone(RECIPES), ...extra });

function fakeFetchReturning({ ok = true, status = 200, contentType = 'image/jpeg', bytes = 10 } = {}) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        return {
            ok,
            status,
            headers: { get: (name) => (name === 'content-type' ? contentType : null) },
            arrayBuffer: async () => new ArrayBuffer(bytes)
        };
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

describe('setRecipeImage', () => {
    test('downloads the image and attaches it to the recipe', async () => {
        const db = database();

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.com/soup.jpg',
            fetchImpl: fakeFetchReturning()
        });

        assert.equal(result.ok, true);
        assert.match(result.message, /Set the photo for "Chicken soup"/);
        assert.match(db.tables.recipes[0].image_url, new RegExp(`${IMAGE_BUCKET}/soup-\\d+\\.jpg`));
    });

    test('uses the extension that matches the content type', async () => {
        const db = database();

        await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.com/soup',
            fetchImpl: fakeFetchReturning({ contentType: 'image/png' })
        });

        assert.match(db.tables.recipes[0].image_url, /\.png$/);
    });

    test('fetches the exact URL it was given', async () => {
        const db = database();
        const fetchImpl = fakeFetchReturning();

        await setRecipeImage(db, { recipe: 'Chicken soup', imageUrl: 'https://example.com/soup.jpg', fetchImpl });

        assert.deepEqual(fetchImpl.calls, ['https://example.com/soup.jpg']);
    });

    test('removes the previous image once a new one is attached', async () => {
        const db = database({
            recipes: [{
                id: 'soup',
                name: 'Chicken soup',
                image_url: `https://x.supabase.co/storage/v1/object/public/${IMAGE_BUCKET}/old.jpg`
            }]
        });
        db.storageFiles[`${IMAGE_BUCKET}/old.jpg`] = { body: Buffer.from('old') };

        await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.com/soup.jpg',
            fetchImpl: fakeFetchReturning()
        });

        assert.equal(db.storageFiles[`${IMAGE_BUCKET}/old.jpg`], undefined);
    });

    test('rejects a file type that is not an image the app supports', async () => {
        const db = database();

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.com/soup.pdf',
            fetchImpl: fakeFetchReturning({ contentType: 'application/pdf' })
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /application\/pdf/);
        assert.equal(db.tables.recipes[0].image_url, null);
    });

    test('rejects an image over the size limit', async () => {
        const db = database();

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.com/soup.jpg',
            fetchImpl: fakeFetchReturning({ bytes: 6 * 1024 * 1024 })
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /limit is 5MB/);
        assert.equal(db.tables.recipes[0].image_url, null);
    });

    test('reports a download failure without throwing', async () => {
        const db = database();

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.com/missing.jpg',
            fetchImpl: fakeFetchReturning({ ok: false, status: 404 })
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /404/);
    });

    test('reports an unreachable host without throwing', async () => {
        const db = database();
        const exploding = async () => { throw new Error('getaddrinfo ENOTFOUND'); };

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup',
            imageUrl: 'https://example.invalid/soup.jpg',
            fetchImpl: exploding
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /ENOTFOUND/);
    });

    test('says which tool to use when the recipe does not exist', async () => {
        const db = database({ recipes: [] });

        const result = await setRecipeImage(db, {
            recipe: 'Beef wellington',
            imageUrl: 'https://example.com/soup.jpg',
            fetchImpl: fakeFetchReturning()
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /list_recipes/);
    });

    test('never downloads anything for a recipe that does not exist', async () => {
        const db = database({ recipes: [] });
        const fetchImpl = fakeFetchReturning();

        await setRecipeImage(db, { recipe: 'Beef wellington', imageUrl: 'https://example.com/soup.jpg', fetchImpl });

        assert.equal(fetchImpl.calls.length, 0);
    });

    test('reads a local file and attaches it to the recipe', async () => {
        const db = database();
        const readFileImpl = async () => Buffer.from('fake-bytes');

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup', imagePath: '/Users/me/Desktop/soup.png', readFileImpl
        });

        assert.equal(result.ok, true);
        assert.match(db.tables.recipes[0].image_url, /\.png$/);
    });

    test('reads the exact path it was given', async () => {
        const db = database();
        const calls = [];
        const readFileImpl = async (path) => { calls.push(path); return Buffer.from('x'); };

        await setRecipeImage(db, { recipe: 'Chicken soup', imagePath: '/Users/me/Desktop/soup.jpg', readFileImpl });

        assert.deepEqual(calls, ['/Users/me/Desktop/soup.jpg']);
    });

    test('rejects a local file whose extension is not a supported image type', async () => {
        const db = database();
        const readFileImpl = async () => Buffer.from('x');

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup', imagePath: '/Users/me/Desktop/soup.pdf', readFileImpl
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /soup\.pdf/);
        assert.equal(db.tables.recipes[0].image_url, null);
    });

    test('never reads a file for a recipe that does not exist', async () => {
        const db = database({ recipes: [] });
        const calls = [];
        const readFileImpl = async (path) => { calls.push(path); return Buffer.from('x'); };

        await setRecipeImage(db, { recipe: 'Beef wellington', imagePath: '/Users/me/Desktop/soup.jpg', readFileImpl });

        assert.equal(calls.length, 0);
    });

    test('reports a local file that cannot be read without throwing', async () => {
        const db = database();
        const readFileImpl = async () => { throw new Error('ENOENT: no such file or directory'); };

        const result = await setRecipeImage(db, {
            recipe: 'Chicken soup', imagePath: '/Users/me/Desktop/missing.jpg', readFileImpl
        });

        assert.equal(result.ok, false);
        assert.match(result.message, /ENOENT/);
    });

    test('throws when the upload fails', async () => {
        const db = database({ storageError: { message: 'bucket not found' } });

        await assert.rejects(
            () => setRecipeImage(db, {
                recipe: 'Chicken soup',
                imageUrl: 'https://example.com/soup.jpg',
                fetchImpl: fakeFetchReturning()
            }),
            /bucket not found/
        );
    });
});
