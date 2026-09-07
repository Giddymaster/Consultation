import { createContext, useContext } from 'react';
import type { ProductSummaryDto } from '@meridian/types';

/**
 * Cart context and its hook.
 *
 * Kept apart from `cart.tsx` so that file exports only a component and keeps
 * React Fast Refresh — a module exporting both a provider and a hook is
 * remounted on every edit, emptying the cart on each save.
 */

export interface CartLine {
  productId: string;
  quantity: number;
  /** Snapshot for rendering only. Never sent as the basis for a charge. */
  snapshot: {
    name: string;
    slug: string;
    price: number;
    currency: string;
    coverImageUrl: string | null;
    type: 'DIGITAL' | 'PHYSICAL';
  };
}

export interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  /** Indicative only — the authoritative total comes back from the API. */
  estimatedTotal: number;
  currency: string;
  hasPhysicalItems: boolean;
  add: (product: ProductSummaryDto, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  contains: (productId: string) => boolean;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
