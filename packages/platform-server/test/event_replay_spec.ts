/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {DOCUMENT} from '@angular/common';
import {Component, destroyPlatform, getPlatform, Provider, Type} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {bootstrapApplication, HydrationFeature, provideClientHydration} from '@angular/platform-browser';
import {HydrationFeatureKind, withEventReplay} from '@angular/platform-browser/src/hydration';

import {provideServerRendering} from '../public_api';
import {renderApplication} from '../src/utils';

/**
 * The name of the attribute that contains a slot index
 * inside the TransferState storage where hydration info
 * could be found.
 */
const NGH_ATTR_NAME = 'ngh';
const EMPTY_TEXT_NODE_COMMENT = 'ngetn';
const TEXT_NODE_SEPARATOR_COMMENT = 'ngtns';

const NGH_ATTR_REGEXP = new RegExp(` ${NGH_ATTR_NAME}=".*?"`, 'g');
const EMPTY_TEXT_NODE_REGEXP = new RegExp(`<!--${EMPTY_TEXT_NODE_COMMENT}-->`, 'g');
const TEXT_NODE_SEPARATOR_REGEXP = new RegExp(`<!--${TEXT_NODE_SEPARATOR_COMMENT}-->`, 'g');

/**
 * Drop utility attributes such as `ng-version`, `ng-server-context` and `ngh`,
 * so that it's easier to make assertions in tests.
 */
function stripUtilAttributes(html: string, keepNgh: boolean): string {
  html = html.replace(/ ng-version=".*?"/g, '')
             .replace(/ ng-server-context=".*?"/g, '')
             .replace(/ ng-reflect-(.*?)=".*?"/g, '')
             .replace(/ _nghost(.*?)=""/g, '')
             .replace(/ _ngcontent(.*?)=""/g, '');
  if (!keepNgh) {
    html = html.replace(NGH_ATTR_REGEXP, '')
               .replace(EMPTY_TEXT_NODE_REGEXP, '')
               .replace(TEXT_NODE_SEPARATOR_REGEXP, '');
  }
  return html;
}

/**
 * Extracts a portion of HTML located inside of the `<body>` element.
 * This content belongs to the application view (and supporting TransferState
 * scripts) rendered on the server.
 */
function getAppContents(html: string): string {
  const result = stripUtilAttributes(html, true).match(/<body>(.*?)<\/body>/s);
  return result ? result[1] : html;
}

/**
 * Converts a static HTML to a DOM structure.
 *
 * @param html the rendered html in test
 * @param doc the document object
 * @returns a div element containing a copy of the app contents
 */
function convertHtmlToDom(html: string, doc: Document): HTMLElement {
  const contents = getAppContents(html);
  const container = doc.createElement('div');
  container.innerHTML = contents;
  return container;
}

describe('platform-server hydration integration', () => {
  beforeEach(() => {
    if (typeof ngDevMode === 'object') {
      // Reset all ngDevMode counters.
      for (const metric of Object.keys(ngDevMode!)) {
        const currentValue = (ngDevMode as unknown as {[key: string]: number | boolean})[metric];
        if (typeof currentValue === 'number') {
          // Rest only numeric values, which represent counters.
          (ngDevMode as unknown as {[key: string]: number | boolean})[metric] = 0;
        }
      }
    }
    if (getPlatform()) destroyPlatform();
  });

  afterAll(() => destroyPlatform());

  describe('hydration', () => {
    let doc: Document;

    beforeEach(() => {
      doc = TestBed.inject(DOCUMENT);
    });

    afterEach(() => {
      doc.body.textContent = '';
    });

    /**
     * This renders the application with server side rendering logic.
     *
     * @param component the test component to be rendered
     * @param doc the document
     * @param envProviders the environment providers
     * @returns a promise containing the server rendered app as a string
     */
    async function ssr(component: Type<unknown>, options?: {
      doc?: string,
    }): Promise<string> {
      const defaultHtml = '<html><head></head><body><app></app></body></html>';
      const providers = [
        provideServerRendering(),
        // @ts-ignore
        provideClientHydration(withEventReplay()),
      ];

      const bootstrap = () => bootstrapApplication(component, {providers});

      return renderApplication(bootstrap, {
        document: options?.doc ?? defaultHtml,
      });
    }

    describe('server rendering', () => {
      it('should wipe out existing host element content when server side rendering', async () => {
        @Component({
          standalone: true,
          selector: 'app',
          template: `
            <div (click)="onClick()">
                <div (blur)="onClick()"></div>
            </div>
          `,
        })
        class SimpleComponent {
          onClick() {}
        }

        const doc = `<html><head></head><body><app></app></body></html>`;
        const html = await ssr(SimpleComponent, {doc});
        const ssrContents = getAppContents(html);
        expect(ssrContents.startsWith(
                   '<script id="jsa" type="application/json">["click","blur"]</script>'))
            .toBeTrue();
        expect(ssrContents)
            .toContain('<div jsaction="click:e;"><div jsaction="blur:e;"></div></div>');
      });
    });
  });
});
