// apiTest.js

const fetchNutrition = async (ingredientName) => {
    const appId = import.meta.env.VITE_EDAMAM_APP_ID;
    const appKey = import.meta.env.VITE_EDAMAM_APP_KEY;

    const url = `https://api.edamam.com/api/food-database/v2/parser?app_id=${appId}&app_key=${appKey}&ingr=${ingredientName}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // Pick the first food result found
        const firstResult = data.hints[0]?.food;

        if (firstResult) {
            console.log(`Nutritional info for ${ingredientName}:`, firstResult.nutrients);
        }

        return firstResult;
    } catch (error) {
        console.error("Fetch failed:", error);
    }
};

export default fetchNutrition;