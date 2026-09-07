import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgePercent, Plus, Ticket, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingSkeleton,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useDiscount,
  useDiscounts,
  useSaveDiscount,
  useWithdrawDiscount,
  type DiscountRow,
} from '@/lib/admin-queries';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { formatDate, money } from '@/lib/utils';

/**
 * Discount codes.
 *
 * A percentage is stored in basis points, but nobody thinks in basis points, so
 * the form works in percent and converts on the way in and out. Everything else
 * — money, counts — is already in the units the rest of the admin uses.
 */

const STATE_TONE: Record<DiscountRow['state'], 'success' | 'info' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'neutral',
  EXHAUSTED: 'warning',
  WITHDRAWN: 'neutral',
};

const STATE_LABEL: Record<DiscountRow['state'], string> = {
  ACTIVE: 'Active',
  SCHEDULED: 'Scheduled',
  EXPIRED: 'Expired',
  EXHAUSTED: 'Fully redeemed',
  WITHDRAWN: 'Withdrawn',
};

function describeValue(row: Pick<DiscountRow, 'type' | 'value' | 'currency'>): string {
  return row.type === 'PERCENTAGE'
    ? `${row.value / 100}%`
    : money(row.value, row.currency ?? 'KES');
}

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

export function AdminDiscounts() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDiscounts({ page, pageSize: 25 });
  const withdraw = useWithdrawDiscount();
  const toast = useToast();
  const [pending, setPending] = useState<DiscountRow | null>(null);

  const columns: Column<DiscountRow>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <Link to={`/admin/discounts/${row.id}`} className="group block min-w-0">
          <p className="tabular truncate text-sm font-semibold underline-offset-4 group-hover:underline">{row.code}</p>
          {row.description && <p className="truncate text-xs text-muted-foreground">{row.description}</p>}
        </Link>
      ),
    },
    {
      key: 'value',
      header: 'Worth',
      render: (row) => <span className="tabular text-sm">{describeValue(row)}</span>,
    },
    {
      key: 'appliesTo',
      header: 'Applies to',
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.appliesTo === 'EVERYTHING'
            ? 'Everything'
            : row.appliesTo === 'SERVICES'
              ? row.serviceIds.length > 0
                ? `${row.serviceIds.length} service(s)`
                : 'All consultations'
              : row.productIds.length > 0
                ? `${row.productIds.length} product(s)`
                : 'All resources'}
        </span>
      ),
    },
    {
      key: 'used',
      header: 'Used',
      numeric: true,
      render: (row) => (
        <span className="tabular text-sm">
          {row.redeemedCount}
          {row.maxRedemptions !== null && <span className="text-muted-foreground"> / {row.maxRedemptions}</span>}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.startsAt ? formatDate(row.startsAt) : 'Any time'}
          {row.endsAt ? ` → ${formatDate(row.endsAt)}` : ''}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      render: (row) => <StatusBadge label={STATE_LABEL[row.state]} tone={STATE_TONE[row.state]} />,
    },
    {
      key: 'actions',
      header: '',
      showInCard: false,
      render: (row) =>
        row.state === 'WITHDRAWN' ? null : (
          <Button size="sm" variant="ghost" onClick={() => setPending(row)} aria-label={`Withdraw ${row.code}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        ),
    },
  ];

  return (
    <>
      <SEO title="Discounts" noIndex />
      <PageHeader
        title="Discount codes"
        description="Every code is validated and priced on the server; the browser only ever sends the code."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Discounts' }]}
        action={
          <Link to="/admin/discounts/new">
            <Button icon={<Plus className="size-4" aria-hidden />}>New code</Button>
          </Link>
        }
      />

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Redemptions</p>
            <p className="tabular mt-1.5 text-2xl font-semibold">{data.totals.redemptions}</p>
          </Card>
          <Card>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Total discounted</p>
            <p className="tabular mt-1.5 text-2xl font-semibold">{money(data.totals.discounted)}</p>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        rowKey={(row) => row.id}
        cardTitle={(row) => row.code}
        empty={{
          icon: <Ticket />,
          title: 'No discount codes yet',
          description: 'A code can be a percentage or a fixed amount, limited by date, count or client.',
          action: (
            <Link to="/admin/discounts/new">
              <Button variant="secondary">Create the first one</Button>
            </Link>
          ),
        }}
        footer={
          data ? (
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              total={data.meta.total}
              onPageChange={setPage}
            />
          ) : null
        }
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={`Withdraw ${pending?.code ?? ''}?`}
        description={
          (pending?.redeemedCount ?? 0) > 0
            ? 'This code has been used, so it is deactivated rather than deleted — its redemptions stay in the financial record. Nobody will be able to use it again.'
            : 'This code has never been used, so it is deleted outright.'
        }
        confirmLabel="Withdraw"
        tone="destructive"
        loading={withdraw.isPending}
        onConfirm={async () => {
          if (!pending) return;
          try {
            const result = await withdraw.mutateAsync(pending.id);
            setPending(null);
            toast.success(result.deleted ? 'Code deleted' : 'Code withdrawn');
          } catch (error) {
            toast.error(
              'Could not withdraw the code',
              error instanceof ApiError ? error.message : 'Please try again shortly.',
            );
          }
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

interface DiscountDraft {
  code: string;
  description: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  /** Percent as typed (10 = 10%), or major currency units for a fixed amount. */
  amount: string;
  currency: string;
  appliesTo: 'EVERYTHING' | 'SERVICES' | 'PRODUCTS';
  minSubtotal: string;
  maxDiscount: string;
  maxRedemptions: string;
  perClientLimit: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

const EMPTY: DiscountDraft = {
  code: '',
  description: '',
  type: 'PERCENTAGE',
  amount: '10',
  currency: 'KES',
  appliesTo: 'EVERYTHING',
  minSubtotal: '',
  maxDiscount: '',
  maxRedemptions: '',
  perClientLimit: '1',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

const toLocalInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export function AdminDiscountEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { data: existing, isLoading } = useDiscount(isNew ? undefined : id);
  const save = useSaveDiscount(isNew ? undefined : id);
  const navigate = useNavigate();
  const toast = useToast();

  const [draft, setDraft] = useState<DiscountDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrated during render, keyed on the record, for the same reason the other
  // editors are: an effect would show an empty form for a frame first.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (existing && hydratedFor !== existing.id) {
    setHydratedFor(existing.id);
    setDraft({
      code: existing.code,
      description: existing.description ?? '',
      type: existing.type,
      amount:
        existing.type === 'PERCENTAGE'
          ? String(existing.value / 100)
          : String(existing.value / 100),
      currency: existing.currency ?? 'KES',
      appliesTo: existing.appliesTo,
      minSubtotal: existing.minSubtotal ? String(existing.minSubtotal / 100) : '',
      maxDiscount: existing.maxDiscount ? String(existing.maxDiscount / 100) : '',
      maxRedemptions: existing.maxRedemptions === null ? '' : String(existing.maxRedemptions),
      perClientLimit: existing.perClientLimit === null ? '' : String(existing.perClientLimit),
      startsAt: toLocalInput(existing.startsAt),
      endsAt: toLocalInput(existing.endsAt),
      isActive: existing.isActive,
    });
  }

  const form = draft ?? (isNew ? EMPTY : null);
  if (!isNew && isLoading) return <LoadingSkeleton rows={8} />;
  if (!form) return <LoadingSkeleton rows={8} />;

  const patch = (changes: Partial<DiscountDraft>) => setDraft({ ...form, ...changes });

  const submit = async () => {
    const next: Record<string, string> = {};
    if (isNew && form.code.trim().length < 3) next.code = 'Use at least 3 characters';

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) next.amount = 'Enter an amount above zero';
    if (form.type === 'PERCENTAGE' && amount > 100) next.amount = 'A percentage cannot exceed 100';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // Percent → basis points, major → minor. The server re-validates all of it.
    const payload: Record<string, unknown> = {
      description: form.description.trim() || null,
      type: form.type,
      value: Math.round(amount * 100),
      currency: form.type === 'FIXED_AMOUNT' ? form.currency : null,
      appliesTo: form.appliesTo,
      minSubtotal: form.minSubtotal ? Math.round(Number(form.minSubtotal) * 100) : 0,
      maxDiscount: form.maxDiscount ? Math.round(Number(form.maxDiscount) * 100) : 0,
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      perClientLimit: form.perClientLimit ? Number(form.perClientLimit) : null,
      startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
      endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
      isActive: form.isActive,
    };
    if (isNew) payload.code = form.code.trim().toUpperCase();

    try {
      const saved = await save.mutateAsync(payload);
      toast.success(isNew ? 'Discount created' : 'Discount updated');
      void navigate(`/admin/discounts/${saved.id}`);
    } catch (error) {
      toast.error(
        'Could not save the code',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  return (
    <>
      <SEO title={isNew ? 'New discount' : form.code} noIndex />
      <PageHeader
        title={isNew ? 'New discount code' : form.code}
        description={isNew ? 'Clients enter this code at checkout.' : 'The code itself cannot be changed once issued.'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Discounts', to: '/admin/discounts' },
          { label: isNew ? 'New' : form.code },
        ]}
        action={
          <Button onClick={submit} loading={save.isPending}>
            {isNew ? 'Create code' : 'Save changes'}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle className="text-base">The offer</CardTitle>
            <div className="mt-5 space-y-5">
              {isNew && (
                <Field label="Code" required hint="Letters, numbers, hyphens. Stored upper-case." error={errors.code}>
                  {({ id: fieldId, invalid }) => (
                    <Input
                      id={fieldId}
                      invalid={invalid}
                      value={form.code}
                      placeholder="WELCOME10"
                      className="tabular uppercase"
                      onChange={(event) => patch({ code: event.target.value })}
                    />
                  )}
                </Field>
              )}

              <Field label="Description" hint="Internal only — clients never see it.">
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={2}
                    value={form.description}
                    onChange={(event) => patch({ description: event.target.value })}
                  />
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Type">
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={form.type}
                      onChange={(event) => patch({ type: event.target.value as DiscountDraft['type'] })}
                    >
                      <option value="PERCENTAGE">Percentage off</option>
                      <option value="FIXED_AMOUNT">Fixed amount off</option>
                    </Select>
                  )}
                </Field>

                <Field
                  label={form.type === 'PERCENTAGE' ? 'Percent off' : 'Amount off'}
                  required
                  error={errors.amount}
                >
                  {({ id: fieldId, invalid }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      step={form.type === 'PERCENTAGE' ? 0.5 : 1}
                      invalid={invalid}
                      value={form.amount}
                      onChange={(event) => patch({ amount: event.target.value })}
                    />
                  )}
                </Field>
              </div>

              {form.type === 'FIXED_AMOUNT' && (
                <Field label="Currency" hint="A fixed amount only applies to baskets in this currency.">
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={form.currency}
                      onChange={(event) => patch({ currency: event.target.value })}
                      className="max-w-40"
                    >
                      {['KES', 'USD', 'NGN', 'GHS', 'ZAR'].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              <Field label="Applies to">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.appliesTo}
                    onChange={(event) => patch({ appliesTo: event.target.value as DiscountDraft['appliesTo'] })}
                  >
                    <option value="EVERYTHING">Everything</option>
                    <option value="SERVICES">Consultations only</option>
                    <option value="PRODUCTS">Shop resources only</option>
                  </Select>
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-base">Limits</CardTitle>
            <CardDescription className="mt-1">Leave a field empty for no limit.</CardDescription>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Minimum spend" hint="Before the discount, in major units.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="number"
                    min={0}
                    value={form.minSubtotal}
                    onChange={(event) => patch({ minSubtotal: event.target.value })}
                  />
                )}
              </Field>

              {form.type === 'PERCENTAGE' && (
                <Field label="Maximum discount" hint="Caps a percentage on a large basket.">
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      value={form.maxDiscount}
                      onChange={(event) => patch({ maxDiscount: event.target.value })}
                    />
                  )}
                </Field>
              )}

              <Field label="Total redemptions" hint="Across all clients.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="number"
                    min={1}
                    value={form.maxRedemptions}
                    onChange={(event) => patch({ maxRedemptions: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Per client" hint="How many times one client may use it.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="number"
                    min={1}
                    value={form.perClientLimit}
                    onChange={(event) => patch({ perClientLimit: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Starts">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="date"
                    value={form.startsAt}
                    onChange={(event) => patch({ startsAt: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Ends">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="date"
                    value={form.endsAt}
                    onChange={(event) => patch({ endsAt: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <div className="mt-5">
              <Checkbox
                label="Accepting redemptions"
                description="Uncheck to pause the code without deleting it."
                checked={form.isActive}
                onChange={(event) => patch({ isActive: event.target.checked })}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgePercent className="size-4 text-muted-foreground" aria-hidden />
              Preview
            </CardTitle>
            <p className="tabular mt-3 text-2xl font-semibold">
              {form.type === 'PERCENTAGE'
                ? `${form.amount || 0}% off`
                : `${form.currency} ${form.amount || 0} off`}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {form.appliesTo === 'EVERYTHING'
                ? 'Consultations and shop resources'
                : form.appliesTo === 'SERVICES'
                  ? 'Consultations only'
                  : 'Shop resources only'}
            </p>
          </Card>

          {existing && (
            <Card>
              <CardTitle className="text-base">Redemptions</CardTitle>
              <p className="tabular mt-2 text-2xl font-semibold">
                {existing.redeemedCount}
                {existing.maxRedemptions !== null && (
                  <span className="text-base font-normal text-muted-foreground"> of {existing.maxRedemptions}</span>
                )}
              </p>

              {existing.redemptions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Not used yet.</p>
              ) : (
                <ul className="mt-4 space-y-3 border-t border-border pt-4">
                  {existing.redemptions.slice(0, 8).map((redemption) => (
                    <li key={redemption.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{redemption.clientName}</span>
                      <span className="tabular shrink-0 text-muted-foreground">
                        −{money(redemption.amount, redemption.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {existing && existing.state !== 'ACTIVE' && (
            <Card className="bg-warning-soft">
              <Badge tone="warning" dot>
                {STATE_LABEL[existing.state]}
              </Badge>
              <p className="mt-2 text-sm text-warning/80">
                This code is not currently redeemable.
              </p>
            </Card>
          )}
        </div>
      </div>

      {isNew && (
        <EmptyState
          className="mt-8"
          title="Codes are validated on the server"
          description="A client sends only the code. The amount is computed from this rule at checkout, so a modified request cannot change what is charged."
        />
      )}
    </>
  );
}
