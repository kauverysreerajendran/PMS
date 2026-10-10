import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import Tooltips from './lib/Tooltips';
import { applyStoredPalette } from './lib/theme';
import './styles.css';
// Theme last so its palette wins over page styles.
import './front-office/theme.css';
// Start in the last palette used on this device; the hotel's saved palette takes over once it loads.
applyStoredPalette();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/><Tooltips/></BrowserRouter></React.StrictMode>);
