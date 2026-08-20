// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import type { Page } from '@playwright/test';

const NOTEBOOK = 'nb7_globals_test.ipynb';

const EMPTY_NOTEBOOK = JSON.stringify({
  cells: [
    {
      cell_type: 'code',
      source: '',
      metadata: {},
      outputs: [],
      execution_count: null
    }
  ],
  metadata: {
    kernelspec: { display_name: 'Python 3 (ipykernel)', name: 'python3' }
  },
  nbformat: 4,
  nbformat_minor: 5
});

/**
 * The documented classic API surface, as dotted paths on `window.Jupyter`
 * with their expected types. The smoke test walks all of them.
 */
const SURFACE: [string, string][] = [
  ['version', 'string'],
  ['_target', 'string'],
  ['app', 'object'],
  ['events.on', 'function'],
  ['events.one', 'function'],
  ['events.off', 'function'],
  ['events.trigger', 'function'],
  ['utils.url_path_join', 'function'],
  ['utils.url_join_encode', 'function'],
  ['utils.encode_uri_components', 'function'],
  ['utils.uuid', 'function'],
  ['utils.splitext', 'function'],
  ['dialog.modal', 'function'],
  ['dialog.kernel_modal', 'function'],
  ['menubar._nbconvert', 'function'],
  ['menubar._new_window', 'function'],
  ['toolbar.add_buttons_group', 'function'],
  ['contents.get', 'function'],
  ['contents.new_untitled', 'function'],
  ['contents.delete', 'function'],
  ['contents.rename', 'function'],
  ['contents.save', 'function'],
  ['contents.copy', 'function'],
  ['contents.trust', 'function'],
  ['contents.list_contents', 'function'],
  ['contents.create_checkpoint', 'function'],
  ['contents.list_checkpoints', 'function'],
  ['contents.restore_checkpoint', 'function'],
  ['contents.delete_checkpoint', 'function'],
  ['keyboard_manager.enable', 'function'],
  ['keyboard_manager.disable', 'function'],
  ['keyboard_manager.register_events', 'function'],
  ['keyboard_manager.edit_mode', 'function'],
  ['keyboard_manager.command_mode', 'function'],
  ['keyboard_manager.actions.register', 'function'],
  ['keyboard_manager.actions.get', 'function'],
  ['keyboard_manager.actions.exists', 'function'],
  ['keyboard_manager.actions.call', 'function'],
  ['keyboard_manager.actions.get_name', 'function'],
  ['keyboard_manager.actions.extend_env', 'function'],
  ['keyboard_manager.command_shortcuts.add_shortcut', 'function'],
  ['keyboard_manager.command_shortcuts.add_shortcuts', 'function'],
  ['keyboard_manager.command_shortcuts.remove_shortcut', 'function'],
  ['keyboard_manager.edit_shortcuts.add_shortcut', 'function'],
  ['notebook.kernel', 'object'],
  ['notebook.session', 'object'],
  ['notebook.contents', 'object'],
  ['notebook.events', 'object'],
  ['notebook.config.loaded', 'object'],
  ['notebook.config.data', 'object'],
  ['notebook.config.update', 'function'],
  ['notebook.metadata', 'object'],
  ['notebook.checkpoints', 'object'],
  ['notebook.dirty', 'boolean'],
  ['notebook.trusted', 'boolean'],
  ['notebook.writable', 'boolean'],
  ['notebook.mode', 'string'],
  ['notebook.notebook_name', 'string'],
  ['notebook.notebook_path', 'string'],
  ['notebook.base_url', 'string'],
  ['notebook._fully_loaded', 'boolean'],
  ['notebook.get_cells', 'function'],
  ['notebook.get_cell', 'function'],
  ['notebook.get_selected_cell', 'function'],
  ['notebook.get_selected_index', 'function'],
  ['notebook.get_edit_index', 'function'],
  ['notebook.get_selected_cells', 'function'],
  ['notebook.get_selected_cells_indices', 'function'],
  ['notebook.find_cell_index', 'function'],
  ['notebook.index_or_selected', 'function'],
  ['notebook.ncells', 'function'],
  ['notebook.select', 'function'],
  ['notebook.select_next', 'function'],
  ['notebook.select_prev', 'function'],
  ['notebook.select_all', 'function'],
  ['notebook.extend_selection_by', 'function'],
  ['notebook.insert_cell_at_index', 'function'],
  ['notebook.insert_cell_above', 'function'],
  ['notebook.insert_cell_below', 'function'],
  ['notebook.insert_cell_at_bottom', 'function'],
  ['notebook.delete_cell', 'function'],
  ['notebook.delete_cells', 'function'],
  ['notebook.undelete_cell', 'function'],
  ['notebook.move_cell_up', 'function'],
  ['notebook.move_cell_down', 'function'],
  ['notebook.move_selection_up', 'function'],
  ['notebook.move_selection_down', 'function'],
  ['notebook.merge_cell_above', 'function'],
  ['notebook.merge_cell_below', 'function'],
  ['notebook.merge_cells', 'function'],
  ['notebook.split_cell', 'function'],
  ['notebook.copy_cell', 'function'],
  ['notebook.cut_cell', 'function'],
  ['notebook.paste_cell_above', 'function'],
  ['notebook.paste_cell_below', 'function'],
  ['notebook.paste_cell_replace', 'function'],
  ['notebook.to_code', 'function'],
  ['notebook.to_markdown', 'function'],
  ['notebook.to_raw', 'function'],
  ['notebook.cells_to_code', 'function'],
  ['notebook.cells_to_markdown', 'function'],
  ['notebook.cells_to_raw', 'function'],
  ['notebook.clear_output', 'function'],
  ['notebook.clear_cells_outputs', 'function'],
  ['notebook.clear_all_output', 'function'],
  ['notebook.toggle_output', 'function'],
  ['notebook.collapse_output', 'function'],
  ['notebook.expand_output', 'function'],
  ['notebook.toggle_output_scroll', 'function'],
  ['notebook.execute_cell', 'function'],
  ['notebook.execute_selected_cells', 'function'],
  ['notebook.execute_cell_and_select_below', 'function'],
  ['notebook.execute_all_cells', 'function'],
  ['notebook.execute_cell_range', 'function'],
  ['notebook.execute_cells', 'function'],
  ['notebook.save_notebook', 'function'],
  ['notebook.save_checkpoint', 'function'],
  ['notebook.create_checkpoint', 'function'],
  ['notebook.list_checkpoints', 'function'],
  ['notebook.restore_checkpoint', 'function'],
  ['notebook.delete_checkpoint', 'function'],
  ['notebook.get_notebook_name', 'function'],
  ['notebook.set_notebook_name', 'function'],
  ['notebook.rename', 'function'],
  ['notebook.trust_notebook', 'function'],
  ['notebook.restart_kernel', 'function'],
  ['notebook.restart_run_all', 'function'],
  ['notebook.restart_clear_output', 'function'],
  ['notebook.shutdown_kernel', 'function'],
  ['notebook.start_session', 'function'],
  ['notebook.command_mode', 'function'],
  ['notebook.edit_mode', 'function'],
  ['notebook.scroll_to_top', 'function'],
  ['notebook.scroll_to_bottom', 'function'],
  ['notebook.set_dirty', 'function'],
  ['notebook.toJSON', 'function'],
  ['notebook.focus_cell', 'function'],
  ['notebook.kernel.execute', 'function'],
  ['notebook.kernel.send_shell_message', 'function'],
  ['notebook.kernel.complete', 'function'],
  ['notebook.kernel.inspect', 'function'],
  ['notebook.kernel.kernel_info', 'function'],
  ['notebook.kernel.comm_info', 'function'],
  ['notebook.kernel.send_input_reply', 'function'],
  ['notebook.kernel.interrupt', 'function'],
  ['notebook.kernel.restart', 'function'],
  ['notebook.kernel.reconnect', 'function'],
  ['notebook.kernel.is_connected', 'function'],
  ['notebook.kernel.is_fully_disconnected', 'function'],
  ['notebook.kernel.id', 'string'],
  ['notebook.kernel.name', 'string'],
  ['notebook.kernel.username', 'string'],
  ['notebook.kernel.ws_url', 'string'],
  ['notebook.kernel.session_id', 'string'],
  ['notebook.kernel.info_reply', 'object'],
  ['notebook.kernel.comm_manager.register_target', 'function'],
  ['notebook.kernel.comm_manager.unregister_target', 'function'],
  ['notebook.kernel.comm_manager.new_comm', 'function'],
  ['notebook.kernel.comm_manager.register_comm', 'function'],
  ['notebook.kernel.comm_manager.unregister_comm', 'function'],
  ['notebook.session.kernel', 'object'],
  ['notebook.session.delete', 'function'],
  ['notebook.session.restart', 'function'],
  ['notebook.session.list', 'function'],
  ['notebook.session.rename_notebook', 'function']
];

