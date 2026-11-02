import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Small line icons (24px grid, drawn for this app).
function Svg({ children, size = 18 }) {
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: children }));
}
export const IconMenu = () => (_jsx(Svg, { children: _jsx("path", { d: "M4 6h16M4 12h16M4 18h16" }) }));
export const IconPlus = () => (_jsx(Svg, { children: _jsx("path", { d: "M12 5v14M5 12h14" }) }));
export const IconSplit = () => (_jsxs(Svg, { children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }), _jsx("path", { d: "M12 4v16" })] }));
export const IconClose = () => (_jsx(Svg, { children: _jsx("path", { d: "M6 6l12 12M18 6L6 18" }) }));
export const IconOutline = () => (_jsx(Svg, { children: _jsx("path", { d: "M4 6h10M8 12h12M8 18h12M4 12h.01M4 18h.01" }) }));
export const IconHistory = () => (_jsxs(Svg, { children: [_jsx("path", { d: "M3 12a9 9 0 1 0 3-6.7" }), _jsx("path", { d: "M3 4v4h4" }), _jsx("path", { d: "M12 8v4l3 2" })] }));
export const IconSettings = () => (_jsxs(Svg, { children: [_jsx("path", { d: "M4 7h10M18 7h2M4 17h4M12 17h8" }), _jsx("circle", { cx: "16", cy: "7", r: "2" }), _jsx("circle", { cx: "10", cy: "17", r: "2" })] }));
export const IconChevron = () => (_jsx(Svg, { size: 14, children: _jsx("path", { d: "M6 9l6 6 6-6" }) }));
export const IconUndo = () => (_jsxs(Svg, { children: [_jsx("path", { d: "M9 14L4 9l5-5" }), _jsx("path", { d: "M4 9h10a6 6 0 0 1 0 12h-3" })] }));
export const IconRedo = () => (_jsxs(Svg, { children: [_jsx("path", { d: "M15 14l5-5-5-5" }), _jsx("path", { d: "M20 9H10a6 6 0 0 0 0 12h3" })] }));
export const IconHighlight = () => (_jsxs(Svg, { children: [_jsx("path", { d: "M9 11l-5 5v4h4l5-5" }), _jsx("path", { d: "M14 6l4 4-6 6-4-4z" }), _jsx("path", { d: "M14 20h7" })] }));
export const IconFold = () => (_jsx(Svg, { children: _jsx("path", { d: "M7 4l5 5 5-5M7 20l5-5 5 5" }) }));
export const IconUnfold = () => (_jsx(Svg, { children: _jsx("path", { d: "M7 9l5-5 5 5M7 15l5 5 5-5" }) }));
export const IconDoc = () => (_jsxs(Svg, { size: 16, children: [_jsx("path", { d: "M7 3h7l5 5v13H7z" }), _jsx("path", { d: "M14 3v5h5" })] }));
export const IconBook = () => (_jsxs(Svg, { size: 16, children: [_jsx("path", { d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" }), _jsx("path", { d: "M4 19V5" })] }));
export const IconMore = () => (_jsxs(Svg, { size: 16, children: [_jsx("circle", { cx: "5", cy: "12", r: "1" }), _jsx("circle", { cx: "12", cy: "12", r: "1" }), _jsx("circle", { cx: "19", cy: "12", r: "1" })] }));
export const IconSwap = () => (_jsx(Svg, { size: 16, children: _jsx("path", { d: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" }) }));
export const IconDownload = () => (_jsx(Svg, { children: _jsx("path", { d: "M12 4v11M7 10l5 5 5-5M5 20h14" }) }));
export const IconLock = () => (_jsxs(Svg, { size: 13, children: [_jsx("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V8a4 4 0 0 1 8 0v3" })] }));
export const IconShare = () => (_jsxs(Svg, { children: [_jsx("circle", { cx: "18", cy: "5", r: "2.5" }), _jsx("circle", { cx: "6", cy: "12", r: "2.5" }), _jsx("circle", { cx: "18", cy: "19", r: "2.5" }), _jsx("path", { d: "M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" })] }));
export const IconPin = () => (_jsxs(Svg, { size: 16, children: [_jsx("path", { d: "M9 3h6l-1 6 3 3H7l3-3z" }), _jsx("path", { d: "M12 12v9" })] }));
export const IconSearch = () => (_jsxs(Svg, { children: [_jsx("circle", { cx: "11", cy: "11", r: "6.5" }), _jsx("path", { d: "M20 20l-4.2-4.2" })] }));
export const IconGrip = () => (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: [_jsx("circle", { cx: "9", cy: "6", r: "1.6" }), _jsx("circle", { cx: "15", cy: "6", r: "1.6" }), _jsx("circle", { cx: "9", cy: "12", r: "1.6" }), _jsx("circle", { cx: "15", cy: "12", r: "1.6" }), _jsx("circle", { cx: "9", cy: "18", r: "1.6" }), _jsx("circle", { cx: "15", cy: "18", r: "1.6" })] }));
export const IconUpload = () => (_jsx(Svg, { children: _jsx("path", { d: "M12 16V5M7 10l5-5 5 5M5 20h14" }) }));
