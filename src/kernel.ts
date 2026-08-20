// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISessionContext } from '@jupyterlab/apputils';
import { Kernel, KernelMessage } from '@jupyterlab/services';

import { CommManagerShim, getCommManagerShim } from './comm';
import { EventsShim, getEventsShim } from './events';

/**
 * Callbacks accepted by the classic `kernel.execute`, in the exact classic
 * shape. Every callback receives the whole raw Jupyter message, except
 * payload handlers which receive `(payload, msg)`.
 */
export interface IClassicExecuteCallbacks {
  shell?: {
    reply?: (msg: any) => void;
    payload?: { [source: string]: (payload: any, msg: any) => void };
  };
  iopub?: {
    output?: (msg: any) => void;
    clear_output?: (msg: any) => void;
    status?: (msg: any) => void;
  };
  input?: (msg: any) => void;
}

/**
 * Options accepted by the classic `kernel.execute`.
 */
export interface IClassicExecuteOptions {
  silent?: boolean;
  store_history?: boolean;
  stop_on_error?: boolean;
  user_expressions?: any;
  allow_stdin?: boolean;
}

/**
 * Route the messages of a kernel future to the classic callbacks.
 *
 * @param future - The kernel future to wire
 * @param callbacks - The classic callbacks
 * @param onInputRequest - Optional extra hook for `input_request` messages
 */
export function wireClassicCallbacks(
  future: Kernel.IFuture<any, any>,
  callbacks: IClassicExecuteCallbacks,
  onInputRequest?: (msg: KernelMessage.IInputRequestMsg) => void
): void {
  future.onIOPub = msg => {
    const msgType = msg.header.msg_type;
    if (msgType === 'clear_output') {
      callbacks.iopub?.clear_output?.(msg);
    } else if (msgType === 'status') {
      callbacks.iopub?.status?.(msg);
    } else if (Private.OUTPUT_MSG_TYPES.includes(msgType)) {
      callbacks.iopub?.output?.(msg);
    }
  };
  future.onReply = msg => {
    callbacks.shell?.reply?.(msg);
    const payloads = (msg.content as any).payload ?? [];
    for (const payload of payloads) {
      callbacks.shell?.payload?.[payload.source]?.(payload, msg);
    }
  };
  future.onStdin = msg => {
    if (KernelMessage.isInputRequestMsg(msg)) {
      onInputRequest?.(msg);
      callbacks.input?.(msg);
    }
  };
}

/**
 * Get the cached kernel shim for a session context.
 *
 * @param sessionContext - The session context of a notebook panel
 * @returns The kernel shim bound to the session context
 */
export function getKernelShim(sessionContext: ISessionContext): KernelShim {
  let shim = Private.kernelShims.get(sessionContext);
  if (!shim) {
    shim = new KernelShim(sessionContext);
    Private.kernelShims.set(sessionContext, shim);
  }
  return shim;
}

/**
 * Replica of the classic `Jupyter.notebook.kernel` object.
 *
 * The shim resolves the kernel connection from the session context at call
 * time, so a held reference stays valid across kernel restarts and swaps.
 */
export class KernelShim {
  /**
   * Construct a new kernel shim.
   *
   * @param sessionContext - The session context to resolve the kernel from
   */
  constructor(sessionContext: ISessionContext) {
    this._sessionContext = sessionContext;
    this._primeInfoReply();
    (sessionContext as any).kernelChanged?.connect?.(() => {
      this._primeInfoReply();
    });
  }

  /**
   * The kernel id, or an empty string when there is no kernel.
   */
  get id(): string {
    return this._kernel?.id ?? '';
  }

  /**
   * The kernel name, or an empty string when there is no kernel.
   */
  get name(): string {
    return this._kernel?.name ?? '';
  }

  /**
   * The kernel websocket URL.
   */
  get ws_url(): string {
    return this._kernel?.serverSettings?.wsUrl ?? '';
  }

  /**
   * The kernel connection username.
   */
  get username(): string {
    return this._kernel?.username ?? '';
  }

  /**
   * The per-connection client id, like the classic session id.
   */
  get session_id(): string {
    return this._kernel?.clientId ?? '';
  }

  /**
   * The classic events object.
   */
  get events(): EventsShim {
    return getEventsShim();
  }

  /**
   * The cached `kernel_info` reply content, classic style. Empty until
   * the kernel info arrives; refreshed on kernel changes.
   */
  get info_reply(): any {
    return this._infoReply;
  }

  /**
   * The classic comm manager.
   */
  get comm_manager(): CommManagerShim {
    return getCommManagerShim(this._sessionContext);
  }

  /**
   * Execute code on the kernel, classic style.
   *
   * Defaults match classic (`silent: true`, `store_history: false`,
   * `stop_on_error: true`), which differ from the JupyterLab
   * `requestExecute` defaults.
   *
   * @param code - The code to execute
   * @param callbacks - The classic callbacks to report results through
   * @param options - Overrides for the execute request content
   * @returns The `msg_id` of the execute request, synchronously
   */
  execute(
    code: string,
    callbacks: IClassicExecuteCallbacks = {},
    options: IClassicExecuteOptions = {}
  ): string {
    const kernel = this._requireKernel();
    const content: KernelMessage.IExecuteRequestMsg['content'] = {
      code,
      silent: true,
      store_history: false,
      user_expressions: {},
      allow_stdin: callbacks.input !== undefined,
      stop_on_error: true,
      ...options
    };
    const future = kernel.requestExecute(content);
    wireClassicCallbacks(future, callbacks, msg => {
      this._lastInputRequest = msg;
    });
    return future.msg.header.msg_id;
  }

