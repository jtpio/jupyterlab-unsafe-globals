/**
 * Handler signature of the classic events object, following the jQuery
 * convention: handlers receive an event object first and the data second.
 */
export type ClassicEventHandler = (event: { type: string }, data?: any) => void;

/**
 * Events emitted by this shim. Registering a handler for any other classic
 * event name is accepted but the handler will never fire.
 */
const EMITTED_EVENTS = [
  'notebook_loaded.Notebook',
  'kernel_ready.Kernel',
  'kernel_busy.Kernel',
  'kernel_idle.Kernel',
  'select.Cell',
  'set_dirty.Notebook'
];

/**
 * Minimal replica of the classic notebook `events` object.
 *
 * Event names are matched as literal strings, including the jQuery
 * namespace suffix (e.g. 'notebook_loaded.Notebook').
 */
export class EventsShim {
  on(name: string, handler: ClassicEventHandler): void {
    if (!EMITTED_EVENTS.includes(name) && !this._warned.has(name)) {
      this._warned.add(name);
      console.warn(
        `jupyterlab-unsafe-globals: the event '${name}' is never emitted by this shim`
      );
    }
    let handlers = this._handlers.get(name);
    if (!handlers) {
      handlers = new Set();
      this._handlers.set(name, handlers);
    }
    handlers.add(handler);
  }

  one(name: string, handler: ClassicEventHandler): void {
    const wrapper: ClassicEventHandler = (event, data) => {
      this.off(name, wrapper);
      handler(event, data);
    };
    this.on(name, wrapper);
  }

  off(name: string, handler?: ClassicEventHandler): void {
    if (!handler) {
      this._handlers.delete(name);
      return;
    }
    this._handlers.get(name)?.delete(handler);
  }

  trigger(name: string, data?: any): void {
    const handlers = this._handlers.get(name);
    if (!handlers) {
      return;
    }
    for (const handler of [...handlers]) {
      try {
        handler({ type: name }, data);
      } catch (error) {
        console.error(
          `jupyterlab-unsafe-globals: error in handler for '${name}'`,
          error
        );
      }
    }
  }

  private _handlers = new Map<string, Set<ClassicEventHandler>>();
  private _warned = new Set<string>();
}
