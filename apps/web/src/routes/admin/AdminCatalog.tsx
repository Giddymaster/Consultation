import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  CalendarOff,
  ExternalLink,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import type { MeetingProvider } from '@meridian/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  LoadingSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useAdminConsultant,
  useAdminConsultants,
  useAdminProduct,
  useAdminProducts,
  useAdminService,
  useAdminServices,
  useArchiveProduct,
  useArchiveService,
  useDeletePermanently,
  useSaveConsultant,
  useSaveProduct,
  useSaveService,
} from '@/lib/admin-queries';
import { useAdminUsers, useProductCategories, useServiceCategories, useServices } from '@/lib/queries';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { formatDate, formatDuration, money } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

const CONTENT_STATUS_TONE = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  ARCHIVED: 'warning',
} as const;

function StatusPill({ status }: { status: string }) {
  const tone = CONTENT_STATUS_TONE[status as keyof typeof CONTENT_STATUS_TONE] ?? 'neutral';
  return (
    <Badge tone={tone}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
  );
}

/** Money input that speaks major units to the operator and minor to the API. */
function MoneyInput({
  value,
  onChange,
  currency = 'KES',
  id,
  ...props
}: {
  value: number;
  onChange: (minor: number) => void;
  currency?: string;
  id?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState((value / 100).toString());

  // Resync when the value changes for a reason other than this field — a form
  // reset, or a record loading — but never while the user is mid-keystroke.
  // Comparing the parsed amount is what makes that distinction: "2.50" and
  // "2.5" are the same value, so a trailing zero is not snatched away.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    if (Math.round(Number(text || '0') * 100) !== value) setText((value / 100).toString());
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted-foreground">
        {currency}
      </span>
      <Input
        {...props}
        id={id}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(Math.round(Number(event.target.value || '0') * 100));
        }}
        className="pl-12"
      />
    </div>
  );
}

/** Comma-separated list, edited as text and stored as an array. */
function ListInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(value.join(', '));

  // Keyed on length, not content: the parent re-splits on every keystroke, so
  // resyncing on content would rewrite the field as the user types a separator.
  const [lastLength, setLastLength] = useState(value.length);
  if (lastLength !== value.length) {
    setLastLength(value.length);
    setText(value.join(', '));
  }

  return (
    <Input
      id={id}
      value={text}
      placeholder={placeholder}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/* -------------------------------------------------------------------------- */
/* Services list                                                              */
/* -------------------------------------------------------------------------- */

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  startingPrice: number;
  defaultDurationMinutes: number;
  consultantCount: number;
  bookingCount: number;
  category: { name: string };
  isFeatured: boolean;
  updatedAt: string;
}

