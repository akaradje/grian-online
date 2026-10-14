/* ═══════════════════════════════════════════════════════════
   inventory.js — จัดการกระเป๋า
   แยกออกมาเป็นโมดูลของตัวเอง เพื่อให้ entities.js และ pets.js
   ใช้ร่วมกันได้โดยไม่เกิด circular import
   ═══════════════════════════════════════════════════════════ */

import { ITEMS } from './data.js';

export function addItem(p, id, qty = 1) {
  if (!ITEMS[id]) return;
  const slot = p.inv.find((s) => s.id === id);
  if (slot) slot.qty += qty;
  else p.inv.push({ id, qty });
}

export function removeItem(p, id, qty = 1) {
  const i = p.inv.findIndex((s) => s.id === id);
  if (i < 0) return false;
  p.inv[i].qty -= qty;
  if (p.inv[i].qty <= 0) p.inv.splice(i, 1);
  return true;
}

export function countItem(p, id) {
  const s = p.inv.find((x) => x.id === id);
  return s ? s.qty : 0;
}
