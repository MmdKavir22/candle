import type { Catalog } from '../services/data';
import type { Safe } from '../utils/dom';

export interface Route { segs: string[]; params: URLSearchParams }
export interface Page {
  title: string;
  desc?: string;
  view: Safe;
  mount?: (root: HTMLElement, signal: AbortSignal) => void;
}
export type PageFn = (ctx: Catalog, route: Route) => Page;
