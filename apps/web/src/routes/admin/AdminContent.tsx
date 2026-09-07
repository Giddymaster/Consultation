import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  BookOpen,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Plus,
  Save,
  Search,
  Send,
} from 'lucide-react';
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
import { DataTable, type Column } from '@/components/admin/DataTable';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useAdminArticle,
  useArchiveArticle,
  useDeletePermanently,
  useSaveArticle,
} from '@/lib/admin-queries';
import { useAdminConsultants } from '@/lib/admin-queries';
import { useArticleCategories, useArticles } from '@/lib/queries';
import { useAuth } from '@/providers/auth-context';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';

/**
 * Content management for articles and the research journal.
 *
 * Both are the same underlying record distinguished by `isJournal`; the two
 * screens differ only in the filter they apply and the metadata they surface.
 */

const STATUS_TONE = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  ARCHIVED: 'warning',
} as const;

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  readingMinutes: number;
  publishedAt: string | null;
  isJournal: boolean;
  category: { name: string };
  tags: string[];
  author: { fullName: string; avatarUrl: string | null } | null;
}

function ArticleList({ journal }: { journal: boolean }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const navigate = useNavigate();

  const { data: categories } = useArticleCategories();
  const { data, isLoading } = useArticles({
    pageSize: 50,
    isJournal: journal,
    search: search || undefined,
    // Without a status filter the API returns published only; an editor needs
    // to see drafts, so an explicit status is always sent.
    status: status || undefined,
    category: category || undefined,
  });

  const rows = (data?.items ?? []) as unknown as ArticleRow[];

  const columns: Column<ArticleRow>[] = [
    {
      key: 'title',
      header: 'Title',
      showInCard: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate text-xs text-muted-foreground">{row.category.name}</p>
        </div>
      ),
    },
    {
      key: 'author',
      header: 'Author',
      render: (row) =>
        row.author ? (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.author.fullName} src={row.author.avatarUrl} size="xs" />
            <span className="truncate text-sm">{row.author.fullName}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'published',
      header: 'Published',
      render: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.publishedAt ? formatDate(row.publishedAt) : 'Not scheduled'}
        </span>
      ),
    },
    {
      key: 'reading',
      header: 'Length',
      numeric: true,
      render: (row) => `${row.readingMinutes} min`,
    },
  ];

  const label = journal ? 'journal paper' : 'article';

  return (
    <>
      <SEO title={journal ? 'Journal' : 'Articles'} noIndex />
      <PageHeader
        title={journal ? 'Research journal' : 'Articles'}
        description={
          journal
            ? 'Peer-reviewed papers with volume, issue and DOI metadata.'
            : 'Insight pieces published on the public site.'
        }
        action={
          <Link to={`/admin/articles/new${journal ? '?journal=1' : ''}`}>
            <Button icon={<Plus className="size-4" aria-hidden />}>New {label}</Button>
          </Link>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/articles/${row.id}`)}
        cardTitle={(row) => row.title}
        empty={{
          title: `No ${label}s match those filters`,
          icon: journal ? <BookOpen className="size-5" aria-hidden /> : <FileText className="size-5" aria-hidden />,
          action: (
            <Link to={`/admin/articles/new${journal ? '?journal=1' : ''}`}>
              <Button>Write the first one</Button>
            </Link>
          ),
        }}
        toolbar={
          <>
            <div className="relative min-w-52 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title"
                aria-label="Search content"
                className="pl-10"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              className="w-40"
            >
              <option value="">Published</option>
              <option value="DRAFT">Drafts</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
            {!journal && (
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Filter by category"
                className="w-44"
              >
                <option value="">All categories</option>
                {categories?.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
          </>
        }
      />
    </>
  );
}

export function AdminArticles() {
  return <ArticleList journal={false} />;
}

export function AdminJournal() {
  return <ArticleList journal />;
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

export function AdminArticleEditor() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can } = useAuth();

  const { data: categories } = useArticleCategories();
  const { data: consultants } = useAdminConsultants({ pageSize: 60 });
  const saveArticle = useSaveArticle(isNew ? undefined : id);
  const archiveArticle = useArchiveArticle();

  // Loaded by id, not slug: a draft's slug can change while it is being edited,
  // and the record being edited must not change with it.
  const { data: existing, isLoading } = useAdminArticle(isNew ? undefined : id);

  const [form, setForm] = useState({
    title: '',
    slug: '',
    categoryId: '',
    excerpt: '',
    content: '',
    tags: [] as string[],
    featuredImageUrl: '',
    authorId: '',
    status: 'DRAFT',
    publishedAt: '',
    readingMinutes: 0,
    isJournal: params.get('journal') === '1',
    journalVolume: '',
    journalIssue: '',
    doi: '',
    seoTitle: '',
    seoDescription: '',
  });
  const [tagText, setTagText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteArticle = useDeletePermanently();
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
    const publishedAt = (record.publishedAt ?? null) as unknown as string | null;

    setForm({
      title: String(record.title ?? ''),
      slug: String(record.slug ?? ''),
      categoryId: String(record.categoryId ?? ''),
      excerpt: String(record.excerpt ?? ''),
      content: String(record.content ?? ''),
      tags: (record.tags ?? []) as unknown as string[],
      featuredImageUrl: String(record.featuredImageUrl ?? ''),
      authorId: String(record.authorId ?? ''),
      status: String(record.status ?? 'DRAFT'),
      publishedAt: publishedAt ? DateTime.fromISO(publishedAt).toFormat("yyyy-MM-dd'T'HH:mm") : '',
      readingMinutes: Number(record.readingMinutes ?? 0),
      isJournal: Boolean(record.isJournal),
      journalVolume: String(record.journalVolume ?? ''),
      journalIssue: String(record.journalIssue ?? ''),
      doi: String(record.doi ?? ''),
      seoTitle: String(record.seoTitle ?? ''),
      seoDescription: String(record.seoDescription ?? ''),
    });
    setTagText(((record.tags ?? []) as unknown as string[]).join(', '));
    setSlugTouched(true);
  }

  const canPublish = can('content.publish');

  const submit = async (overrideStatus?: string) => {
    setErrors({});
    const status = overrideStatus ?? form.status;

    try {
      const payload = {
        title: form.title,
        slug: form.slug,
        categoryId: form.categoryId,
        excerpt: form.excerpt,
        content: form.content,
        tags: form.tags,
        featuredImageUrl: form.featuredImageUrl || undefined,
        authorId: form.authorId || user?.id,
        status,
        publishedAt: form.publishedAt ? DateTime.fromISO(form.publishedAt).toUTC().toISO() : undefined,
        readingMinutes: form.readingMinutes > 0 ? form.readingMinutes : undefined,
        isJournal: form.isJournal,
        journalVolume: form.journalVolume || undefined,
        journalIssue: form.journalIssue || undefined,
        doi: form.doi || undefined,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
      };

      const result = await saveArticle.mutateAsync(payload);
      toast.success(
        isNew ? 'Created' : 'Saved',
        status === 'PUBLISHED' ? 'It is now live on the site.' : undefined,
      );

      if (isNew) {
        navigate(`/admin/articles/${(result as { id: string }).id}`);
      } else {
        setForm((current) => ({ ...current, status }));
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error('Could not save', error.issues?.length ? 'Check the highlighted fields.' : error.message);
      } else {
        toast.error('Could not save');
      }
    }
  };

  if (!isNew && isLoading) return <LoadingSkeleton rows={10} />;

  const publicPath = `/${form.isJournal ? 'journal' : 'insights'}/${form.slug}`;

  return (
    <>
      <SEO title={isNew ? 'New article' : form.title || 'Edit article'} noIndex />
      <PageHeader
        title={isNew ? (form.isJournal ? 'New journal paper' : 'New article') : form.title || 'Edit'}
        description={isNew ? undefined : publicPath}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: form.isJournal ? 'Journal' : 'Articles', to: form.isJournal ? '/admin/journal' : '/admin/articles' },
          { label: isNew ? 'New' : 'Edit' },
        ]}
        action={
          <>
            {!isNew && form.status === 'PUBLISHED' && (
              <a href={publicPath} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" icon={<ExternalLink className="size-4" aria-hidden />}>
                  View
                </Button>
              </a>
            )}
            {!isNew && (
              <Button
                variant="ghost"
                onClick={() => (form.status === 'ARCHIVED' ? setDeleteOpen(true) : setArchiveOpen(true))}
              >
                {form.status === 'ARCHIVED' ? 'Delete permanently' : 'Archive'}
              </Button>
            )}
            <Button
              variant="secondary"
              loading={saveArticle.isPending}
              onClick={() => void submit('DRAFT')}
              icon={<Save className="size-4" aria-hidden />}
            >
              Save draft
            </Button>
            {canPublish && (
              <Button
                loading={saveArticle.isPending}
                onClick={() => void submit('PUBLISHED')}
                icon={<Send className="size-4" aria-hidden />}
              >
                Publish
              </Button>
            )}
          </>
        }
      />

      {!canPublish && (
        <Card className="mb-6 bg-info-soft">
          <p className="flex gap-3 text-sm text-info">
            <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
            You can draft and edit. Publishing needs the content.publish permission — ask an editor to review it.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-5">
              <Field label="Title" required error={errors.title}>
                {({ id: fieldId, invalid }) => (
                  <Input
                    id={fieldId}
                    invalid={invalid}
                    className="text-lg font-semibold"
                    value={form.title}
                    onChange={(event) => {
                      const title = event.target.value;
                      setForm((current) => ({
                        ...current,
                        title,
                        slug: slugTouched
                          ? current.slug
                          : title
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/^-+|-+$/g, '')
                              .slice(0, 160),
                      }));
                    }}
                  />
                )}
              </Field>

              <Field label="URL slug" required hint={publicPath} error={errors.slug}>
                {({ id: fieldId, invalid }) => (
                  <Input
                    id={fieldId}
                    invalid={invalid}
                    value={form.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setForm((current) => ({
                        ...current,
                        slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                      }));
                    }}
                  />
                )}
              </Field>

              <Field
                label="Excerpt"
                required
                hint={`Shown on cards and in search results. ${form.excerpt.length}/400`}
                error={errors.excerpt}
              >
                {({ id: fieldId, invalid }) => (
                  <Textarea
                    id={fieldId}
                    invalid={invalid}
                    rows={3}
                    maxLength={400}
                    value={form.excerpt}
                    onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <RichTextEditor
              label="Body"
              value={form.content}
              onChange={(content) => setForm((current) => ({ ...current, content }))}
              placeholder="Write the piece…"
              minHeight="30rem"
              error={errors.content}
            />
          </Card>

          <Card>
            <CardTitle>Search engine listing</CardTitle>
            <div className="mt-5 space-y-5">
              <Field label="SEO title" hint={`Defaults to the article title. ${form.seoTitle.length}/160`}>
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    maxLength={160}
                    value={form.seoTitle}
                    onChange={(event) => setForm((current) => ({ ...current, seoTitle: event.target.value }))}
                  />
                )}
              </Field>
              <Field label="SEO description" hint={`Defaults to the excerpt. ${form.seoDescription.length}/320`}>
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
            <CardTitle className="text-[0.9375rem]">Publication</CardTitle>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current status</span>
                <Badge tone={STATUS_TONE[form.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                  {form.status.toLowerCase()}
                </Badge>
              </div>

              <Field
                label="Publish date"
                hint="Set a future date and choose Scheduled — the worker publishes it automatically."
              >
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="datetime-local"
                    value={form.publishedAt}
                    onChange={(event) => setForm((current) => ({ ...current, publishedAt: event.target.value }))}
                  />
                )}
              </Field>

              {canPublish && (
                <Field label="Status">
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={form.status}
                      onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="ARCHIVED">Archived</option>
                    </Select>
                  )}
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Classification</CardTitle>
            <div className="mt-4 space-y-4">
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

              <Field label="Author">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={form.authorId}
                    onChange={(event) => setForm((current) => ({ ...current, authorId: event.target.value }))}
                  >
                    <option value="">{user ? `${user.firstName} ${user.lastName} (you)` : 'Unattributed'}</option>
                    {(consultants?.items ?? []).map((consultant) => {
                      const row = consultant as Record<string, never>;
                      return (
                        <option key={String(row.userId)} value={String(row.userId)}>
                          {String(row.fullName)}
                        </option>
                      );
                    })}
                  </Select>
                )}
              </Field>

              <Field label="Tags" hint="Comma separated.">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={tagText}
                    placeholder="strategy, pricing, growth"
                    onChange={(event) => {
                      setTagText(event.target.value);
                      setForm((current) => ({
                        ...current,
                        tags: event.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      }));
                    }}
                  />
                )}
              </Field>

              <Field label="Featured image URL">
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    type="url"
                    value={form.featuredImageUrl}
                    onChange={(event) => setForm((current) => ({ ...current, featuredImageUrl: event.target.value }))}
                  />
                )}
              </Field>

              <Field label="Reading time" hint="Leave at zero to calculate from the body.">
                {({ id: fieldId }) => (
                  <div className="relative">
                    <Input
                      id={fieldId}
                      type="number"
                      min={0}
                      max={180}
                      value={form.readingMinutes}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, readingMinutes: Number(event.target.value) }))
                      }
                      className="pr-14"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted-foreground">
                      min
                    </span>
                  </div>
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="text-[0.9375rem]">Journal metadata</CardTitle>
            <CardDescription className="mt-1">
              Marks this as a peer-reviewed paper and moves it to the journal.
            </CardDescription>

            <div className="mt-4 space-y-4">
              <Checkbox
                label="This is a journal paper"
                checked={form.isJournal}
                onChange={(event) => setForm((current) => ({ ...current, isJournal: event.target.checked }))}
              />

              {form.isJournal && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Volume">
                      {({ id: fieldId }) => (
                        <Input
                          id={fieldId}
                          placeholder="Volume 4"
                          value={form.journalVolume}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, journalVolume: event.target.value }))
                          }
                        />
                      )}
                    </Field>
                    <Field label="Issue">
                      {({ id: fieldId }) => (
                        <Input
                          id={fieldId}
                          placeholder="Issue 2"
                          value={form.journalIssue}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, journalIssue: event.target.value }))
                          }
                        />
                      )}
                    </Field>
                  </div>
                  <Field label="DOI" hint="Rendered as a citation on the paper page.">
                    {({ id: fieldId }) => (
                      <Input
                        id={fieldId}
                        placeholder="10.5281/meridian.2026.0402"
                        value={form.doi}
                        onChange={(event) => setForm((current) => ({ ...current, doi: event.target.value }))}
                      />
                    )}
                  </Field>
                </>
              )}
            </div>
          </Card>

          <Card className="bg-muted/40">
            <p className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Body content is sanitised on save to a fixed set of tags. Anything the toolbar cannot produce will be
              stripped, so what you see here is what gets stored.
            </p>
          </Card>
        </aside>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => {
          if (!id) return;
          archiveArticle.mutate(id, {
            onSuccess: () => {
              toast.success('Archived', 'It no longer appears on the public site.');
              navigate(form.isJournal ? '/admin/journal' : '/admin/articles');
            },
          });
        }}
        title="Archive this piece?"
        description="It stops appearing publicly. Nothing is deleted, and you can restore it by setting the status back to published."
        confirmLabel="Archive"
        tone="destructive"
        loading={archiveArticle.isPending}
      />

      {/* Offered only on an archived piece, so a live URL is always retired in
          two deliberate steps rather than one click. */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!id) return;
          try {
            await deleteArticle.mutateAsync({ kind: 'articles', id });
            toast.success('Deleted');
            void navigate(form.isJournal ? '/admin/journal' : '/admin/articles');
          } catch (error) {
            setDeleteOpen(false);
            toast.error(
              'Could not delete this piece',
              error instanceof ApiError ? error.message : 'Please try again shortly.',
            );
          }
        }}
        title="Delete this piece for good?"
        description="This cannot be undone, and the URL will start returning a not-found page."
        confirmLabel="Delete permanently"
        tone="destructive"
        loading={deleteArticle.isPending}
      />
    </>
  );
}

