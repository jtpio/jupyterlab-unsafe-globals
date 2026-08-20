// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { NotebookPanel } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';

import { remap } from './keyboard';
import { getApp, getTracker } from './shimcontext';

/**
 * A classic toolbar button descriptor: an object, or a registered action
 * full name as a string.
 */
export interface IClassicToolbarButton {
  label?: string;
  icon?: string;
  help?: string;
  callback?: () => void;
  action?: string;
  id?: string;
}

/**
 * Get the singleton toolbar shim.
 */
export function getToolbarShim(): ToolbarShim {
  return Private.getOrCreate();
}

/**
 * Replica of the classic `Jupyter.toolbar`.
 *
 * Classic had one page-global toolbar; here each button group is added to
 * the toolbar of every open and future notebook panel.
 */
export class ToolbarShim {
  constructor() {
    const tracker = getTracker();
    tracker.forEach(panel => this._applyAll(panel));
    tracker.widgetAdded.connect((sender, panel) => {
      this._applyAll(panel);
    });
  }

  /**
   * Add a group of buttons to the notebook toolbars.
   *
   * @param group - The button descriptors, or registered action names
   * @param group_id - Optional DOM id for the group element
   * @returns The group element in the current notebook toolbar
   */
  add_buttons_group(
    group: (IClassicToolbarButton | string)[],
    group_id?: string
  ): HTMLElement | undefined {
    const entry = { group, group_id, name: Private.nextGroupName() };
    this._groups.push(entry);
    getTracker().forEach(panel => this._apply(panel, entry));
    const current = getTracker().currentWidget;
    return current ? this._nodes.get(current)?.get(entry.name) : undefined;
  }

  private _applyAll(panel: NotebookPanel): void {
    for (const entry of this._groups) {
      this._apply(panel, entry);
    }
  }

  private _apply(panel: NotebookPanel, entry: Private.IGroupEntry): void {
    let nodes = this._nodes.get(panel);
    if (!nodes) {
      nodes = new Map();
      this._nodes.set(panel, nodes);
    }
    if (nodes.has(entry.name)) {
      return;
    }
    const node = Private.buildGroup(
      entry,
      panel === getTracker().currentWidget
    );
    const widget = new Widget({ node });
    widget.addClass('jp-UnsafeGlobals-toolbarGroup');
    if (!panel.toolbar.insertBefore('kernelName', entry.name, widget)) {
      panel.toolbar.addItem(entry.name, widget);
    }
    nodes.set(entry.name, node);
  }

  private _groups: Private.IGroupEntry[] = [];
  private _nodes = new WeakMap<NotebookPanel, Map<string, HTMLElement>>();
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * Get or create the singleton toolbar shim.
   */
  export function getOrCreate(): ToolbarShim {
    if (!toolbar) {
      toolbar = new ToolbarShim();
    }
    return toolbar;
  }

  let toolbar: ToolbarShim | null = null;

  /**
   * Get a unique toolbar item name.
   */
  export function nextGroupName(): string {
    return `unsafe-globals-group-${groupCount++}`;
  }

  let groupCount = 0;

  /**
   * A registered button group, applied to every notebook panel.
   */
  export interface IGroupEntry {
    group: (IClassicToolbarButton | string)[];
    group_id?: string;
    name: string;
  }

  /**
   * Build the classic-styled DOM for a button group.
   * The `group_id` is only set on the current panel's copy, so that
   * `document.getElementById` stays unambiguous.
   */
  export function buildGroup(
    entry: IGroupEntry,
    isCurrent: boolean
  ): HTMLElement {
    const node = document.createElement('div');
    node.className = 'btn-group';
    if (entry.group_id && isCurrent) {
      node.id = entry.group_id;
    }
    for (const item of entry.group) {
      const button = typeof item === 'string' ? { action: item } : item;
      const el = document.createElement('button');
      el.className = 'btn btn-default';
      el.title = button.help ?? button.label ?? '';
      if (button.icon) {
        const icon = document.createElement('i');
        icon.className = 'fa ' + button.icon;
        el.appendChild(icon);
      }
      if (button.label) {
        el.appendChild(document.createTextNode(button.label));
      }
      if (button.id) {
        el.id = button.id;
      }
      el.addEventListener('click', () => {
        if (button.callback) {
          button.callback();
        } else if (button.action) {
          void getApp().commands.execute(remap(button.action));
        }
      });
      node.appendChild(el);
    }
    return node;
  }
}
