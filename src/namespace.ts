// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd } from '@jupyterlab/application';
import { Cell, CodeCell, MarkdownCell } from '@jupyterlab/cells';
import { PageConfig, PathExt, URLExt } from '@jupyterlab/coreutils';
import { UUID } from '@lumino/coreutils';
import {
  INotebookTracker,
  Notebook,
  NotebookActions,
  NotebookPanel
} from '@jupyterlab/notebook';

import { ContentsShim, getContentsShim } from './contents';
import { dialog } from './dialog';
import { EventsShim, getEventsShim } from './events';
import { getKernelShim } from './kernel';
import {
  ActionHandlerShim,
  getKeyboardManagerShim,
  KeyboardManagerShim
} from './keyboard';
import {
  findCellShimByModelId,
  forgetCellShimByModelId,
  getCellShim,
  getNotebookShim,
  NotebookShim
} from './notebook';
import { getTracker, initShimContext } from './shimcontext';
import { getToolbarShim, ToolbarShim } from './toolbar';

/**
 * The classic namespace exposed as `window.Jupyter` and `window.IPython`.
 */
export interface IClassicNamespace {
  /**
   * The application version.
   */
  version: string;

  /**
   * The classic link target, always `'_blank'`.
   */
  _target: string;

  /**
   * The JupyterFrontEnd application. Not part of the classic API,
   * provided as an escape hatch.
   */
  app: JupyterFrontEnd;

  /**
   * The classic events object.
   */
  events: EventsShim;

  /**
   * The classic notebook object for the current notebook, or `null`
   * when no notebook is open.
   */
  readonly notebook: NotebookShim | null;

  /**
   * The classic keyboard manager.
   */
  keyboard_manager: KeyboardManagerShim;

  /**
   * The classic actions registry, deprecated alias of
   * `keyboard_manager.actions` like in classic.
   */
  readonly actions: ActionHandlerShim;

  /**
   * The classic toolbar.
   */
  toolbar: ToolbarShim;

  /**
   * The classic dialog module.
   */
  dialog: typeof dialog;

  /**
   * The classic contents service.
   */
  contents: ContentsShim;

  /**
   * The classic menubar subset used by nbconvert-style extensions.
   */
  menubar: any;

  /**
   * The pure helpers of the classic `utils` module.
   */
  utils: any;
}

/**
 * Build the classic namespace on top of the modern application APIs.
 *
 * The `notebook` property resolves the current widget of the notebook
 * tracker at access time, so it always points to the active notebook.
 *
 * @param app - The JupyterFrontEnd application
 * @param tracker - The notebook tracker
 * @returns The classic namespace object
 */
