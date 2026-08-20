// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Cell, CodeCell, MarkdownCell } from '@jupyterlab/cells';
import { PageConfig, PathExt } from '@jupyterlab/coreutils';
import { NotebookActions, NotebookPanel } from '@jupyterlab/notebook';

import { EventsShim } from './events';
import { getKernelShim, KernelShim } from './kernel';

/**
 * Get the cached shim for a cell widget.
 *
 * @param panel - The notebook panel containing the cell
 * @param widget - The cell widget to wrap
 * @returns The cell shim for the widget
 */
export function getCellShim(panel: NotebookPanel, widget: Cell): CellShim {
  let shim = Private.cellShims.get(widget);
  if (!shim) {
    shim = new CellShim(panel, widget);
    Private.cellShims.set(widget, shim);
  }
  return shim;
}

/**
 * Replica of the classic notebook cell objects, backed by a JupyterLab
 * cell widget.
 */
export class CellShim {
  /**
   * Construct a new cell shim.
   *
   * @param panel - The notebook panel containing the cell
   * @param widget - The cell widget to wrap
   */
  constructor(panel: NotebookPanel, widget: Cell) {
    this.widget = widget;
    this._panel = panel;
  }

  /**
   * The underlying JupyterLab cell widget. Not part of the classic API,
   * provided as an escape hatch.
   */
  readonly widget: Cell;

  /**
   * The cell type: `'code'`, `'markdown'` or `'raw'`.
   */
  get cell_type(): string {
    return this.widget.model.type;
  }

  /**
   * A live view on the cell metadata.
   */
  get metadata(): any {
    return Private.createMetadataProxy(this.widget.model.sharedModel);
  }

  /**
   * Whether a markdown cell is rendered; always `true` for other types.
   */
  get rendered(): boolean {
    if (this.widget instanceof MarkdownCell) {
      return this.widget.rendered;
    }
    return true;
  }

  /**
   * Get the cell source.
   */
  get_text(): string {
    return this.widget.model.sharedModel.getSource();
  }

  /**
   * Set the cell source.
   *
   * @param text - The new cell source
   */
  set_text(text: string): void {
    this.widget.model.sharedModel.setSource(text);
  }

  /**
   * Execute a code cell on the kernel, or render a markdown cell.
   */
  execute(): void {
    if (this.widget instanceof CodeCell) {
      void CodeCell.execute(this.widget, this._panel.sessionContext);
    } else {
      this.render();
    }
  }

  /**
   * Render a markdown cell; no-op for other types.
   */
  render(): void {
    if (this.widget instanceof MarkdownCell) {
      this.widget.rendered = true;
    }
  }

  /**
   * Make this cell the active cell of its notebook.
   */
  select(): void {
    const nb = this._panel.content;
    const index = nb.widgets.indexOf(this.widget);
    if (index !== -1) {
      nb.activeCellIndex = index;
      nb.deselectAll();
    }
  }

  /**
   * Select this cell and give it the focus in command mode.
   */
  focus_cell(): void {
    this.select();
    this._panel.content.mode = 'command';
    this.widget.node.focus();
  }

  private _panel: NotebookPanel;
}

/**
 * Replica of the classic `Jupyter.notebook` object, backed by a JupyterLab
 * notebook panel.
 */
export class NotebookShim {
  /**
   * Construct a new notebook shim.
   *
   * @param panel - The notebook panel to wrap
   * @param events - The shared classic events object
   */
  constructor(panel: NotebookPanel, events: EventsShim) {
    this.panel = panel;
    this.events = events;
  }

  /**
   * The underlying JupyterLab notebook panel. Not part of the classic API,
   * provided as an escape hatch.
   */
  readonly panel: NotebookPanel;

  /**
   * The same events object as `Jupyter.events`, like in classic.
   */
  readonly events: EventsShim;

  /**
   * Inert replica of the classic config: `config.loaded` resolves
   * immediately and `config.data` is empty, so extensions gating on it
   * proceed with their built-in defaults.
   */
  readonly config = {
    loaded: Promise.resolve(),
    data: {} as any,
    update: (): void => {
      console.warn('jupyterlab-unsafe-globals: notebook.config is inert');
    }
  };

  /**
   * The kernel shim, or `null` when the notebook has no kernel.
   */
  get kernel(): KernelShim | null {
    const sessionContext = this.panel.sessionContext;
    return sessionContext.session?.kernel
      ? getKernelShim(sessionContext)
      : null;
  }

  /**
   * The notebook file name, including the extension.
   */
  get notebook_name(): string {
    return PathExt.basename(this.panel.context.path);
  }

  /**
   * The notebook path relative to the server root.
   */
  get notebook_path(): string {
    return this.panel.context.path;
  }

  /**
   * The server base URL path, with a trailing slash.
   */
  get base_url(): string {
    return PageConfig.getOption('baseUrl');
  }

  /**
   * A live view on the notebook metadata.
   */
  get metadata(): any {
    return Private.createMetadataProxy(this.panel.model!.sharedModel);
  }

