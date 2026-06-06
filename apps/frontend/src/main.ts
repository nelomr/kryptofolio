import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'

import './style.css'
import App from './App.vue'
import router from './router'
import { setupDependencyInjection } from '@/core/infrastructure/di'

// --- Bootstrap ---
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(PiniaColada)
app.use(router)

// Initialize Composition Root (Dependency Injection)
setupDependencyInjection(app, pinia)

app.mount('#app')
