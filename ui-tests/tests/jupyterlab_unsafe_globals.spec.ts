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
      // the iopub idle status can arrive after the shell reply
      for (let i = 0; i < 50 && !idle; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
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

  test('should support the classic cell operations', async ({ page }) => {
    const result = await page.evaluate(() => {
      const nb = (window as any).Jupyter.notebook;
      nb.get_cell(0).set_text('first');
      nb.insert_cell_below('code').set_text('second');
      nb.move_cell_down(0);
      const afterMove = nb.get_cells().map((c: any) => c.get_text());
      nb.merge_cells([0, 1]);
      const afterMerge = { n: nb.ncells(), text: nb.get_cell(0).get_text() };
      nb.to_markdown(0);
      const mdType = nb.get_cell(0).cell_type;
      nb.to_code(0);
      nb.copy_cell();
      nb.paste_cell_below();
      return { afterMove, afterMerge, mdType, afterPaste: nb.ncells() };
    });
    expect(result.afterMove).toEqual(['second', 'first']);
    expect(result.afterMerge).toEqual({ n: 1, text: 'second\n\nfirst' });
    expect(result.mdType).toBe('markdown');
    expect(result.afterPaste).toBe(2);
  });

  test('should create and list checkpoints with events', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      let created: any = null;
      J.events.on('checkpoint_created.Notebook', (event: any, data: any) => {
        created = data;
      });
      await J.notebook.save_checkpoint();
      const listed = await J.notebook.list_checkpoints();
      return {
        createdId: created?.id,
        lastId: J.notebook.last_checkpoint?.id,
        nListed: listed.length
      };
    });
    expect(typeof result.createdId).toBe('string');
    expect(typeof result.lastId).toBe('string');
    expect(result.nListed).toBeGreaterThan(0);
  });

  test('should complete code through the classic kernel API', async ({
    page
  }) => {
    const matches = await page.evaluate(
      async () =>
        new Promise(resolve => {
          setTimeout(() => resolve('TIMEOUT'), 30000);
          (window as any).Jupyter.notebook.kernel.complete(
            'pri',
            3,
            (msg: any) => resolve(msg.content.matches)
          );
        })
    );
    expect(matches).toContain('print');
  });

  test('should round trip a comm through comm_manager', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      await new Promise(resolve => {
        J.notebook.kernel.execute(
          [
            'def _target(comm, open_msg):',
            '    @comm.on_msg',
            '    def _recv(msg):',
            "        comm.send({'echo': msg['content']['data']})",
            "get_ipython().kernel.comm_manager.register_target('unsafe_echo', _target)"
          ].join('\n'),
          { shell: { reply: () => resolve(undefined) } }
        );
      });
      const comm = J.notebook.kernel.comm_manager.new_comm('unsafe_echo', {});
      return await new Promise(resolve => {
        const timer = setTimeout(() => resolve('TIMEOUT'), 30000);
        comm.on_msg((msg: any) => {
          clearTimeout(timer);
          resolve(msg.content.data);
        });
        comm.send({ value: 42 });
      });
    });
    expect(result).toEqual({ echo: { value: 42 } });
  });

  test('should add a classic toolbar button group', async ({ page }) => {
    const clicked = await page.evaluate(() => {
      const J = (window as any).Jupyter;
      const w = window as any;
      w._unsafeClicked = false;
      J.toolbar.add_buttons_group(
        [
          {
            label: 'Test',
            icon: 'fa-check',
            callback: () => {
              w._unsafeClicked = true;
            }
          }
        ],
        'unsafe-test-group'
      );
      const el = document.getElementById('unsafe-test-group');
      (el?.querySelector('button') as HTMLElement)?.click();
      return w._unsafeClicked;
    });
    expect(clicked).toBe(true);
  });

  test('should show a classic modal dialog', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      let clicked = false;
      J.dialog.modal({
        title: 'Test dialog',
        body: 'Hello',
        buttons: {
          OK: {
            click: () => {
              clicked = true;
            }
          }
        }
      });
      await new Promise(r => setTimeout(r, 300));
      const visible = !!document.querySelector('.jp-Dialog');
      (
        document.querySelector('.jp-Dialog button.jp-mod-accept') as HTMLElement
      )?.click();
      await new Promise(r => setTimeout(r, 200));
      return {
        visible,
        clicked,
        closed: !document.querySelector('.jp-Dialog')
      };
    });
    expect(result).toEqual({ visible: true, clicked: true, closed: true });
  });

  test('should trigger the extended classic events', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      const seen: string[] = [];
      for (const name of [
        'create.Cell',
        'finished_execute.CodeCell',
        'notebook_saved.Notebook',
        'rendered.MarkdownCell'
      ]) {
        J.events.on(name, () => {
          if (!seen.includes(name)) {
            seen.push(name);
          }
        });
      }
      J.notebook.insert_cell_below('code').set_text('1 + 1');
      await new Promise(r => requestAnimationFrame(r));
      const md = J.notebook.insert_cell_below('markdown', 1);
      md.set_text('# hi');
      md.unrender();
      md.render();
      J.notebook.execute_cells([1]);
      for (let i = 0; i < 100 && seen.length < 3; i++) {
        await new Promise(r => setTimeout(r, 200));
      }
      await J.notebook.save_notebook();
      await new Promise(r => setTimeout(r, 300));
      return seen;
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'create.Cell',
        'finished_execute.CodeCell',
        'notebook_saved.Notebook',
        'rendered.MarkdownCell'
      ])
    );
  });

  test('should register classic actions and shortcuts', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      const w = window as any;
      w._unsafeRan = 0;
      const full = J.keyboard_manager.actions.register(
        {
          help: 'test action',
          handler: () => {
            w._unsafeRan++;
          }
        },
        'my-action',
        'unsafe-test'
      );
      await J.app.commands.execute(full);
      J.keyboard_manager.actions.call(full);
      J.keyboard_manager.command_shortcuts.add_shortcut('ctrl-shift-9', full);
      return { full, ran: w._unsafeRan };
    });
    expect(result.full).toBe('unsafe-test:my-action');
    expect(result.ran).toBe(2);

    await page.notebook.enterCellEditingMode(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Shift+Digit9');
    const ran = await page.evaluate(() => (window as any)._unsafeRan);
    expect(ran).toBe(3);
  });

  test('should expose the classic session and contents', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const J = (window as any).Jupyter;
      const model = await J.contents.new_untitled('', { type: 'notebook' });
      const listing = await J.contents.list_contents('');
      const found = listing.content.some((f: any) => f.path === model.path);
      await J.contents.delete(model.path);
      return {
        sessionId: J.notebook.session.id,
        sameKernel: J.notebook.session.kernel === J.notebook.kernel,
        newType: model.type,
        found
      };
    });
    expect(typeof result.sessionId).toBe('string');
    expect(result.sameKernel).toBe(true);
    expect(result.newType).toBe('notebook');
    expect(result.found).toBe(true);
  });
});
