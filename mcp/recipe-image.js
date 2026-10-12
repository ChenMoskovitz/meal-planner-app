/**
 * Setting a recipe's photo.
 *
 * Mirrors what Recipes.jsx's uploadRecipeImage does in the web app: the same
 * bucket, the same type and size limits, and the same cleanup of the previous
 * file once the recipe points elsewhere. The two cannot share code — this is a
 * standalone Node package, not bundled with the Vite app — so keep them in
 * sync by hand if either changes.
 *
 * The model gives a URL or a local file path rather than raw image bytes:
 * reading it here keeps the tool call itself a small, ordinary JSON message
 * instead of carrying a multi-megabyte body through MCP. A path only works
 * because this server runs on the same machine as the file.
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { findRecipe } from './ingredients.js';

export const IMAGE_BUCKET = 'recipe-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_FOR_TYPE = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSION_FOR_TYPE);

// A local file has no Content-Type header to read, so its extension stands in
// for one — reversing EXTENSION_FOR_TYPE would collapse .jpg and .jpeg to the
// same key and lose one of them.
const TYPE_FOR_EXTENSION = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

// ".../object/public/recipe-images/<name>" -> "<name>", copied from
// Recipes.jsx's storageNameFromUrl for the same reason as the header comment.
function storageNameFromUrl(url) {
    if (!url) return null;
    const marker = `/${IMAGE_BUCKET}/`;
    const at = url.indexOf(marker);
    if (at === -1) return null;
    return decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
}

async function readFromUrl(imageUrl, fetchImpl) {
    let response;
    try {
        response = await fetchImpl(imageUrl);
    } catch (error) {
        return { ok: false, message: `Could not download that image: ${error.message}` };
    }

    if (!response.ok) {
        return { ok: false, message: `Could not download that image: the server responded ${response.status}.` };
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();

    // Checked before size: no point reading a multi-megabyte body for a file
    // type that will be refused anyway.
    if (!EXTENSION_FOR_TYPE[contentType]) {
        return {
            ok: false,
            message: `That URL is ${contentType || 'not an image'}. Only JPEG, PNG, WebP and GIF images are supported.`
        };
    }

    return { ok: true, contentType, buffer: Buffer.from(await response.arrayBuffer()) };
}

async function readFromPath(imagePath, readFileImpl) {
    const contentType = TYPE_FOR_EXTENSION[extname(imagePath).toLowerCase()];

    if (!contentType) {
        return {
            ok: false,
            message: `"${imagePath}" is not a .jpg, .jpeg, .png, .webp or .gif file. Only those image types are supported.`
        };
    }

    let buffer;
    try {
        buffer = await readFileImpl(imagePath);
    } catch (error) {
        return { ok: false, message: `Could not read that file: ${error.message}` };
    }

    return { ok: true, contentType, buffer };
}

export async function setRecipeImage(
    client, { recipe: recipeName, imageUrl, imagePath, fetchImpl = fetch, readFileImpl = readFile }
) {
    const found = await findRecipe(client, recipeName);

    if (!found.ok) return { ok: false, message: found.reason };

    const source = imagePath ? await readFromPath(imagePath, readFileImpl) : await readFromUrl(imageUrl, fetchImpl);

    if (!source.ok) return source;

    const { contentType, buffer } = source;
    const extension = EXTENSION_FOR_TYPE[contentType];

    if (buffer.byteLength > MAX_IMAGE_BYTES) {
        const sizeMb = (buffer.byteLength / 1024 / 1024).toFixed(1);
        return { ok: false, message: `That image is ${sizeMb}MB. The limit is 5MB.` };
    }

    const { recipe } = found;
    const fileName = `${recipe.id}-${Date.now()}.${extension}`;

    const { error: uploadError } = await client.storage
        .from(IMAGE_BUCKET)
        .upload(fileName, buffer, { contentType });

    if (uploadError) throw new Error(`Could not upload the image: ${uploadError.message}`);

    const { data: publicUrlData } = client.storage.from(IMAGE_BUCKET).getPublicUrl(fileName);

    const { error: updateError } = await client
        .from('recipes')
        .update({ image_url: publicUrlData.publicUrl })
        .eq('id', recipe.id);

    if (updateError) {
        throw new Error(`Uploaded the image, but could not attach it to "${recipe.name}": ${updateError.message}`);
    }

    // The old file is unreachable once the recipe points elsewhere, so don't
    // leave it sitting in storage forever — same cleanup Recipes.jsx does. A
    // failure here is logged, not thrown: the recipe already has its new
    // photo, and the user did not ask for this cleanup, so it must not read as
    // the operation having failed.
    const previousName = storageNameFromUrl(recipe.image_url);
    if (previousName && previousName !== fileName) {
        const { error: removeError } = await client.storage.from(IMAGE_BUCKET).remove([previousName]);
        if (removeError) console.error('Failed to remove the previous recipe image:', removeError.message);
    }

    return { ok: true, message: `Set the photo for "${recipe.name}".` };
}
