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

- `Jupyter.notebook`: cell access and selection (`get_cells`, `get_cell`, `get_selected_cell`, `get_selected_index`, `ncells`, `select`, `select_all`, ...), insertion, deletion, movement, merge and split (`insert_cell_above/below/at_index`, `delete_cell(s)`, `move_cell_up/down`, `merge_cells`, `split_cell`), the cell clipboard (`copy_cell`, `cut_cell`, `paste_cell_above/below/replace`, `undelete_cell`), type conversion (`to_code`, `to_markdown`, `to_raw`), outputs (`clear_output`, `clear_all_output`, `toggle_output`, `collapse_output`, `expand_output`), execution (`execute_cell`, `execute_selected_cells`, `execute_all_cells`, `execute_cells`, `execute_cell_range`), saving and checkpoints (`save_notebook`, `save_checkpoint`, `create/list/restore/delete_checkpoint`), `rename`, `trust_notebook`, kernel lifecycle (`restart_kernel`, `restart_run_all`, `restart_clear_output`, `shutdown_kernel`, `start_session`), and properties (`metadata`, `dirty`, `trusted`, `mode`, `notebook_name`, `notebook_path`, `base_url`, `writable`, `_fully_loaded`, `session`, `contents`, `keyboard_manager`).
- `Jupyter.notebook.kernel`: `execute(code, callbacks, options)` with the exact classic callback shape and defaults (`silent: true`, `store_history: false`, `stop_on_error: true`), `complete`, `inspect`, `kernel_info`, `comm_info`, `send_shell_message`, `interrupt`, `restart`, `reconnect`, `is_connected`, `send_input_reply`, `id`, `name`, `username`, `ws_url`, `info_reply`, and `comm_manager` (`register_target`, `new_comm`, and classic `Comm` objects with `send`, `on_msg`, `on_close`).
- `Jupyter.events` (also `Jupyter.notebook.events`): `on`, `one`, `off`, `trigger` with the jQuery conventions; emits over 30 classic events, including `notebook_loaded/saved/renamed.Notebook`, `before_save.Notebook`, the checkpoint events, `create/delete/select.Cell`, `execute/finished_execute.CodeCell`, `rendered.MarkdownCell`, `output_appended.OutputArea`, and the kernel lifecycle events (`kernel_ready/busy/idle/restarting/dead.Kernel`).
- `Jupyter.keyboard_manager`: `actions.register/call/get` backed by the application command registry, and `command_shortcuts` / `edit_shortcuts` with `add_shortcut(s)` accepting the classic shortcut strings (`'ctrl-shift-h'`, `'d,d'`).
- `Jupyter.toolbar.add_buttons_group`, applied to every notebook toolbar, with FontAwesome 4 icons bundled.
- `Jupyter.dialog.modal`, backed by the JupyterLab dialog.
- `Jupyter.contents` (also `Jupyter.notebook.contents`): the classic contents API over the JupyterLab contents manager.
- `Jupyter.notebook.session`: `id`, `kernel`, `delete`, `restart`, `list`.
- `Jupyter.menubar._nbconvert`, `Jupyter.actions` (deprecated alias), `Jupyter.version`, `Jupyter._target`, and `Jupyter.app` (the `JupyterFrontEnd` application, not part of classic, provided as the migration escape hatch).

Cell objects support `get_text`, `set_text`, `cell_type`, `metadata`, `execute`, `render`, `unrender`, `rendered`, `select`, `unselect`, `focus_cell`, `is_editable`, `is_deletable`, `input_prompt_number`, `set_input_prompt`, line number toggles, `notebook`, `events`, `element` (a raw DOM node unless jQuery is present), `output_area` (`outputs`, `append_output`, `clear_output`, collapse and scroll toggles), and `code_mirror` (a CodeMirror 5 style adapter with `getValue`, `setValue`, cursor and selection methods, and the `lineNumbers`/`readOnly` options), plus `widget`, the underlying JupyterLab cell widget.

### What is not shimmed

The classic constructors (`Jupyter.CodeCell`, ...), requirejs module access and prototype patching, and the other page globals (`$`, `require`, `_`, `CodeMirror`, `MathJax`) are out of scope. `Jupyter.notebook.config` is an inert stub whose `loaded` promise resolves immediately, so extensions that gate on it proceed with their defaults. CodeMirror 6 cannot serve the CM5 configuration APIs (gutters, folding, themes); those methods are absent and fail loudly. Full classic nbextensions will usually not run on this shim; port them to real JupyterLab extensions instead.

Note: `metadata` reads and writes work at the top level (`metadata.foo = {...}`); nested in-place mutations (`metadata.foo.bar = 1`) are not persisted, assign the whole sub-object instead.

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_unsafe_globals
```

## Contributing

If you would like to contribute to this extension, please refer to the [Contributing Guide](CONTRIBUTING.md).
