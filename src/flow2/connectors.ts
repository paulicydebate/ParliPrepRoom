// Link lines between an argument and its answers.
//
// Adapted from Flowist (by Elli; used with permission): workspace/layout/response-connector-layout.ts.
// The route and the path shapes (the eased 'curved' default, the square and rounded-square elbows
// and the straight line) are Flowist's; the inputs here are plain rectangles, since this app's cells
// are not Flowist's sheet cells.

export type ConnectorShape = 'curved' | 'straight' | 'square' | 'rounded-square';

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const ROUNDED_CORNER_RADIUS = 8;

type CurvedConnectorOptions = { corner: number; ease: number };

export const CURVED_CONNECTOR_DEFAULTS: Readonly<CurvedConnectorOptions> = { corner: 32, ease: 0.75 };

export type ConnectorPath = {
  key: string;
  sourceId: string;
  responseId: string | null;
  sourceCellIds: readonly string[];
  responseCellIds: readonly string[];
  ghost: boolean;
  sourceX: number;
  sourceY: number;
  elbowX: number;
  responseX: number;
  responseY: number;
  straight: boolean;
  d: string;
};

type ConnectorRoute = Omit<ConnectorPath, 'd' | 'straight'>;

/** Where the lines of one argument bend: halfway across the gutter, so its answers share one trunk. */
export const SHARED_CONTROL_RATIO = 0.5;

/** The route from the argument's right edge to the answer's left edge (rects in sheet pixels). */
export function routeBetween(key: string, source: Rect, response: Rect, sourceId: string, responseId: string | null, track = SHARED_CONTROL_RATIO): ConnectorRoute {
  const sourceY = (source.top + source.bottom) / 2;
  const responseY = (response.top + response.bottom) / 2;
  const sourceX = source.right;
  const responseX = response.left;
  const gutter = responseX - sourceX;
  const direction = Math.sign(gutter) || 1;
  const distance = Math.abs(gutter);
  const inset = Math.min(4, distance / 4);
  const clampedTrack = Math.max(0, Math.min(1, track));
  const elbowX = sourceX + direction * (inset + Math.max(0, distance - inset * 2) * clampedTrack);
  return { key, sourceId, responseId, sourceCellIds: [sourceId], responseCellIds: responseId ? [responseId] : [], ghost: false, sourceX, sourceY, elbowX, responseX, responseY };
}

const pathNumber = (value: number) => Math.round(value * 1000) / 1000;
function orthogonalRoutePath(route: ConnectorRoute, radius: number) {
  const verticalDirection = Math.sign(route.responseY - route.sourceY) || 1;
  const inward = Math.sign(route.elbowX - route.sourceX) || 1;
  const outward = Math.sign(route.responseX - route.elbowX) || 1;
  const corner = Math.max(0, Math.min(
    radius,
    Math.abs(route.responseY - route.sourceY) / 2,
    Math.abs(route.elbowX - route.sourceX),
    Math.abs(route.responseX - route.elbowX),
  ));
  const sourceX = pathNumber(route.sourceX);
  const sourceY = pathNumber(route.sourceY);
  const elbowX = pathNumber(route.elbowX);
  const responseX = pathNumber(route.responseX);
  const responseY = pathNumber(route.responseY);
  if (corner === 0) {
    return `M ${sourceX} ${sourceY} H ${elbowX} V ${responseY} H ${responseX}`;
  }
  const r = pathNumber(corner);
  const firstSweep = inward * verticalDirection > 0 ? 1 : 0;
  const secondSweep = verticalDirection * outward > 0 ? 0 : 1;
  return [
    `M ${sourceX} ${sourceY}`,
    `H ${pathNumber(route.elbowX - inward * corner)}`,
    `A ${r} ${r} 0 0 ${firstSweep} ${elbowX} ${pathNumber(route.sourceY + verticalDirection * corner)}`,
    `V ${pathNumber(route.responseY - verticalDirection * corner)}`,
    `A ${r} ${r} 0 0 ${secondSweep} ${pathNumber(route.elbowX + outward * corner)} ${responseY}`,
    `H ${responseX}`,
  ].join(' ');
}

function easedRoutePath(route: ConnectorRoute, { corner, ease }: Readonly<CurvedConnectorOptions>) {
  const rise = route.responseY - route.sourceY;
  const vertical = Math.sign(rise) || 1;
  const inward = Math.sign(route.elbowX - route.sourceX) || 1;
  const outward = Math.sign(route.responseX - route.elbowX) || 1;
  const reach = Math.max(0, Math.min(
    corner,
    Math.abs(route.elbowX - route.sourceX),
    Math.abs(route.responseX - route.elbowX),
  ));
  const drop = Math.max(0, Math.min(corner, Math.abs(rise) / 2));
  const sourceX = pathNumber(route.sourceX);
  const sourceY = pathNumber(route.sourceY);
  const elbowX = pathNumber(route.elbowX);
  const responseX = pathNumber(route.responseX);
  const responseY = pathNumber(route.responseY);
  if (reach === 0 || drop === 0) return `M ${sourceX} ${sourceY} H ${elbowX} V ${responseY} L ${responseX} ${responseY}`;
  const handle = Math.max(0, Math.min(1, ease));
  const lean = Math.max(0, reach - drop) * handle / 2;
  const firstEnd = route.sourceY + vertical * drop;
  const secondStart = route.responseY - vertical * drop;
  const run = drop * 2 < Math.abs(rise) ? ` V ${pathNumber(secondStart)}` : '';
  return `M ${sourceX} ${sourceY} H ${pathNumber(route.elbowX - inward * reach)}`
    + ` C ${pathNumber(route.elbowX - inward * reach * (1 - handle))} ${sourceY}`
    + ` ${pathNumber(route.elbowX - inward * lean)} ${pathNumber(firstEnd - vertical * drop * handle)}`
    + ` ${elbowX} ${pathNumber(firstEnd)}${run}`
    + ` C ${pathNumber(route.elbowX + outward * lean)} ${pathNumber(secondStart + vertical * drop * handle)}`
    + ` ${pathNumber(route.elbowX + outward * reach * (1 - handle))} ${responseY}`
    + ` ${pathNumber(route.elbowX + outward * reach)} ${responseY} L ${responseX} ${responseY}`;
}

/** The finished path for a route (Flowist's routePaths, for one route). */
export function connectorPath(
  route: ConnectorRoute,
  shape: ConnectorShape = 'curved',
  cornerRadius = ROUNDED_CORNER_RADIUS,
  curve: Readonly<CurvedConnectorOptions> = CURVED_CONNECTOR_DEFAULTS,
): ConnectorPath {
  const sourceY = pathNumber(route.sourceY);
  const responseY = pathNumber(route.responseY);
  const straight = shape === 'straight' || sourceY === responseY;
  return {
    ...route,
    straight,
    d: straight
      ? `M ${pathNumber(route.sourceX)} ${sourceY} L ${pathNumber(route.responseX)} ${responseY}`
      : shape === 'curved'
        ? easedRoutePath(route, curve)
        : orthogonalRoutePath(route, shape === 'square' ? 0 : cornerRadius),
  };
}
