import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyterlab-unsafe-globals extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-unsafe-globals:plugin',
  description: 'Expose the classic Notebook globals (Jupyter, IPython) on the window, for JupyterLab and Jupyter Notebook',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyterlab-unsafe-globals is activated!');
  }
};

export default plugin;
