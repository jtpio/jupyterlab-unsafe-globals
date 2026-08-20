import { ISessionContext } from '@jupyterlab/apputils';
import { Kernel, KernelMessage } from '@jupyterlab/services';

/**
 * Callbacks accepted by the classic `kernel.execute`, in the exact classic
 * shape. Every callback receives the whole raw Jupyter message, except
 * payload handlers which receive (payload, msg).
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

const OUTPUT_MSG_TYPES = [
  'stream',
  'display_data',
  'update_display_data',
  'execute_result',
  'error'
];

const kernelShims = new WeakMap<ISessionContext, KernelShim>();

/**
 * Get the cached kernel shim for a session context.
 */
export function getKernelShim(sessionContext: ISessionContext): KernelShim {
  let shim = kernelShims.get(sessionContext);
  if (!shim) {
    shim = new KernelShim(sessionContext);
    kernelShims.set(sessionContext, shim);
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
  constructor(sessionContext: ISessionContext) {
    this._sessionContext = sessionContext;
  }

  get id(): string {
    return this._kernel?.id ?? '';
  }

  get name(): string {
    return this._kernel?.name ?? '';
  }

  /**
   * Execute code on the kernel, classic style: returns the msg_id string
   * synchronously and reports results through the callbacks.
   *
   * Defaults match classic (silent: true, store_history: false,
   * stop_on_error left to the kernel default of true), which differ from
   * the JupyterLab `requestExecute` defaults.
   */
  execute(
    code: string,
    callbacks: IClassicExecuteCallbacks = {},
    options: IClassicExecuteOptions = {}
  ): string {
    const kernel = this._kernel;
    if (!kernel) {
      throw new Error('kernel is not connected and cannot execute');
    }
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
    future.onIOPub = msg => {
      const msgType = msg.header.msg_type;
      if (msgType === 'clear_output') {
        callbacks.iopub?.clear_output?.(msg);
      } else if (msgType === 'status') {
        callbacks.iopub?.status?.(msg);
      } else if (OUTPUT_MSG_TYPES.includes(msgType)) {
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
        this._lastInputRequest = msg;
        callbacks.input?.(msg);
      }
    };
    return future.msg.header.msg_id;
  }

  /**
   * Reply to the most recent input_request, classic style.
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

  interrupt(success?: () => void, error?: (err: any) => void): void {
    this._kernel
      ?.interrupt()
      .then(() => success?.())
      .catch(err => (error ? error(err) : console.error(err)));
  }

  restart(success?: () => void, error?: (err: any) => void): void {
    this._kernel
      ?.restart()
      .then(() => success?.())
      .catch(err => (error ? error(err) : console.error(err)));
  }

  reconnect(): void {
    void this._kernel?.reconnect();
  }

  is_connected(): boolean {
    return this._kernel?.connectionStatus === 'connected';
  }

  is_fully_disconnected(): boolean {
    return (
      (this._kernel?.connectionStatus ?? 'disconnected') === 'disconnected'
    );
  }

  private get _kernel(): Kernel.IKernelConnection | null {
    return this._sessionContext.session?.kernel ?? null;
  }

  private _sessionContext: ISessionContext;
  private _lastInputRequest: KernelMessage.IInputRequestMsg | null = null;
}
