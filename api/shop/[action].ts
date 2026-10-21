import createStaff from '../../server/shop/create-staff.js'
import listStaff from '../../server/shop/list-staff.js'
import resetStaffPassword from '../../server/shop/reset-staff-password.js'
import setStaffActive from '../../server/shop/set-staff-active.js'
import { defineRouter } from '../../server/_lib/router.js'

/** Point d'entrée unique de /api/shop/* (une seule fonction Vercel). */
export default defineRouter({
  'create-staff': createStaff,
  'list-staff': listStaff,
  'reset-staff-password': resetStaffPassword,
  'set-staff-active': setStaffActive,
})
