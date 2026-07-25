import { useEffect, useMemo, useState } from 'preact/hooks';
import * as v from 'valibot';
import { Content } from './components/Content';
import { Footer } from './components/Footer';
import { FilterBar } from './components/FilterBar';
import { ContextMenu } from './components/ContextMenu';
import { CookieForm, type FormValues } from './components/CookieForm';
import { Resizers } from './components/Resizers';
import { Toasts } from './components/Toasts';
import { useCookies } from './hooks/useCookies';
import { useToasts } from './hooks/useToasts';
import { useColumnResize } from './hooks/useColumnResize';
import { useSettings } from './hooks/useSettings';
import { useSelection } from './hooks/useSelection';
import { buildExportFilename, sortCookies } from './util';
import { CookieImportSchema } from '../shared/cookie-schema';
import { t } from './i18n';
import type { Socket } from './socket';
import type { SortColumn, SortState, UICookie } from './types';

interface MenuState {
  x: number;
  y: number;
  cookie: UICookie | null;
}

interface EditorState {
  initial: UICookie;
  isNew: boolean;
}

interface Props {
  socket: Socket;
}

export function App({ socket }: Props) {
  const { cookies, refresh, create, remove, removeMany, removeAll, update, importAll } =
    useCookies(socket);
  const { widths, resize } = useColumnResize();
  const { settings, setSetting } = useSettings();
  const { toasts, showToast, dismissToast } = useToasts();
  const [sort, setSort] = useState<SortState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [filter, setFilter] = useState('');

  const sorted = useMemo(
    () => (sort ? sortCookies(cookies, sort.column, sort.dir) : cookies),
    [cookies, sort],
  );

  const visible = useMemo(() => {
    if (!settings.showFilterBar) return sorted;
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => {
      switch (settings.filterBy) {
        case 'value':
          return c.value.toLowerCase().includes(q);
        case 'name-value':
          return c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q);
        case 'name':
        default:
          return c.name.toLowerCase().includes(q);
      }
    });
  }, [sorted, settings.showFilterBar, settings.filterBy, filter]);

  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const { selectedIds, clearSelection, prepareContextMenu, onRowClick } = useSelection(
    visibleIds,
    !menu && !editor,
  );

  useEffect(() => {
    document.body.classList.toggle('filter-bar-visible', settings.showFilterBar);
  }, [settings.showFilterBar]);

  const onSort = (col: SortColumn) => {
    setSort((prev) => {
      if (!prev || prev.column !== col) return { column: col, dir: 'asc' };
      return { column: col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const openMenuFor = (e: MouseEvent, cookie: UICookie | null) => {
    e.stopPropagation();
    e.preventDefault();
    prepareContextMenu(cookie?.id ?? null);
    setMenu({ x: e.clientX, y: e.clientY, cookie });
  };

  const openEditorFor = (cookie: UICookie, isNew = false) => {
    setEditor({ initial: cookie, isNew });
  };

  const onAddNew = () => {
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    chrome.tabs.get(socket.tabId, (tab) => {
      let domain = '';
      const url = tab?.url;
      if (url) {
        try {
          domain = new URL(url).hostname;
        } catch {
          domain = '';
        }
      }
      const cookie: UICookie = {
        id: '',
        domain,
        expirationDate: oneYear.getTime() / 1000,
        hostOnly: false,
        httpOnly: false,
        name: '',
        path: '/',
        secure: false,
        session: false,
        value: '',
        sameSite: 'unspecified',
        storeId: '',
      };
      openEditorFor(cookie, true);
    });
  };

  const onSubmitForm = (values: FormValues) => {
    if (!editor) return;
    if (editor.isNew) {
      create(values);
    } else {
      update(editor.initial, values);
    }
    setEditor(null);
  };

  const exportCookies = (toExport: UICookie[]) => {
    chrome.tabs.get(socket.tabId, (tab) => {
      const a = document.createElement('a');
      const blob = new Blob([JSON.stringify(toExport, null, '  ')]);
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = buildExportFilename(tab?.url);
      a.click();
      showToast(t('cookiesExported', String(toExport.length)), 'info', 4500);
    });
  };

  const onExport = () => exportCookies(cookies);
  const onExportSelected = () =>
    exportCookies(visible.filter((c) => selectedIds.has(c.id)));

  const onImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const fr = new FileReader();
      fr.addEventListener('loadend', () => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(fr.result));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'invalid JSON';
          console.warn('cookie import: invalid JSON', err);
          window.alert(t('importInvalidJson', msg));
          return;
        }
        const result = v.safeParse(CookieImportSchema, raw);
        if (!result.success) {
          console.warn('cookie import: schema validation failed', result.issues);
          const summary = result.issues
            .slice(0, 3)
            .map((issue) => {
              const path = issue.path?.map((p) => p.key).join('.') ?? '';
              return path ? `${path}: ${issue.message}` : issue.message;
            })
            .join('\n');
          const more =
            result.issues.length > 3 ? t('importMoreIssues', String(result.issues.length - 3)) : '';
          window.alert(t('importSchemaFailed', summary) + more);
          return;
        }
        const confirmed = window.confirm(
          t('importConfirm', String(result.output.length)),
        );
        if (!confirmed) return;
        const toImport = result.output.map(({ id: _id, ...rest }) => {
          void _id;
          return rest;
        });
        importAll(toImport);
        showToast(t('cookiesImported', String(toImport.length)), 'info', 4500);
      });
      fr.readAsText(file);
    });
    input.click();
  };

  return (
    <>
      {settings.showFilterBar && (
        <FilterBar value={filter} filterBy={settings.filterBy} onChange={setFilter} />
      )}
      <Content
        cookies={visible}
        widths={widths}
        sort={sort}
        onSort={onSort}
        showCopyIcons={settings.showCopyIcons}
        selectedIds={selectedIds}
        onRowClick={(e, c) => onRowClick(e, c.id)}
        onFillerClick={clearSelection}
        onRowContextMenu={(e, c) => openMenuFor(e, c)}
        onFillerContextMenu={(e) => openMenuFor(e, null)}
        onRowDoubleClick={(c) => openEditorFor(c)}
      />
      <Footer
        count={visible.length}
        selectedCount={selectedIds.size}
        settings={settings}
        setSetting={setSetting}
      />
      <Resizers widths={widths} onResize={resize} />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          isInRow={!!menu.cookie}
          selectedCount={selectedIds.size}
          onDismiss={() => setMenu(null)}
          actions={{
            onAddNew,
            onEdit: () => menu.cookie && openEditorFor(menu.cookie),
            onRemove: () => {
              if (selectedIds.size > 1) {
                removeMany(visible.filter((c) => selectedIds.has(c.id)));
                clearSelection();
              } else if (menu.cookie) {
                remove(menu.cookie);
                clearSelection();
              }
            },
            onRemoveAll: removeAll,
            onExport,
            onExportSelected,
            onImport,
            onRefresh: refresh,
          }}
        />
      )}
      {editor && (
        <CookieForm
          key={editor.isNew ? 'new' : editor.initial.id}
          initial={editor.initial}
          isNew={editor.isNew}
          onSubmit={onSubmitForm}
          onCancel={() => setEditor(null)}
          showToast={showToast}
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