/**
 * The documented classic cell surface, as dotted paths on the first cell.
 */
const CELL_SURFACE: [string, string][] = [
  ['cell_type', 'string'],
  ['metadata', 'object'],
  ['notebook', 'object'],
  ['events', 'object'],
  ['selected', 'boolean'],
  ['rendered', 'boolean'],
  ['element', 'object'],
  ['widget', 'object'],
  ['get_text', 'function'],
  ['set_text', 'function'],
  ['execute', 'function'],
  ['render', 'function'],
  ['unrender', 'function'],
  ['select', 'function'],
  ['unselect', 'function'],
  ['focus_cell', 'function'],
  ['is_editable', 'function'],
  ['is_deletable', 'function'],
  ['set_input_prompt', 'function'],
  ['show_line_numbers', 'function'],
  ['toggle_line_numbers', 'function'],
  ['code_mirror.getValue', 'function'],
  ['code_mirror.setValue', 'function'],
  ['code_mirror.getCursor', 'function'],
  ['code_mirror.setCursor', 'function'],
  ['code_mirror.getLine', 'function'],
  ['code_mirror.lineCount', 'function'],
  ['code_mirror.focus', 'function'],
  ['code_mirror.refresh', 'function'],
  ['code_mirror.setOption', 'function'],
  ['code_mirror.getOption', 'function'],
  ['code_mirror.on', 'function'],
  ['code_mirror.off', 'function'],
  ['output_area.append_output', 'function'],
  ['output_area.clear_output', 'function'],
  ['output_area.handle_output', 'function'],
  ['output_area.toggle_output', 'function'],
  ['output_area.toJSON', 'function']
];

