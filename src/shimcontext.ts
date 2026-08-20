// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';

/**
 * Store the application objects shared by all shims.
 *
 * @param app - The JupyterFrontEnd application
 * @param tracker - The notebook tracker
 */
export function initShimContext(
  app: JupyterFrontEnd,
  tracker: INotebookTracker
): void {
  Private.init(app, tracker);
}

/**
 * Get the JupyterFrontEnd application.
 */
export function getApp(): JupyterFrontEnd {
  if (!Private.app) {
    throw new Error('jupyterlab-unsafe-globals: the shims are not initialized');
  }
  return Private.app;
}

/**
 * Get the notebook tracker.
 */
export function getTracker(): INotebookTracker {
  if (!Private.tracker) {
    throw new Error('jupyterlab-unsafe-globals: the shims are not initialized');
  }
  return Private.tracker;
}

/**
 * The namespace for module private data.
 */
namespace Private {
  export let app: JupyterFrontEnd | null = null;
  export let tracker: INotebookTracker | null = null;

  /**
   * Store the shared application objects.
   */
  export function init(
    frontEnd: JupyterFrontEnd,
    notebooks: INotebookTracker
  ): void {
    app = frontEnd;
    tracker = notebooks;
  }
}
