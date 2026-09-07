import { useRef, useState } from 'react';
import { Image, Palette, Trash2, Type, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  LoadingSkeleton,
  Separator,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/DashboardLayout';
import { SEO } from '@/components/SEO';
import {
  useBranding,
  useRemoveBrandAsset,
  useSettings,
  useUpdateSetting,
  useUploadBrandAsset,
  type BrandAsset,
} from '@/lib/admin-queries';
import { useToast } from '@/providers/toast-context';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';

/**
 * Branding: what the platform is called and what it looks like.
 *
 * The text fields write to the same `settings` rows the settings screen edits;
 * they are surfaced here too because "rename the platform" is one job, and
 * making someone find `business.name` in a list of forty keys is not a design.
 */

const ASSET_COPY: Record<BrandAsset, { label: string; hint: string }> = {
  logo: {
    label: 'Logo',
    hint: 'Shown in the header, the portal and the footer. A square or wide mark both work; it is rendered at 32px.',
  },
  logoDark: {
    label: 'Dark-mode logo',
    hint: 'Optional. Used only when the viewer is in dark mode — leave it empty and the main logo is used for both.',
  },
  favicon: {
    label: 'Favicon',
    hint: 'The browser tab icon. A square PNG of 32px or more, or an SVG.',
  },
};

function AssetSlot({
  asset,
  url,
  summary,
  maxBytes,
  accepted,
}: {
  asset: BrandAsset;
  url: string | null;
  summary: { fileName: string; mimeType: string; updatedAt: string } | null;
  maxBytes: number;
  accepted: string[];
}) {
  const upload = useUploadBrandAsset();
  const remove = useRemoveBrandAsset();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const copy = ASSET_COPY[asset];

  const choose = async (file: File | undefined) => {
    if (!file) return;

    // Checked here as well as on the server, so the reason arrives instantly
    // rather than after a 2MB upload.
    if (file.size > maxBytes) {
      toast.error('That file is too large', `Brand images must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
      return;
    }

    try {
      await upload.mutateAsync({ asset, file });
      toast.success(`${copy.label} updated`, 'It is live across the site immediately.');
    } catch (error) {
      toast.error(
        `Could not update the ${copy.label.toLowerCase()}`,
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    } finally {
      // Lets the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base">{copy.label}</CardTitle>
          <CardDescription className="mt-1 max-w-md">{copy.hint}</CardDescription>
        </div>

        <div className="flex size-16 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-surface-2 p-2">
          {url ? (
            <img src={url} alt={`Current ${copy.label.toLowerCase()}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <Image className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
      </div>

      {summary && (
        <p className="mt-3 truncate text-xs text-muted-foreground">
          {summary.fileName} · uploaded {formatDate(summary.updatedAt)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <input
          ref={inputRef}
          type="file"
          accept={accepted.join(',')}
          className="sr-only"
          id={`brand-${asset}`}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="secondary"
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
          icon={<Upload className="size-3.5" aria-hidden />}
        >
          {url ? 'Replace' : 'Upload'}
        </Button>

        {url && (
          <Button size="sm" variant="ghost" onClick={() => setRemoveOpen(true)} icon={<Trash2 className="size-3.5" aria-hidden />}>
            Remove
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={`Remove the ${copy.label.toLowerCase()}?`}
        description="The built-in mark is used until another image is uploaded. This does not affect anything else."
        confirmLabel="Remove"
        tone="destructive"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(asset);
            setRemoveOpen(false);
            toast.success(`${copy.label} removed`);
          } catch {
            toast.error(`Could not remove the ${copy.label.toLowerCase()}`);
          }
        }}
      />
    </Card>
  );
}

/** The settings rows this screen owns, in the order they read best. */
const TEXT_FIELDS: { key: string; label: string; hint?: string; multiline?: boolean }[] = [
  { key: 'business.name', label: 'Platform name', hint: 'Used in the header, page titles, emails and invoices.' },
  { key: 'business.tagline', label: 'Tagline', hint: 'The line under the name on the home page.' },
  { key: 'business.email', label: 'Public email' },
  { key: 'business.phone', label: 'Public phone' },
  { key: 'business.address', label: 'Registered address', multiline: true },
];

export function AdminBranding() {
  const { data: branding, isLoading } = useBranding();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const updateSetting = useUpdateSetting();
  const toast = useToast();

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (isLoading || settingsLoading || !branding) return <LoadingSkeleton rows={8} />;

  const valueFor = (key: string): string => {
    if (key in drafts) return drafts[key]!;
    const row = settings?.find((setting) => setting.key === key);
    return typeof row?.value === 'string' ? row.value : '';
  };

  const dirty = Object.entries(drafts).filter(([key, value]) => {
    const row = settings?.find((setting) => setting.key === key);
    return (typeof row?.value === 'string' ? row.value : '') !== value;
  });

  const saveText = async () => {
    try {
      for (const [key, value] of dirty) {
        await updateSetting.mutateAsync({ key, value });
      }
      setDrafts({});
      toast.success('Branding saved', 'The new name and details are live across the site.');
    } catch (error) {
      toast.error(
        'Could not save',
        error instanceof ApiError ? error.message : 'Please try again shortly.',
      );
    }
  };

  return (
    <>
      <SEO title="Branding" noIndex />
      <PageHeader
        title="Branding"
        description="What this platform is called, and the marks it wears."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Branding' }]}
        action={
          <Button onClick={saveText} disabled={dirty.length === 0} loading={updateSetting.isPending}>
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardTitle className="flex items-center gap-2 text-base">
              <Type className="size-4 text-muted-foreground" aria-hidden />
              Name and contact
            </CardTitle>
            <CardDescription className="mt-1">
              Changing the name updates the header, browser tab, transactional emails and every invoice issued from
              now on. Invoices already sent keep the name they were issued under.
            </CardDescription>

            <div className="mt-5 space-y-5">
              {TEXT_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  {({ id }) =>
                    field.multiline ? (
                      <Textarea
                        id={id}
                        rows={3}
                        value={valueFor(field.key)}
                        onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    ) : (
                      <Input
                        id={id}
                        value={valueFor(field.key)}
                        onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    )
                  }
                </Field>
              ))}
            </div>
          </Card>

          <Separator />

          <div className="grid gap-6 sm:grid-cols-2">
            {(['logo', 'logoDark', 'favicon'] as BrandAsset[]).map((asset) => (
              <AssetSlot
                key={asset}
                asset={asset}
                url={branding[`brand.${asset}Url` as keyof typeof branding] as string | null}
                summary={branding.assets[asset]}
                maxBytes={branding.maxBytes}
                accepted={branding.acceptedTypes}
              />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="size-4 text-muted-foreground" aria-hidden />
              How this is applied
            </CardTitle>
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              <li>The header and footer read the name and logo on every page load.</li>
              <li>The favicon is applied to the browser tab as soon as it is uploaded.</li>
              <li>A dark-mode logo is optional; without one the main logo serves both themes.</li>
              <li>Images are served from a fixed URL, so a replacement reaches cached pages too.</li>
            </ul>

            <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
              SVG uploads are served with scripting disabled, so a logo cannot carry code into the page.
            </p>
          </Card>

          <Card>
            <CardTitle className="text-base">Not changed here</CardTitle>
            <CardDescription className="mt-1">
              Colours and typography are part of the compiled theme rather than settings, because they need designing
              rather than configuring. Ask an engineer to adjust the theme tokens.
            </CardDescription>
          </Card>
        </div>
      </div>
    </>
  );
}
