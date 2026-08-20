// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Cell,
  CodeCell,
  ICodeCellModel,
  MarkdownCell
} from '@jupyterlab/cells';
import { PageConfig, PathExt } from '@jupyterlab/coreutils';
import { NotebookActions, NotebookPanel } from '@jupyterlab/notebook';
import { Contents } from '@jupyterlab/services';

import { CodeMirrorShim, getCodeMirrorShim } from './codemirror';
import { ConfigSectionShim, getConfigSection } from './config';
import { ContentsShim, getContentsShim } from './contents';
import { EventsShim, getEventsShim } from './events';
import { getKernelShim, KernelShim } from './kernel';
import { getKeyboardManagerShim, KeyboardManagerShim } from './keyboard';
import { getOutputAreaShim, OutputAreaShim } from './outputarea';
import { getSessionShim, SessionShim } from './session';

/**
 * Get the cached shim for a notebook panel.
 */
export function getNotebookShim(panel: NotebookPanel): NotebookShim {
  let shim = Private.notebookShims.get(panel);
  if (!shim) {
    shim = new NotebookShim(panel);
    Private.notebookShims.set(panel, shim);
  }
  return shim;
}

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
    Private.cellShimsByModelId.set(widget.model.id, shim);
    Private.addClassicClasses(widget);
  }
  return shim;
}

/**
 * Get a cell shim by its model id; used for `delete.Cell` where the
 * widget is already disposed.
 */
export function findCellShimByModelId(id: string): CellShim | undefined {
  return Private.cellShimsByModelId.get(id);
}

/**
 * Drop the model-id cache entry of a removed cell.
 */
