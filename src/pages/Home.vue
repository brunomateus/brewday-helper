<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import FileUpload, { type FileUploadUploaderEvent } from 'primevue/fileupload';
import Textarea from 'primevue/textarea';
import Panel from 'primevue/panel';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import type { Recipe, Fermentable, Hop, Yeast, Misc } from '../types/brewfather';
import type { BrewShopData, ShopProduct } from '../types/brewshop'
import { storeToRefs } from 'pinia';
import { useUserStore } from '../stores/user';
import { updateBrewfatherInventory } from '../services/brewfatherApi';


const userStore = useUserStore();

const { userId: brewfatherUserId, apiKey: brewfatherApiKey } = storeToRefs(userStore);
const recipe = ref<Recipe | null>(null);
const shopData = ref<BrewShopData | null>(null);
const isUpdatingStock = ref(false);

const selectedFermentables = ref<string[]>([]);
const selectedHops = ref<string[]>([]);
const selectedYeasts = ref<string[]>([]);
const selectedMiscs = ref<string[]>([]);

const costs = reactive<{ [key: string]: number | undefined }>({});
const ingredientUiMode = reactive<{ [key: string]: 'input' | 'select' }>({});

const allShopProducts = computed(() => {
    if (!shopData.value) return [];
    return [
        ...shopData.value.produtos.maltes_base,
        ...shopData.value.produtos.maltes_especiais,
        ...shopData.value.produtos.lupulos,
        ...shopData.value.produtos.leveduras,
    ];
});

const shopMaltes = computed(() => {
    if (!shopData.value) return [];
    return [
        ...shopData.value.produtos.maltes_base,
        ...shopData.value.produtos.maltes_especiais,
    ].map(malte => ({ ...malte, displayName: `${malte.nome} (${malte.fabricante})` }));
});

const shopHops = computed(() => shopData.value?.produtos.lupulos || []);
const shopYeasts = computed(() => shopData.value?.produtos.leveduras || []);

const getHopAmountInGrams = (hop: Hop) => {
    const hopPackageSize = hop.name.toLowerCase().includes('(25g)') ? 25 : 50;
    const packagesNeeded = Math.ceil(hop.amount / hopPackageSize);
    return packagesNeeded * hopPackageSize;
}

const getHopPackageSize = (hop: Hop) => {
    return hop.name.toLowerCase().includes('(25g)') ? 25 : 50;
}

const onRecipeUpload = (event: FileUploadUploaderEvent) => {
  if(event.files && Array.isArray(event.files)) {
    const file = event.files[0];
    if (!file) return;
    readFile(file, (result) => {
      try {
        const parsedRecipe = JSON.parse(result);
        recipe.value = parsedRecipe;
        // Select all ingredients by default
        selectedFermentables.value = parsedRecipe.fermentables.map((i: Fermentable) => i.name);
        selectedHops.value = parsedRecipe.hops.map((i: Hop) => i.name);
        selectedYeasts.value = parsedRecipe.yeasts.map((i: Yeast) => i.name);
        //selectedMiscs.value = parsedRecipe.miscs.map((i: Misc) => i.name);
        initializeIngredientsState();
      } catch (error) {
        console.error('Error parsing recipe file:', error);
      }
    });
  }

};

const onShopProductsUpload = (event: FileUploadUploaderEvent) => {
  if(event.files && Array.isArray(event.files)) {
    const file = event.files[0];
    if (!file) return;
    readFile(file, (result) => {
      try {
        shopData.value = JSON.parse(result);
      } catch (error) {
        console.error('Error parsing shop products file:', error);
      }
    });
  }
};

const readFile = (file: File, callback: (result: string) => void) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      callback(e.target.result as string);
    }
  };
  reader.readAsText(file);
};

const initializeIngredientsState = () => {
    if (!recipe.value) return;
    Object.keys(costs).forEach(key => delete costs[key]);
    Object.keys(ingredientUiMode).forEach(key => delete ingredientUiMode[key]);
    
    [...recipe.value.fermentables, ...recipe.value.hops, ...recipe.value.yeasts, ...recipe.value.miscs].forEach((i: any) => {
        costs[i.name] = undefined;
        ingredientUiMode[i.name] = 'select'; // Default to select
    });
};

const findProduct = (ingredientName: string) => {
    if (!allShopProducts.value.length) return null;
    const searchTerm = ingredientName.toLowerCase().trim();
    return allShopProducts.value.find((p: ShopProduct) => 
        p.nome.toLowerCase().includes(searchTerm) || 
        p.equivalencia?.toLowerCase().includes(searchTerm)
    );
};

