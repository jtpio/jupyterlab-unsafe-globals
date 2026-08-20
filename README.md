# jupyterlab_unsafe_globals

[![Github Actions Status](https://github.com/jtpio/jupyterlab-unsafe-globals/workflows/Build/badge.svg)](https://github.com/jtpio/jupyterlab-unsafe-globals/actions/workflows/build.yml)

Expose the classic Notebook globals (`Jupyter`, `IPython`) on the window, for JupyterLab and Jupyter Notebook.

The classic Notebook (< 7.0) exposed a `Jupyter` object (and its `IPython` alias) on the browser `window`. Many scripts and snippets relied on it, for example `Jupyter.notebook.save_checkpoint()` or `Jupyter.notebook.kernel.execute(...)`. Jupyter Notebook 7+ and JupyterLab removed these globals on purpose (see [jupyter/notebook#6394](https://github.com/jupyter/notebook/issues/6394)).

This extension restores a subset of those globals as an opt-in compatibility shim, implemented on top of the modern JupyterLab APIs. It is a transition aid, not a replacement for a proper port to the [JupyterLab extension APIs](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html).

## ⚠️ Warning: this is unsafe by design

Restoring these globals restores the security posture of the classic Notebook: any JavaScript running in the page, including code injected from a kernel with `IPython.display.Javascript`, can read, modify, execute, and save the current notebook, and reach the whole application through `Jupyter.app`. Install it only if you understand and accept this. Do not install it by default for other users.

## Requirements

- JupyterLab >= 4.0.0 or Jupyter Notebook >= 7.0.0

## Install

To install the extension, execute:

```bash
pip install jupyterlab_unsafe_globals
```

## Usage

After installing, `window.Jupyter` and `window.IPython` (a plain alias, like in classic) are available on notebook pages:

```js
// insert a cell and run code on the kernel, classic style
const cell = Jupyter.notebook.insert_cell_below('code');
cell.set_text('print("hello")');

Jupyter.notebook.kernel.execute('1 + 1', {
  iopub: { output: msg => console.log(msg.content) },
  shell: { reply: msg => console.log(msg.content.status) }
});

Jupyter.notebook.save_checkpoint();

Jupyter.events.on('kernel_idle.Kernel', () => console.log('idle'));
```

`Jupyter.notebook` always points to the current notebook of the notebook tracker. In Jupyter Notebook there is one notebook per page, like in classic; in JupyterLab it is the most recently focused notebook, and `null` when no notebook is open.

### What is shimmed

- `Jupyter.notebook`: cell access and selection (`get_cells`, `get_cell`, `get_selected_cell`, `get_selected_index`, `ncells`, `select`, ...), insertion and deletion (`insert_cell_above/below/at_index`, `delete_cell(s)`), execution (`execute_cell`, `execute_selected_cells`, `execute_all_cells`, `execute_cells`, `execute_cell_range`), saving (`save_notebook`, `save_checkpoint`), and properties (`metadata`, `dirty`, `trusted`, `mode`, `notebook_name`, `notebook_path`, `base_url`, `writable`, `_fully_loaded`).
- `Jupyter.notebook.kernel`: `execute(code, callbacks, options)` with the exact classic callback shape and defaults (`silent: true`, `store_history: false`, `stop_on_error: true`), `interrupt`, `restart`, `reconnect`, `is_connected`, `send_input_reply`, `id`, `name`.
- `Jupyter.events` (also `Jupyter.notebook.events`): `on`, `one`, `off`, `trigger`; emits `notebook_loaded.Notebook`, `kernel_ready.Kernel`, `kernel_busy.Kernel`, `kernel_idle.Kernel`, `select.Cell`, and `set_dirty.Notebook`.
- `Jupyter.version`, `Jupyter._target`, and `Jupyter.app` (the `JupyterFrontEnd` application, not part of classic, provided as the migration escape hatch).

Cell objects support `get_text`, `set_text`, `cell_type`, `metadata`, `execute`, `render`, `rendered`, `select`, and `focus_cell`, plus `widget`, the underlying JupyterLab cell widget.

### What is not shimmed

Page-chrome and extension-authoring APIs are out of scope: `Jupyter.keyboard_manager`, `Jupyter.toolbar`, `Jupyter.actions`, the classic constructors (`Jupyter.CodeCell`, ...), and the other page globals (`$`, `require`, `_`, `CodeMirror`, `MathJax`). `Jupyter.notebook.config` is an inert stub whose `loaded` promise resolves immediately, so extensions that gate on it proceed with their defaults. Classic nbextensions will not run on this shim; port them to real JupyterLab extensions instead.

Note: `metadata` reads and writes work at the top level (`metadata.foo = {...}`); nested in-place mutations (`metadata.foo.bar = 1`) are not persisted, assign the whole sub-object instead.

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_unsafe_globals
```

## Contributing

If you would like to contribute to this extension, please refer to the [Contributing Guide](CONTRIBUTING.md).
