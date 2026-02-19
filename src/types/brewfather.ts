export interface Fermentable {
  _id: string;
  name: string;
  amount: number; // in kg
  type: string;
  cost?: number;
}

export interface Hop {
  _id: string;
  name:string;
  amount: number; // in g
  use: string;
  time: number;
  type: string;
  cost?: number;
}

export interface Yeast {
  _id: string;
  name: string;
  amount: number; // in packages
  form: string;
  laboratory: string;
  productId: string;
  cost?: number;
}

export interface Misc {
  _id: string;
  name: string;
  amount: number;
  unit: string;
  use: string;
  type: string;
  cost?: number;
}

export interface Recipe {
  name: string;
  fermentables: Fermentable[];
  hops: Hop[];
  yeasts: Yeast[];
  miscs: Misc[];
}
