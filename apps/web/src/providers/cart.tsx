import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CartContext, type CartContextValue, type CartLine } from './cart-context';
import type { ProductSummaryDto } from '@meridian/types';

/**
 * Shopping cart.
 *
 * Held in localStorage so a browse-and-return journey does not lose the basket.
 * Only product ids, quantities and a display snapshot are stored — the server
 * recomputes every price at checkout from live product rows, so a tampered
 * cart in storage changes what the user *sees* and nothing about what they pay.
 */

const STORAGE_KEY = 'meridian:cart';

function readStored(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === 'object' && line !== null && 'productId' in line && 'quantity' in line,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* Storage full or blocked; the cart still works for this session. */
    }
  }, [lines]);

  const add = useCallback((product: ProductSummaryDto, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);

      // A digital product is a licence, not a quantity — buying two of the same
      // PDF is meaningless, so it is capped at one.
      if (existing) {
        if (product.type === 'DIGITAL') return current;
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: Math.min(line.quantity + quantity, 50) }
            : line,
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          quantity: product.type === 'DIGITAL' ? 1 : quantity,
          snapshot: {
            name: product.name,
            slug: product.slug,
            price: product.price,
            currency: product.currency,
            coverImageUrl: product.coverImageUrl,
            type: product.type,
          },
        },
      ];
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.productId !== productId)
        : current.map((line) =>
            line.productId === productId ? { ...line, quantity: Math.min(quantity, 50) } : line,
          ),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      estimatedTotal: lines.reduce((sum, line) => sum + line.snapshot.price * line.quantity, 0),
      currency: lines[0]?.snapshot.currency ?? 'KES',
      hasPhysicalItems: lines.some((line) => line.snapshot.type === 'PHYSICAL'),
      add,
      remove,
      setQuantity,
      clear,
      contains: (productId) => lines.some((line) => line.productId === productId),
    }),
    [lines, add, remove, setQuantity, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
