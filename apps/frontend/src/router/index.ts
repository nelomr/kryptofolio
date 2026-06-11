import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'portfolio',
      component: () => import('@/views/Portfolio/PortfolioView.vue'),
    },
    {
      path: '/tax',
      name: 'taxReport',
      component: () => import('@/views/TaxReport/TaxReportView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings/SettingsView.vue'),
    },
  ],
})

export default router
