import { EventsShim } from '../events';
import { KernelShim } from '../kernel';

describe('EventsShim', () => {
  let events: EventsShim;

  beforeEach(() => {
    events = new EventsShim();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call handlers with the jQuery convention', () => {
    const handler = jest.fn();
    events.on('kernel_idle.Kernel', handler);
    events.trigger('kernel_idle.Kernel', { value: 42 });
    expect(handler).toHaveBeenCalledWith(
      { type: 'kernel_idle.Kernel' },
      { value: 42 }
    );
  });

  it('should fire a one() handler only once', () => {
    const handler = jest.fn();
    events.one('kernel_ready.Kernel', handler);
    events.trigger('kernel_ready.Kernel');
    events.trigger('kernel_ready.Kernel');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should remove handlers with off()', () => {
    const handler = jest.fn();
    events.on('select.Cell', handler);
    events.off('select.Cell', handler);
    events.trigger('select.Cell');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove all handlers with off(name)', () => {
    const a = jest.fn();
    const b = jest.fn();
    events.on('select.Cell', a);
    events.on('select.Cell', b);
    events.off('select.Cell');
    events.trigger('select.Cell');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('should warn once for events that are never emitted', () => {
    events.on('execute.CodeCell', jest.fn());
    events.on('execute.CodeCell', jest.fn());
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('should keep calling handlers when one throws', () => {
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    events.on('set_dirty.Notebook', bad);
    events.on('set_dirty.Notebook', good);
    events.trigger('set_dirty.Notebook', { value: true });
    expect(good).toHaveBeenCalled();
  });
});

describe('KernelShim', () => {
  interface IFakeFuture {
    msg: any;
    onIOPub: (msg: any) => void;
    onReply: (msg: any) => void;
    onStdin: (msg: any) => void;
  }

  let future: IFakeFuture;
  let requested: any[];
  let inputReplies: any[];
  let shim: KernelShim;

  beforeEach(() => {
    future = {
      msg: { header: { msg_id: 'test-msg-id' } },
      onIOPub: () => undefined,
      onReply: () => undefined,
      onStdin: () => undefined
    };
    requested = [];
    inputReplies = [];
    const kernel = {
      id: 'kernel-id',
      name: 'python3',
      connectionStatus: 'connected',
      requestExecute: (content: any) => {
        requested.push(content);
        return future;
      },
      sendInputReply: (content: any, parentHeader: any) => {
        inputReplies.push({ content, parentHeader });
      }
    };
    const sessionContext = { session: { kernel } };
    shim = new KernelShim(sessionContext as any);
  });

  it('should return the msg_id synchronously', () => {
    expect(shim.execute('1 + 1')).toBe('test-msg-id');
  });

  it('should throw when there is no kernel', () => {
    const noKernel = new KernelShim({ session: null } as any);
    expect(() => noKernel.execute('1 + 1')).toThrow(/not connected/);
    expect(noKernel.is_connected()).toBe(false);
    expect(noKernel.is_fully_disconnected()).toBe(true);
  });

  it('should use the classic defaults', () => {
    shim.execute('1 + 1');
    expect(requested[0]).toEqual({
      code: '1 + 1',
      silent: true,
      store_history: false,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: true
    });
  });

  it('should let options override the defaults', () => {
    shim.execute('1 + 1', {}, { silent: false, store_history: true });
    expect(requested[0].silent).toBe(false);
    expect(requested[0].store_history).toBe(true);
  });

  it('should enable stdin when an input callback is given', () => {
    shim.execute('input()', { input: jest.fn() });
    expect(requested[0].allow_stdin).toBe(true);
  });

  it('should route iopub messages to the classic callbacks', () => {
    const output = jest.fn();
    const clearOutput = jest.fn();
    const status = jest.fn();
    shim.execute('print(1)', {
      iopub: { output, clear_output: clearOutput, status }
    });
    const stream = {
      header: { msg_type: 'stream' },
      content: { name: 'stdout', text: '1\n' }
    };
    future.onIOPub(stream);
    future.onIOPub({ header: { msg_type: 'clear_output' }, content: {} });
    future.onIOPub({
      header: { msg_type: 'status' },
      content: { execution_state: 'idle' }
    });
    future.onIOPub({ header: { msg_type: 'comm_msg' }, content: {} });
    expect(output).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith(stream);
    expect(clearOutput).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('should route the reply and its payloads', () => {
    const reply = jest.fn();
    const page = jest.fn();
    shim.execute('help', {
      shell: { reply, payload: { page } }
    });
    const msg = {
      header: { msg_type: 'execute_reply' },
      content: {
        status: 'ok',
        payload: [{ source: 'page', data: {} }]
      }
    };
    future.onReply(msg);
    expect(reply).toHaveBeenCalledWith(msg);
    expect(page).toHaveBeenCalledWith(msg.content.payload[0], msg);
  });

  it('should reply to the last input request', () => {
    const input = jest.fn();
    shim.execute('input()', { input });
    const request = {
      channel: 'stdin',
      header: { msg_type: 'input_request' },
      content: { prompt: '', password: false }
    };
    future.onStdin(request);
    expect(input).toHaveBeenCalledWith(request);
    shim.send_input_reply('an answer');
    expect(inputReplies[0]).toEqual({
      content: { status: 'ok', value: 'an answer' },
      parentHeader: request.header
    });
  });

  it('should report the connection state', () => {
    expect(shim.is_connected()).toBe(true);
    expect(shim.is_fully_disconnected()).toBe(false);
  });
});