  /**
   * Send a raw shell message, classic style.
   *
   * @param msg_type - The message type, e.g. `'complete_request'`
   * @param content - The message content
   * @param callbacks - The classic callbacks to report results through
   * @param metadata - Optional message metadata
   * @param buffers - Optional binary buffers
   * @returns The `msg_id` of the request, synchronously
   */
  send_shell_message(
    msg_type: string,
    content: any,
    callbacks: IClassicExecuteCallbacks = {},
    metadata?: any,
    buffers?: any[]
  ): string {
    const kernel = this._requireKernel();
    const msg = KernelMessage.createMessage({
      msgType: msg_type as any,
      channel: 'shell',
      username: kernel.username,
      session: kernel.clientId,
      content,
      metadata,
      buffers
    });
    const future = kernel.sendShellMessage(msg, true);
    wireClassicCallbacks(future, callbacks);
    return msg.header.msg_id;
  }

  /**
   * Request code completions; the callback receives the full
   * `complete_reply` message.
   */
  complete(
    code: string,
    cursor_pos: number,
    callback?: (msg: any) => void
  ): string {
    return this.send_shell_message(
      'complete_request',
      { code, cursor_pos },
      { shell: { reply: callback } }
    );
  }

  /**
   * Request code introspection; the callback receives the full
   * `inspect_reply` message.
   */
  inspect(
    code: string,
    cursor_pos: number,
    callback?: (msg: any) => void
  ): string {
    return this.send_shell_message(
      'inspect_request',
      { code, cursor_pos, detail_level: 0 },
      { shell: { reply: callback } }
    );
  }

  /**
   * Request the kernel info; the callback receives the full
   * `kernel_info_reply` message.
   */
  kernel_info(callback?: (msg: any) => void): string {
    return this.send_shell_message(
      'kernel_info_request',
      {},
      {
        shell: {
          reply: (msg: any) => {
            this._infoReply = msg.content;
            callback?.(msg);
          }
        }
      }
    );
  }

  /**
   * Request the open comms; the callback receives the full
   * `comm_info_reply` message.
   */
  comm_info(target_name?: string, callback?: (msg: any) => void): string {
    return this.send_shell_message(
      'comm_info_request',
      target_name ? { target_name } : {},
      { shell: { reply: callback } }
    );
  }

  /**
   * Reply to the most recent `input_request`, classic style.
   *
   * @param input - The value to send back to the kernel
   */
  send_input_reply(input: string): void {
    const request = this._lastInputRequest;
    const kernel = this._kernel;
    if (!request || !kernel) {
      console.warn(
        'jupyterlab-unsafe-globals: no pending input request to reply to'
      );
      return;
    }
    kernel.sendInputReply({ status: 'ok', value: input }, request.header);
  }

  /**
   * Interrupt the kernel.
   *
   * @param success - Callback invoked when the interrupt succeeds
   * @param error - Callback invoked when the interrupt fails
   */
  interrupt(success?: () => void, error?: (err: any) => void): void {
    this._kernel
      ?.interrupt()
      .then(() => success?.())
      .catch(err => (error ? error(err) : console.error(err)));
  }

  /**
   * Restart the kernel.
   *
   * @param success - Callback invoked when the restart succeeds
   * @param error - Callback invoked when the restart fails
   */
  restart(success?: () => void, error?: (err: any) => void): void {
    this._kernel
      ?.restart()
      .then(() => success?.())
      .catch(err => (error ? error(err) : console.error(err)));
  }

  /**
   * Reconnect the kernel websocket connection.
   */
  reconnect(): void {
    void this._kernel?.reconnect();
  }

  /**
   * Whether the kernel connection is established.
   */
  is_connected(): boolean {
    return this._kernel?.connectionStatus === 'connected';
  }

  /**
   * Whether the kernel connection is permanently down.
   */
  is_fully_disconnected(): boolean {
    return (
      (this._kernel?.connectionStatus ?? 'disconnected') === 'disconnected'
    );
  }

  private get _kernel(): Kernel.IKernelConnection | null {
    return this._sessionContext.session?.kernel ?? null;
  }

  private _requireKernel(): Kernel.IKernelConnection {
    const kernel = this._kernel;
    if (!kernel) {
      throw new Error('kernel is not connected and cannot execute');
    }
    return kernel;
  }

  private _primeInfoReply(): void {
    void this._kernel?.info?.then(info => {
      this._infoReply = info;
    });
  }

  private _sessionContext: ISessionContext;
  private _lastInputRequest: KernelMessage.IInputRequestMsg | null = null;
  private _infoReply: any = {};
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The iopub message types routed to the classic `iopub.output` callback.
   */
  export const OUTPUT_MSG_TYPES = [
    'stream',
    'display_data',
    'update_display_data',
    'execute_result',
    'error'
  ];

  /**
   * The kernel shim cache, one per session context.
   */
  export const kernelShims = new WeakMap<ISessionContext, KernelShim>();
}
