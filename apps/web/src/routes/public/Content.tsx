import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Calendar, Clock, FileText, Quote, Tag } from 'lucide-react';
import { Avatar, Badge, Button, Card, EmptyState, Separator } from '@/components/ui';
import { ArticleCard, CardGridSkeleton, Section, SectionHeader } from '@/components/marketing';
import { SEO } from '@/components/SEO';
import { articleSchema } from '@/lib/structured-data';
import { useArticle, useArticleCategories, useArticles } from '@/lib/queries';
import { cn, formatDate, formatDuration } from '@/lib/utils';

/**
 * Insights and the research journal.
 *
 * Both are backed by the same `articles` table, distinguished by `isJournal`.
 * Journal entries carry volume, issue and DOI metadata and are presented in a
 * more formal, citation-oriented layout.
 */

/* -------------------------------------------------------------------------- */
/* Insights index                                                             */
/* -------------------------------------------------------------------------- */

export function InsightsPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';

  const { data: categories } = useArticleCategories();
  const { data, isLoading } = useArticles({
    pageSize: 18,
    isJournal: false,
    category: category || undefined,
  });

  const [featured, ...rest] = data?.items ?? [];

  return (
    <>
      <SEO
        title="Insights"
        description="Short pieces on strategy, capital, operations and leadership — written by the consultants who do the work."
        path="/insights"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">Insights</p>
          <h1 className="mt-3 max-w-3xl text-h1">Thinking worth your time</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Short, practical pieces on the decisions our clients are actually wrestling with. Written by the people who
            sit in those rooms.
          </p>
        </div>
      </div>

      <Section className="!pt-12">
        <div className="mb-10 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => setParams({})}
            aria-pressed={!category}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              !category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            All insights
          </button>
          {categories
            ?.filter((item) => item.slug !== 'research')
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams({ category: item.slug })}
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

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <CardGridSkeleton count={6} aspect="tall" />
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            {featured && (
              <div className="mb-5">
                <ArticleCard article={featured} featured />
              </div>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((article, index) => (
                <ArticleCard key={article.id} article={article} index={index} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<FileText className="size-5" aria-hidden />}
            title="Nothing published in this category yet"
            action={
              <Button variant="secondary" onClick={() => setParams({})}>
                Show all insights
              </Button>
            }
          />
        )}
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Journal index                                                              */
/* -------------------------------------------------------------------------- */

export function JournalPage() {
  const { data, isLoading } = useArticles({ pageSize: 24, isJournal: true });

  return (
    <>
      <SEO
        title="Meridian Advisory Journal"
        description="Peer-reviewed research on advisory practice, operating models and governance in sub-Saharan Africa."
        path="/journal"
      />

      <div className="aura border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-eyebrow uppercase text-accent">Research</p>
          <h1 className="mt-3 max-w-3xl text-h1">The Meridian Advisory Journal</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Peer-reviewed research on advisory practice, operating model transitions and governance among mid-market
            firms in sub-Saharan Africa. Published twice yearly.
          </p>
        </div>
      </div>

      <Section className="!pt-12">
        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-40 w-full" />
            <div className="skeleton h-40 w-full" />
          </div>
        ) : data && data.items.length > 0 ? (
          <ol className="space-y-4">
            {data.items.map((article) => (
              <li key={article.id}>
                <Link to={`/journal/${article.slug}`} className="group block">
                  <Card interactive>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge tone="accent">Peer-reviewed</Badge>
                      {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
                      <span aria-hidden>·</span>
                      <span>{article.readingMinutes} min read</span>
                    </div>

                    <h2 className="mt-3 text-h3 transition-colors group-hover:text-accent">{article.title}</h2>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p>

                    <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4">
                      {article.author && (
                        <span className="flex items-center gap-2.5">
                          <Avatar name={article.author.fullName} src={article.author.avatarUrl} size="xs" />
                          <span className="text-xs">
                            <span className="block font-medium text-foreground">{article.author.fullName}</span>
                            {article.author.title && (
                              <span className="block text-muted-foreground">{article.author.title}</span>
                            )}
                          </span>
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-accent">
                        Read paper
                        <ArrowRight className="size-3.5" aria-hidden />
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={<BookOpen className="size-5" aria-hidden />} title="No papers published yet" />
        )}
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Article detail                                                             */
/* -------------------------------------------------------------------------- */

export function ArticleDetailPage({ journal }: { journal?: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = useArticle(slug);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="skeleton h-6 w-32" />
        <div className="skeleton mt-5 h-12 w-full" />
        <div className="skeleton mt-3 h-12 w-2/3" />
        <div className="skeleton mt-10 h-96 w-full" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <Section>
        <EmptyState
          title="That piece could not be found"
          description="It may have been unpublished or the link may be out of date."
          action={
            <Link to={journal ? '/journal' : '/insights'}>
              <Button>Back to {journal ? 'the journal' : 'insights'}</Button>
            </Link>
          }
        />
      </Section>
    );
  }

  const backHref = article.isJournal ? '/journal' : '/insights';

  const citation = article.doi
    ? `${article.author?.fullName ?? 'Meridian Advisory'} (${
        article.publishedAt ? new Date(article.publishedAt).getFullYear() : ''
      }). ${article.title}. Meridian Advisory Journal, ${article.journalVolume ?? ''}${
        article.journalIssue ? `, ${article.journalIssue}` : ''
      }. https://doi.org/${article.doi}`
    : null;

  return (
    <>
      <SEO
        title={article.seoTitle ?? article.title}
        description={article.seoDescription ?? article.excerpt}
        path={`${backHref}/${article.slug}`}
        type="article"
        image={article.featuredImageUrl ?? undefined}
        publishedAt={article.publishedAt ?? undefined}
        author={article.author?.fullName}
        structuredData={articleSchema({
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          publishedAt: article.publishedAt,
          authorName: article.author?.fullName,
          isJournal: article.isJournal,
        })}
      />

      <article>
        <header className="aura border-b border-border">
          <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
            <Link
              to={backHref}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {article.isJournal ? 'The journal' : 'Insights'}
            </Link>

            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge tone={article.isJournal ? 'accent' : 'neutral'}>
                {article.isJournal ? 'Peer-reviewed' : article.category.name}
              </Badge>
              {article.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" aria-hidden />
                  {formatDate(article.publishedAt)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden />
                {formatDuration(article.readingMinutes)} read
              </span>
            </div>

            <h1 className="mt-5 text-h1">{article.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{article.excerpt}</p>

            {article.author && (
              <div className="mt-8 flex items-center gap-3">
                <Avatar name={article.author.fullName} src={article.author.avatarUrl} size="md" />
                <div>
                  <p className="text-sm font-semibold">{article.author.fullName}</p>
                  {article.author.title && <p className="text-xs text-muted-foreground">{article.author.title}</p>}
                </div>
              </div>
            )}

            {article.isJournal && (article.journalVolume || article.doi) && (
              <dl className="mt-8 grid gap-x-8 gap-y-2 border-t border-border pt-6 text-xs sm:grid-cols-3">
                {article.journalVolume && (
                  <div>
                    <dt className="text-muted-foreground">Volume</dt>
                    <dd className="mt-0.5 font-medium">{article.journalVolume}</dd>
                  </div>
                )}
                {article.journalIssue && (
                  <div>
                    <dt className="text-muted-foreground">Issue</dt>
                    <dd className="mt-0.5 font-medium">{article.journalIssue}</dd>
                  </div>
                )}
                {article.doi && (
                  <div>
                    <dt className="text-muted-foreground">DOI</dt>
                    <dd className="mt-0.5 font-medium">{article.doi}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </header>

        {article.featuredImageUrl && (
          <div className="mx-auto max-w-4xl px-5 sm:px-8">
            <img
              src={article.featuredImageUrl}
              alt=""
              className="-mt-8 w-full rounded-[var(--radius-card)] shadow-[var(--shadow-lifted)]"
            />
          </div>
        )}

        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
          {/* Server-sanitised on write, so this is safe to render as HTML. */}
          <div className="prose-editorial" dangerouslySetInnerHTML={{ __html: article.content }} />

          {article.tags.length > 0 && (
            <>
              <Separator className="my-10" />
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="size-4 text-muted-foreground" aria-hidden />
                {article.tags.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            </>
          )}

          {citation && (
            <Card className="mt-10 bg-muted/40">
              <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                <Quote className="size-4 text-accent" aria-hidden />
                Cite this paper
              </h2>
              <p className="mt-3 font-mono text-xs leading-relaxed break-words text-muted-foreground">{citation}</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-4"
                onClick={() => {
                  void navigator.clipboard.writeText(citation);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied' : 'Copy citation'}
              </Button>
            </Card>
          )}
        </div>
      </article>

      {article.related.length > 0 && (
        <Section className="bg-card">
          <SectionHeader eyebrow="Keep reading" title="Related pieces" />
          <div className="grid gap-5 sm:grid-cols-3">
            {article.related.map((related, index) => (
              <ArticleCard key={related.id} article={related} index={index} />
            ))}
          </div>
        </Section>
      )}

      <Section>
        <div className="aura relative overflow-hidden rounded-[var(--radius-card)] bg-primary px-8 py-14 text-center sm:px-16">
          <h2 className="text-h2 text-primary-foreground">Working through something like this?</h2>
          <p className="mx-auto mt-4 max-w-lg text-primary-foreground/70">
            Book a working session with the consultant who wrote it.
          </p>
          <Link to="/book" className="mt-8 inline-block">
            <Button size="lg" variant="accent" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Book a consultation
            </Button>
          </Link>
        </div>
      </Section>
    </>
  );
}