export function AdminServices() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const { data, isLoading } = useAdminServices({
    page,
    pageSize: 25,
    search: search || undefined,
    status: status || undefined,
  });

  const rows = (data?.items ?? []) as unknown as ServiceRow[];

  const columns: Column<ServiceRow>[] = [
    {
      key: 'name',
      header: 'Service',
      showInCard: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.category.name}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
    {
      key: 'price',
      header: 'From',
      numeric: true,
      render: (row) => (row.startingPrice === 0 ? 'Free' : money(row.startingPrice, row.currency)),
    },
    {
      key: 'duration',
      header: 'Default',
      render: (row) => formatDuration(row.defaultDurationMinutes),
    },
    {
      key: 'consultants',
      header: 'Consultants',
      numeric: true,
      render: (row) =>
        row.consultantCount === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />0
          </span>
        ) : (
          row.consultantCount
        ),
    },
    { key: 'bookings', header: 'Bookings', numeric: true, render: (row) => row.bookingCount },
    {
      key: 'updated',
      header: 'Updated',
      render: (row) => <span className="text-muted-foreground">{formatDate(row.updatedAt)}</span>,
    },
  ];

  return (
    <>
      <SEO title="Services" noIndex />
      <PageHeader
        title="Services"
        description="The consultation catalogue, including drafts that are not yet public."
        action={
          <Link to="/admin/services/new">
            <Button icon={<Plus className="size-4" aria-hidden />}>New service</Button>
          </Link>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/services/${row.id}`)}
        cardTitle={(row) => row.name}
        empty={{
          title: 'No services match those filters',
          icon: <Briefcase className="size-5" aria-hidden />,
          action: (
            <Link to="/admin/services/new">
              <Button>Create the first service</Button>
            </Link>
          ),
        }}
        toolbar={
          <>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search services"
                aria-label="Search services"
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="w-44"
            >
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </>
        }
        footer={
          data ? (
            <Pagination
              page={data.meta.page}
              pageSize={data.meta.pageSize}
              total={data.meta.total}
              onPageChange={setPage}
            />
          ) : undefined
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Service editor                                                             */
/* -------------------------------------------------------------------------- */

interface DurationDraft {
  minutes: number;
  price: number;
  label: string;
  isDefault: boolean;
}

const ALL_PROVIDERS: { value: MeetingProvider; label: string }[] = [
  { value: 'ZOOM', label: 'Zoom' },
  { value: 'GOOGLE_MEET', label: 'Google Meet' },
  { value: 'MICROSOFT_TEAMS', label: 'Microsoft Teams' },
  { value: 'PHONE', label: 'Phone call' },
  { value: 'IN_PERSON', label: 'In person' },
];

export function AdminServiceEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const { data: existing, isLoading } = useAdminService(isNew ? undefined : id);
  const { data: categories } = useServiceCategories();
  const { data: consultants } = useAdminConsultants({ pageSize: 100 });
  const saveService = useSaveService(isNew ? undefined : id);
  const archiveService = useArchiveService();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    categoryId: '',
    shortDescription: '',
    fullDescription: '',
    currency: 'KES',
    paymentModel: 'FULL_PAYMENT',
    depositAmount: 0,
    depositPercentBps: 2500,
    taxRateBps: 1600,
    meetingProviders: ['ZOOM'] as MeetingProvider[],
    preparationNotes: '',
    cancellationPolicy: '',
    reschedulePolicy: '',
    cancellationWindowHours: 24,
    rescheduleWindowHours: 24,
    leadTimeHours: 24,
    bookingHorizonDays: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
    status: 'DRAFT',
    isFeatured: false,
    sortOrder: 0,
    seoTitle: '',
    seoDescription: '',
    consultantIds: [] as string[],
  });
  const [durations, setDurations] = useState<DurationDraft[]>([
    { minutes: 60, price: 500_000, label: '', isDefault: true },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deletePermanently = useDeletePermanently();
  const [slugTouched, setSlugTouched] = useState(false);

  // Hydrated during render rather than in an effect: an effect renders the
  // empty form once before filling it, which shows a blank editor for a frame
  // and makes every field look briefly cleared. Keyed on the record id, so a
  // refetch cannot overwrite edits already in progress.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const recordId = existing ? String((existing as { id?: unknown }).id ?? '') : null;

  if (existing && recordId && hydratedFor !== recordId) {
    setHydratedFor(recordId);
    const record = existing as Record<string, never>;
    setForm({
      name: String(record.name ?? ''),
      slug: String(record.slug ?? ''),
      categoryId: String(record.categoryId ?? ''),
      shortDescription: String(record.shortDescription ?? ''),
      fullDescription: String(record.fullDescription ?? ''),
      currency: String(record.currency ?? 'KES'),
      paymentModel: String(record.paymentModel ?? 'FULL_PAYMENT'),
      depositAmount: Number(record.depositAmount ?? 0),
      depositPercentBps: Number(record.depositPercentBps ?? 2500),
      taxRateBps: Number(record.taxRateBps ?? 0),
      meetingProviders: (record.meetingProviders ?? ['ZOOM']) as unknown as MeetingProvider[],
      preparationNotes: String(record.preparationNotes ?? ''),
      cancellationPolicy: String(record.cancellationPolicy ?? ''),
      reschedulePolicy: String(record.reschedulePolicy ?? ''),
      cancellationWindowHours: Number(record.cancellationWindowHours ?? 24),
      rescheduleWindowHours: Number(record.rescheduleWindowHours ?? 24),
      leadTimeHours: Number(record.leadTimeHours ?? 24),
      bookingHorizonDays: Number(record.bookingHorizonDays ?? 60),
      bufferBeforeMinutes: Number(record.bufferBeforeMinutes ?? 0),
      bufferAfterMinutes: Number(record.bufferAfterMinutes ?? 10),
      status: String(record.status ?? 'DRAFT'),
      isFeatured: Boolean(record.isFeatured),
      sortOrder: Number(record.sortOrder ?? 0),
      seoTitle: String(record.seoTitle ?? ''),
      seoDescription: String(record.seoDescription ?? ''),
      consultantIds: (record.consultantIds ?? []) as unknown as string[],
    });
    setDurations(
      ((record.durations ?? []) as unknown as DurationDraft[]).map((duration) => ({
        minutes: duration.minutes,
        price: duration.price,
        label: duration.label ?? '',
        isDefault: duration.isDefault,
      })),
    );
    setSlugTouched(true);
  }

  const bookingCount = Number((existing as Record<string, never> | undefined)?.bookingCount ?? 0);

  const submit = async () => {
    setErrors({});

    const payload = {
      ...form,
      depositAmount: form.paymentModel === 'FIXED_DEPOSIT' ? form.depositAmount : undefined,
      depositPercentBps: form.paymentModel === 'PERCENTAGE_DEPOSIT' ? form.depositPercentBps : undefined,
      preparationNotes: form.preparationNotes || undefined,
      cancellationPolicy: form.cancellationPolicy || undefined,
      reschedulePolicy: form.reschedulePolicy || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      durations: durations.map((duration) => ({
        minutes: duration.minutes,
        price: duration.price,
        label: duration.label || undefined,
        isDefault: duration.isDefault,
      })),
    };

    try {
      const result = await saveService.mutateAsync(payload);
      toast.success(isNew ? 'Service created' : 'Service saved');
      if (isNew) navigate(`/admin/services/${(result as { id: string }).id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error('Could not save', error.issues?.length ? 'Check the highlighted fields.' : error.message);
      } else {
        toast.error('Could not save the service');
      }
    }
  };

  if (!isNew && isLoading) return <LoadingSkeleton rows={10} />;

  return (
    <>
      <SEO title={isNew ? 'New service' : form.name || 'Edit service'} noIndex />
      <PageHeader
        title={isNew ? 'New service' : form.name || 'Edit service'}
        description={isNew ? 'Everything here is configurable — nothing is hardcoded.' : `/services/${form.slug}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Services', to: '/admin/services' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        action={
          <>
            {!isNew && (
              <>
                <a href={`/services/${form.slug}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" icon={<ExternalLink className="size-4" aria-hidden />}>
                    View
                  </Button>
                </a>
                {form.status === 'ARCHIVED' ? (
                  <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                    Delete permanently
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
                    Archive
                  </Button>
                )}
              </>
            )}
            <Button loading={saveService.isPending} onClick={() => void submit()} icon={<Save className="size-4" aria-hidden />}>
              {isNew ? 'Create service' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Basics</CardTitle>
            <div className="mt-5 space-y-5">
              <Field label="Service name" required error={errors.name}>
                {({ id: fieldId, invalid }) => (
                  <Input
                    id={fieldId}
                    invalid={invalid}
                    value={form.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name,
                        // Auto-slug only until the operator edits it themselves;
                        // changing a live slug breaks inbound links.
                        slug: slugTouched ? current.slug : slugify(name),
                      }));
                    }}
                  />
                )}
              </Field>

              <Field
                label="URL slug"
                required
                hint={`meridianadvisory.co.ke/services/${form.slug || '…'}`}
                error={errors.slug}
              >
                {({ id: fieldId, invalid }) => (
                  <Input
                    id={fieldId}
                    invalid={invalid}
                    value={form.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setForm((current) => ({ ...current, slug: slugify(event.target.value) }));
                    }}
                  />
                )}
              </Field>

              <Field label="Category" required error={errors.categoryId}>
                {({ id: fieldId, invalid }) => (
                  <Select
                    id={fieldId}
                    invalid={invalid}
                    value={form.categoryId}
                    onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  >
                    <option value="">Choose a category</option>
                    {categories?.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Short description"
                required
                hint="Shown on cards and in search results. One or two sentences."
                error={errors.shortDescription}
              >
                {({ id: fieldId, invalid }) => (
                  <Textarea
                    id={fieldId}
                    invalid={invalid}
                    rows={2}
                    maxLength={320}
                    value={form.shortDescription}
                    onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))}
                  />
                )}
              </Field>

              <Field label="Full description" required error={errors.fullDescription}>
                {({ id: fieldId, invalid }) => (
                  <Textarea
                    id={fieldId}
                    invalid={invalid}
                    rows={8}
                    value={form.fullDescription}
                    onChange={(event) => setForm((current) => ({ ...current, fullDescription: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Durations and pricing</CardTitle>
                <CardDescription className="mt-1">
                  Each duration is priced separately. Bookings copy the price of the duration chosen.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" aria-hidden />}
                onClick={() =>
                  setDurations((current) => [
                    ...current,
                    { minutes: 30, price: 250_000, label: '', isDefault: current.length === 0 },
                  ])
                }
              >
                Add duration
              </Button>
            </div>

            {errors.durations && (
              <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                {errors.durations}
              </p>
            )}

            <ul className="mt-5 space-y-3">
              {durations.map((duration, index) => (
                <li key={index} className="rounded-[var(--radius-panel)] bg-muted/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr_auto] sm:items-end">
                    <Field label="Minutes">
                      {({ id: fieldId }) => (
                        <Input
                          id={fieldId}
                          type="number"
                          min={5}
                          max={600}
                          step={5}
                          value={duration.minutes}
                          onChange={(event) =>
                            setDurations((current) =>
                              current.map((entry, i) =>
                                i === index ? { ...entry, minutes: Number(event.target.value) } : entry,
                              ),
                            )
                          }
                        />
                      )}
                    </Field>

                    <Field label="Price">
                      {({ id: fieldId }) => (
                        <MoneyInput
                          id={fieldId}
                          currency={form.currency}
                          value={duration.price}
                          onChange={(price) =>
                            setDurations((current) =>
                              current.map((entry, i) => (i === index ? { ...entry, price } : entry)),
                            )
                          }
                        />
                      )}
                    </Field>

                    <Field label="Label" hint="Optional">
                      {({ id: fieldId }) => (
                        <Input
                          id={fieldId}
                          placeholder="e.g. Focused question"
                          value={duration.label}
                          onChange={(event) =>
                            setDurations((current) =>
                              current.map((entry, i) =>
                                i === index ? { ...entry, label: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      )}
                    </Field>

                    <button
                      type="button"
                      onClick={() => setDurations((current) => current.filter((_, i) => i !== index))}
                      disabled={durations.length === 1}
                      aria-label={`Remove the ${duration.minutes} minute option`}
                      className="mb-1 rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>

                  <label className="mt-3 flex items-center gap-2.5 text-sm">
                    <input
                      type="radio"
                      name="default-duration"
                      checked={duration.isDefault}
                      onChange={() =>
                        setDurations((current) =>
                          current.map((entry, i) => ({ ...entry, isDefault: i === index })),
                        )
                      }
                      className="size-4 accent-[hsl(var(--accent))]"
                    />
                    Pre-select this duration in the booking wizard
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Policies</CardTitle>
            <CardDescription className="mt-1">
              Shown to clients before they book, and enforced by the API when they cancel or reschedule.
            </CardDescription>

            <div className="mt-5 space-y-5">
              <Field label="How to prepare" hint="Sent in the confirmation email.">
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={3}
                    value={form.preparationNotes}
                    onChange={(event) => setForm((current) => ({ ...current, preparationNotes: event.target.value }))}
                  />
                )}
              </Field>

              <Field label="Cancellation policy">
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={3}
                    value={form.cancellationPolicy}
                    onChange={(event) => setForm((current) => ({ ...current, cancellationPolicy: event.target.value }))}
                  />
                )}
              </Field>

              <Field label="Rescheduling policy">
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={3}
                    value={form.reschedulePolicy}
                    onChange={(event) => setForm((current) => ({ ...current, reschedulePolicy: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>Search engine listing</CardTitle>
            <div className="mt-5 space-y-5">
              <Field label="SEO title" hint={`Defaults to the service name. ${form.seoTitle.length}/160`}>
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    maxLength={160}
                    value={form.seoTitle}
                    onChange={(event) => setForm((current) => ({ ...current, seoTitle: event.target.value }))}
                  />
                )}
              </Field>
              <Field label="SEO description" hint={`${form.seoDescription.length}/320`}>
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={2}
                    maxLength={320}
                    value={form.seoDescription}
                    onChange={(event) => setForm((current) => ({ ...current, seoDescription: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle className="text-[0.9375rem]">Visibility</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="Status">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="DRAFT">Draft — not visible publicly</option>
                    <option value="PUBLISHED">Published — bookable</option>
                    <option value="ARCHIVED">Archived — hidden</option>
                  </Select>
                )}
              </Field>

              <Checkbox
                label="Feature on the home page"
                checked={form.isFeatured}
                onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))}
              />

              <Field label="Sort order" hint="Lower numbers appear first.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Payment</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="How clients pay">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.paymentModel}
                    onChange={(event) => setForm((current) => ({ ...current, paymentModel: event.target.value }))}
                  >
                    <option value="FULL_PAYMENT">Full payment up front</option>
                    <option value="FIXED_DEPOSIT">Fixed booking fee</option>
                    <option value="PERCENTAGE_DEPOSIT">Percentage deposit</option>
                    <option value="FREE">No charge</option>
                  </Select>
                )}
              </Field>

              {form.paymentModel === 'FIXED_DEPOSIT' && (
                <Field label="Booking fee" required error={errors.depositAmount}>
                  {({ id: fieldId }) => (
                    <MoneyInput
                      id={fieldId}
                      currency={form.currency}
                      value={form.depositAmount}
                      onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))}
                    />
                  )}
                </Field>
              )}

              {form.paymentModel === 'PERCENTAGE_DEPOSIT' && (
                <Field label="Deposit percentage" required error={errors.depositPercentBps}>
                  {({ id: fieldId }) => (
                    <div className="relative">
                      <Input
                        id={fieldId}
                        type="number"
                        min={1}
                        max={99}
                        value={form.depositPercentBps / 100}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            depositPercentBps: Math.round(Number(event.target.value) * 100),
                          }))
                        }
                        className="pr-9"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  )}
                </Field>
              )}

              <Field label="Tax rate" hint="Applied after any discount.">
                {({ id: fieldId }) => (
                  <div className="relative">
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={form.taxRateBps / 100}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, taxRateBps: Math.round(Number(event.target.value) * 100) }))
                      }
                      className="pr-9"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Meeting options</CardTitle>
            <CardDescription className="mt-1">Clients choose from what you enable here.</CardDescription>
            <div className="mt-4 space-y-2.5">
              {ALL_PROVIDERS.map((provider) => (
                <Checkbox
                  key={provider.value}
                  label={provider.label}
                  checked={form.meetingProviders.includes(provider.value)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      meetingProviders: event.target.checked
                        ? [...current.meetingProviders, provider.value]
                        : current.meetingProviders.filter((value) => value !== provider.value),
                    }))
                  }
                />
              ))}
            </div>
            {errors.meetingProviders && (
              <p role="alert" className="mt-3 text-xs font-medium text-destructive">
                {errors.meetingProviders}
              </p>
            )}
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Scheduling rules</CardTitle>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(
                [
                  ['leadTimeHours', 'Notice (hours)', 'Earliest a client may book.'],
                  ['bookingHorizonDays', 'Horizon (days)', 'How far ahead.'],
                  ['cancellationWindowHours', 'Cancel by (h)', ''],
                  ['rescheduleWindowHours', 'Reschedule by (h)', ''],
                  ['bufferBeforeMinutes', 'Buffer before (m)', ''],
                  ['bufferAfterMinutes', 'Buffer after (m)', ''],
                ] as const
              ).map(([key, label, hint]) => (
                <Field key={key} label={label} hint={hint || undefined}>
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      value={form[key]}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: Number(event.target.value) }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Who delivers this</CardTitle>
            <CardDescription className="mt-1">
              A published service with no consultant cannot be booked.
            </CardDescription>

            <div className="mt-4 max-h-64 space-y-2.5 overflow-y-auto scroll-slim">
              {(consultants?.items ?? []).map((consultant) => {
                const row = consultant as Record<string, never>;
                const consultantId = String(row.id);
                return (
                  <Checkbox
                    key={consultantId}
                    label={String(row.fullName)}
                    description={String(row.title)}
                    checked={form.consultantIds.includes(consultantId)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        consultantIds: event.target.checked
                          ? [...current.consultantIds, consultantId]
                          : current.consultantIds.filter((value) => value !== consultantId),
                      }))
                    }
                  />
                );
              })}
            </div>

            {form.status === 'PUBLISHED' && form.consultantIds.length === 0 && (
              <p className="mt-4 flex gap-2 rounded-[var(--radius-control)] bg-warning-soft p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                This service is published but has no consultant assigned, so nobody can book it.
              </p>
            )}
          </Card>

          {!isNew && bookingCount > 0 && (
            <Card className="bg-muted/40">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <strong className="font-medium text-foreground">{bookingCount} booking{bookingCount === 1 ? '' : 's'}</strong>{' '}
                reference this service. Changing a price affects new bookings only — existing ones keep the amount
                they were charged.
              </p>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => {
          if (!id) return;
          archiveService.mutate(id, {
            onSuccess: () => {
              toast.success('Service archived', 'It is no longer bookable.');
              navigate('/admin/services');
            },
          });
        }}
        title="Archive this service?"
        description="It will stop appearing publicly and cannot be booked. Existing bookings are unaffected and keep their historical pricing."
        confirmLabel="Archive"
        tone="destructive"
        loading={archiveService.isPending}
      />

      {/* Only offered once archived. The server refuses if any booking still
          references the service and says so, which is the useful answer. */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!id) return;
          try {
            await deletePermanently.mutateAsync({ kind: 'services', id });
            toast.success('Service deleted');
            void navigate('/admin/services');
          } catch (error) {
            setDeleteOpen(false);
            toast.error(
              'Could not delete this service',
              error instanceof ApiError ? error.message : 'Please try again shortly.',
            );
          }
        }}
        title="Delete this service for good?"
        description="This cannot be undone. It is refused if any booking references the service — archived is the right answer in that case."
        confirmLabel="Delete permanently"
        tone="destructive"
        loading={deletePermanently.isPending}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Consultants                                                                */