watch([() => recipe.value, () => shopData.value], () => {
    if (!recipe.value || !shopData.value) return;

    const setupIngredient = (ingredient: Fermentable | Hop | Yeast | Misc) => {
        const product = findProduct(ingredient.name);
        if (product && product.preco) {
            costs[ingredient.name] = product.preco;
            ingredientUiMode[ingredient.name] = 'input';
        } else {
            costs[ingredient.name] = undefined;
            ingredientUiMode[ingredient.name] = 'select';
        }
    };

    recipe.value.fermentables.forEach(setupIngredient);
    recipe.value.hops.forEach(setupIngredient);
    recipe.value.yeasts.forEach(setupIngredient);
    recipe.value.miscs.forEach(setupIngredient);
}, { deep: true });

const onProductSelect = (ingredientName: string, product: ShopProduct) => {
    if (product) {
        costs[ingredientName] = product.preco;
        ingredientUiMode[ingredientName] = 'input';
    }
};

const changeProduct = (ingredientName: string) => {
    ingredientUiMode[ingredientName] = 'select';
};

const whatsAppMessage = computed(() => {
  if (!recipe.value) return 'O pedido para a loja aparecerá aqui...';

  let message = `Olá! Gostaria de fazer um pedido para a receita "${recipe.value.name}".\n\n`;

  const createIngredientLine = (name: string, amount: number, unit: string) => `${name}: ${amount} ${unit}\n`;

  const fermentables = recipe.value.fermentables.filter(f => selectedFermentables.value.includes(f.name));
  if (fermentables.length > 0) {
    message += '--- Fermentáveis ---\n';
    fermentables.forEach(f => message += createIngredientLine(f.name, f.amount, 'kg'));
  }

  const hops = recipe.value.hops.filter(h => selectedHops.value.includes(h.name));
  if (hops.length > 0) {
    message += '\n--- Lúpulos ---\n';
    hops.forEach(h => message += createIngredientLine(h.name, getHopAmountInGrams(h), 'g'));
  }

  const yeasts = recipe.value.yeasts.filter(y => selectedYeasts.value.includes(y.name));
  if (yeasts.length > 0) {
    message += '\n--- Leveduras ---\n';
    yeasts.forEach(y => message += createIngredientLine(y.name, y.amount, y.amount > 1 ? 'pacotes' : 'pacote'));
  }

  const miscs = recipe.value.miscs.filter(m => selectedMiscs.value.includes(m.name));
  if (miscs.length > 0) {
    message += '\n--- Miscelânea ---\n';
    miscs.forEach(m => message += createIngredientLine(m.name, m.amount, m.unit));
  }

  message += '\nObrigado!';
  return message;
});

const copyMessage = () => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(whatsAppMessage.value)
      .then(() => alert('Mensagem copiada para a área de transferência!'))
      .catch(err => console.error('Error copying message to clipboard:', err));
  }
};

const updateStock = async () => {
  if (!recipe.value || !brewfatherUserId.value || !brewfatherApiKey.value) {
    alert('Por favor, carregue uma receita e insira suas credenciais da API do Brewfather.');
    return;
  }
  
  const getIngredientsForUpdate = (list: any[], selected: string[]) => {
      return list
          .filter(item => selected.includes(item.name))
          .map(item => {
              let cost = costs[item.name];
              if (item.use === 'Boil' && cost) { // It's a hop
                const packageSize = getHopPackageSize(item);
                cost = cost / packageSize; // cost per gram
              }

              return {
                ...item,
                amount: item.use === 'Boil' ? getHopAmountInGrams(item) : item.amount,
                cost: cost
              }
          });
  };

  const recipeForUpdate: Recipe = {
      ...recipe.value,
      fermentables: getIngredientsForUpdate(recipe.value.fermentables, selectedFermentables.value),
      hops: getIngredientsForUpdate(recipe.value.hops, selectedHops.value),
      yeasts: getIngredientsForUpdate(recipe.value.yeasts, selectedYeasts.value),
      miscs: getIngredientsForUpdate(recipe.value.miscs, selectedMiscs.value),
  };

  isUpdatingStock.value = true;
  try {
    await updateBrewfatherInventory(brewfatherUserId.value, brewfatherApiKey.value, recipeForUpdate);
    alert('Estoque do Brewfather atualizado com sucesso!');
  } catch (error) {
    console.error('Failed to update Brewfather inventory:', error);
    alert(`Falha ao atualizar o estoque do Brewfather: ${error}`);
  } finally {
    isUpdatingStock.value = false;
  }
};
</script>

