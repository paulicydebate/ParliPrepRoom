import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applySettings, getSettings } from './settings/settings';
import { App } from './ui/App';
import './styles.css';
applySettings(getSettings());
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