/* -------------------------------------------------------------------------- */

interface ConsultantRow {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  title: string;
  specialties: string[];
  yearsExperience: number;
  averageRating: number | null;
  reviewCount: number;
  completedSessions: number;
  isPublished: boolean;
  isAcceptingBookings: boolean;
  bookingCount: number;
  serviceCount: number;
  hasAvailability: boolean;
}

export function AdminConsultants() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { data, isLoading } = useAdminConsultants({ pageSize: 50, search: search || undefined });

  const rows = (data?.items ?? []) as unknown as ConsultantRow[];

  const columns: Column<ConsultantRow>[] = [
    {
      key: 'name',
      header: 'Consultant',
      showInCard: false,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.fullName} src={row.avatarUrl} size="xs" />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={row.isPublished ? 'success' : 'neutral'}>{row.isPublished ? 'Published' : 'Draft'}</Badge>
          {!row.isAcceptingBookings && (
            <Badge tone="warning">
              <CalendarOff className="size-3" aria-hidden />
              Paused
            </Badge>
          )}
          {row.isPublished && !row.hasAvailability && (
            <Badge tone="destructive">
              <AlertTriangle className="size-3" aria-hidden />
              No hours
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'services', header: 'Services', numeric: true, render: (row) => row.serviceCount },
    { key: 'sessions', header: 'Sessions', numeric: true, render: (row) => row.completedSessions },
    {
      key: 'rating',
      header: 'Rating',
      numeric: true,
      render: (row) =>
        row.averageRating ? (
          <span>
            {row.averageRating.toFixed(1)} ★{' '}
            <span className="text-xs text-muted-foreground">({row.reviewCount})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <SEO title="Consultants" noIndex />
      <PageHeader
        title="Consultants"
        description="Profiles, service assignments and publication state."
        action={
          <Link to="/admin/consultants/new">
            <Button icon={<Plus className="size-4" aria-hidden />}>New consultant</Button>
          </Link>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/consultants/${row.id}`)}
        cardTitle={(row) => row.fullName}
        empty={{ title: 'No consultants yet', icon: <Users className="size-5" aria-hidden /> }}
        toolbar={
          <div className="relative max-w-md flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, title or email"
              aria-label="Search consultants"
              className="pl-10"
            />
          </div>
        }
      />
    </>
  );
}

export function AdminConsultantEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const { data: existing, isLoading } = useAdminConsultant(isNew ? undefined : id);
  const { data: services } = useServices({ pageSize: 60 });
  const { data: users } = useAdminUsers({ pageSize: 100 });
  const saveConsultant = useSaveConsultant(isNew ? undefined : id);

  const [form, setForm] = useState({
    userId: '',
    slug: '',
    title: '',
    biography: '',
    specialties: [] as string[],
    qualifications: [] as string[],
    languages: ['English'] as string[],
    yearsExperience: 5,
    linkedinUrl: '',
    websiteUrl: '',
    timezone: 'Africa/Nairobi',
    slotIntervalMinutes: 30,
    isAcceptingBookings: true,
    isPublished: false,
    sortOrder: 0,
    serviceIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrated during render rather than in an effect: an effect renders the
  // empty form once before filling it, which shows a blank editor for a frame
  // and makes every field look briefly cleared. Keyed on the record id, so a
  // refetch cannot overwrite edits already in progress.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const recordId = existing ? String((existing as { id?: unknown }).id ?? '') : null;

  if (existing && recordId && hydratedFor !== recordId) {
    setHydratedFor(recordId);
    const record = existing as Record<string, never>;
    setForm({
      userId: String(record.userId ?? ''),
      slug: String(record.slug ?? ''),
      title: String(record.title ?? ''),
      biography: String(record.biography ?? ''),
      specialties: (record.specialties ?? []) as unknown as string[],
      qualifications: (record.qualifications ?? []) as unknown as string[],
      languages: (record.languages ?? []) as unknown as string[],
      yearsExperience: Number(record.yearsExperience ?? 0),
      linkedinUrl: String(record.linkedinUrl ?? ''),
      websiteUrl: String(record.websiteUrl ?? ''),
      timezone: String(record.timezone ?? 'Africa/Nairobi'),
      slotIntervalMinutes: Number(record.slotIntervalMinutes ?? 30),
      isAcceptingBookings: Boolean(record.isAcceptingBookings),
      isPublished: Boolean(record.isPublished),
      sortOrder: Number(record.sortOrder ?? 0),
      serviceIds: (record.serviceIds ?? []) as unknown as string[],
    });
  }

  // Only users who are not already consultants can be linked to a new profile.
  const eligibleUsers = useMemo(() => {
    return (users?.items ?? []).filter((user) => {
      const roles = (user as { roles?: unknown }).roles;
      return !(Array.isArray(roles) && roles.includes('CONSULTANT'));
    });
  }, [users]);

  const submit = async () => {
    setErrors({});
    try {
      const payload = {
        ...form,
        linkedinUrl: form.linkedinUrl || null,
        websiteUrl: form.websiteUrl || null,
      };
      const result = await saveConsultant.mutateAsync(payload);
      toast.success(isNew ? 'Consultant created' : 'Profile saved');
      if (isNew) navigate(`/admin/consultants/${(result as { id: string }).id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error('Could not save', error.issues?.length ? 'Check the highlighted fields.' : error.message);
      } else {
        toast.error('Could not save the profile');
      }
    }
  };

  if (!isNew && isLoading) return <LoadingSkeleton rows={10} />;

  const fullName = String((existing as Record<string, never> | undefined)?.fullName ?? '');

  return (
    <>
      <SEO title={isNew ? 'New consultant' : fullName || 'Edit consultant'} noIndex />
      <PageHeader
        title={isNew ? 'New consultant' : fullName || 'Edit consultant'}
        description={isNew ? 'Links an existing user account to a public consultant profile.' : `/consultants/${form.slug}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Consultants', to: '/admin/consultants' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        action={
          <>
            {!isNew && (
              <a href={`/consultants/${form.slug}`} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" icon={<ExternalLink className="size-4" aria-hidden />}>
                  View
                </Button>
              </a>
            )}
            <Button loading={saveConsultant.isPending} onClick={() => void submit()} icon={<Save className="size-4" aria-hidden />}>
              {isNew ? 'Create profile' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Profile</CardTitle>
            <div className="mt-5 space-y-5">
              {isNew && (
                <Field
                  label="User account"
                  required
                  hint="The person must already have an account. Create one under Users first."
                  error={errors.userId}
                >
                  {({ id: fieldId, invalid }) => (
                    <Select
                      id={fieldId}
                      invalid={invalid}
                      value={form.userId}
                      onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
                    >
                      <option value="">Choose a user</option>
                      {eligibleUsers.map((user) => {
                        const row = user as Record<string, never>;
                        return (
                          <option key={String(row.id)} value={String(row.id)}>
                            {String(row.fullName)} — {String(row.email)}
                          </option>
                        );
                      })}
                    </Select>
                  )}
                </Field>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Professional title" required error={errors.title}>
                  {({ id: fieldId, invalid }) => (
                    <Input
                      id={fieldId}
                      invalid={invalid}
                      placeholder="Managing Partner, Strategy"
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    />
                  )}
                </Field>

                <Field label="URL slug" required error={errors.slug}>
                  {({ id: fieldId, invalid }) => (
                    <Input
                      id={fieldId}
                      invalid={invalid}
                      value={form.slug}
                      onChange={(event) => setForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                    />
                  )}
                </Field>
              </div>

              <Field
                label="Biography"
                required
                hint="Shown on the public profile. Separate paragraphs with a blank line."
                error={errors.biography}
              >
                {({ id: fieldId, invalid }) => (
                  <Textarea
                    id={fieldId}
                    invalid={invalid}
                    rows={10}
                    value={form.biography}
                    onChange={(event) => setForm((current) => ({ ...current, biography: event.target.value }))}
                  />
                )}
              </Field>

              <Field label="Specialties" required hint="Comma separated." error={errors.specialties}>
                {({ id: fieldId }) => (
                  <ListInput
                    id={fieldId}
                    value={form.specialties}
                    onChange={(specialties) => setForm((current) => ({ ...current, specialties }))}
                    placeholder="Market entry, Growth strategy, Pricing"
                  />
                )}
              </Field>

              <Field label="Qualifications" hint="Comma separated." error={errors.qualifications}>
                {({ id: fieldId }) => (
                  <ListInput
                    id={fieldId}
                    value={form.qualifications}
                    onChange={(qualifications) => setForm((current) => ({ ...current, qualifications }))}
                    placeholder="MBA INSEAD, CFA Charterholder"
                  />
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Languages" required hint="Comma separated." error={errors.languages}>
                  {({ id: fieldId }) => (
                    <ListInput
                      id={fieldId}
                      value={form.languages}
                      onChange={(languages) => setForm((current) => ({ ...current, languages }))}
                    />
                  )}
                </Field>

                <Field label="Years of experience" required error={errors.yearsExperience}>
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      max={70}
                      value={form.yearsExperience}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, yearsExperience: Number(event.target.value) }))
                      }
                    />
                  )}
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="LinkedIn URL" error={errors.linkedinUrl}>
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="url"
                      placeholder="https://www.linkedin.com/in/…"
                      value={form.linkedinUrl}
                      onChange={(event) => setForm((current) => ({ ...current, linkedinUrl: event.target.value }))}
                    />
                  )}
                </Field>
                <Field label="Website URL" error={errors.websiteUrl}>
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="url"
                      value={form.websiteUrl}
                      onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))}
                    />
                  )}
                </Field>
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle className="text-[0.9375rem]">Visibility</CardTitle>
            <div className="mt-4 space-y-3">
              <Checkbox
                label="Publish this profile"
                description="Appears on the public site and in the booking wizard."
                checked={form.isPublished}
                onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))}
              />
              <Checkbox
                label="Accepting new bookings"
                description="Unchecking pauses new bookings. Existing ones are unaffected."
                checked={form.isAcceptingBookings}
                onChange={(event) => setForm((current) => ({ ...current, isAcceptingBookings: event.target.checked }))}
              />
              <Field label="Sort order">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Scheduling</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="Timezone" hint="Working hours are interpreted in this zone.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={form.timezone}
                    onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                  />
                )}
              </Field>
              <Field label="Slot interval">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.slotIntervalMinutes}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, slotIntervalMinutes: Number(event.target.value) }))
                    }
                  >
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </Select>
                )}
              </Field>
            </div>
            {!isNew && (
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Working hours are set by the consultant in their own workspace, under Availability.
              </p>
            )}
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Services offered</CardTitle>
            <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto scroll-slim">
              {(services?.items ?? []).map((service) => (
                <Checkbox
                  key={service.id}
                  label={service.name}
                  checked={form.serviceIds.includes(service.id)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      serviceIds: event.target.checked
                        ? [...current.serviceIds, service.id]
                        : current.serviceIds.filter((value) => value !== service.id),
                    }))
                  }
                />
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  author: string | null;
  category: { name: string };
  price: number;
  currency: string;
  type: string;
  stock: number | null;
  status: string;
  unitsSold: number;
  downloadCount: number;
  coverImageUrl: string | null;
}

export function AdminProducts() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const { data, isLoading } = useAdminProducts({
    pageSize: 50,
    search: search || undefined,
    status: status || undefined,
  });

  const rows = (data?.items ?? []) as unknown as ProductRow[];

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'Product',
      showInCard: false,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="size-9 shrink-0 overflow-hidden rounded-md bg-accent-soft">
            {row.coverImageUrl ? (
              <img src={row.coverImageUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-accent">
                <Package className="size-4" aria-hidden />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.author ?? row.category.name}
              {row.sku ? ` · ${row.sku}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
    {
      key: 'type',
      header: 'Format',
      render: (row) => (
        <Badge tone={row.type === 'DIGITAL' ? 'info' : 'neutral'}>
          {row.type === 'DIGITAL' ? 'Digital' : 'Print'}
        </Badge>
      ),
    },
    { key: 'price', header: 'Price', numeric: true, render: (row) => money(row.price, row.currency) },
    {
      key: 'stock',
      header: 'Stock',
      numeric: true,
      render: (row) =>
        row.type === 'DIGITAL' ? (
          <span className="text-muted-foreground">Unlimited</span>
        ) : row.stock === null ? (
          <span className="text-muted-foreground">Untracked</span>
        ) : row.stock === 0 ? (
          <span className="text-destructive">Out of stock</span>
        ) : (
          row.stock
        ),
    },
    { key: 'sold', header: 'Sold', numeric: true, render: (row) => row.unitsSold },
  ];

  return (
    <>
      <SEO title="Products" noIndex />
      <PageHeader
        title="Products"
        description="Books, reports, templates and courses sold through the shop."
        action={
          <Link to="/admin/products/new">
            <Button icon={<Plus className="size-4" aria-hidden />}>New product</Button>
          </Link>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/products/${row.id}`)}
        cardTitle={(row) => row.name}
        empty={{ title: 'No products match those filters', icon: <Package className="size-5" aria-hidden /> }}
        toolbar={
          <>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, SKU or author"
                aria-label="Search products"
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              className="w-44"
            >
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </>
        }
      />
    </>
  );
}

export function AdminProductEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const { data: existing, isLoading } = useAdminProduct(isNew ? undefined : id);
  const { data: categories } = useProductCategories();
  const saveProduct = useSaveProduct(isNew ? undefined : id);
  const archiveProduct = useArchiveProduct();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    categoryId: '',
    description: '',
    shortDescription: '',
    author: '',
    coverImageUrl: '',
    price: 0,
    compareAtPrice: 0,
    currency: 'KES',
    sku: '',
    type: 'DIGITAL' as 'DIGITAL' | 'PHYSICAL',
    stock: 0,
    digitalAssetKey: '',
    isbn: '',
    pages: 0,
    publishedYear: new Date().getFullYear(),
    status: 'DRAFT',
    isFeatured: false,
    seoTitle: '',
    seoDescription: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteProduct = useDeletePermanently();
  const [slugTouched, setSlugTouched] = useState(false);

  // Hydrated during render rather than in an effect: an effect renders the
  // empty form once before filling it, which shows a blank editor for a frame
  // and makes every field look briefly cleared. Keyed on the record id, so a
  // refetch cannot overwrite edits already in progress.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const recordId = existing ? String((existing as { id?: unknown }).id ?? '') : null;

  if (existing && recordId && hydratedFor !== recordId) {
    setHydratedFor(recordId);
    const record = existing as Record<string, never>;
    setForm({
      name: String(record.name ?? ''),
      slug: String(record.slug ?? ''),
      categoryId: String(record.categoryId ?? ''),
      description: String(record.description ?? ''),
      shortDescription: String(record.shortDescription ?? ''),
      author: String(record.author ?? ''),
      coverImageUrl: String(record.coverImageUrl ?? ''),
      price: Number(record.price ?? 0),
      compareAtPrice: Number(record.compareAtPrice ?? 0),
      currency: String(record.currency ?? 'KES'),
      sku: String(record.sku ?? ''),
      type: (String(record.type ?? 'DIGITAL') as 'DIGITAL' | 'PHYSICAL'),
      stock: Number(record.stock ?? 0),
      digitalAssetKey: String(record.digitalAssetKey ?? ''),
      isbn: String(record.isbn ?? ''),
      pages: Number(record.pages ?? 0),
      publishedYear: Number(record.publishedYear ?? new Date().getFullYear()),
      status: String(record.status ?? 'DRAFT'),
      isFeatured: Boolean(record.isFeatured),
      seoTitle: String(record.seoTitle ?? ''),
      seoDescription: String(record.seoDescription ?? ''),
    });
    setSlugTouched(true);
  }

  const submit = async () => {
    setErrors({});
    try {
      const payload = {
        ...form,
        shortDescription: form.shortDescription || undefined,
        author: form.author || undefined,
        coverImageUrl: form.coverImageUrl || undefined,
        compareAtPrice: form.compareAtPrice > 0 ? form.compareAtPrice : undefined,
        sku: form.sku || undefined,
        stock: form.type === 'PHYSICAL' ? form.stock : null,
        digitalAssetKey: form.type === 'DIGITAL' ? form.digitalAssetKey || undefined : undefined,
        isbn: form.isbn || undefined,
        pages: form.pages > 0 ? form.pages : undefined,
        publishedYear: form.publishedYear > 1900 ? form.publishedYear : undefined,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
        galleryUrls: [],
      };

      const result = await saveProduct.mutateAsync(payload);
      toast.success(isNew ? 'Product created' : 'Product saved');
      if (isNew) navigate(`/admin/products/${(result as { id: string }).id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error('Could not save', error.issues?.length ? 'Check the highlighted fields.' : error.message);
      } else {
        toast.error('Could not save the product');
      }
    }
  };

  if (!isNew && isLoading) return <LoadingSkeleton rows={10} />;

  return (
    <>
      <SEO title={isNew ? 'New product' : form.name || 'Edit product'} noIndex />
      <PageHeader
        title={isNew ? 'New product' : form.name || 'Edit product'}
        description={isNew ? undefined : `/shop/${form.slug}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Products', to: '/admin/products' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        action={
          <>
            {!isNew && (
              <>
                <a href={`/shop/${form.slug}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" icon={<ExternalLink className="size-4" aria-hidden />}>
                    View
                  </Button>
                </a>
                {form.status === 'ARCHIVED' ? (
                  <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                    Delete permanently
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
                    Archive
                  </Button>
                )}
              </>
            )}
            <Button loading={saveProduct.isPending} onClick={() => void submit()} icon={<Save className="size-4" aria-hidden />}>
              {isNew ? 'Create product' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Basics</CardTitle>
            <div className="mt-5 space-y-5">
              <Field label="Product name" required error={errors.name}>
                {({ id: fieldId, invalid }) => (
                  <Input
                    id={fieldId}
                    invalid={invalid}
                    value={form.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name,
                        slug: slugTouched ? current.slug : slugify(name),
                      }));
                    }}
                  />
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="URL slug" required error={errors.slug}>
                  {({ id: fieldId, invalid }) => (
                    <Input
                      id={fieldId}
                      invalid={invalid}
                      value={form.slug}
                      onChange={(event) => {
                        setSlugTouched(true);
                        setForm((current) => ({ ...current, slug: slugify(event.target.value) }));
                      }}
                    />
                  )}
                </Field>

                <Field label="Category" required error={errors.categoryId}>
                  {({ id: fieldId, invalid }) => (
                    <Select
                      id={fieldId}
                      invalid={invalid}
                      value={form.categoryId}
                      onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                    >
                      <option value="">Choose a category</option>
                      {categories?.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>

              <Field label="Author" hint="Optional.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={form.author}
                    onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))}
                  />
                )}
              </Field>

              <Field label="Short description" hint="Shown on product cards." error={errors.shortDescription}>
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={2}
                    maxLength={400}
                    value={form.shortDescription}
                    onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <RichTextEditor
              label="Full description"
              value={form.description}
              onChange={(description) => setForm((current) => ({ ...current, description }))}
              placeholder="What is this resource, and who is it for?"
              minHeight="18rem"
              error={errors.description}
            />
          </Card>

          <Card>
            <CardTitle>Search engine listing</CardTitle>
            <div className="mt-5 space-y-5">
              <Field label="SEO title">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    maxLength={160}
                    value={form.seoTitle}
                    onChange={(event) => setForm((current) => ({ ...current, seoTitle: event.target.value }))}
                  />
                )}
              </Field>
              <Field label="SEO description">
                {({ id: fieldId }) => (
                  <Textarea
                    id={fieldId}
                    rows={2}
                    maxLength={320}
                    value={form.seoDescription}
                    onChange={(event) => setForm((current) => ({ ...current, seoDescription: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle className="text-[0.9375rem]">Visibility</CardTitle>
            <div className="mt-4 space-y-3">
              <Field label="Status">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </Select>
                )}
              </Field>
              <Checkbox
                label="Feature on the home page"
                checked={form.isFeatured}
                onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))}
              />
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Pricing</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="Price" required error={errors.price}>
                {({ id: fieldId }) => (
                  <MoneyInput
                    id={fieldId}
                    currency={form.currency}
                    value={form.price}
                    onChange={(price) => setForm((current) => ({ ...current, price }))}
                  />
                )}
              </Field>
              <Field label="Compare-at price" hint="Shows a struck-through original. Leave at zero to hide.">
                {({ id: fieldId }) => (
                  <MoneyInput
                    id={fieldId}
                    currency={form.currency}
                    value={form.compareAtPrice}
                    onChange={(compareAtPrice) => setForm((current) => ({ ...current, compareAtPrice }))}
                  />
                )}
              </Field>
              <Field label="SKU" hint="Optional.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={form.sku}
                    onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Format</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="Product type">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.type}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, type: event.target.value as 'DIGITAL' | 'PHYSICAL' }))
                    }
                  >
                    <option value="DIGITAL">Digital download</option>
                    <option value="PHYSICAL">Print edition</option>
                  </Select>
                )}
              </Field>

              {form.type === 'DIGITAL' ? (
                <Field
                  label="File storage key"
                  required
                  hint="Path in the private bucket. Never served directly — downloads are signed and expire."
                  error={errors.digitalAssetKey}
                >
                  {({ id: fieldId, invalid }) => (
                    <Input
                      id={fieldId}
                      invalid={invalid}
                      placeholder="products/my-book/my-book.pdf"
                      value={form.digitalAssetKey}
                      onChange={(event) => setForm((current) => ({ ...current, digitalAssetKey: event.target.value }))}
                    />
                  )}
                </Field>
              ) : (
                <Field label="Stock on hand" hint="Decremented automatically at checkout.">
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      value={form.stock}
                      onChange={(event) => setForm((current) => ({ ...current, stock: Number(event.target.value) }))}
                    />
                  )}
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Publication details</CardTitle>
            <div className="mt-4 space-y-4">
              <Field label="Cover image URL">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="url"
                    value={form.coverImageUrl}
                    onChange={(event) => setForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pages">
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      value={form.pages}
                      onChange={(event) => setForm((current) => ({ ...current, pages: Number(event.target.value) }))}
                    />
                  )}
                </Field>
                <Field label="Year">
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="number"
                      min={1900}
                      max={2200}
                      value={form.publishedYear}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, publishedYear: Number(event.target.value) }))
                      }
                    />
                  )}
                </Field>
              </div>
              <Field label="ISBN">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={form.isbn}
                    onChange={(event) => setForm((current) => ({ ...current, isbn: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => {
          if (!id) return;
          archiveProduct.mutate(id, {
            onSuccess: () => {
              toast.success('Product archived');
              navigate('/admin/products');
            },
          });
        }}
        title="Archive this product?"
        description="It disappears from the shop. Past orders and existing download access are unaffected."
        confirmLabel="Archive"
        tone="destructive"
        loading={archiveProduct.isPending}
      />

      {/* Refused while the product appears on any order, so a buyer's download
          entitlement can never be orphaned. */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!id) return;
          try {
            await deleteProduct.mutateAsync({ kind: 'products', id });
            toast.success('Product deleted', 'Its file was removed from storage.');
            void navigate('/admin/products');
          } catch (error) {
            setDeleteOpen(false);
            toast.error(
              'Could not delete this product',
              error instanceof ApiError ? error.message : 'Please try again shortly.',
            );
          }
        }}
        title="Delete this product for good?"
        description="The uploaded file is deleted with it. This is refused if the product appears on any order."
        confirmLabel="Delete permanently"
        tone="destructive"
        loading={deleteProduct.isPending}
      />
    </>
  );
}