  /**
   * Whether the notebook has unsaved changes.
   */
  get dirty(): boolean {
    return this.panel.model?.dirty ?? false;
  }
  set dirty(value: boolean) {
    if (this.panel.model) {
      this.panel.model.dirty = value;
    }
  }

  /**
   * Whether every code cell of the notebook is trusted.
   */
  get trusted(): boolean {
    return this.panel.content.widgets.every(
      widget => widget.model.type !== 'code' || widget.model.trusted
    );
  }

  /**
   * Whether the notebook file is writable.
   */
  get writable(): boolean {
    return this.panel.context.contentsModel?.writable ?? false;
  }

  /**
   * The interaction mode: `'command'` or `'edit'`.
   */
  get mode(): string {
    return this.panel.content.mode;
  }

  /**
   * Whether the notebook is fully loaded, classic style.
   */
  get _fully_loaded(): boolean {
    return this.panel.context.isReady;
  }

  /**
   * Get all cells as classic cell objects.
   */
  get_cells(): CellShim[] {
    return this.panel.content.widgets.map(widget =>
      getCellShim(this.panel, widget)
    );
  }

  /**
   * Get the cell at the given index, or `null` when out of range.
   *
   * @param index - The cell index
   */
  get_cell(index: number): CellShim | null {
    const widget = this.panel.content.widgets[index];
    return widget ? getCellShim(this.panel, widget) : null;
  }

  /**
   * Get the active cell, or `null` when there is none.
   */
  get_selected_cell(): CellShim | null {
    const widget = this.panel.content.activeCell;
    return widget ? getCellShim(this.panel, widget) : null;
  }

  /**
   * Get the index of the active cell.
   */
  get_selected_index(): number {
    return this.panel.content.activeCellIndex;
  }

  /**
   * Get the selected cells, including the active cell.
   */
  get_selected_cells(): CellShim[] {
    const nb = this.panel.content;
    return nb.widgets
      .filter(widget => nb.isSelectedOrActive(widget))
      .map(widget => getCellShim(this.panel, widget));
  }

  /**
   * Get the indices of the selected cells, including the active cell.
   */
  get_selected_cells_indices(): number[] {
    const nb = this.panel.content;
    const indices: number[] = [];
    nb.widgets.forEach((widget, index) => {
      if (nb.isSelectedOrActive(widget)) {
        indices.push(index);
      }
    });
    return indices;
  }

  /**
   * Get the index of a cell, or `null` when it is not in this notebook.
   *
   * @param cell - The cell shim to locate
   */
  find_cell_index(cell: CellShim): number | null {
    const index = this.panel.content.widgets.indexOf(cell.widget);
    return index === -1 ? null : index;
  }

  /**
   * Get the number of cells.
   */
  ncells(): number {
    return this.panel.content.widgets.length;
  }

  /**
   * Make the cell at the given index the active cell.
   *
   * @param index - The cell index
   * @returns This notebook shim, for chaining
   */
  select(index: number): NotebookShim {
    const nb = this.panel.content;
    if (index >= 0 && index < nb.widgets.length) {
      nb.activeCellIndex = index;
      nb.deselectAll();
    }
    return this;
  }

  /**
   * Select the cell after the active cell.
   *
   * @returns This notebook shim, for chaining
   */
  select_next(): NotebookShim {
    return this.select(this.panel.content.activeCellIndex + 1);
  }

  /**
   * Select the cell before the active cell.
   *
   * @returns This notebook shim, for chaining
   */
  select_prev(): NotebookShim {
    return this.select(this.panel.content.activeCellIndex - 1);
  }

  /**
   * Insert a cell at the given index.
   *
   * @param type - The cell type, defaults to `'code'`
   * @param index - The insertion index, clamped to the notebook size
   * @returns The new cell
   */
  insert_cell_at_index(type?: string, index?: number): CellShim {
    let cellType = type ?? 'code';
    if (!Private.CELL_TYPES.includes(cellType)) {
      console.warn(
        `jupyterlab-unsafe-globals: unsupported cell type '${cellType}', inserting a code cell`
      );
      cellType = 'code';
    }
    const nb = this.panel.content;
    const at = Math.min(Math.max(index ?? 0, 0), nb.widgets.length);
    this.panel.model!.sharedModel.insertCell(at, {
      cell_type: cellType,
      source: ''
    });
    return getCellShim(this.panel, nb.widgets[at]);
  }

  /**
   * Insert a cell above the given index, or above the active cell.
   *
   * @param type - The cell type, defaults to `'code'`
   * @param index - The reference index, defaults to the active cell
   * @returns The new cell
   */
  insert_cell_above(type?: string, index?: number): CellShim {
    return this.insert_cell_at_index(
      type,
      index ?? this.panel.content.activeCellIndex
    );
  }

  /**
   * Insert a cell below the given index, or below the active cell.
   *
   * @param type - The cell type, defaults to `'code'`
   * @param index - The reference index, defaults to the active cell
   * @returns The new cell
   */
  insert_cell_below(type?: string, index?: number): CellShim {
    return this.insert_cell_at_index(
      type,
      (index ?? this.panel.content.activeCellIndex) + 1
    );
  }