/**
 * The extension must work in Jupyter Notebook 7 as well; the test server
 * serves the Notebook UI on /tree and /notebooks alongside /lab.
 */
test.use({ autoGoto: false });

/**
 * Upload an empty notebook and open it in the Notebook 7 interface.
 */
async function openNotebook7(
  page: IJupyterLabPageFixture,
  tmpPath: string,
  baseURL: string
): Promise<Page> {
  await page.contents.uploadContent(
    EMPTY_NOTEBOOK,
    'text',
    `${tmpPath}/${NOTEBOOK}`
  );
  const nb7 = await page.context().newPage();
  await nb7.goto(`${baseURL}/notebooks/${tmpPath}/${NOTEBOOK}`);
  await nb7.waitForFunction(() => {
    const w = window as any;
    return !!(
      w.Jupyter &&
      w.Jupyter.notebook &&
      w.Jupyter.notebook.kernel &&
      w.Jupyter.notebook.kernel.is_connected()
    );
  });
  return nb7;
}

test('should support the main use cases in Notebook 7', async ({
  page,
  tmpPath,
  baseURL
}) => {
  const nb7 = await openNotebook7(page, tmpPath, baseURL!);
  const result = await nb7.evaluate(async () => {
    const w = window as any;
    const J = w.Jupyter;
    let idle = false;
    J.events.on('kernel_idle.Kernel', () => {
      idle = true;
    });
    const cell = J.notebook.insert_cell_below('code');
    cell.set_text('a = 40 + 2');
    const output = await new Promise(resolve => {
      setTimeout(() => resolve('TIMEOUT'), 30000);
      J.notebook.kernel.execute('print("hello from notebook 7")', {
        iopub: {
          output: (msg: any) => resolve(msg.content.text)
        }
      });
    });
    for (let i = 0; i < 50 && !idle; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    await J.notebook.save_checkpoint();
    return {
      alias: w.Jupyter === w.IPython,
      name: J.notebook.notebook_name,
      ncells: J.notebook.ncells(),
      output,
      idle,
      dirtyAfterSave: J.notebook.dirty
    };
  });
  await nb7.close();
  expect(result.alias).toBe(true);
  expect(result.name).toBe(NOTEBOOK);
  expect(result.ncells).toBe(2);
  expect(result.output).toBe('hello from notebook 7\n');
  expect(result.idle).toBe(true);
  expect(result.dirtyAfterSave).toBe(false);
});

test('should expose the whole documented API surface in Notebook 7', async ({
  page,
  tmpPath,
  baseURL
}) => {
  const nb7 = await openNotebook7(page, tmpPath, baseURL!);
  const mismatches = await nb7.evaluate(
    ([surface, cellSurface]) => {
      const resolve = (root: any, path: string): any =>
        path.split('.').reduce((obj, key) => obj?.[key], root);
      const J = (window as any).Jupyter;
      const bad: string[] = [];
      for (const [path, expected] of surface) {
        const actual = typeof resolve(J, path);
        if (actual !== expected) {
          bad.push(`Jupyter.${path}: ${actual} (expected ${expected})`);
        }
      }
      const cell = J.notebook.get_cell(0);
      for (const [path, expected] of cellSurface) {
        const actual = typeof resolve(cell, path);
        if (actual !== expected) {
          bad.push(`cell.${path}: ${actual} (expected ${expected})`);
        }
      }
      return bad;
    },
    [SURFACE, CELL_SURFACE]
  );
  await nb7.close();
  expect(mismatches).toEqual([]);
});
