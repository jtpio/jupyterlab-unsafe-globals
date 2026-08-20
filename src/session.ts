// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PathExt } from '@jupyterlab/coreutils';
import { NotebookPanel } from '@jupyterlab/notebook';

import { getKernelShim, KernelShim } from './kernel';
import { getApp } from './shimcontext';

/**
 * Get the cached session shim for a notebook panel.
 */
export function getSessionShim(panel: NotebookPanel): SessionShim {
  let shim = Private.sessionShims.get(panel);
  if (!shim) {
    shim = new SessionShim(panel);
    Private.sessionShims.set(panel, shim);
  }
  return shim;
}

/**
 * Replica of the classic `Jupyter.notebook.session` object, backed by the
 * panel session context.
 */
export class SessionShim {
  /**
   * Construct a new session shim.
   */
  constructor(panel: NotebookPanel) {
    this._panel = panel;
  }

  /**
   * The session id, or `null` when there is no session.
   */
  get id(): string | null {
    return this._panel.sessionContext.session?.id ?? null;
  }

  /**
   * The kernel shim; identical to `Jupyter.notebook.kernel`, like in
   * classic.
   */
  get kernel(): KernelShim {
    return getKernelShim(this._panel.sessionContext);
  }

  /**
   * Shut the session down, classic style.
   *
   * @param success - Callback invoked when the shutdown succeeds
   * @param error - Callback invoked when the shutdown fails
   */
  delete(success?: () => void, error?: (err: any) => void): void {
    this._panel.sessionContext.shutdown().then(
      () => success?.(),
      err => (error ? error(err) : console.error(err))
    );
  }

  /**
   * Restart the session kernel, or change it when `options.kernel_name`
   * is given.
   */
  restart(
    options?: { kernel_name?: string },
    success?: () => void,
    error?: (err: any) => void
  ): void {
    const sessionContext = this._panel.sessionContext;
    const promise = options?.kernel_name
      ? sessionContext.changeKernel({ name: options.kernel_name })
      : sessionContext.restartKernel();
    promise.then(
      () => success?.(),
      err => (error ? error(err) : console.error(err))
    );
  }

  /**
   * List the running sessions; the callback receives the session models.
   */
  list(success?: (models: any[]) => void, error?: (err: any) => void): void {
    const sessions = getApp().serviceManager.sessions;
    sessions.refreshRunning().then(
      () => success?.([...sessions.running()]),
      err => (error ? error(err) : console.error(err))
    );
  }

  /**
   * Rename the notebook of this session.
   */
  rename_notebook(path: string): Promise<void> {
    return this._panel.context.rename(PathExt.basename(path));
  }

  private _panel: NotebookPanel;
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The session shim cache, one per notebook panel.
   */
  export const sessionShims = new WeakMap<NotebookPanel, SessionShim>();
}
