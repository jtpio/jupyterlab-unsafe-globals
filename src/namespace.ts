import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import { EventsShim } from './events';
import { getKernelShim } from './kernel';
import { getCellShim, NotebookShim } from './notebook';

/**
 * The classic namespace exposed as `window.Jupyter` and `window.IPython`.
 */
export interface IClassicNamespace {
  version: string;
  _target: string;
  app: JupyterFrontEnd;
  events: EventsShim;
  readonly notebook: NotebookShim | null;
}

/**
 * Build the classic namespace on top of the modern application APIs.
 *
 * `notebook` resolves the current widget of the notebook tracker at access
 * time, so it always points to the active notebook.
 */
export function createClassicNamespace(
  app: JupyterFrontEnd,
  tracker: INotebookTracker
): IClassicNamespace {
  const events = new EventsShim();
  wireEvents(events, tracker);
  const shims = new WeakMap<NotebookPanel, NotebookShim>();
  return {
    version: app.version,
    _target: '_blank',
    app,
    events,
    get notebook(): NotebookShim | null {
      const panel = tracker.currentWidget;
      if (!panel) {
        return null;
      }
      let shim = shims.get(panel);
      if (!shim) {
        shim = new NotebookShim(panel, events);
        shims.set(panel, shim);
      }
      return shim;
    }
  };
}

/**
 * Re-emit JupyterLab signals as the classic events. Every notebook panel
 * emits, which matches classic in Notebook (one document per page); in
 * JupyterLab events come from all open notebooks.
 */
function wireEvents(events: EventsShim, tracker: INotebookTracker): void {
  const wired = new WeakSet<NotebookPanel>();
  const wire = (panel: NotebookPanel): void => {
    if (wired.has(panel)) {
      return;
    }
    wired.add(panel);
    const kernelData = () => ({
      kernel: getKernelShim(panel.sessionContext)
    });
    void panel.context.ready.then(() => {
      events.trigger('notebook_loaded.Notebook');
    });
    // classic fired kernel_ready on every successful (re)connection
    if (
      panel.sessionContext.session?.kernel?.connectionStatus === 'connected'
    ) {
      events.trigger('kernel_ready.Kernel', kernelData());
    }
    panel.sessionContext.connectionStatusChanged.connect((sender, status) => {
      if (status === 'connected') {
        events.trigger('kernel_ready.Kernel', kernelData());
      }
    });
    panel.sessionContext.statusChanged.connect((sender, status) => {
      if (status === 'busy') {
        events.trigger('kernel_busy.Kernel', kernelData());
      } else if (status === 'idle') {
        events.trigger('kernel_idle.Kernel', kernelData());
      }
    });
    panel.content.activeCellChanged.connect((sender, cell) => {
      events.trigger('select.Cell', {
        cell: cell ? getCellShim(panel, cell) : null,
        extendSelection: false
      });
    });
    panel.model?.stateChanged.connect((sender, change) => {
      if (change.name === 'dirty') {
        events.trigger('set_dirty.Notebook', { value: change.newValue });
      }
    });
  };
  tracker.forEach(wire);
  tracker.widgetAdded.connect((sender, panel) => {
    wire(panel);
  });
}
