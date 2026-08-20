// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Cell } from '@jupyterlab/cells';
import { CodeEditor } from '@jupyterlab/codeeditor';

/**
 * Get the cached CodeMirror shim for a cell widget.
 */
export function getCodeMirrorShim(widget: Cell): CodeMirrorShim {
  let shim = Private.codeMirrors.get(widget);
  if (!shim) {
    shim = new CodeMirrorShim(widget);
    Private.codeMirrors.set(widget, shim);
  }
  return shim;
}

/**
 * A CodeMirror 5 style position, `{line, ch}`.
 */
export interface IClassicPosition {
  line: number;
  ch: number;
}

/**
 * CodeMirror 5 style adapter over the JupyterLab cell editor.
 *
 * Only the honest subset is defined; CodeMirror 6 configuration APIs
 * (gutters, folding, themes, modes) are deliberately absent.
 */
export class CodeMirrorShim {
  /**
   * Construct a new CodeMirror shim.
   */
  constructor(widget: Cell) {
    this.widget = widget;
    this.doc = {
      getValue: () => this.getValue(),
      setValue: (value: string) => this.setValue(value),
      replaceSelection: (text: string) => this.replaceSelection(text)
    };
  }

  /**
   * The underlying JupyterLab cell widget. Not part of the CodeMirror
   * API, provided as an escape hatch.
   */
  readonly widget: Cell;

  /**
   * The CodeMirror 5 style `doc` sub-object.
   */
  readonly doc: {
    getValue: () => string;
    setValue: (value: string) => void;
    replaceSelection: (text: string) => void;
  };

  /**
   * Get the full editor content.
   */
  getValue(): string {
    return this.widget.model.sharedModel.getSource();
  }

  /**
   * Replace the full editor content.
   */
  setValue(value: string): void {
    this.widget.model.sharedModel.setSource(value);
  }

  /**
   * Get the cursor position; the CodeMirror `which` variants degrade to
   * the primary cursor.
   */
  getCursor(): IClassicPosition {
    const editor = this._editor;
    if (!editor) {
      return { line: 0, ch: 0 };
    }
    const position = editor.getCursorPosition();
    return { line: position.line, ch: position.column };
  }

  /**
   * Set the cursor position, `setCursor(pos)` or `setCursor(line, ch)`.
   */
  setCursor(line: number | IClassicPosition, ch?: number): void {
    const position =
      typeof line === 'number'
        ? { line, column: ch ?? 0 }
        : { line: line.line, column: line.ch };
    this._editor?.setCursorPosition(position);
  }

  /**
   * Get one line of the content.
   */
  getLine(line: number): string | undefined {
    return this.getValue().split('\n')[line];
  }

  /**
   * Get the number of lines.
   */
  lineCount(): number {
    return this._editor?.lineCount ?? this.getValue().split('\n').length;
  }

  /**
   * Get the first line number, always 0.
   */
  firstLine(): number {
    return 0;
  }

  /**
   * Get the last line number.
   */
  lastLine(): number {
    return this.lineCount() - 1;
  }

  /**
   * Get the primary selection text.
   */
  getSelection(): string {
    const editor = this._editor;
    if (!editor) {
      return '';
    }
    const range = editor.getSelection();
    const start = editor.getOffsetAt(range.start);
    const end = editor.getOffsetAt(range.end);
    return this.getValue().slice(start, end);
  }

  /**
   * Set the primary selection from CodeMirror 5 style positions.
   */
  setSelection(anchor: IClassicPosition, head: IClassicPosition): void {
    this._editor?.setSelection({
      start: { line: anchor.line, column: anchor.ch },
      end: { line: head.line, column: head.ch }
    });
  }

  /**
   * Replace the primary selection with text.
   */
  replaceSelection(text: string): void {
    this._editor?.replaceSelection?.(text);
  }

  /**
   * Focus the editor.
   */
  focus(): void {
    this._editor?.focus();
  }

  /**
   * Whether the editor has the focus.
   */
  hasFocus(): boolean {
    return this._editor?.hasFocus() ?? false;
  }

  /**
   * No-op: CodeMirror 6 needs no manual refresh.
   */
  refresh(): void {
    /* no-op */
  }

  /**
   * Get the editor host element.
   */
  getWrapperElement(): HTMLElement | null {
    return this._editor?.host ?? null;
  }

  /**
   * Set an editor option; only `'lineNumbers'` and `'readOnly'` are
   * supported.
   */
  setOption(key: string, value: any): void {
    if (key === 'lineNumbers') {
      this._editor?.setOption('lineNumbers', value);
    } else if (key === 'readOnly') {
      this.widget.readOnly = !!value;
    } else if (!Private.warnedOptions.has(key)) {
      Private.warnedOptions.add(key);
      console.warn(
        `jupyterlab-unsafe-globals: the CodeMirror option '${key}' is not supported`
      );
    }
  }

  /**
   * Get an editor option; only `'lineNumbers'` and `'readOnly'` are
   * supported.
   */
  getOption(key: string): any {
    if (key === 'lineNumbers') {
      return this._editor?.getOption('lineNumbers');
    }
    if (key === 'readOnly') {
      return this.widget.readOnly;
    }
    return undefined;
  }

  /**
   * Listen to content changes; only `'change'` and `'changes'` are
   * supported, and the handler receives this shim without a CodeMirror
   * change object.
   */
  on(event: string, handler: (instance: CodeMirrorShim) => void): void {
    if (event !== 'change' && event !== 'changes') {
      if (!Private.warnedEvents.has(event)) {
        Private.warnedEvents.add(event);
        console.warn(
          `jupyterlab-unsafe-globals: the CodeMirror event '${event}' is not supported`
        );
      }
      return;
    }
    const slot = (): void => {
      handler(this);
    };
    this._handlers.set(handler, slot);
    this.widget.model.sharedModel.changed.connect(slot);
  }

  /**
   * Stop listening to content changes.
   */
  off(event: string, handler: (instance: CodeMirrorShim) => void): void {
    const slot = this._handlers.get(handler);
    if (slot) {
      this.widget.model.sharedModel.changed.disconnect(slot);
      this._handlers.delete(handler);
    }
  }

  private get _editor(): CodeEditor.IEditor | null {
    return this.widget.editor;
  }

  private _handlers = new Map<(instance: CodeMirrorShim) => void, () => void>();
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The CodeMirror shim cache, one per cell widget.
   */
  export const codeMirrors = new WeakMap<Cell, CodeMirrorShim>();

  /**
   * Options and events already warned about.
   */
  export const warnedOptions = new Set<string>();
  export const warnedEvents = new Set<string>();
}
