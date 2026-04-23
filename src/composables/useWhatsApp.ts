import { computed, type Ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import type { Recipe } from '../types/brewfather';
import { getHopAmountInGrams } from '../utils/hopUtils';

export function useWhatsApp(
  recipe: Ref<Recipe | null>,
  selectedFermentables: Ref<string[]>,
  selectedHops: Ref<string[]>,
  selectedYeasts: Ref<string[]>,
  selectedMiscs: Ref<string[]>
) {
  const toast = useToast();

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
        .then(() => toast.add({ severity: 'success', summary: 'Sucesso', detail: 'Mensagem copiada para a área de transferência!', life: 3000 }))
        .catch(err => {
          console.error('Error copying message to clipboard:', err);
          toast.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao copiar a mensagem.', life: 3000 });
        });
    }
  };

  return { whatsAppMessage, copyMessage };
}
