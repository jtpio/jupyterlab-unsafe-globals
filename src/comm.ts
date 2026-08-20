// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISessionContext } from '@jupyterlab/apputils';
import { Kernel } from '@jupyterlab/services';

import { IClassicExecuteCallbacks, wireClassicCallbacks } from './kernel';

/**
 * Get the cached comm manager shim for a session context.
 *
 * @param sessionContext - The session context of a notebook panel
 */
export function getCommManagerShim(
  sessionContext: ISessionContext
): CommManagerShim {
  let shim = Private.commManagers.get(sessionContext);
  if (!shim) {
    shim = new CommManagerShim(sessionContext);
    Private.commManagers.set(sessionContext, shim);
  }
  return shim;
}

/**
 * Replica of the classic `Comm` object, backed by a JupyterLab comm.
 *
 * The classic argument order `(data, callbacks, metadata, buffers)` is
 * preserved; every method returns the request `msg_id` synchronously.
 */
export class CommShim {
  /**
   * Construct a new comm shim over a JupyterLab comm.
   */
  constructor(comm: Kernel.IComm) {
    this.comm = comm;
  }

  /**
   * The underlying JupyterLab comm. Not part of the classic API,
   * provided as an escape hatch.
   */
  readonly comm: Kernel.IComm;

  /**
   * The comm id.
   */
  get comm_id(): string {
    return this.comm.commId;
  }

  /**
   * The comm target name.
   */
  get target_name(): string {
    return this.comm.targetName;
  }

  /**
   * Open the comm on the kernel side.
   */
  open(
    data?: any,
    callbacks?: IClassicExecuteCallbacks,
    metadata?: any,
    buffers?: any[]
  ): string {
    const future = this.comm.open(data, metadata, buffers);
    wireClassicCallbacks(future, callbacks ?? {});
    return future.msg.header.msg_id;
  }

  /**
   * Send a message over the comm.
   */
  send(
    data: any,
    callbacks?: IClassicExecuteCallbacks,
    metadata?: any,
    buffers?: any[]
  ): string {
    const future = this.comm.send(data, metadata, buffers, false);
    wireClassicCallbacks(future, callbacks ?? {});
    return future.msg.header.msg_id;
  }

  /**
   * Close the comm.
   */
  close(
    data?: any,
    callbacks?: IClassicExecuteCallbacks,
    metadata?: any,
    buffers?: any[]
  ): string {
    const future = this.comm.close(data, metadata, buffers);
    wireClassicCallbacks(future, callbacks ?? {});
    return future.msg.header.msg_id;
  }

  /**
   * Register the handler for `comm_msg` messages; it receives the whole
   * raw Jupyter message, like in classic.
   */
  on_msg(callback: (msg: any) => void): void {
    this.comm.onMsg = msg => {
      try {
        callback(msg);
      } catch (error) {
        console.error(error);
      }
    };
  }

  /**
   * Register the handler for the `comm_close` message.
   */
  on_close(callback: (msg: any) => void): void {
    this.comm.onClose = msg => {
      try {
        callback(msg);
      } catch (error) {
        console.error(error);
      }
    };
  }
}

/**
 * Replica of the classic `kernel.comm_manager`.
 *
 * Targets registered here survive kernel swaps: they are re-registered
 * on the new kernel connection automatically.
 */
export class CommManagerShim {
  /**
   * Construct a new comm manager shim.
   */
  constructor(sessionContext: ISessionContext) {
    this._sessionContext = sessionContext;
    (sessionContext as any).kernelChanged?.connect?.(() => {
      this.comms = {};
      for (const [name, wrapped] of this._wrapped) {
        this._kernel?.registerCommTarget(name, wrapped);
      }
    });
  }

  /**
   * The open comms, keyed by comm id, as promises like in classic.
   */
  comms: { [commId: string]: Promise<CommShim> } = {};

  /**
   * The registered target functions, keyed by target name.
   */
  targets: { [targetName: string]: (comm: CommShim, msg: any) => void } = {};

  /**
   * Register a handler for kernel-opened comms on a target.
   *
   * @param target_name - The comm target name
   * @param f - Called with `(comm, comm_open_msg)` for each new comm
   */
  register_target(
    target_name: string,
    f: (comm: CommShim, msg: any) => void
  ): void {
    if (target_name === 'jupyter.widget') {
      console.warn(
        'jupyterlab-unsafe-globals: registering the jupyter.widget target may conflict with ipywidgets'
      );
    }
    const wrapped = (comm: Kernel.IComm, msg: any): void => {
      const shim = new CommShim(comm);
      this.comms[comm.commId] = Promise.resolve(shim);
      f(shim, msg);
    };
    this.targets[target_name] = f;
    this._wrapped.set(target_name, wrapped);
    this._kernel?.registerCommTarget(target_name, wrapped);
  }

  /**
   * Unregister a comm target; the second classic argument is ignored,
   * like in classic.
   */
  unregister_target(target_name: string): void {
    const wrapped = this._wrapped.get(target_name);
    if (wrapped) {
      this._kernel?.removeCommTarget(target_name, wrapped);
      this._wrapped.delete(target_name);
    }
    delete this.targets[target_name];
  }

  /**
   * Open a new comm to the kernel, classic style.
   *
   * @returns The comm shim, synchronously
   */
  new_comm(
    target_name: string,
    data?: any,
    callbacks?: IClassicExecuteCallbacks,
    metadata?: any,
    comm_id?: string,
    buffers?: any[]
  ): CommShim {
    const kernel = this._kernel;
    if (!kernel) {
      throw new Error('kernel is not connected and cannot open a comm');
    }
    const shim = new CommShim(kernel.createComm(target_name, comm_id));
    this.comms[shim.comm_id] = Promise.resolve(shim);
    shim.open(data, callbacks, metadata, buffers);
    return shim;
  }

  /**
   * Track a comm, classic bookkeeping.
   */
  register_comm(comm: CommShim): string {
    this.comms[comm.comm_id] = Promise.resolve(comm);
    return comm.comm_id;
  }

  /**
   * Stop tracking a comm, classic bookkeeping.
   */
  unregister_comm(comm: CommShim): void {
    delete this.comms[comm.comm_id];
  }

  private get _kernel(): Kernel.IKernelConnection | null {
    return this._sessionContext.session?.kernel ?? null;
  }

  private _sessionContext: ISessionContext;
  private _wrapped = new Map<string, (comm: Kernel.IComm, msg: any) => void>();
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The comm manager cache, one per session context.
   */
  export const commManagers = new WeakMap<ISessionContext, CommManagerShim>();
}
