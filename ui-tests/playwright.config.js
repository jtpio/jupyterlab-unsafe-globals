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
  webServer: {
    command: `jlpm start --port ${port} --ServerApp.port_retries=0`,
    url: `http://localhost:${port}/lab`,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
