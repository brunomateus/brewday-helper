import type { Recipe, Fermentable, Hop, Yeast, Misc } from '../types/brewfather';

const API_BASE_URL = 'https://api.brewfather.app/v2';

async function patchIngredient(
  userId: string,
  apiKey: string,
  ingredientType: 'fermentables' | 'hops' | 'yeasts' | 'miscs',
  ingredientId: string,
  amount: number,
) {
  const url = `${API_BASE_URL}/inventory/${ingredientType}/${ingredientId}`;
  const credentials = btoa(`${userId}:${apiKey}`);

  const body = {
    inventory_adjust: amount
  };


  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to update ${ingredientType}: ${errorData.message}`);
  }

  return response.text();
}

export interface UpdateResult {
  name: string;
  success: boolean;
  error?: string;
}

export async function updateBrewfatherInventory(
  userId: string,
  apiKey: string,
  recipe: Recipe
): Promise<UpdateResult[]> {
  const results: Promise<UpdateResult>[] = [];

  const update = async (name: string, type: 'fermentables' | 'hops' | 'yeasts' | 'miscs', id: string, amount: number) => {
    try {
      await patchIngredient(userId, apiKey, type, id, amount);
      return { name, success: true };
    } catch (error: any) {
      return { name, success: false, error: error.message || String(error) };
    }
  };

  for (const f of recipe.fermentables) {
    // The amount in the recipe is in kg, but the API expects kg
    results.push(update(f.name, 'fermentables', f._id, f.amount));
  }

  for (const h of recipe.hops) {
    // The amount in the recipe is in g, the API expects g
    results.push(update(h.name, 'hops', h._id, h.amount));
  }

  for (const y of recipe.yeasts) {
    // The amount is in packages
    results.push(update(y.name, 'yeasts', y._id, y.amount));
  }

  for (const m of recipe.miscs) {
    // The amount is in g or items, the API expects the same unit
    results.push(update(m.name, 'miscs', m._id, m.amount));
  }

  return Promise.all(results);
}
