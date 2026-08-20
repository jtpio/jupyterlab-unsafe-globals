// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/**
 * Handler signature of the classic events object, following the jQuery
 * convention: handlers receive an event object first and the data after.
 * Array payloads are spread over multiple arguments, like jQuery did.
 */
export type ClassicEventHandler = (
  event: { type: string },
  ...data: any[]
) => void;

/**
 * Get the singleton classic events object.
 */
export function getEventsShim(): EventsShim {
  return Private.getOrCreate();
}

/**
 * Minimal replica of the classic notebook `events` object.
 *
 * Event names are matched as literal strings, including the jQuery
 * namespace suffix (e.g. `'notebook_loaded.Notebook'`). A whitespace
 * separated list registers each name, like jQuery.
 */
export class EventsShim {
  /**
   * Register a handler for one or more events.
   *
   * @param name - The full event name(s), e.g. `'kernel_idle.Kernel'`
   * @param handler - The callback to invoke when the event is triggered
   */
  on(name: string, handler: ClassicEventHandler): void {
    for (const event of Private.splitNames(name)) {
      this._warnIfNeverEmitted(event);
      let handlers = this._handlers.get(event);
      if (!handlers) {
        handlers = new Set();
        this._handlers.set(event, handlers);
      }
      handlers.add(handler);
    }
  }

  /**
   * Register a handler that is removed after its first invocation.
   *
   * @param name - The full event name(s)
   * @param handler - The callback to invoke once
   */
  one(name: string, handler: ClassicEventHandler): void {
    for (const event of Private.splitNames(name)) {
      const wrapper: ClassicEventHandler = (evt, ...data) => {
        this.off(event, wrapper);
        handler(evt, ...data);
      };
      this.on(event, wrapper);
    }
  }

  /**
   * Remove a handler, or all handlers for an event when none is given.
   *
   * @param name - The full event name(s)
   * @param handler - The callback to remove
   */
  off(name: string, handler?: ClassicEventHandler): void {
    for (const event of Private.splitNames(name)) {
      if (!handler) {
        this._handlers.delete(event);
        continue;
      }
      this._handlers.get(event)?.delete(handler);
    }
  }

  /**
   * Trigger an event, invoking all its handlers.
   *
   * @param name - The full event name
   * @param data - Optional data; an array is spread over the handler
   * arguments, like jQuery did
   */
  trigger(name: string, data?: any): void {
    const handlers = this._handlers.get(name);
    if (!handlers) {
      return;
    }
    const args = Array.isArray(data) ? data : data === undefined ? [] : [data];
    for (const handler of [...handlers]) {
      try {
        handler({ type: name }, ...args);
      } catch (error) {
        console.error(
          `jupyterlab-unsafe-globals: error in handler for '${name}'`,
          error
        );
      }
    }
  }

  /**
   * Warn once for a namespaced classic event this shim never emits.
   * Names without a namespace are extension-internal, and extensions
   * trigger those themselves.
   */
  private _warnIfNeverEmitted(name: string): void {
    if (
      /\.[A-Z]/.test(name) &&
      !Private.EMITTED_EVENTS.includes(name) &&
      !this._warned.has(name)
    ) {
      this._warned.add(name);
      console.warn(
        `jupyterlab-unsafe-globals: the event '${name}' is never emitted by this shim`
      );
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
   * Get or create the singleton events object.
   */
  export function getOrCreate(): EventsShim {
    if (!events) {
      events = new EventsShim();
    }
    return events;
  }

  let events: EventsShim | null = null;

  /**
   * Split a jQuery-style whitespace separated event name list.
   */
  export function splitNames(name: string): string[] {
    return name.split(/\s+/).filter(part => part.length > 0);
  }

  /**
   * The events emitted by this shim. Registering a handler for any other
   * namespaced classic event is accepted but the handler will never fire.
   */
  export const EMITTED_EVENTS = [
    'app_initialized.NotebookApp',
    'notebook_loading.Notebook',
    'notebook_loaded.Notebook',
    'notebook_saved.Notebook',
    'before_save.Notebook',
    'notebook_save_failed.Notebook',
    'notebook_renamed.Notebook',
    'set_dirty.Notebook',
    'trust_changed.Notebook',
    'command_mode.Notebook',
    'edit_mode.Notebook',
    'checkpoint_created.Notebook',
    'checkpoint_failed.Notebook',
    'checkpoints_listed.Notebook',
    'list_checkpoints_failed.Notebook',
    'notebook_restoring.Notebook',
    'checkpoint_restored.Notebook',
    'checkpoint_restore_failed.Notebook',
    'checkpoint_deleted.Notebook',
    'checkpoint_delete_failed.Notebook',
    'create.Cell',
    'delete.Cell',
    'select.Cell',
    'rendered.MarkdownCell',
    'execute.CodeCell',
    'finished_execute.CodeCell',
    'output_appended.OutputArea',
    'kernel_starting.Kernel',
    'kernel_connected.Kernel',
    'kernel_ready.Kernel',
    'kernel_busy.Kernel',
    'kernel_idle.Kernel',
    'kernel_restarting.Kernel',
    'kernel_autorestarting.Kernel',
    'kernel_dead.Kernel',
    'kernel_killed.Kernel'
  ];
}
