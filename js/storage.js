const KEY = 'snooze_court_stats';

export function getStats() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { wins: 0, losses: 0 };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export function recordWin() {
  const s = getStats();
  s.wins++;
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

export function recordLoss() {
  const s = getStats();
  s.losses++;
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
