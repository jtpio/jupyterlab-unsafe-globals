/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

// Allow overriding the port, e.g. when another server occupies 8888
const port = process.env.JUPYTER_PORT ?? '8888';

module.exports = {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${port}`
  },
  projects: [
    // the full behavior suite runs against JupyterLab
    { name: 'jupyterlab', testIgnore: /notebook7/ },
    // the main use cases and the API surface run against Notebook 7,
    // served by the same server on /tree and /notebooks
    { name: 'notebook7', testMatch: /notebook7/ }
  ],
  webServer: {
    command: `jlpm start --port ${port} --ServerApp.port_retries=0`,
    url: `http://localhost:${port}/lab`,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
