/* ═══════════════════════════════════════════════════════════
   achievements.js — ความสำเร็จ ผูกกับสถิติจริง ไม่ใช่ของประดับ
   ทุกอันตรวจสอบได้จากตัวเลขในเซฟ
   ═══════════════════════════════════════════════════════════ */

import { countItem } from './entities.js';

export const ACHIEVEMENTS = [
  { id: 'first_blood', icon: '🩸', name: 'เลือดแรก', desc: 'สังหารมอนตัวแรก', goal: 1, get: (p) => p.kills_total },
  { id: 'level10', icon: '🔟', name: 'ผู้เริ่มแข็งแกร่ง', desc: 'ถึงเลเวล 10', goal: 10, get: (p) => p.lvl },
  { id: 'loot25', icon: '🎒', name: 'นักเก็บของ', desc: 'เก็บไอเทมสะสม 25 ชิ้น', goal: 25, get: (p) => p.dropsTotal },
  { id: 'tail10', icon: '🐁', name: 'หางหนูคือชีวิต', desc: 'เก็บหางหนู 10 ชิ้น (ทนได้ไง)', goal: 10, get: (p) => p.ctr.ratTail || 0 },
  { id: 'slime10', icon: '🟢', name: 'คนใจร้าย', desc: 'สังหารสไลม์ที่ไม่ได้สู้กลับ 10 ตัว', goal: 10, get: (p) => p.kills.slime || 0 },
  { id: 'dummy5', icon: '🪵', name: 'ตีหุ่นซ้อม', desc: 'สังหารมอนที่ไม่มี AI 5 ตัว', goal: 5, get: (p) => p.kills.dummy || 0 },
  { id: 'broke', icon: '💸', name: 'หนี้ท่วม', desc: 'ร่ายสกิลตอนเงินเหลือ 0', goal: 1, get: (p) => p.ctr.brokeSkill || 0 },
  { id: 'steal10', icon: '🗡️', name: 'ขโมยคิลมืออาชีพ', desc: 'ขโมยคิลสำเร็จ 10 ครั้ง', goal: 10, get: (p) => p.ctr.stolenKills || 0 },
  { id: 'feed20', icon: '🩸', name: 'เพื่อนร่วมทีมตัวจริง', desc: 'ฟีดคู่แข่ง 20 ครั้ง', goal: 20, get: (p) => p.ctr.feeds || 0 },
  { id: 'ban15', icon: '🚫', name: 'แอดมินเต็มตัว', desc: 'เตะมอนออกจากเซิร์ฟ 15 ตัว', goal: 15, get: (p) => p.ctr.banished || 0 },
  { id: 'die10', icon: '💀', name: 'ตายเก่ง', desc: 'ตายสะสม 10 ครั้ง', goal: 10, get: (p) => p.deaths },
  { id: 'pull90', icon: '🎰', name: 'รอ pity มา 90 ครั้ง', desc: 'เปิดกาชาสะสม 90 ครั้ง', goal: 90, get: (p) => p.totalPulls },
  { id: 'got5', icon: '⭐', name: 'คนโชคดี', desc: 'ได้ตัวละคร ★5 หนึ่งตัว', goal: 1, get: (p) => p.ctr.gacha5 || 0 },
  { id: 'trash5', icon: '🗑️', name: 'นักสะสมขยะ', desc: 'ได้ ★1 (ถุงขยะ/ใบเสร็จ) 5 ชิ้น', goal: 5, get: (p) => p.ctr.gacha1 || 0 },
  { id: 'rich', icon: '💰', name: 'เศรษฐีชั่วขณะ', desc: 'ถือเงินถึง 10,000', goal: 10000, get: (p) => p.maxGold || 0 },
  { id: 'boss1', icon: '👹', name: 'ปราบครูฝึก', desc: 'ปราบบอสโลก 1 ครั้ง', goal: 1, get: (p) => p.ctr.bossKills || 0 },
  { id: 'walk5k', icon: '👣', name: 'นักเดิน', desc: 'เดินสะสม 5,000 หน่วย', goal: 5000, get: (p) => Math.floor(p.ctr.distance || 0) },
  { id: 'afk3', icon: '💤', name: 'AFK ตัวจริง', desc: 'ยืนนิ่งติดกัน 3 นาที', goal: 180, get: (p) => Math.floor(p.ctr.idleBest || 0) },
  { id: 'upok', icon: '💎', name: 'หนึ่งในล้าน', desc: 'อัพเกรดหินสำเร็จ (0.0001%)', goal: 1, get: (p) => p.ctr.upgradeOk || 0 },
  { id: 'upfail', icon: '🔨', name: 'ไม่เคยสำเร็จ', desc: 'อัพเกรดล้มเหลว 10 ครั้ง', goal: 10, get: (p) => p.ctr.upgradeFail || 0 },
  { id: 'vet30', icon: '⏳', name: 'ผู้เล่นประจำ', desc: 'เล่นสะสม 30 นาที', goal: 1800, get: (p) => Math.floor(p.ctr.playtime || 0) },
  { id: 'bag20', icon: '🧳', name: 'กระเป๋าหนัก', desc: 'ถือไอเทม 20 ชนิดพร้อมกัน', goal: 20, get: (p) => p.inv.length },
  { id: 'kill200', icon: '⚔️', name: 'ฆ่ามาเยอะ', desc: 'สังหารสะสม 200 ตัว', goal: 200, get: (p) => p.kills_total },
  { id: 'tail50', icon: '🏆', name: 'ในตำนาน', desc: 'เก็บหางหนูสะสม 50 ชิ้น', goal: 50, get: (p) => p.ctr.ratTailTotal || 0 },
  { id: 'auto10', icon: '🤖', name: 'ปล่อยให้ AI เล่น', desc: 'ใช้โหมด AUTO สะสม 10 นาที', goal: 600, get: (p) => Math.floor(p.ctr.autoTime || 0) },
  { id: 'auto30', icon: '🛌', name: 'นอนหลับให้ AI ตี', desc: 'ใช้โหมด AUTO สะสม 30 นาที', goal: 1800, get: (p) => Math.floor(p.ctr.autoTime || 0) },
  { id: 'autoKill50', icon: '⚙️', name: 'มืออาชีพสายออโต้', desc: 'สังหาร 50 ตัวด้วยโหมด AUTO', goal: 50, get: (p) => p.ctr.autoKills || 0 },
  { id: 'noAuto', icon: '🎮', name: 'เล่นเองจริง ๆ', desc: 'เล่น 10 นาทีโดยไม่เปิด AUTO เลย (หายาก)', goal: 600, get: (p) => Math.floor(p.ctr.manualTime || 0) },
  { id: 'cyber1', icon: '💻', name: 'นักมุดเซิร์ฟเถื่อน', desc: 'เดินทางไปถึงแดนเซิร์ฟเถื่อน (แมพ 3)', goal: 1, get: (p) => p.ctr.visitedCyber || 0 },
  { id: 'pvp3', icon: '🥊', name: 'นักเลงคีย์บอร์ด', desc: 'ชนะการประลอง PvP กับบอทเกรียน 3 ครั้ง', goal: 3, get: (p) => p.ctr.pvpWins || 0 },
  { id: 'tower3', icon: '🗼', name: 'ผู้พิชิตหอคอยบั๊ก', desc: 'ผ่านหอคอยบั๊กถึงชั้นที่ 3', goal: 3, get: (p) => p.ctr.towerFloor || 0 },
  { id: 'charm1', icon: '🧿', name: 'พึ่งสิ่งศักดิ์สิทธิ์', desc: 'หลอมหรือใช้ยันต์กันแตกสำเร็จ 1 ครั้ง', goal: 1, get: (p) => (p.ctr.charmSaved || 0) + (p.ctr.charmCrafted || 0) },
];

/** ตรวจความสำเร็จใหม่ → คืนรายการที่เพิ่งปลดล็อก */
export function checkAchievements(state) {
  const p = state.player;
  if (!p.unlocked) p.unlocked = {};
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (p.unlocked[a.id]) continue;
    let v = 0;
    try { v = a.get(p) || 0; } catch (e) { v = 0; }
    if (v >= a.goal) {
      p.unlocked[a.id] = Date.now();
      fresh.push(a);
    }
  }
  return fresh;
}

export function achievementProgress(p, a) {
  let v = 0;
  try { v = a.get(p) || 0; } catch (e) { v = 0; }
  return { cur: Math.min(v, a.goal), goal: a.goal, done: !!p.unlocked?.[a.id] };
}

export function achievementSummary(p) {
  const total = ACHIEVEMENTS.length;
  const got = Object.keys(p.unlocked || {}).length;
  return { got, total, pct: Math.round((got / total) * 100) };
}

export { countItem };
