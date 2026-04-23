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
import { updateBrewfatherInventory, type UpdateResult } from '../services/brewfatherApi';
import { useToast } from 'primevue/usetoast';
import { getHopAmountInGrams, getHopPackageSize } from '../utils/hopUtils';
import { useWhatsApp } from '../composables/useWhatsApp';
import { readFileAsText } from '../utils/fileUtils';


const userStore = useUserStore();
const toast = useToast();

const { userId: brewfatherUserId, apiKey: brewfatherApiKey } = storeToRefs(userStore);
const recipe = ref<Recipe | null>(null);
const shopData = ref<BrewShopData | null>(null);
const isUpdatingStock = ref(false);
const updateResults = ref<UpdateResult[] | null>(null);

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



const onRecipeUpload = (event: FileUploadUploaderEvent) => {
  if(event.files && Array.isArray(event.files)) {
    const file = event.files[0];
    if (!file) return;
    readFileAsText(file, (result) => {
      try {
        const parsedRecipe = JSON.parse(result);
        
        const aggregateIngredients = (ingredients: any[]) => {
          if (!ingredients) return [];
          const map = new Map();
          for (const item of ingredients) {
            if (map.has(item.name)) {
              const existing = map.get(item.name);
              existing.amount += item.amount;
            } else {
              map.set(item.name, { ...item });
            }
          }
          return Array.from(map.values());
        };

        parsedRecipe.fermentables = aggregateIngredients(parsedRecipe.fermentables);
        parsedRecipe.hops = aggregateIngredients(parsedRecipe.hops);
        parsedRecipe.yeasts = aggregateIngredients(parsedRecipe.yeasts);
        parsedRecipe.miscs = aggregateIngredients(parsedRecipe.miscs);

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
    readFileAsText(file, (result) => {
      try {
        shopData.value = JSON.parse(result);
      } catch (error) {
        console.error('Error parsing shop products file:', error);
      }
    });
  }
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

const { whatsAppMessage, copyMessage } = useWhatsApp(recipe, selectedFermentables, selectedHops, selectedYeasts, selectedMiscs);

const updateStock = async () => {
  if (!recipe.value || !brewfatherUserId.value || !brewfatherApiKey.value) {
    toast.add({ severity: 'warn', summary: 'Atenção', detail: 'Por favor, carregue uma receita e insira suas credenciais da API do Brewfather.', life: 5000 });
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
  updateResults.value = null;
  try {
    const results = await updateBrewfatherInventory(brewfatherUserId.value, brewfatherApiKey.value, recipeForUpdate);
    updateResults.value = results;
    
    const hasErrors = results.some(r => !r.success);
    if (hasErrors) {
      toast.add({ severity: 'warn', summary: 'Atenção', detail: 'Alguns itens não puderam ser atualizados. Verifique os resultados na tela.', life: 5000 });
    } else {
      toast.add({ severity: 'success', summary: 'Sucesso', detail: 'Estoque do Brewfather atualizado com sucesso!', life: 3000 });
    }
  } catch (error) {
    console.error('Failed to update Brewfather inventory:', error);
    toast.add({ severity: 'error', summary: 'Erro', detail: `Erro inesperado ao atualizar o estoque: ${error}`, life: 5000 });
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
            <div v-if="updateResults">
              <p>Resultados da atualização:</p>
              <ul class="list-none p-0 m-0">
                <li v-for="result in updateResults" :key="result.name" class="mb-2">
                  <span v-if="result.success" class="text-green-600 font-bold">
                    <i class="pi pi-check text-green-600"></i> {{ result.name }}: Sucesso
                  </span>
                  <span v-else class="text-red-600 font-bold">
                    <i class="pi pi-times text-red-600"></i> {{ result.name }}: Falha <span class="font-normal">({{ result.error }})</span>
                  </span>
                </li>
              </ul>
              <Button label="Limpar Resultados" class="p-button-secondary p-button-sm mt-3" @click="updateResults = null" />
            </div>
            <div v-else-if="recipe">
              <p>Itens selecionados para atualizar o estoque:</p>
              <ul>
                <li v-for="f in recipe.fermentables.filter(i => selectedFermentables.includes(i.name))" :key="f.name">{{ f.name }}</li>
                <li v-for="h in recipe.hops.filter(i => selectedHops.includes(i.name))" :key="h.name">{{ h.name }}</li>
                <li v-for="y in recipe.yeasts.filter(i => selectedYeasts.includes(i.name))" :key="y.name">{{ y.name }}</li>
                <li v-for="m in recipe.miscs.filter(i => selectedMiscs.includes(i.name))" :key="m.name">{{ m.name }}</li>
              </ul>
            </div>
            <p v-else>Os ingredientes da receita aparecerão aqui para confirmação.</p>
            <Button v-if="!updateResults" label="Atualizar Estoque no Brewfather" icon="pi pi-cloud-upload" class="p-button-success" @click="updateStock" :disabled="!recipe || isUpdatingStock" :loading="isUpdatingStock" />
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
