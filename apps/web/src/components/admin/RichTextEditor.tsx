import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Rich text editor for articles and product descriptions.
 *
 * Built on `contenteditable` with a deliberately small command set rather than
 * pulling in a full editor framework. Two reasons: the output is sanitised
 * server-side on write to a fixed tag allowlist, so an editor that can produce
 * arbitrary markup buys nothing; and the toolbar maps exactly onto the tags
 * that survive sanitisation, so what an author sees is what gets stored.
 *
 * `document.execCommand` is formally deprecated but remains the only
 * cross-browser way to drive contenteditable without a large dependency, and
 * every browser this app supports still implements it.
 */

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  minHeight?: string;
  error?: string;
}

interface ToolbarAction {
  icon: typeof Bold;
  label: string;
  command: string;
  argument?: string;
  /** Shown in the tooltip. */
  shortcut?: string;
}

const ACTIONS: (ToolbarAction | 'divider')[] = [
  { icon: Bold, label: 'Bold', command: 'bold', shortcut: '⌘B' },
  { icon: Italic, label: 'Italic', command: 'italic', shortcut: '⌘I' },
  'divider',
  { icon: Heading2, label: 'Heading', command: 'formatBlock', argument: 'h2' },
  { icon: Heading3, label: 'Subheading', command: 'formatBlock', argument: 'h3' },
  { icon: Quote, label: 'Quote', command: 'formatBlock', argument: 'blockquote' },
  'divider',
  { icon: List, label: 'Bulleted list', command: 'insertUnorderedList' },
  { icon: ListOrdered, label: 'Numbered list', command: 'insertOrderedList' },
  'divider',
  { icon: Code, label: 'Code', command: 'formatBlock', argument: 'pre' },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing…',
  label,
  minHeight = '24rem',
  error,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  const labelId = useId();

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  /**
   * Opening the dialog moves focus out of the editor, and the browser discards
   * the selection with it. `execCommand('createLink')` acts on the selection, so
   * the range is captured before the dialog opens and restored just before the
   * command runs — otherwise the link is applied to nothing.
   */
  const savedRange = useRef<Range | null>(null);

  // Only write into the DOM when the incoming value genuinely differs from what
  // is rendered. Assigning innerHTML on every keystroke would collapse the
  // caret to the start of the document.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value;
      setIsEmpty(!editor.textContent?.trim());
    }
  }, [value]);

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsEmpty(!editor.textContent?.trim());
    onChange(editor.innerHTML);
  }, [onChange]);

  const exec = useCallback(
    (command: string, argument?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, argument);
      emit();
    },
    [emit],
  );

  const insertLink = useCallback(() => {
    const selection = window.getSelection();
    savedRange.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    setLinkUrl('');
    setLinkError(null);
    setLinkOpen(true);
  }, []);

  const confirmLink = useCallback(() => {
    const url = linkUrl.trim();
    if (!url) {
      setLinkError('Enter a URL');
      return;
    }

    // Only http(s) and mailto survive server-side sanitisation. Rejecting
    // anything else here means the author finds out now rather than wondering
    // why their link vanished on save.
    if (!/^(https?:|mailto:)/i.test(url)) {
      setLinkError('Links must start with http://, https:// or mailto:');
      return;
    }

    setLinkOpen(false);

    const range = savedRange.current;
    if (range) {
      editorRef.current?.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    exec('createLink', url);
    savedRange.current = null;
  }, [exec, linkUrl]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      exec('bold');
    } else if (key === 'i') {
      event.preventDefault();
      exec('italic');
    } else if (key === 'k') {
      event.preventDefault();
      insertLink();
    }
  };

  /**
   * Paste as plain text. Pasting from Word or a web page otherwise drags in
   * spans, inline styles and font tags that the sanitiser strips anyway —
   * leaving the author with a document that looked right until they saved it.
   */
  const onPaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <span id={labelId} className="block text-sm font-medium text-foreground">
          {label}
        </span>
      )}

      <div
        className={cn(
          'overflow-hidden rounded-[var(--radius-control)] bg-card hairline',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
          error && 'ring-1 ring-destructive',
        )}
      >
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1.5"
        >
          {ACTIONS.map((action, index) =>
            action === 'divider' ? (
              <span key={`divider-${index}`} className="mx-1 h-5 w-px bg-border" aria-hidden />
            ) : (
              <button
                key={action.label}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => exec(action.command, action.argument)}
                title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
                aria-label={action.label}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <action.icon className="size-4" aria-hidden />
              </button>
            ),
          )}

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertLink}
            title="Insert link (⌘K)"
            aria-label="Insert link"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <Link2 className="size-4" aria-hidden />
          </button>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => exec('undo')}
            title="Undo"
            aria-label="Undo"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => exec('redo')}
            title="Redo"
            aria-label="Redo"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <Redo2 className="size-4" aria-hidden />
          </button>
        </div>

        <div className="relative">
          {isEmpty && (
            <span className="pointer-events-none absolute top-4 left-4 text-sm text-muted-foreground/70" aria-hidden>
              {placeholder}
            </span>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-labelledby={label ? labelId : undefined}
            aria-invalid={Boolean(error) || undefined}
            onInput={emit}
            onBlur={emit}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            style={{ minHeight }}
            className="prose-editorial max-w-none overflow-y-auto p-4 text-sm outline-none scroll-slim"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Formatting is limited to what the site renders. Pasted text arrives unformatted by design.
      </p>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <Dialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Insert link"
        description="The selected text becomes the link."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmLink}>Insert link</Button>
          </>
        }
      >
        <Field label="URL" required error={linkError ?? undefined}>
          {({ id, invalid }) => (
            <Input
              id={id}
              // Not type="url": the browser's own validation bubble would fight
              // the inline error, and mailto: is rejected by some engines.
              type="text"
              inputMode="url"
              autoFocus
              invalid={invalid}
              value={linkUrl}
              placeholder="https://example.com"
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                confirmLink();
              }}
            />
          )}
        </Field>
      </Dialog>
    </div>
  );
}
