// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/**
 * Handler signature of the classic events object, following the jQuery
 * convention: handlers receive an event object first and the data second.
 */
export type ClassicEventHandler = (event: { type: string }, data?: any) => void;

/**
 * Minimal replica of the classic notebook `events` object.
 *
 * Event names are matched as literal strings, including the jQuery
 * namespace suffix (e.g. `'notebook_loaded.Notebook'`).
 */
export class EventsShim {
  /**
   * Register a handler for an event.
   *
   * @param name - The full event name, e.g. `'kernel_idle.Kernel'`
   * @param handler - The callback to invoke when the event is triggered
   */
  on(name: string, handler: ClassicEventHandler): void {
    if (!Private.EMITTED_EVENTS.includes(name) && !this._warned.has(name)) {
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

  /**
   * Register a handler that is removed after its first invocation.
   *
   * @param name - The full event name
   * @param handler - The callback to invoke once
   */
  one(name: string, handler: ClassicEventHandler): void {
    const wrapper: ClassicEventHandler = (event, data) => {
      this.off(name, wrapper);
      handler(event, data);
    };
    this.on(name, wrapper);
  }

  /**
   * Remove a handler, or all handlers for an event when none is given.
   *
   * @param name - The full event name
   * @param handler - The callback to remove
   */
  off(name: string, handler?: ClassicEventHandler): void {
    if (!handler) {
      this._handlers.delete(name);
      return;
    }
    this._handlers.get(name)?.delete(handler);
  }

  /**
   * Trigger an event, invoking all its handlers.
   *
   * @param name - The full event name
   * @param data - Optional data passed as the second handler argument
   */
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

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The events emitted by this shim. Registering a handler for any other
   * classic event name is accepted but the handler will never fire.
   */
  export const EMITTED_EVENTS = [
    'notebook_loaded.Notebook',
    'kernel_ready.Kernel',
    'kernel_busy.Kernel',
    'kernel_idle.Kernel',
    'select.Cell',
    'set_dirty.Notebook'
  ];
}
