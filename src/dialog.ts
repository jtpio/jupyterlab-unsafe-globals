// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Dialog } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';

/**
 * The options of the classic `dialog.modal`.
 */
export interface IClassicModalOptions {
  title?: string;
  body?: any;
  buttons?: {
    [label: string]: { click?: () => void; class?: string; id?: string };
  };
  open?: () => void;
  [key: string]: any;
}

/**
 * Replica of the classic `dialog` module, backed by the JupyterLab
 * dialog.
 */
export const dialog = {
  modal,
  kernel_modal: modal
};

/**
 * Show a modal dialog, classic style.
 *
 * @param options - The classic options; `notebook`, `keyboard_manager`
 * and `sanitize` are accepted and ignored
 * @returns A minimal element wrapper supporting `modal('hide')`
 */
export function modal(options: IClassicModalOptions = {}): any {
  const buttons = options.buttons ?? {};
  const labels = Object.keys(buttons);
  const dialogButtons = labels.length
    ? labels.map(label =>
        Dialog.createButton({
          label,
          accept: true,
          displayType: /danger/.test(buttons[label]?.class ?? '')
            ? 'warn'
            : 'default'
        })
      )
    : [Dialog.okButton()];
  const body =
    options.body instanceof HTMLElement
      ? new Widget({ node: options.body })
      : options.body?.jquery
        ? new Widget({ node: options.body[0] })
        : String(options.body ?? '');
  const modalDialog = new Dialog({
    title: options.title ?? '',
    body,
    buttons: dialogButtons
  });
  void modalDialog.launch().then(result => {
    buttons[result.button.label]?.click?.call(modalDialog.node);
  });
  if (options.open) {
    requestAnimationFrame(() => options.open?.());
  }
  return Private.wrapNode(modalDialog);
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * Wrap the dialog node with the tiny jQuery-like surface the classic
   * call sites use; every method operates on the real DOM node.
   */
  export function wrapNode(modalDialog: Dialog<unknown>): any {
    const node = modalDialog.node;
    const wrapper = {
      node,
      length: 1,
      modal: (command?: string) => {
        if (command === 'hide') {
          modalDialog.reject();
        }
        return wrapper;
      },
      find: (selector: string) => Array.from(node.querySelectorAll(selector)),
      addClass: (name: string) => {
        node.classList.add(name);
        return wrapper;
      },
      removeClass: (name: string) => {
        node.classList.remove(name);
        return wrapper;
      },
      attr: (name: string, value?: string) => {
        if (value === undefined) {
          return node.getAttribute(name);
        }
        node.setAttribute(name, value);
        return wrapper;
      },
      css: (name: string, value: string) => {
        node.style.setProperty(name, value);
        return wrapper;
      },
      on: (event: string, handler: EventListener) => {
        node.addEventListener(event, handler);
        return wrapper;
      }
    };
    return wrapper;
  }
}
