// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { NotebookActions } from '@jupyterlab/notebook';
import { Contents } from '@jupyterlab/services';

import { getApp, getTracker } from './shimcontext';

/**
 * Get the singleton contents shim.
 */
export function getContentsShim(): ContentsShim {
  return Private.getOrCreate();
}

/**
 * Replica of the classic contents service, backed by the JupyterLab
 * contents manager. Models use the same REST shapes as classic.
 */
export class ContentsShim {
  /**
   * Get a file or directory model.
   */
  get(path: string, options?: any): Promise<any> {
    return this._manager.get(path, options);
  }

  /**
   * Create a new untitled file or directory in a directory.
   */
  new_untitled(
    path: string,
    options?: { ext?: string; type?: string }
  ): Promise<any> {
    return this._manager.newUntitled({
      path,
      ext: options?.ext,
      type: options?.type as Contents.ContentType
    });
  }

  /**
   * Delete a file.
   */
  delete(path: string): Promise<void> {
    return this._manager.delete(path);
  }

  /**
   * Rename a file.
   */
  rename(path: string, new_path: string): Promise<any> {
    return this._manager.rename(path, new_path);
  }

  /**
   * Save a file model.
   */
  save(path: string, model: any): Promise<any> {
    return this._manager.save(path, model);
  }

  /**
   * Copy a file into a directory.
   */
  copy(from_file: string, to_dir: string): Promise<any> {
    return this._manager.copy(from_file, to_dir);
  }

  /**
   * Trust a notebook. Only works for notebooks open in the application;
   * classic trusted the file server side.
   */
  trust(path: string): Promise<void> {
    const panel = getTracker().find(widget => widget.context.path === path);
    if (!panel) {
      console.warn(
        `jupyterlab-unsafe-globals: cannot trust '${path}', the notebook is not open`
      );
      return Promise.resolve();
    }
    return NotebookActions.trust(panel.content).then(() => undefined);
  }

  /**
   * List the content of a directory.
   */
  list_contents(path: string): Promise<any> {
    return this._manager.get(path, { type: 'directory', content: true });
  }

  /**
   * Create a checkpoint for a file.
   */
  create_checkpoint(path: string): Promise<any> {
    return this._manager.createCheckpoint(path);
  }

  /**
   * List the checkpoints of a file.
   */
  list_checkpoints(path: string): Promise<any[]> {
    return this._manager.listCheckpoints(path);
  }

  /**
   * Restore a file to a checkpoint.
   */
  restore_checkpoint(path: string, checkpoint_id: string): Promise<void> {
    return this._manager.restoreCheckpoint(path, checkpoint_id);
  }

  /**
   * Delete a checkpoint of a file.
   */
  delete_checkpoint(path: string, checkpoint_id: string): Promise<void> {
    return this._manager.deleteCheckpoint(path, checkpoint_id);
  }

  private get _manager(): Contents.IManager {
    return getApp().serviceManager.contents;
  }
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * Get or create the singleton contents shim.
   */
  export function getOrCreate(): ContentsShim {
    if (!contents) {
      contents = new ContentsShim();
    }
    return contents;
  }

  let contents: ContentsShim | null = null;
}
