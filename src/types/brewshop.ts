export type ShopProduct = {
  nome: string;
  preco: number;
  equivalencia?: string;
  fabricante?: string;
}

export type BrewShopData = {
  "loja": string,
  "data_atualizacao": string,
  "contato": {
    "endereco":  string,
    "telefone": string,
  },
  "observacoes": string[],
  "produtos": {
    "maltes_base": ShopProduct[],
    "maltes_especiais": ShopProduct[],
    "lupulos": ShopProduct[],
    "leveduras": ShopProduct[],
  }
}