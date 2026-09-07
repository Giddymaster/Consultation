import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Select, Separator } from '@/components/ui';
import { CardGridSkeleton, ProductCard, Section } from '@/components/marketing';
import { SEO } from '@/components/SEO';
import { productSchema } from '@/lib/structured-data';
import { useCreateOrder, useInitializePayment, useProduct, useProductCategories, useProducts } from '@/lib/queries';
import { useCart } from '@/providers/cart-context';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { cn, idempotencyKey, clearIdempotencyKey, money } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Shop index                                                                 */
/* -------------------------------------------------------------------------- */

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';

  const { data: categories } = useProductCategories();
  const { data, isLoading } = useProducts({ pageSize: 24, category: category || undefined, sort });

  const { itemCount } = useCart();

  return (
    <>
      <SEO
        title="Books, journals & resources"
        description="Books, research reports, working templates and recorded programmes from the Meridian partnership."
        path="/shop"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-5 py-14 sm:px-8 sm:py-20">
          <div>
            <p className="text-eyebrow uppercase text-accent">Resources</p>
            <h1 className="mt-3 max-w-2xl text-h1">Take the thinking with you</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Our books, research reports and the working templates we use in engagements. Digital files download
              instantly to your portal.
            </p>
          </div>

          {itemCount > 0 && (
            <Link to="/cart">
              <Button variant="secondary" icon={<ShoppingBag className="size-4" aria-hidden />}>
                Basket ({itemCount})
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Section className="!pt-12">
        <div className="mb-10 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setParams(sort !== 'newest' ? { sort } : {})}
              aria-pressed={!category}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                !category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              All
            </button>
            {categories?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams({ category: item.slug, ...(sort !== 'newest' ? { sort } : {}) })}
                aria-pressed={category === item.slug}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  category === item.slug
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="ml-auto w-44">
            <Select
              value={sort}
              aria-label="Sort products"
              onChange={(event) =>
                setParams({ ...(category ? { category } : {}), sort: event.target.value })
              }
            >
              <option value="newest">Newest first</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name A–Z</option>
            </Select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <CardGridSkeleton count={8} aspect="tall" />
          ) : data && data.items.length > 0 ? (
            data.items.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)
          ) : (
            <div className="sm:col-span-2 lg:col-span-4">
              <EmptyState
                icon={<BookOpen className="size-5" aria-hidden />}
                title="Nothing in this category yet"
                action={
                  <Button variant="secondary" onClick={() => setParams({})}>
                    Show everything
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Product detail                                                             */
/* -------------------------------------------------------------------------- */

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, isError } = useProduct(slug);
  const cart = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2">
        <div className="skeleton aspect-[3/4] w-full" />
        <div>
          <div className="skeleton h-10 w-2/3" />
          <div className="skeleton mt-4 h-32 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <Section>
        <EmptyState
          title="That resource could not be found"
          action={
            <Link to="/shop">
              <Button>Browse resources</Button>
            </Link>
          }
        />
      </Section>
    );
  }

  const inCart = cart.contains(product.id);

  return (
    <>
      <SEO
        title={product.seoTitle ?? product.name}
        description={product.seoDescription ?? product.shortDescription ?? undefined}
        path={`/shop/${product.slug}`}
        type="product"
        image={product.coverImageUrl ?? undefined}
        structuredData={productSchema(product)}
      />

      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex items-center gap-2 text-xs text-muted-foreground">
            <li>
              <Link to="/shop" className="transition-colors hover:text-foreground">
                Resources
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link to={`/shop?category=${product.category.slug}`} className="transition-colors hover:text-foreground">
                {product.category.name}
              </Link>
            </li>
          </ol>
        </nav>

        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-muted to-accent-soft shadow-[var(--shadow-lifted)]">
              {product.coverImageUrl ? (
                <img src={product.coverImageUrl} alt={product.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col justify-between p-8">
                  <span className="text-eyebrow uppercase text-accent">{product.category.name}</span>
                  <div>
                    <p className="text-h2">{product.name}</p>
                    {product.author && <p className="mt-2 text-sm text-muted-foreground">{product.author}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <Badge tone="neutral">{product.category.name}</Badge>
            <h1 className="mt-4 text-h1">{product.name}</h1>
            {product.author && <p className="mt-2 text-lg text-muted-foreground">by {product.author}</p>}

            <div className="mt-6 flex items-baseline gap-3">
              <p className="text-h2">{money(product.price, product.currency)}</p>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <p className="text-lg text-muted-foreground line-through">
                  {money(product.compareAtPrice, product.currency)}
                </p>
              )}
            </div>

            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Format</dt>
                <dd className="mt-0.5 font-medium">
                  {product.type === 'DIGITAL' ? 'Digital download' : 'Print edition'}
                </dd>
              </div>
              {product.pages && (
                <div>
                  <dt className="text-xs text-muted-foreground">Pages</dt>
                  <dd className="tabular mt-0.5 font-medium">{product.pages}</dd>
                </div>
              )}
              {product.publishedYear && (
                <div>
                  <dt className="text-xs text-muted-foreground">Published</dt>
                  <dd className="tabular mt-0.5 font-medium">{product.publishedYear}</dd>
                </div>
              )}
              {product.isbn && (
                <div>
                  <dt className="text-xs text-muted-foreground">ISBN</dt>
                  <dd className="tabular mt-0.5 font-medium">{product.isbn}</dd>
                </div>
              )}
            </dl>

            {product.inStock ? (
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {product.type === 'PHYSICAL' && (
                  <div className="flex items-center rounded-[var(--radius-control)] hairline">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      className="p-3 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="tabular w-10 text-center text-sm font-medium" aria-live="polite">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(product.stock ?? 50, q + 1))}
                      aria-label="Increase quantity"
                      className="p-3 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                )}

                <Button
                  size="lg"
                  className="flex-1 sm:flex-none"
                  disabled={inCart && product.type === 'DIGITAL'}
                  icon={inCart ? <Check className="size-4" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
                  onClick={() => {
                    cart.add(product, quantity);
                    toast.success('Added to your basket', product.name);
                  }}
                >
                  {inCart && product.type === 'DIGITAL' ? 'In your basket' : 'Add to basket'}
                </Button>

                <Link to="/cart">
                  <Button size="lg" variant="secondary">
                    View basket
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="mt-7">
                <Badge tone="warning">Currently out of stock</Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  Contact us and we will let you know when it is available again.
                </p>
              </div>
            )}

            <ul className="mt-7 space-y-2.5 text-sm text-muted-foreground">
              {product.type === 'DIGITAL' ? (
                <>
                  <li className="flex items-center gap-2.5">
                    <Download className="size-4 shrink-0 text-success" aria-hidden />
                    Available in your portal immediately after payment
                  </li>
                  <li className="flex items-center gap-2.5">
                    <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                    Download links are generated fresh and expire quickly
                  </li>
                </>
              ) : (
                <li className="flex items-center gap-2.5">
                  <Package className="size-4 shrink-0 text-success" aria-hidden />
                  Delivered within Kenya in 3–5 working days
                </li>
              )}
            </ul>
          </div>
        </div>

        <Separator className="my-14" />

        <div className="max-w-3xl">
          <h2 className="text-h2">About this resource</h2>
          <div className="prose-editorial mt-6" dangerouslySetInnerHTML={{ __html: product.description }} />
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Cart and checkout                                                          */
/* -------------------------------------------------------------------------- */

export function CartPage() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const createOrder = useCreateOrder();
  const initializePayment = useInitializePayment();
  const [error, setError] = useState<string | null>(null);

  const checkout = async () => {
    setError(null);

    if (!user) {
      navigate(`/login?next=${encodeURIComponent('/cart')}`);
      return;
    }

    const scope = `order:${cart.lines.map((line) => `${line.productId}x${line.quantity}`).join('|')}`;

    try {
      const order = await createOrder.mutateAsync({
        items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        idempotencyKey: idempotencyKey(scope),
      });

      const payment = await initializePayment.mutateAsync({
        purpose: 'PRODUCT_ORDER',
        orderId: order.id,
        callbackPath: `/shop/confirmation?reference=${order.reference}`,
      });

      clearIdempotencyKey(scope);
      cart.clear();
      window.location.href = payment.authorizationUrl;
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Checkout could not be completed.';
      setError(message);
      toast.error('Checkout failed', message);
    }
  };

  const busy = createOrder.isPending || initializePayment.isPending;

  return (
    <>
      <SEO title="Your basket" path="/cart" noIndex />

      <Section className="!py-12">
        <h1 className="text-h1">Your basket</h1>

        {cart.lines.length === 0 ? (
          <EmptyState
            className="mt-10"
            icon={<ShoppingBag className="size-5" aria-hidden />}
            title="Your basket is empty"
            description="Browse our books, reports and templates."
            action={
              <Link to="/shop">
                <Button>Browse resources</Button>
              </Link>
            }
          />
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
            <ul className="space-y-3">
              {cart.lines.map((line) => (
                <li key={line.productId}>
                  <Card className="flex gap-5">
                    <Link
                      to={`/shop/${line.snapshot.slug}`}
                      className="size-20 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-muted"
                    >
                      {line.snapshot.coverImageUrl ? (
                        <img src={line.snapshot.coverImageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center bg-accent-soft text-accent">
                          <BookOpen className="size-6" aria-hidden />
                        </span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link to={`/shop/${line.snapshot.slug}`} className="font-semibold transition-colors hover:text-accent">
                        {line.snapshot.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {line.snapshot.type === 'DIGITAL' ? 'Digital download' : 'Print edition'}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        {line.snapshot.type === 'PHYSICAL' ? (
                          <div className="flex items-center rounded-[var(--radius-control)] hairline">
                            <button
                              type="button"
                              onClick={() => cart.setQuantity(line.productId, line.quantity - 1)}
                              aria-label={`Decrease quantity of ${line.snapshot.name}`}
                              className="p-2 text-muted-foreground hover:text-foreground"
                            >
                              <Minus className="size-3.5" aria-hidden />
                            </button>
                            <span className="tabular w-8 text-center text-sm">{line.quantity}</span>
                            <button
                              type="button"
                              onClick={() => cart.setQuantity(line.productId, line.quantity + 1)}
                              aria-label={`Increase quantity of ${line.snapshot.name}`}
                              className="p-2 text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Single licence</span>
                        )}

                        <button
                          type="button"
                          onClick={() => cart.remove(line.productId)}
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Remove
                        </button>
                      </div>
                    </div>

                    <p className="tabular shrink-0 font-semibold">
                      {money(line.snapshot.price * line.quantity, line.snapshot.currency)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>

            <aside>
              <Card className="lg:sticky lg:top-24">
                <h2 className="text-h3">Order summary</h2>

                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Subtotal</dt>
                    <dd className="tabular">{money(cart.estimatedTotal, cart.currency)}</dd>
                  </div>
                  {cart.hasPhysicalItems && (
                    <div className="flex justify-between text-muted-foreground">
                      <dt>Delivery</dt>
                      <dd className="text-xs">Calculated at checkout</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-3 font-semibold">
                    <dt>Total</dt>
                    <dd className="tabular">{money(cart.estimatedTotal, cart.currency)}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-muted-foreground">
                  Final totals are confirmed by our server at checkout.
                </p>

                {error && (
                  <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-destructive-soft p-3 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <Button
                  className="mt-5 w-full"
                  size="lg"
                  loading={busy}
                  onClick={() => void checkout()}
                  iconRight={<ArrowRight className="size-4" aria-hidden />}
                >
                  {user ? 'Checkout with Paystack' : 'Sign in to checkout'}
                </Button>

                <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-success" aria-hidden />
                  Payments handled entirely by Paystack
                </p>
              </Card>
            </aside>
          </div>
        )}
      </Section>
    </>
  );
}
