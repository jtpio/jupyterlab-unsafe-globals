// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';

const NOTEBOOK = 'globals_test.ipynb';

/**
 * Wait until the classic kernel shim reports a connected kernel.
 */
async function waitForKernel(page: IJupyterLabPageFixture): Promise<void> {
  await page.waitForFunction(() => {
    const w = window as any;
    return !!(
      w.Jupyter &&
      w.Jupyter.notebook &&
      w.Jupyter.notebook.kernel &&
      w.Jupyter.notebook.kernel.is_connected()
    );
  });
}

test.describe('activation', () => {
  /**
   * Don't load JupyterLab webpage before running the tests.
   * This is required to ensure we capture all log messages.
   */
  test.use({ autoGoto: false });

  test('should emit an activation console message', async ({ page }) => {
    const logs: string[] = [];

    page.on('console', message => {
      logs.push(message.text());
    });

    await page.goto();

    expect(
      logs.filter(
        s =>
          s ===
          'jupyterlab-unsafe-globals: window.Jupyter and window.IPython are now available'
      )
    ).toHaveLength(1);
  });
});

test('should expose window.Jupyter and window.IPython', async ({ page }) => {
  const result = await page.evaluate(() => {
    const w = window as any;
    return {
      hasJupyter: typeof w.Jupyter !== 'undefined',
      alias: w.Jupyter === w.IPython,
      notebook: w.Jupyter.notebook,
      hasEvents: typeof w.Jupyter.events.on === 'function',
      version: w.Jupyter.version
    };
  });
  expect(result.hasJupyter).toBe(true);
  expect(result.alias).toBe(true);
  // no notebook is open yet
  expect(result.notebook).toBeNull();
  expect(result.hasEvents).toBe(true);
  expect(typeof result.version).toBe('string');
});

test.describe('with a notebook', () => {
  test.beforeEach(async ({ page }) => {
    await page.notebook.createNew(NOTEBOOK);
    await waitForKernel(page);
  });

  test.afterEach(async ({ page }) => {
    await page.notebook.close(true);
    if (await page.contents.fileExists(NOTEBOOK)) {
      await page.contents.deleteFile(NOTEBOOK);
    }
  });

  test('should point Jupyter.notebook to the current notebook', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const nb = (window as any).Jupyter.notebook;
      return {
        name: nb.notebook_name,
        path: nb.notebook_path,
        fullyLoaded: nb._fully_loaded,
        kernelName: nb.kernel.name
      };
    });
    expect(result.name).toBe(NOTEBOOK);
    // galata runs each test in its own subdirectory
    expect(result.path.endsWith(NOTEBOOK)).toBe(true);
    expect(result.fullyLoaded).toBe(true);
    expect(typeof result.kernelName).toBe('string');
  });

  test('should manipulate cells with the classic API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const nb = (window as any).Jupyter.notebook;
      const before = nb.ncells();
      const cell = nb.insert_cell_below('code');
      cell.set_text('a = 1');
      const md = nb.insert_cell_below('markdown', 1);
      md.set_text('# Title');
      md.render();
      return {
        before,
        after: nb.ncells(),
        cellText: nb.get_cell(1).get_text(),
        mdType: nb.get_cell(2).cell_type,
        selectedIndex: nb.select(2).get_selected_index(),
        selectedText: nb.get_selected_cell().get_text()
      };
    });
    expect(result.before).toBe(1);
    expect(result.after).toBe(3);
    expect(result.cellText).toBe('a = 1');
    expect(result.mdType).toBe('markdown');
    expect(result.selectedIndex).toBe(2);
    expect(result.selectedText).toBe('# Title');
  });

  test('should execute code with the classic kernel callbacks', async ({
    page
  }) => {
    const result = await page.evaluate(async () => {
      const kernel = (window as any).Jupyter.notebook.kernel;
      let output = '';
      let msgId: any = null;
      const reply = await new Promise(resolve => {
        setTimeout(() => resolve('TIMEOUT'), 30000);
        msgId = kernel.execute('print("hello from unsafe globals")', {
          shell: {
            reply: (msg: any) => resolve(msg.content.status)
          },
          iopub: {
            output: (msg: any) => {
              output = msg.content.text;
            }
          }
        });
      });
      // the iopub output can arrive slightly after the shell reply
      for (let i = 0; i < 50 && !output; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      return { output, reply, msgIdType: typeof msgId };
    });
    expect(result.output).toBe('hello from unsafe globals\n');
    expect(result.reply).toBe('ok');
    expect(result.msgIdType).toBe('string');
  });

  test('should run all cells with execute_all_cells', async ({ page }) => {
    await page.notebook.setCell(0, 'code', 'print(40 + 2)');
    await page.evaluate(() => {
      (window as any).Jupyter.notebook.execute_all_cells();
    });
    await page.waitForFunction(() => {
      const nb = (window as any).Jupyter.notebook;
      const outputs =
        nb.get_cell(0).widget.model.sharedModel.toJSON().outputs ?? [];
      return outputs.length > 0;
    });
    const text = await page.evaluate(
      () =>
        (window as any).Jupyter.notebook
          .get_cell(0)
          .widget.model.sharedModel.toJSON().outputs[0].text
    );
    expect(text).toBe('42\n');
  });

  test('should save with save_checkpoint', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const nb = (window as any).Jupyter.notebook;
      nb.get_cell(0).set_text('x = 1');
      const dirtyBefore = nb.dirty;
      await nb.save_checkpoint();
      return { dirtyBefore, dirtyAfter: nb.dirty };
    });
    expect(result.dirtyBefore).toBe(true);
    expect(result.dirtyAfter).toBe(false);
  });

  test('should trigger classic events', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      let idle = false;
      let selected: any = null;
      J.events.on('kernel_idle.Kernel', () => {
        idle = true;
      });
      J.events.on('select.Cell', (event: any, data: any) => {
        selected = { type: event.type, cellType: data.cell?.cell_type };
      });
      await new Promise(resolve => {
        J.notebook.kernel.execute('1 + 1', {
          shell: { reply: () => resolve(undefined) }
        });
      });
      J.notebook.insert_cell_below('code').select();
      return { idle, selected };
    });
    expect(result.idle).toBe(true);
    expect(result.selected).toEqual({
      type: 'select.Cell',
      cellType: 'code'
    });
  });

  test('should read and write notebook metadata', async ({ page }) => {
    const result = await page.evaluate(() => {
      const nb = (window as any).Jupyter.notebook;
      nb.metadata.custom_key = { answer: 42 };
      return {
        roundTrip: nb.metadata.custom_key,
        kernelspec: nb.metadata.kernelspec?.name
      };
    });
    expect(result.roundTrip).toEqual({ answer: 42 });
    expect(typeof result.kernelspec).toBe('string');
  });
});
