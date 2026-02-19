import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'

import App from './App.vue'
import router from './router'
import Aura from '@primeuix/themes/aura';

import 'primeicons/primeicons.css' // Icons
import 'primeflex/primeflex.css' // Flex utilities

const app = createApp(App)
app.use(PrimeVue, {
    theme: {
        preset: Aura
    }
});

app.use(createPinia())
app.use(router)
app.use(PrimeVue)

app.mount('#app')