  /**
   * Delete the cell at the given index, or the active cell.
   *
   * @param index - The cell index, defaults to the active cell
   * @returns This notebook shim, for chaining
   */
  delete_cell(index?: number): NotebookShim {
    return this.delete_cells([index ?? this.panel.content.activeCellIndex]);
  }

  /**
   * Delete the cells at the given indices, or the active cell.
   *
   * @param indices - The cell indices, defaults to the active cell
   * @returns This notebook shim, for chaining
   */
  delete_cells(indices?: number[]): NotebookShim {
    const toDelete = indices ?? [this.panel.content.activeCellIndex];
    const sorted = [...toDelete].sort((a, b) => b - a);
    for (const index of sorted) {
      if (index >= 0 && index < this.panel.content.widgets.length) {
        this.panel.model!.sharedModel.deleteCell(index);
      }
    }
    return this;
  }

  /**
   * Execute the selected cells; classic alias of `execute_selected_cells`.
   */
  execute_cell(): void {
    this.execute_selected_cells();
  }

  /**
   * Execute the selected cells.
   */
  execute_selected_cells(): void {
    void NotebookActions.run(this.panel.content, this.panel.sessionContext);
  }

  /**
   * Execute all cells of the notebook.
   */
  execute_all_cells(): void {
    void NotebookActions.runAll(this.panel.content, this.panel.sessionContext);
  }

  /**
   * Execute the cells in `[start, end)`, like in classic.
   *
   * @param start - The first index to execute
   * @param end - The index after the last one to execute
   */
  execute_cell_range(start: number, end: number): void {
    const indices = [];
    for (let i = start; i < end; i++) {
      indices.push(i);
    }
    this.execute_cells(indices);
  }

  /**
   * Execute the cells at the given indices, in order.
   *
   * @param indices - The cell indices to execute
   */
  execute_cells(indices: number[]): void {
    const nb = this.panel.content;
    let chain: Promise<unknown> = Promise.resolve();
    for (const index of indices) {
      const widget = nb.widgets[index];
      if (widget instanceof CodeCell) {
        chain = chain.then(() =>
          CodeCell.execute(widget, this.panel.sessionContext)
        );
      } else if (widget instanceof MarkdownCell) {
        widget.rendered = true;
      }
    }
    chain.catch(console.error);
    // classic leaves the last executed cell selected
    if (indices.length > 0) {
      this.select(indices[indices.length - 1]);
    }
  }

  /**
   * Save the notebook.
   */
  save_notebook(): Promise<void> {
    return this.panel.context.save();
  }

  /**
   * Save the notebook and create a checkpoint.
   */
  save_checkpoint(): Promise<void> {
    return this.panel.context
      .save()
      .then(() => this.panel.context.createCheckpoint())
      .then(() => undefined);
  }

  /**
   * Switch the notebook to command mode.
   */
  command_mode(): void {
    this.panel.content.mode = 'command';
  }

  /**
   * Switch the notebook to edit mode.
   */
  edit_mode(): void {
    this.panel.content.mode = 'edit';
  }

  /**
   * Scroll the notebook to the top.
   */
  scroll_to_top(): void {
    this.panel.content.node.scrollTop = 0;
  }

  /**
   * Scroll the notebook to the bottom.
   */
  scroll_to_bottom(): void {
    const node = this.panel.content.node;
    node.scrollTop = node.scrollHeight;
  }
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The cell types accepted by the classic insert methods.
   */
  export const CELL_TYPES = ['code', 'markdown', 'raw'];

  /**
   * The cell shim cache, one per cell widget.
   */
  export const cellShims = new WeakMap<Cell, CellShim>();

  /**
   * The shared model metadata surface used by the metadata proxy.
   */
  export interface ISharedMetadata {
    getMetadata(): any;
    setMetadata(key: string, value: any): void;
    deleteMetadata(key: string): void;
  }

  /**
   * Create a live view on a shared model metadata, so that the classic
   * patterns `metadata.foo` and `metadata.foo = bar` read and write the
   * actual model.
   *
   * Nested in-place mutations (e.g. `metadata.foo.bar = 1`) are lost;
   * assign whole sub-objects instead.
   */
  export function createMetadataProxy(shared: ISharedMetadata): any {
    return new Proxy(
      {},
      {
        get: (target, key) =>
          typeof key === 'string' ? shared.getMetadata()[key] : undefined,
        set: (target, key, value) => {
          if (typeof key === 'string') {
            shared.setMetadata(key, value);
          }
          return true;
        },
        has: (target, key) =>
          typeof key === 'string' && key in shared.getMetadata(),
        deleteProperty: (target, key) => {
          if (typeof key === 'string') {
            shared.deleteMetadata(key);
          }
          return true;
        },
        ownKeys: () => Reflect.ownKeys(shared.getMetadata()),
        getOwnPropertyDescriptor: (target, key) => {
          if (typeof key !== 'string' || !(key in shared.getMetadata())) {
            return undefined;
          }
          return {
            enumerable: true,
            configurable: true,
            value: shared.getMetadata()[key]
          };
        }
      }
    );
  }
}