<template>
  <div class="grid">
    <div class="col-12">
      <Card>
        <template #title>
          <div class="flex align-items-center">
            <i class="pi pi-book mr-2"></i>
            <span>Recipe Helper para Brewfather</span>
          </div>
        </template>
        <template #subtitle>
          Gere seu pedido para a loja e atualize seu estoque com facilidade.
        </template>
      </Card>
    </div>

    <div class="col-12 md:col-6">
      <Panel header="Passo 1: Credenciais da API Brewfather">
        <div class="field">
          <label for="bf-userid">User ID</label>
          <InputText id="bf-userid" v-model="brewfatherUserId" class="w-full" />
        </div>
        <div class="field">
          <label for="bf-apikey">API Key</label>
          <InputText id="bf-apikey" v-model="brewfatherApiKey" class="w-full" />
        </div>
        <small>Suas credenciais são usadas apenas no seu navegador e são salvas localmente para futuros acessos.</small>
      </Panel>
    </div>

    <div class="col-12 md:col-6">
      <Panel header="Passo 2: Upload de Arquivos">
        <div class="field">
          <label for="recipe-upload">Receita do Brewfather (.json)</label>
          <FileUpload id="recipe-upload" mode="basic" name="recipe" accept=".json" :auto="true" :customUpload="true" @uploader="onRecipeUpload" chooseLabel="Selecionar JSON" />
        </div>
        <div class="field">
          <label for="shop-products-upload">Lista de Produtos da Loja (.json)</label>
          <FileUpload id="shop-products-upload" mode="basic" name="shop-products" accept=".json" :auto="true" :customUpload="true" @uploader="onShopProductsUpload" chooseLabel="Selecionar JSON" />
        </div>
      </Panel>
    </div>

    <div class="col-12" v-if="recipe">
      <Panel header="Passo 3: Selecione os Itens para o Pedido">
        <div class="grid">
          <div class="col-12 md:col-6" v-if="recipe.fermentables.length">
            <h5>Fermentáveis (preço/kg)</h5>
            <div v-for="f in recipe.fermentables" :key="f.name" class="ingredient-item">
              <div class="flex align-items-center">
                <Checkbox :id="`f-${f.name}`" v-model="selectedFermentables" :value="f.name" />
                <label :for="`f-${f.name}`" class="ml-2">{{ f.name }}</label>
              </div>
              <div class="flex align-items-center" v-if="selectedFermentables.includes(f.name)">
                <div v-if="ingredientUiMode[f.name] === 'input'" class="flex align-items-center">
                  <InputNumber v-model="costs[f.name]" class="p-inputtext-sm" placeholder="Custo/kg" />
                  <Button icon="pi pi-sync" class="p-button-sm p-button-text ml-2" @click="changeProduct(f.name)" aria-label="Trocar" />
                </div>
                <Select v-else-if="shopData"
                    :options="shopMaltes"
                    optionLabel="displayName"
                    placeholder="Selecionar produto"
                    @change="onProductSelect(f.name, $event.value)"
                    class="p-inputtext-sm" style="width: 200px"
                    :filter="true" filterPlaceholder="Buscar malte"
                    />
              </div>
            </div>
          </div>
          <div class="col-12 md:col-6" v-if="recipe.hops.length">
            <h5>Lúpulos (preço/pct)</h5>
            <div v-for="h in recipe.hops" :key="h.name" class="ingredient-item">
              <div class="flex align-items-center">
                <Checkbox :id="`h-${h.name}`" v-model="selectedHops" :value="h.name" />
                <label :for="`h-${h.name}`" class="ml-2">{{ h.name }} ({{getHopAmountInGrams(h)}}g)</label>
              </div>
              <div class="flex align-items-center" v-if="selectedHops.includes(h.name)">
                 <div v-if="ingredientUiMode[h.name] === 'input'" class="flex align-items-center">
                  <InputNumber v-model="costs[h.name]" class="p-inputtext-sm" placeholder="Custo/pct" />
                  <Button icon="pi pi-sync" class="p-button-sm p-button-text ml-2" @click="changeProduct(h.name)" aria-label="Trocar" />
                </div>
                <Select v-else-if="shopData"
                    :options="shopHops"
                    optionLabel="nome"
                    placeholder="Selecionar produto"
                    @change="onProductSelect(h.name, $event.value)"
                    class="p-inputtext-sm ml-2" style="width: 200px"
                    :filter="true" filterPlaceholder="Buscar lúpulo"
                    />
              </div>
            </div>
          </div>
          <div class="col-12 md:col-6" v-if="recipe.yeasts.length">
            <h5>Leveduras (preço/pct)</h5>
            <div v-for="y in recipe.yeasts" :key="y.name" class="ingredient-item">
              <div class="flex align-items-center">
                <Checkbox :id="`y-${y.name}`" v-model="selectedYeasts" :value="y.name" />
                <label :for="`y-${y.name}`" class="ml-2">{{ y.name }}</label>
              </div>
              <div class="flex align-items-center" v-if="selectedYeasts.includes(y.name)">
                <div v-if="ingredientUiMode[y.name] === 'input'" class="flex align-items-center">
                  <InputNumber v-model="costs[y.name]" class="p-inputtext-sm" placeholder="Custo/pct" />
                  <Button icon="pi pi-sync" class="p-button-sm p-button-text ml-2" @click="changeProduct(y.name)" aria-label="Trocar" />
                </div>
                <Select v-else-if="shopData"
                    :options="shopYeasts"
                    optionLabel="nome"
                    placeholder="Selecionar produto"
                    @change="onProductSelect(y.name, $event.value)"
                    class="p-inputtext-sm ml-2" style="width: 200px"
                    :filter="true" filterPlaceholder="Buscar levedura"
                    />
              </div>
            </div>
          </div>
          <div class="col-12 md:col-6" v-if="recipe.miscs.length">
            <h5>Miscelânea (preço/un)</h5>
            <div v-for="m in recipe.miscs" :key="m.name" class="ingredient-item">
              <div class="flex align-items-center">
                <Checkbox :id="`m-${m.name}`" v-model="selectedMiscs" :value="m.name" />
                <label :for="`m-${m.name}`" class="ml-2">{{ m.name }}</label>
              </div>
              <div class="flex align-items-center" v-if="selectedMiscs.includes(m.name)">
                <div v-if="ingredientUiMode[m.name] === 'input'" class="flex align-items-center">
                  <InputNumber v-model="costs[m.name]" class="p-inputtext-sm" placeholder="Custo/un" />
                  <Button icon="pi pi-sync" class="p-button-sm p-button-text ml-2" @click="changeProduct(m.name)" aria-label="Trocar" />
                </div>
                <Select v-else-if="shopData"
                    :options="allShopProducts"
                    optionLabel="nome"
                    placeholder="Selecionar produto"
                    @change="onProductSelect(m.name, $event.value)"
                    class="p-inputtext-sm ml-2" style="width: 200px"
                    :filter="true" filterPlaceholder="Buscar produto"
                    />
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>

    <div class="col-12">
      <Panel header="Resultados">
        <div class="grid">
          <div class="col-12 md:col-6">
            <h5>Mensagem para WhatsApp</h5>
            <Textarea :modelValue="whatsAppMessage" rows="15" class="w-full" :disabled="!recipe" />
            <Button label="Copiar Mensagem" icon="pi pi-copy" class="mt-2" @click="copyMessage" :disabled="!recipe" />
          </div>
          <div class="col-12 md:col-6">
            <h5>Atualização de Estoque</h5>
            <div v-if="recipe">
              <p>Itens selecionados para atualizar o estoque:</p>
              <ul>
                <li v-for="f in recipe.fermentables.filter(i => selectedFermentables.includes(i.name))" :key="f.name">{{ f.name }}</li>
                <li v-for="h in recipe.hops.filter(i => selectedHops.includes(i.name))" :key="h.name">{{ h.name }}</li>
                <li v-for="y in recipe.yeasts.filter(i => selectedYeasts.includes(i.name))" :key="y.name">{{ y.name }}</li>
                <li v-for="m in recipe.miscs.filter(i => selectedMiscs.includes(i.name))" :key="m.name">{{ m.name }}</li>
              </ul>
            </div>
            <p v-else>Os ingredientes da receita aparecerão aqui para confirmação.</p>
            <Button label="Atualizar Estoque no Brewfather" icon="pi pi-cloud-upload" class="p-button-success" @click="updateStock" :disabled="!recipe || isUpdatingStock" :loading="isUpdatingStock" />
          </div>
        </div>
      </Panel>
    </div>
  </div>
</template>

<style scoped>
.field {
  margin-bottom: 1rem;
}
.ingredient-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 0.5rem;
}
</style>
