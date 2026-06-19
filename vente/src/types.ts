export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type SortOption = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "NAME_ASC";
