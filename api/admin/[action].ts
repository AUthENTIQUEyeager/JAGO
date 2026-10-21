import auditLog from '../../server/admin/audit-log.js'
import createShop from '../../server/admin/create-shop.js'
import listShops from '../../server/admin/list-shops.js'
import me from '../../server/admin/me.js'
import resetPassword from '../../server/admin/reset-password.js'
import setShopStatus from '../../server/admin/set-shop-status.js'
import shopDetail from '../../server/admin/shop-detail.js'
import updateSettings from '../../server/admin/update-settings.js'
import updateShopNotes from '../../server/admin/update-shop-notes.js'
import viewShopData from '../../server/admin/view-shop-data.js'
import { defineRouter } from '../../server/_lib/router.js'

/** Point d'entrée unique de /api/admin/* (une seule fonction Vercel). */
export default defineRouter({
  'audit-log': auditLog,
  'create-shop': createShop,
  'list-shops': listShops,
  me: me,
  'reset-password': resetPassword,
  'set-shop-status': setShopStatus,
  'shop-detail': shopDetail,
  'update-settings': updateSettings,
  'update-shop-notes': updateShopNotes,
  'view-shop-data': viewShopData,
})