export function forgetCellShimByModelId(id: string): void {
  Private.cellShimsByModelId.delete(id);
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
   * The classic cell toolbar; always `null` in this shim.
   */
  readonly celltoolbar: null = null;

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
   * The notebook shim owning this cell.
   */
  get notebook(): NotebookShim {
    return getNotebookShim(this._panel);
  }

  /**
   * The classic events object.
   */
  get events(): EventsShim {
    return getEventsShim();
  }

  /**
   * Whether this cell is selected or active.
   */
  get selected(): boolean {
    return this._panel.content.isSelectedOrActive(this.widget);
  }

  /**
   * Whether a markdown cell is rendered; always `true` for other types.
   * The setter unrenders markdown cells, like in classic.
   */
  get rendered(): boolean {
    if (this.widget instanceof MarkdownCell) {
      return this.widget.rendered;
    }
    return true;
  }
  set rendered(value: boolean) {
    if (this.widget instanceof MarkdownCell) {
      this.widget.rendered = value;
    }
  }

  /**
   * The cell DOM node. Classic returned a jQuery object; without jQuery
   * on the page this is the raw element.
   */
  get element(): any {
    const $ = (window as any).$;
    if ($) {
      return $(this.widget.node).data('cell', this);
    }
    Private.warnElementOnce();
    return this.widget.node;
  }

  /**
   * The CodeMirror 5 style editor adapter.
   */
  get code_mirror(): CodeMirrorShim {
    return getCodeMirrorShim(this.widget);
  }

  /**
   * The classic output area, for code cells only.
   */
  get output_area(): OutputAreaShim | undefined {
    return this.widget instanceof CodeCell
      ? getOutputAreaShim(this.widget)
      : undefined;
  }

  /**
   * The execution count of a code cell, or `null`.
   */
  get input_prompt_number(): number | null {
    return this.widget instanceof CodeCell
      ? ((this.widget.model as ICodeCellModel).executionCount ?? null)
      : null;
  }
  set input_prompt_number(value: number | null) {
    if (this.widget instanceof CodeCell) {
      (this.widget.model as ICodeCellModel).executionCount = value;
    }
  }

  /**
   * Set the input prompt, classic style; `'*'` shows the running prompt.
   */
  set_input_prompt(value?: number | '*' | null): void {
    if (!(this.widget instanceof CodeCell)) {
      return;
    }
    if (value === '*') {
      this.widget.setPrompt('*');
    } else {
      (this.widget.model as ICodeCellModel).executionCount = value ?? null;
    }
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
      const events = getEventsShim();
      events.trigger('execute.CodeCell', { cell: this });
      void CodeCell.execute(this.widget, this._panel.sessionContext).then(
        () => {
          events.trigger('finished_execute.CodeCell', { cell: this });
        }
      );
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
   * Unrender a markdown cell; no-op for other types.
   */
  unrender(): void {
    if (this.widget instanceof MarkdownCell) {
      this.widget.rendered = false;
    }
  }

  /**
   * Whether the cell metadata allows editing.
   */
  is_editable(): boolean {
    return this.widget.model.getMetadata('editable') !== false;
  }

  /**
   * Whether the cell metadata allows deletion.
   */
  is_deletable(): boolean {
    return (
      this.widget.model.getMetadata('deletable') !== false && this.is_editable()
    );
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
   * Deselect this cell; returns whether it was selected.
   */
  unselect(): boolean {
    const nb = this._panel.content;
    const was = nb.isSelectedOrActive(this.widget);
    nb.deselect(this.widget);
    return was;
  }

  /**
   * Select this cell and give it the focus in command mode.
   */
  focus_cell(): void {
    this.select();
    this._panel.content.mode = 'command';
    this.widget.node.focus();
  }

  /**
   * Show or hide the editor line numbers.
   */
  show_line_numbers(value: boolean): void {
    this.widget.editor?.setOption('lineNumbers', value);
  }

  /**
   * Toggle the editor line numbers.
   */
  toggle_line_numbers(): void {
    const editor = this.widget.editor;
    if (editor) {
      editor.setOption('lineNumbers', !editor.getOption('lineNumbers'));
    }
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
   */
  constructor(panel: NotebookPanel) {
    this.panel = panel;
  }

  /**
   * The underlying JupyterLab notebook panel. Not part of the classic API,
   * provided as an escape hatch.
   */
  readonly panel: NotebookPanel;

  /**
   * The checkpoints seen by this shim, classic style; refreshed by
   * `list_checkpoints` and `create_checkpoint`.
   */
  checkpoints: Contents.ICheckpointModel[] = [];

  /**
   * The most recent checkpoint, or `null`.
   */
  last_checkpoint: Contents.ICheckpointModel | null = null;

  /**
   * The classic `notebook` config section, backed by `/api/config`.
   */
  get config(): ConfigSectionShim {
    return getConfigSection('notebook');
  }

  /**
   * The same events object as `Jupyter.events`, like in classic.
   */
  get events(): EventsShim {
    return getEventsShim();
  }

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
   * The classic session object.
   */
  get session(): SessionShim {
    return getSessionShim(this.panel);
  }

  /**
   * The classic contents service.
   */
  get contents(): ContentsShim {
    return getContentsShim();
  }

  /**
   * The classic keyboard manager.
   */
  get keyboard_manager(): KeyboardManagerShim {
    return getKeyboardManagerShim();
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
   * Get the index of the cell in edit mode, or `null`.
   */
  get_edit_index(): number | null {
    return this.panel.content.mode === 'edit'
      ? this.panel.content.activeCellIndex
      : null;
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
   * Resolve an index argument to the active cell, classic style.
   */
  index_or_selected(index?: number): number {
    return index ?? this.panel.content.activeCellIndex;
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
   * @param moveanchor - When `false`, extend the selection instead of
   * moving it, like in classic
   * @returns This notebook shim, for chaining
   */
  select(index: number, moveanchor = true): NotebookShim {
    const nb = this.panel.content;
    if (index >= 0 && index < nb.widgets.length) {
      if (moveanchor) {
        nb.activeCellIndex = index;
        nb.deselectAll();
      } else {
        nb.extendContiguousSelectionTo(index);
      }
    }
    return this;
  }

  /**
   * Select the cell after the active cell.
   *
   * @returns This notebook shim, for chaining
   */
  select_next(moveanchor = true): NotebookShim {
    return this.select(this.panel.content.activeCellIndex + 1, moveanchor);
  }

  /**
   * Select the cell before the active cell.
   *
   * @returns This notebook shim, for chaining
   */
  select_prev(moveanchor = true): NotebookShim {
    return this.select(this.panel.content.activeCellIndex - 1, moveanchor);
  }

  /**
   * Select all cells.
   */
  select_all(): NotebookShim {
    NotebookActions.selectAll(this.panel.content);
    return this;
  }

  /**
   * Extend the selection by a number of cells, classic style.
   */
  extend_selection_by(delta: number): NotebookShim {
    const nb = this.panel.content;
    return this.select(nb.activeCellIndex + delta, false);
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
    return this.insert_cell_at_index(type, this.index_or_selected(index));
  }

  /**
   * Insert a cell below the given index, or below the active cell.
   *
   * @param type - The cell type, defaults to `'code'`
   * @param index - The reference index, defaults to the active cell
   * @returns The new cell
   */
  insert_cell_below(type?: string, index?: number): CellShim {
    return this.insert_cell_at_index(type, this.index_or_selected(index) + 1);
  }

  /**
   * Delete the cell at the given index, or the active cell.
   *
   * @param index - The cell index, defaults to the active cell
   * @returns This notebook shim, for chaining
   */
  delete_cell(index?: number): NotebookShim {
    return this.delete_cells([this.index_or_selected(index)]);
  }

  /**
   * Delete the cells at the given indices, or the active cell.
   *
   * @param indices - The cell indices, defaults to the active cell
   * @returns This notebook shim, for chaining
   */
  delete_cells(indices?: number[]): NotebookShim {
    const nb = this.panel.content;
    const toDelete = indices ?? [nb.activeCellIndex];
    const sorted = [...toDelete].sort((a, b) => b - a);
    for (const index of sorted) {
      const widget = nb.widgets[index];
      if (widget && getCellShim(this.panel, widget).is_deletable()) {
        this.panel.model!.sharedModel.deleteCell(index);
      }
    }
    // classic never leaves an empty notebook
    if (nb.widgets.length === 0) {
      this.insert_cell_at_index('code', 0);
    }
    return this;
  }

  /**
   * Restore deleted cells; maps to the notebook undo, so it can also
   * undo other changes.
   */
  undelete_cell(): NotebookShim {
    NotebookActions.undo(this.panel.content);
    return this;
  }

  /**
   * Insert a cell at the end of the notebook.
   *
   * @param type - The cell type, defaults to `'code'`
   * @returns The new cell
   */
  insert_cell_at_bottom(type?: string): CellShim {
    return this.insert_cell_at_index(type, this.ncells());
  }

  /**
   * Move the selected cells one cell up.
   */
  move_selection_up(): void {
    NotebookActions.moveUp(this.panel.content);
  }

  /**
   * Move the selected cells one cell down.
   */
  move_selection_down(): void {
    NotebookActions.moveDown(this.panel.content);
  }

  /**
   * Move the cell at the given index, or the active cell, one cell up.
   */
  move_cell_up(index?: number): NotebookShim {
    const nb = this.panel.content;
    if (index === undefined) {
      NotebookActions.moveUp(nb);
      return this;
    }
    if (index > 0 && index < nb.widgets.length) {
      this.panel.model!.sharedModel.moveCell(index, index - 1);
      this.select(index - 1);
    }
    return this;
  }

  /**
   * Move the cell at the given index, or the active cell, one cell down.
   */
  move_cell_down(index?: number): NotebookShim {
    const nb = this.panel.content;
    if (index === undefined) {
      NotebookActions.moveDown(nb);
      return this;
    }
    if (index >= 0 && index < nb.widgets.length - 1) {
      this.panel.model!.sharedModel.moveCell(index, index + 1);
      this.select(index + 1);
    }
    return this;
  }

  /**
   * Merge the active cell with the cell above.
   */
  merge_cell_above(): void {
    NotebookActions.mergeCells(this.panel.content, true);
  }

  /**
   * Merge the active cell with the cell below.
   */
  merge_cell_below(): void {
    NotebookActions.mergeCells(this.panel.content, false);
  }

  /**
   * Merge the cells at the given indices into one cell.
   *
   * @param indices - The cell indices to merge
   * @param into_last - Keep the last cell instead of the first
   */
  merge_cells(indices: number[], into_last = false): void {
    const nb = this.panel.content;
    const valid = [...new Set(indices)]
      .sort((a, b) => a - b)
      .filter(i => i >= 0 && i < nb.widgets.length);
    if (valid.length < 2) {
      return;
    }
    const target = into_last ? valid[valid.length - 1] : valid[0];
    const joined = valid
      .map(i => nb.widgets[i].model.sharedModel.getSource())
      .join('\n\n');
    const shared = this.panel.model!.sharedModel;
    shared.transact(() => {
      nb.widgets[target].model.sharedModel.setSource(joined);
      for (const i of valid.filter(i => i !== target).reverse()) {
        shared.deleteCell(i);
      }
    });
    this.select(target - valid.filter(i => i < target).length);
  }

  /**
   * Split the active cell at the cursor.
   */
  split_cell(): void {
    void NotebookActions.splitCell(this.panel.content);
  }

  /**
   * Copy the selected cells to the notebook clipboard.
   */
  copy_cell(): void {
    NotebookActions.copy(this.panel.content);
  }

  /**
   * Cut the selected cells to the notebook clipboard.
   */
  cut_cell(): void {
    NotebookActions.cut(this.panel.content);
  }

  /**
   * Paste the clipboard cells above the active cell.
   */
  paste_cell_above(): void {
    NotebookActions.paste(this.panel.content, 'above');
  }

  /**
   * Paste the clipboard cells below the active cell.
   */
  paste_cell_below(): void {
    NotebookActions.paste(this.panel.content, 'below');
  }

  /**
   * Paste the clipboard cells over the selected cells.
   */
  paste_cell_replace(): void {
    NotebookActions.paste(this.panel.content, 'replace');
  }

  /**
   * Change the cell at the given index, or the active cell, to code.
   */
  to_code(index?: number): void {
    this._change_cell_type('code', index);
  }

  /**
   * Change the cell at the given index, or the active cell, to markdown.
   */
  to_markdown(index?: number): void {
    this._change_cell_type('markdown', index);
  }

  /**
   * Change the cell at the given index, or the active cell, to raw.
   */
  to_raw(index?: number): void {
    this._change_cell_type('raw', index);
  }

  /**
   * Change the cells at the given indices, or the selected cells, to code.
   */
  cells_to_code(indices?: number[]): void {
    this._change_cells_type('code', indices);
  }

  /**
   * Change the cells at the given indices, or the selected cells, to
   * markdown.
   */
  cells_to_markdown(indices?: number[]): void {
    this._change_cells_type('markdown', indices);
  }

  /**
   * Change the cells at the given indices, or the selected cells, to raw.
   */
  cells_to_raw(indices?: number[]): void {
    this._change_cells_type('raw', indices);
  }

  /**
   * Clear the output of the cell at the given index, or the active cell.
   */
  clear_output(index?: number): void {
    this.select(this.index_or_selected(index));
    NotebookActions.clearOutputs(this.panel.content);
  }

  /**
   * Clear the outputs of the cells at the given indices, or the selected
   * cells.
   */
  clear_cells_outputs(indices?: number[]): void {
    const toClear = indices ?? this.get_selected_cells_indices();
    for (const index of toClear) {
      this.clear_output(index);
    }
  }

  /**
   * Clear the outputs of all cells.
   */
  clear_all_output(): void {
    NotebookActions.clearAllOutputs(this.panel.content);
  }

  /**
   * Toggle the output of the cell at the given index, or the active cell.
   */
  toggle_output(index?: number): void {
    const widget = this.panel.content.widgets[this.index_or_selected(index)];
    if (widget instanceof CodeCell) {
      widget.outputHidden = !widget.outputHidden;
    }
  }

  /**
   * Collapse the output of the cell at the given index.
   */
  collapse_output(index?: number): void {
    const widget = this.panel.content.widgets[this.index_or_selected(index)];
    if (widget instanceof CodeCell) {
      widget.outputHidden = true;
    }
  }

  /**
   * Expand the output of the cell at the given index.
   */
  expand_output(index?: number): void {
    const widget = this.panel.content.widgets[this.index_or_selected(index)];
    if (widget instanceof CodeCell) {
      widget.outputHidden = false;
    }
  }

  /**
   * Toggle the output scroll mode of the cell at the given index.
   */
  toggle_output_scroll(index?: number): void {
    const widget = this.panel.content.widgets[this.index_or_selected(index)];
    if (widget instanceof CodeCell) {
      widget.outputsScrolled = !widget.outputsScrolled;
    }
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
   * Execute the selected cells and select the cell below, inserting one
   * at the end of the notebook, like Shift-Enter.
   */
  execute_cell_and_select_below(): void {
    void NotebookActions.runAndAdvance(
      this.panel.content,
      this.panel.sessionContext
    );
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
        const shim = getCellShim(this.panel, widget);
        chain = chain.then(() => {
          this.events.trigger('execute.CodeCell', { cell: shim });
          return CodeCell.execute(widget, this.panel.sessionContext).then(
            () => {
              this.events.trigger('finished_execute.CodeCell', { cell: shim });
            }
          );
        });
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
      .then(() => this.create_checkpoint())
      .then(() => undefined);
  }

  /**
   * Create a checkpoint; fires `checkpoint_created.Notebook`.
   */
  create_checkpoint(): Promise<Contents.ICheckpointModel> {
    return this.panel.context.createCheckpoint().then(
      model => {
        this.checkpoints.push(model);
        this.last_checkpoint = model;
        this.events.trigger('checkpoint_created.Notebook', model);
        return model;
      },
      error => {
        this.events.trigger('checkpoint_failed.Notebook', error);
        throw error;
      }
    );
  }

  /**
   * List the checkpoints; fires `checkpoints_listed.Notebook`.
   */
  list_checkpoints(): Promise<Contents.ICheckpointModel[]> {
    return this.panel.context.listCheckpoints().then(
      models => {
        this.checkpoints = models;
        this.last_checkpoint = models[models.length - 1] ?? null;
        this.events.trigger('checkpoints_listed.Notebook', [models]);
        return models;
      },
      error => {
        this.events.trigger('list_checkpoints_failed.Notebook', error);
        throw error;
      }
    );
  }

  /**
   * Restore the notebook to a checkpoint and reload it; fires
   * `checkpoint_restored.Notebook`.
   */
  restore_checkpoint(checkpoint_id: string): Promise<void> {
    this.events.trigger('notebook_restoring.Notebook', checkpoint_id);
    return this.panel.context
      .restoreCheckpoint(checkpoint_id)
      .then(() => this.panel.context.revert())
      .then(
        () => {
          this.events.trigger('checkpoint_restored.Notebook', checkpoint_id);
        },
        error => {
          this.events.trigger('checkpoint_restore_failed.Notebook', error);
          throw error;
        }
      );
  }

  /**
   * Delete a checkpoint; fires `checkpoint_deleted.Notebook`.
   */
  delete_checkpoint(checkpoint_id: string): Promise<void> {
    return this.panel.context.deleteCheckpoint(checkpoint_id).then(
      () => {
        this.checkpoints = this.checkpoints.filter(
          model => model.id !== checkpoint_id
        );
        this.events.trigger('checkpoint_deleted.Notebook', checkpoint_id);
      },
      error => {
        this.events.trigger('checkpoint_delete_failed.Notebook', error);
        throw error;
      }
    );
  }

  /**
   * Get the notebook name without the extension, classic style.
   */
  get_notebook_name(): string {
    const path = this.panel.context.path;
    return PathExt.basename(path, PathExt.extname(path));
  }

  /**
   * Classic set the local name without renaming the file; there is no
   * equivalent here, use `rename` instead.
   */
  set_notebook_name(): void {
    console.warn(
      'jupyterlab-unsafe-globals: set_notebook_name has no effect, use rename() instead'
    );
  }

  /**
   * Rename the notebook file; fires `notebook_renamed.Notebook`.
   */
  rename(new_name: string): Promise<void> {
    const name = PathExt.extname(new_name) ? new_name : new_name + '.ipynb';
    return this.panel.context.rename(name);
  }

  /**
   * Trust all cells of the notebook, showing the JupyterLab dialog.
   */
  trust_notebook(): Promise<void> {
    return NotebookActions.trust(this.panel.content).then(() => undefined);
  }

  /**
   * Restart the kernel; the classic confirmation dialog is not shown.
   */
  restart_kernel(): Promise<void> {
    return this.panel.sessionContext.restartKernel();
  }

  /**
   * Restart the kernel, then run all cells.
   */
  restart_run_all(): Promise<void> {
    return this.restart_kernel().then(() => {
      return NotebookActions.runAll(
        this.panel.content,
        this.panel.sessionContext
      ).then(() => undefined);
    });
  }

  /**
   * Restart the kernel, then clear all outputs.
   */
  restart_clear_output(): Promise<void> {
    return this.restart_kernel().then(() => {
      NotebookActions.clearAllOutputs(this.panel.content);
    });
  }

  /**
   * Shut the kernel and session down.
   */
  shutdown_kernel(): Promise<void> {
    return this.panel.sessionContext.shutdown();
  }

  /**
   * Start a session, optionally with a specific kernel.
   */
  start_session(kernel_name?: string): Promise<unknown> {
    const sessionContext = this.panel.sessionContext;
    return kernel_name
      ? sessionContext.changeKernel({ name: kernel_name })
      : sessionContext.startKernel();
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
   * Set the dirty flag, classic style.
   */
  set_dirty(value = true): void {
    this.dirty = value;
  }

  /**
   * Get the notebook content as nbformat json.
   */
  toJSON(): any {
    return this.panel.model?.toJSON();
  }

  /**
   * Focus the active cell.
   */
  focus_cell(): void {
    this.get_selected_cell()?.focus_cell();
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

  private _change_cell_type(
    type: 'code' | 'markdown' | 'raw',
    index?: number
  ): void {
    this.select(this.index_or_selected(index));
    NotebookActions.changeCellType(this.panel.content, type);
  }

  private _change_cells_type(
    type: 'code' | 'markdown' | 'raw',
    indices?: number[]
  ): void {
    const toChange = indices ?? this.get_selected_cells_indices();
    for (const index of toChange) {
      this._change_cell_type(type, index);
    }
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
   * The notebook shim cache, one per panel.
   */
  export const notebookShims = new WeakMap<NotebookPanel, NotebookShim>();

  /**
   * The cell shim cache, one per cell widget.
   */
  export const cellShims = new WeakMap<Cell, CellShim>();

  /**
   * Cell shims by model id, for events after widget disposal.
   */
  export const cellShimsByModelId = new Map<string, CellShim>();

  /**
   * Warn once that `cell.element` returns a raw DOM node.
   */
  export function warnElementOnce(): void {
    if (!warnedElement) {
      warnedElement = true;
      console.warn(
        'jupyterlab-unsafe-globals: cell.element is a raw DOM node, jQuery is not available'
      );
    }
  }

  let warnedElement = false;

  /**
   * Add the classic CSS classes so selectors like `$('.cell')` match.
   */
  export function addClassicClasses(widget: Cell): void {
    widget.addClass('cell');
    if (widget.model.type === 'code') {
      widget.addClass('code_cell');
    } else {
      widget.addClass('text_cell');
    }
  }

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
        get: (target, key) => {
          if (typeof key !== 'string') {
            return undefined;
          }
          const metadata = shared.getMetadata();
          // fall back to Object.prototype for e.g. hasOwnProperty
          return key in metadata ? metadata[key] : (target as any)[key];
        },
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
