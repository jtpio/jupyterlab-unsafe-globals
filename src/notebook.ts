import { Cell, CodeCell, MarkdownCell } from '@jupyterlab/cells';
import { PageConfig, PathExt } from '@jupyterlab/coreutils';
import { NotebookActions, NotebookPanel } from '@jupyterlab/notebook';

import { EventsShim } from './events';
import { getKernelShim, KernelShim } from './kernel';

/**
 * Cell types accepted by the classic insert methods.
 */
const CELL_TYPES = ['code', 'markdown', 'raw'];

interface ISharedMetadata {
  getMetadata(): any;
  setMetadata(key: string, value: any): void;
  deleteMetadata(key: string): void;
}

/**
 * Live view on a shared model metadata, so that the classic patterns
 * `metadata.foo` and `metadata.foo = bar` read and write the actual model.
 *
 * Nested in-place mutations (e.g. `metadata.foo.bar = 1`) are lost; assign
 * whole sub-objects instead.
 */
function createMetadataProxy(shared: ISharedMetadata): any {
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

const cellShims = new WeakMap<Cell, CellShim>();

/**
 * Get the cached shim for a cell widget.
 */
export function getCellShim(panel: NotebookPanel, widget: Cell): CellShim {
  let shim = cellShims.get(widget);
  if (!shim) {
    shim = new CellShim(panel, widget);
    cellShims.set(widget, shim);
  }
  return shim;
}

/**
 * Replica of the classic notebook cell objects, backed by a JupyterLab
 * cell widget.
 */
export class CellShim {
  constructor(panel: NotebookPanel, widget: Cell) {
    this.widget = widget;
    this._panel = panel;
  }

  /**
   * The underlying JupyterLab cell widget. Not part of the classic API,
   * provided as an escape hatch.
   */
  readonly widget: Cell;

  get cell_type(): string {
    return this.widget.model.type;
  }

  get metadata(): any {
    return createMetadataProxy(this.widget.model.sharedModel);
  }

  get rendered(): boolean {
    if (this.widget instanceof MarkdownCell) {
      return this.widget.rendered;
    }
    return true;
  }

  get_text(): string {
    return this.widget.model.sharedModel.getSource();
  }

  set_text(text: string): void {
    this.widget.model.sharedModel.setSource(text);
  }

  execute(): void {
    if (this.widget instanceof CodeCell) {
      void CodeCell.execute(this.widget, this._panel.sessionContext);
    } else {
      this.render();
    }
  }

  render(): void {
    if (this.widget instanceof MarkdownCell) {
      this.widget.rendered = true;
    }
  }

  select(): void {
    const nb = this._panel.content;
    const index = nb.widgets.indexOf(this.widget);
    if (index !== -1) {
      nb.activeCellIndex = index;
      nb.deselectAll();
    }
  }

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

  get kernel(): KernelShim | null {
    const sessionContext = this.panel.sessionContext;
    return sessionContext.session?.kernel
      ? getKernelShim(sessionContext)
      : null;
  }

  get notebook_name(): string {
    return PathExt.basename(this.panel.context.path);
  }

  get notebook_path(): string {
    return this.panel.context.path;
  }

  get base_url(): string {
    return PageConfig.getOption('baseUrl');
  }

  get metadata(): any {
    return createMetadataProxy(this.panel.model!.sharedModel);
  }

  get dirty(): boolean {
    return this.panel.model?.dirty ?? false;
  }

  set dirty(value: boolean) {
    if (this.panel.model) {
      this.panel.model.dirty = value;
    }
  }

  get trusted(): boolean {
    return this.panel.content.widgets.every(
      widget => widget.model.type !== 'code' || widget.model.trusted
    );
  }

  get writable(): boolean {
    return this.panel.context.contentsModel?.writable ?? false;
  }

  get mode(): string {
    return this.panel.content.mode;
  }

  get _fully_loaded(): boolean {
    return this.panel.context.isReady;
  }

  // --- cell access and selection ---

  get_cells(): CellShim[] {
    return this.panel.content.widgets.map(widget =>
      getCellShim(this.panel, widget)
    );
  }

  get_cell(index: number): CellShim | null {
    const widget = this.panel.content.widgets[index];
    return widget ? getCellShim(this.panel, widget) : null;
  }

  get_selected_cell(): CellShim | null {
    const widget = this.panel.content.activeCell;
    return widget ? getCellShim(this.panel, widget) : null;
  }

  get_selected_index(): number {
    return this.panel.content.activeCellIndex;
  }

  get_selected_cells(): CellShim[] {
    const nb = this.panel.content;
    return nb.widgets
      .filter(widget => nb.isSelectedOrActive(widget))
      .map(widget => getCellShim(this.panel, widget));
  }

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

  find_cell_index(cell: CellShim): number | null {
    const index = this.panel.content.widgets.indexOf(cell.widget);
    return index === -1 ? null : index;
  }

  ncells(): number {
    return this.panel.content.widgets.length;
  }

  select(index: number): NotebookShim {
    const nb = this.panel.content;
    if (index >= 0 && index < nb.widgets.length) {
      nb.activeCellIndex = index;
      nb.deselectAll();
    }
    return this;
  }

  select_next(): NotebookShim {
    return this.select(this.panel.content.activeCellIndex + 1);
  }

  select_prev(): NotebookShim {
    return this.select(this.panel.content.activeCellIndex - 1);
  }

  // --- insertion and deletion ---

  insert_cell_at_index(type?: string, index?: number): CellShim {
    let cellType = type ?? 'code';
    if (!CELL_TYPES.includes(cellType)) {
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

  insert_cell_above(type?: string, index?: number): CellShim {
    return this.insert_cell_at_index(
      type,
      index ?? this.panel.content.activeCellIndex
    );
  }

  insert_cell_below(type?: string, index?: number): CellShim {
    return this.insert_cell_at_index(
      type,
      (index ?? this.panel.content.activeCellIndex) + 1
    );
  }

  delete_cell(index?: number): NotebookShim {
    return this.delete_cells([index ?? this.panel.content.activeCellIndex]);
  }

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

  // --- execution ---

  execute_cell(): void {
    this.execute_selected_cells();
  }

  execute_selected_cells(): void {
    void NotebookActions.run(this.panel.content, this.panel.sessionContext);
  }

  execute_all_cells(): void {
    void NotebookActions.runAll(this.panel.content, this.panel.sessionContext);
  }

  execute_cell_range(start: number, end: number): void {
    const indices = [];
    for (let i = start; i < end; i++) {
      indices.push(i);
    }
    this.execute_cells(indices);
  }

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

  // --- save ---

  save_notebook(): Promise<void> {
    return this.panel.context.save();
  }

  save_checkpoint(): Promise<void> {
    return this.panel.context
      .save()
      .then(() => this.panel.context.createCheckpoint())
      .then(() => undefined);
  }

  // --- mode and scrolling ---

  command_mode(): void {
    this.panel.content.mode = 'command';
  }

  edit_mode(): void {
    this.panel.content.mode = 'edit';
  }

  scroll_to_top(): void {
    this.panel.content.node.scrollTop = 0;
  }

  scroll_to_bottom(): void {
    const node = this.panel.content.node;
    node.scrollTop = node.scrollHeight;
  }
}
