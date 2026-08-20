// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeCell } from '@jupyterlab/cells';
import { IOutputAreaModel } from '@jupyterlab/outputarea';

/**
 * Get the cached output area shim for a code cell widget.
 */
export function getOutputAreaShim(widget: CodeCell): OutputAreaShim {
  let shim = Private.outputAreas.get(widget);
  if (!shim) {
    shim = new OutputAreaShim(widget);
    Private.outputAreas.set(widget, shim);
  }
  return shim;
}

/**
 * Convert a raw iopub message to an nbformat output, like the classic
 * `OutputArea.prototype.handle_output` did.
 *
 * @param msg - The raw `stream`, `display_data`, `execute_result`,
 * `update_display_data` or `error` message
 * @returns The nbformat output json, or `null` for other message types
 */
export function convertOutputMsg(msg: any): any | null {
  const msgType = msg.header.msg_type;
  const content = msg.content;
  switch (msgType) {
    case 'stream':
      return { output_type: 'stream', name: content.name, text: content.text };
    case 'display_data':
    case 'update_display_data':
      return {
        output_type: 'display_data',
        data: content.data,
        metadata: content.metadata
      };
    case 'execute_result':
      return {
        output_type: 'execute_result',
        execution_count: content.execution_count,
        data: content.data,
        metadata: content.metadata
      };
    case 'error':
      return {
        output_type: 'error',
        ename: content.ename,
        evalue: content.evalue,
        traceback: content.traceback
      };
    default:
      return null;
  }
}

/**
 * Replica of the classic `cell.output_area`, backed by the JupyterLab
 * output area model of a code cell.
 */
export class OutputAreaShim {
  /**
   * Construct a new output area shim.
   */
  constructor(widget: CodeCell) {
    this.widget = widget;
  }

  /**
   * The underlying JupyterLab code cell widget. Not part of the classic
   * API, provided as an escape hatch.
   */
  readonly widget: CodeCell;

  /**
   * A snapshot of the outputs as nbformat json. Classic exposed a live
   * array; mutate through `append_output` and `clear_output` instead.
   */
  get outputs(): any[] {
    return this._model.toJSON();
  }

  /**
   * Whether the outputs are trusted.
   */
  get trusted(): boolean {
    return this.widget.model.trusted;
  }
  set trusted(value: boolean) {
    this.widget.model.trusted = value;
  }

  /**
   * Append one nbformat output.
   */
  append_output(json: any): void {
    this._model.add(json);
  }

  /**
   * Clear the outputs; with `wait` the clear happens on the next output.
   */
  clear_output(wait?: boolean): void {
    this._model.clear(wait ?? false);
  }

  /**
   * Append the output carried by a raw iopub message.
   */
  handle_output(msg: any): void {
    const output = convertOutputMsg(msg);
    if (output) {
      this._model.add(output);
    }
  }

  /**
   * Handle a raw `clear_output` message.
   */
  handle_clear_output(msg: any): void {
    this.clear_output(msg.content?.wait ?? false);
  }

  /**
   * Collapse the output area.
   */
  collapse(): void {
    this.widget.outputHidden = true;
  }

  /**
   * Expand the output area.
   */
  expand(): void {
    this.widget.outputHidden = false;
  }

  /**
   * Toggle the output area visibility.
   */
  toggle_output(): void {
    this.widget.outputHidden = !this.widget.outputHidden;
  }

  /**
   * Put the output area in scroll mode.
   */
  scroll_if_long(): void {
    this.widget.outputsScrolled = true;
  }

  /**
   * Toggle the output scroll mode.
   */
  toggle_scroll(): void {
    this.widget.outputsScrolled = !this.widget.outputsScrolled;
  }

  /**
   * Replace the outputs from nbformat json.
   */
  fromJSON(outputs: any[]): void {
    this._model.fromJSON(outputs);
  }

  /**
   * Get the outputs as nbformat json.
   */
  toJSON(): any[] {
    return this._model.toJSON();
  }

  private get _model(): IOutputAreaModel {
    return this.widget.model.outputs;
  }
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The output area shim cache, one per code cell widget.
   */
  export const outputAreas = new WeakMap<CodeCell, OutputAreaShim>();
}
