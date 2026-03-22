import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            // This helps the app work offline
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}']
            },
            manifest: {
                name: 'Meal Planner Pro',
                short_name: 'MealPlan',
                description: 'Plan meals and track your pantry',
                theme_color: '#4f46e5',
                background_color: '#ffffff',
                display: 'standalone', // This hides the browser URL bar
                orientation: 'portrait',
                icons: [
                    {
                        src: 'pwa-192x192.png?v=1', // Adding ?v=1 tricks the cache
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'pwa-512x512.png?v=1',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            }
        })
    ]
})