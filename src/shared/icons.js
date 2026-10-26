// Inline SVG drawn from a symbol in index.html's sprite (game pieces and
// interface icons), hidden from screen readers: whatever it shows is also
// said in text nearby.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgIcon(doc, symbol, className, viewBox = '0 0 100 100') {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', symbol);
  svg.append(use);
  return svg;
}
