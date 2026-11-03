export function rankTitle(score: number) {
  if (score >= 9000) return { title: 'Legendary Debugger', emoji: '🏆' }
  if (score >= 6500) return { title: '10× Engineer', emoji: '🚀' }
  if (score >= 4500) return { title: 'Senior Exterminator', emoji: '⚡' }
  if (score >= 2500) return { title: 'Bug Hunter', emoji: '🎯' }
  if (score >= 1000) return { title: 'Junior Debugger', emoji: '🔧' }
  return { title: 'Hello, World', emoji: '👋' }
}

