// Save / load: money, missions finished and best (fastest) mission times,
// kept in localStorage under one key. Everything is guarded: private windows
// and disabled storage just mean progress lasts this visit only.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      missionsDone: typeof data.missionsDone === 'number' ? data.missionsDone : 0,
      bestTimes: typeof data.bestTimes === 'object' && data.bestTimes !== null ? data.bestTimes : {},
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
