/**
 * Adaptador asíncrono sobre el almacén SQLite de db.js. Expone la misma interfaz que store/supabase.js
 * para que app.js no sepa con cuál habla. SQLite no tiene panel de administración ni códigos de descuento:
 * `admin` es false y esas rutas responden con un aviso claro.
 */
export function sqliteData(store) {
  return {
    mode: 'sqlite',
    admin: false,
    users: {
      byId: async (id) => store.userById(id),
      byCustomer: async (customer) => store.userByCustomer(customer),
      setPlan: async (id, change) => store.setPlan(id, change),
    },
    usage: {
      get: async (actor, kind, period) => store.usage(actor, kind, period),
      add: async (actor, kind, period, amount) => store.addUsage(actor, kind, period, amount),
      prune: async (olderThanDay) => store.prune(olderThanDay),
    },
    close: async () => store.close(),
  }
}
