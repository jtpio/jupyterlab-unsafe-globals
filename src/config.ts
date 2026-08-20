// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

import { getApp } from './shimcontext';

/**
 * Get the cached config section shim for a section name.
 */
export function getConfigSection(name: string): ConfigSectionShim {
  let shim = Private.sections.get(name);
  if (!shim) {
    shim = new ConfigSectionShim(name);
    Private.sections.set(name, shim);
  }
  return shim;
}

/**
 * Replica of the classic config section, backed by the `/api/config`
 * endpoint that the Jupyter server still serves.
 */
export class ConfigSectionShim {
  /**
   * Construct a config section and start loading it.
   */
  constructor(sectionName: string) {
    this.section_name = sectionName;
    this.loaded = this._load();
  }

  /**
   * The section name, e.g. `'notebook'`.
   */
  readonly section_name: string;

  /**
   * The section data; populated once `loaded` resolves.
   */
  data: any = {};

  /**
   * Resolves with the data when the section is loaded.
   */
  readonly loaded: Promise<any>;

  /**
   * Deep-merge new data into the section on the server, classic style.
   *
   * @param newdata - The data to merge
   * @returns The updated section data
   */
  update(newdata: any): Promise<any> {
    const settings = getApp().serviceManager.serverSettings;
    return ServerConnection.makeRequest(
      this._url(),
      { method: 'PATCH', body: JSON.stringify(newdata) },
      settings
    ).then(async response => {
      if (response.ok) {
        this.data = await response.json();
      } else {
        console.warn(
          `jupyterlab-unsafe-globals: updating the config section '${this.section_name}' failed (${response.status})`
        );
      }
      return this.data;
    });
  }

  private _url(): string {
    const settings = getApp().serviceManager.serverSettings;
    return URLExt.join(settings.baseUrl, 'api/config', this.section_name);
  }

  private async _load(): Promise<any> {
    const settings = getApp().serviceManager.serverSettings;
    const response = await ServerConnection.makeRequest(
      this._url(),
      {},
      settings
    );
    if (response.ok) {
      this.data = await response.json();
    }
    return this.data;
  }
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The config section cache, one per section name.
   */
  export const sections = new Map<string, ConfigSectionShim>();
}
