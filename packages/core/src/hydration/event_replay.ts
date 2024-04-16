/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {ENVIRONMENT_INITIALIZER, Provider} from '../di';
import {TNode, TNodeType} from '../render3/interfaces/node';
import {RNode} from '../render3/interfaces/renderer_dom';
import {CLEANUP, LView, TView} from '../render3/interfaces/view';
import {unwrapRNode} from '../render3/util/view_utils';

import {HydrationContext, setJsactionFunctions} from './annotate';

/**
 * Returns a set of providers required to setup support for event replay.
 * Requires hydration to be enabled separately.
 */
export function withEventReplay(): Provider[] {
  return [
    {
      provide: ENVIRONMENT_INITIALIZER,
      useValue: () => {
        setJsactionFunctions(getElementsToEvents, setJSActionAttribute, insertEventReplaySupport);
      },
      multi: true,
    },
  ];
}

function insertEventReplaySupport(eventsToReplay: Set<string>, doc: Document) {
  if (eventsToReplay.size) {
    const events = Array.from(eventsToReplay);
    const script = doc.createElement('script');
    script.id = 'jsa';
    script.type = 'application/json';
    script.textContent = JSON.stringify(events);
    doc.body.insertBefore(script, doc.body.firstChild);
  }
}

function getElementsToEvents(tView: TView, lView: LView): Map<Element, string[]> {
  const events = new Map<Element, string[]>();
  const lCleanup = lView[CLEANUP];
  const tCleanup = tView.cleanup;
  if (tCleanup && lCleanup) {
    for (let i = 0; i < tCleanup.length;) {
      const firstParam = tCleanup[i++];
      const secondParam = tCleanup[i++];
      if (typeof firstParam === 'string') {
        const name: string = firstParam;
        const listenerElement = unwrapRNode(lView[secondParam]) as any as Element;
        i++;  // move the cursor to the next position (location of the listener idx)
        const useCaptureOrIndx = tCleanup[i++];
        // if useCaptureOrIndx is boolean then report it as is.
        // if useCaptureOrIndx is positive number then it in unsubscribe method
        // if useCaptureOrIndx is negative number then it is a Subscription
        const type =
            (typeof useCaptureOrIndx === 'boolean' || useCaptureOrIndx >= 0) ? 'dom' : 'output';
        if (type === 'dom') {
          if (!events.has(listenerElement)) {
            events.set(listenerElement, [name]);
          } else {
            events.get(listenerElement)!.push(name);
          }
        }
      }
    }
  }
  return events;
}

function setJSActionAttribute(
    tNode: TNode, rNode: RNode, nativeElementToEvents: Map<Element, string[]>,
    context: HydrationContext) {
  if (tNode.type && TNodeType.Element) {
    const nativeElement = unwrapRNode(rNode) as Element;
    // 1. Collect all events registered on this node.
    // 2. Add collected events to the context.eventsToReplay
    // 3. Determine / generate namespace (defer blocks)
    // 4. Add `jsaction` attribute
    const events = nativeElementToEvents.get(nativeElement) ?? [];
    let jsaction = '';
    for (const event of events) {
      context.eventsToReplay.add(event);
      jsaction += `${event}:e;`;
    }
    if (jsaction) {
      nativeElement.setAttribute('jsaction', jsaction);
    }
  }
}
