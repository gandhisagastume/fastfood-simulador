// Forma de /api/products (el struct de Go no lleva tags json, por eso van capitalizadas).
export interface Product {
  Company: string;
  Item: string;
  Calories?: number | null;
  CaloriesFromFat?: number | null;
  TotalFat?: number | null;
  SaturatedFat?: number | null;
  TransFat?: number | null;
  Cholesterol?: number | null;
  Sodium?: number | null;
  Carbs?: number | null;
  Fiber?: number | null;
  Sugars?: number | null;
  Protein?: number | null;
  WwPnts?: number | null;
  Category: string;
  Cost?: number | null;
  Benefit?: number | null;
  Balance?: number | null;
  Censored: boolean;
  IsSectionRow: boolean;
  SourceLine: number;
}
