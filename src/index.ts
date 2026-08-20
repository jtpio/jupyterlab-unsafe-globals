// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';

import { createClassicNamespace, IClassicNamespace } from './namespace';

/**
 * Expose the classic Notebook globals (Jupyter, IPython) on the window.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-unsafe-globals:plugin',
  description:
    'Expose the classic Notebook globals (Jupyter, IPython) on the window, for JupyterLab and Jupyter Notebook',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    const win = window as unknown as {
      Jupyter?: IClassicNamespace;
      IPython?: IClassicNamespace;
    };
    if (win.Jupyter !== undefined || win.IPython !== undefined) {
      console.warn(
        'jupyterlab-unsafe-globals: window.Jupyter or window.IPython is already defined, not overriding it'
      );
      // keep the classic alias invariant when only one name is taken
      if (win.Jupyter === undefined) {
        win.Jupyter = win.IPython;
      } else if (win.IPython === undefined) {
        win.IPython = win.Jupyter;
      }
      return;
    }
    const jupyter = createClassicNamespace(app, tracker);
    win.Jupyter = jupyter;
    // the classic notebook exposed IPython as a plain alias of Jupyter
    win.IPython = jupyter;
    console.log(
      'jupyterlab-unsafe-globals: window.Jupyter and window.IPython are now available'
    );
  }
};

export default plugin;
export { IClassicNamespace } from './namespace';
export { NotebookShim, CellShim } from './notebook';
export { KernelShim } from './kernel';
export { CommManagerShim, CommShim } from './comm';
export { EventsShim } from './events';
export { SessionShim } from './session';
export { ContentsShim } from './contents';
export {
  ActionHandlerShim,
  KeyboardManagerShim,
  ShortcutManagerShim,
  translateShortcut
} from './keyboard';
export { ToolbarShim } from './toolbar';
export { OutputAreaShim, convertOutputMsg } from './outputarea';
export { CodeMirrorShim } from './codemirror';
export { dialog, modal } from './dialog';