export function createClassicNamespace(
  app: JupyterFrontEnd,
  tracker: INotebookTracker
): IClassicNamespace {
  initShimContext(app, tracker);
  Private.wireEvents(app, tracker);
  return {
    version: app.version,
    _target: '_blank',
    app,
    events: getEventsShim(),
    keyboard_manager: getKeyboardManagerShim(),
    toolbar: getToolbarShim(),
    dialog,
    contents: getContentsShim(),
    menubar: Private.createMenubar(),
    utils: Private.createUtils(),
    get notebook(): NotebookShim | null {
      const panel = tracker.currentWidget;
      return panel ? getNotebookShim(panel) : null;
    },
    get actions(): ActionHandlerShim {
      Private.warnActionsOnce();
      return getKeyboardManagerShim().actions;
    }
  };
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * Warn once that `Jupyter.actions` is deprecated, like classic did.
   */
  export function warnActionsOnce(): void {
    if (!warnedActions) {
      warnedActions = true;
      console.warn(
        'jupyterlab-unsafe-globals: accessing "actions" is deprecated, use "keyboard_manager.actions"'
      );
    }
  }

  let warnedActions = false;

  /**
   * Build the classic menubar subset: the nbconvert URL helpers and the
   * actions alias.
   */
  export function createMenubar(): any {
    return {
      _new_window(url: string): void {
        window.open(url, '_blank');
      },
      _nbconvert(format: string, download = false): void {
        const panel = getTracker().currentWidget;
        if (!panel) {
          return;
        }
        const url =
          URLExt.join(
            PageConfig.getBaseUrl(),
            'nbconvert',
            format,
            URLExt.encodeParts(panel.context.path)
          ) + `?download=${download}`;
        const open = (): void => {
          window.open(url, '_blank');
        };
        if (panel.context.model.dirty) {
          void panel.context.save().then(open);
        } else {
          open();
        }
      },
      get actions(): ActionHandlerShim {
        return getKeyboardManagerShim().actions;
      }
    };
  }

  /**
   * Build the pure helpers of the classic `utils` module; the requirejs
   * loaders and ajax helpers are deliberately absent.
   */
  export function createUtils(): any {
    return {
      url_path_join: (...parts: string[]): string => URLExt.join(...parts),
      url_join_encode: (...parts: string[]): string =>
        URLExt.encodeParts(URLExt.join(...parts)),
      encode_uri_components: (uri: string): string => URLExt.encodeParts(uri),
      uuid: (): string => UUID.uuid4(),
      splitext: (path: string): [string, string] => {
        const ext = PathExt.extname(path);
        return [path.slice(0, path.length - ext.length), ext];
      }
    };
  }

  /**
   * Re-emit JupyterLab signals as the classic events. Every notebook
   * panel emits, which matches classic in Notebook (one document per
   * page); in JupyterLab events come from all open notebooks.
   */
  export function wireEvents(
    app: JupyterFrontEnd,
    tracker: INotebookTracker
  ): void {
    const events = getEventsShim();
    void app.restored.then(() => {
      events.trigger('app_initialized.NotebookApp');
    });
    NotebookActions.executionScheduled.connect((sender, args) => {
      const panel = findPanel(args.notebook);
      if (panel && args.cell.model.type === 'code') {
        events.trigger('execute.CodeCell', {
          cell: getCellShim(panel, args.cell)
        });
      }
    });
    NotebookActions.executed.connect((sender, args) => {
      const panel = findPanel(args.notebook);
      if (panel && args.cell.model.type === 'code') {
        events.trigger('finished_execute.CodeCell', {
          cell: getCellShim(panel, args.cell)
        });
      }
    });
    tracker.forEach(panel => {
      wirePanel(events, panel);
    });
    tracker.widgetAdded.connect((sender, panel) => {
      wirePanel(events, panel);
    });
  }

  const wiredPanels = new WeakSet<NotebookPanel>();
  const wiredCells = new WeakSet<Cell>();
  const lastTrusted = new WeakMap<NotebookPanel, boolean>();

  /**
   * Find the panel owning a notebook content widget.
   */
  function findPanel(notebook: Notebook): NotebookPanel | null {
    return getTracker().find(panel => panel.content === notebook) ?? null;
  }

  /**
   * Wire the per-panel classic events.
   */
  function wirePanel(events: EventsShim, panel: NotebookPanel): void {
    if (wiredPanels.has(panel)) {
      return;
    }
    wiredPanels.add(panel);
    const kernelData = (): any => ({
      kernel: getKernelShim(panel.sessionContext)
    });
    events.trigger('notebook_loading.Notebook');
    void panel.context.ready.then(() => {
      events.trigger('notebook_loaded.Notebook');
      for (const widget of panel.content.widgets) {
        wireCell(events, panel, widget);
        if (widget instanceof MarkdownCell && widget.rendered) {
          events.trigger('rendered.MarkdownCell', {
            cell: getCellShim(panel, widget)
          });
        }
      }
    });
    panel.context.saveState.connect((sender, state) => {
      if (state === 'started') {
        events.trigger('before_save.Notebook');
      } else if (state === 'completed') {
        events.trigger('notebook_saved.Notebook');
      } else if (state === 'failed') {
        events.trigger('notebook_save_failed.Notebook');
      }
    });
    panel.context.pathChanged.connect((sender, path) => {
      events.trigger(
        'notebook_renamed.Notebook',
        panel.context.contentsModel ?? { name: PathExt.basename(path), path }
      );
    });
    // classic fired kernel_connected on transport connect and
    // kernel_ready after the kernel info reply, on every (re)connection
    const announceKernel = (connected: boolean): void => {
      if (connected) {
        events.trigger('kernel_connected.Kernel', kernelData());
      }
      void panel.sessionContext.session?.kernel?.info?.then(() => {
        events.trigger('kernel_ready.Kernel', kernelData());
      });
    };
    if (
      panel.sessionContext.session?.kernel?.connectionStatus === 'connected'
    ) {
      announceKernel(false);
    }
    panel.sessionContext.connectionStatusChanged.connect((sender, status) => {
      if (status === 'connected') {
        announceKernel(true);
      }
    });
    panel.sessionContext.statusChanged.connect((sender, status) => {
      switch (status) {
        case 'busy':
          events.trigger('kernel_busy.Kernel', kernelData());
          break;
        case 'idle':
          events.trigger('kernel_idle.Kernel', kernelData());
          break;
        case 'starting':
          events.trigger('kernel_starting.Kernel', kernelData());
          break;
        case 'restarting':
          events.trigger('kernel_restarting.Kernel', kernelData());
          break;
        case 'autorestarting':
          events.trigger('kernel_restarting.Kernel', kernelData());
          events.trigger('kernel_autorestarting.Kernel', kernelData());
          break;
        case 'dead':
          events.trigger('kernel_dead.Kernel', kernelData());
          break;
        case 'terminating':
          events.trigger('kernel_killed.Kernel', kernelData());
          break;
      }
    });
    panel.content.activeCellChanged.connect((sender, cell) => {
      events.trigger('select.Cell', {
        cell: cell ? getCellShim(panel, cell) : null,
        extendSelection: false
      });
    });
    panel.content.stateChanged.connect((sender, change) => {
      if (change.name === 'mode') {
        events.trigger(
          change.newValue === 'edit'
            ? 'edit_mode.Notebook'
            : 'command_mode.Notebook'
        );
      }
    });
    panel.model?.stateChanged.connect((sender, change) => {
      if (change.name === 'dirty') {
        events.trigger('set_dirty.Notebook', { value: change.newValue });
      }
    });
    panel.model?.cells.changed.connect((sender, args) => {
      if (args.type === 'add') {
        args.newValues.forEach((model, i) => {
          // the change args can carry undefined entries
          if (!model) {
            return;
          }
          const index = args.newIndex + i;
          const announce = (widget: Cell): void => {
            wireCell(events, panel, widget);
            events.trigger('create.Cell', {
              cell: getCellShim(panel, widget),
              index
            });
          };
          const widget = panel.content.widgets.find(
            w => w.model.id === model.id
          );
          if (widget) {
            announce(widget);
            return;
          }
          // the widget may not exist yet at model-change time
          requestAnimationFrame(() => {
            const late = panel.content.widgets.find(
              w => w.model.id === model.id
            );
            if (late) {
              announce(late);
            }
          });
        });
      } else if (args.type === 'remove') {
        args.oldValues.forEach((model, i) => {
          // the removed models can be undefined or already disposed
          const id = model?.id;
          events.trigger('delete.Cell', {
            cell: id ? (findCellShimByModelId(id) ?? null) : null,
            index: args.oldIndex + i
          });
          if (id) {
            forgetCellShimByModelId(id);
          }
        });
      }
    });
  }

  /**
   * Wire the per-cell classic events.
   */
  function wireCell(
    events: EventsShim,
    panel: NotebookPanel,
    widget: Cell
  ): void {
    if (wiredCells.has(widget)) {
      return;
    }
    wiredCells.add(widget);
    if (widget instanceof MarkdownCell) {
      widget.renderedChanged.connect((sender, rendered) => {
        if (rendered) {
          events.trigger('rendered.MarkdownCell', {
            cell: getCellShim(panel, widget)
          });
        }
      });
    }
    if (widget instanceof CodeCell) {
      widget.model.stateChanged.connect((sender, change) => {
        if (change.name === 'trusted') {
          const trusted = getNotebookShim(panel).trusted;
          if (lastTrusted.get(panel) !== trusted) {
            lastTrusted.set(panel, trusted);
            events.trigger('trust_changed.Notebook', trusted);
          }
        }
      });
      widget.model.outputs.changed.connect((sender, args) => {
        if (args.type !== 'add') {
          return;
        }
        // wait a frame so the output widget is rendered
        requestAnimationFrame(() => {
          for (const output of args.newValues) {
            const json = output.toJSON() as any;
            const [type, value] = pickDisplayData(json);
            const last =
              widget.outputArea.widgets[widget.outputArea.widgets.length - 1];
            events.trigger('output_appended.OutputArea', [
              type,
              value,
              json.metadata ?? {},
              last?.node ?? null
            ]);
          }
        });
      });
    }
  }

  /**
   * Pick the classic display mime type and value of an nbformat output.
   */
  function pickDisplayData(output: any): [string, any] {
    if (output.output_type === 'stream') {
      return ['text/plain', output.text];
    }
    if (output.output_type === 'error') {
      return ['text/plain', (output.traceback ?? []).join('\n')];
    }
    const data = output.data ?? {};
    const preferred = [
      'text/html',
      'image/svg+xml',
      'image/png',
      'image/jpeg',
      'text/latex',
      'application/javascript',
      'text/plain'
    ];
    const mime = preferred.find(m => m in data) ?? Object.keys(data)[0];
    return [mime ?? 'text/plain', mime ? data[mime] : ''];
  }
}
