import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ToastProvider } from './components/common/ToastProvider.jsx'
import { ConfirmProvider } from './components/common/ConfirmProvider.jsx'
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            {/* Outside App on purpose: the Auth screen renders before a session
                exists and needs to report sign-in errors too. */}
            <ToastProvider>
                <ConfirmProvider>
                    <App />
                </ConfirmProvider>
            </ToastProvider>
        </BrowserRouter>
    </React.StrictMode>,
)