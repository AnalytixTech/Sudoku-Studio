export interface PlayerScoreState {
  score: number
  streak: number
  maxStreak: number
  filledCount: number
  mistakesCount: number
  totalEmpty: number
}

export function createInitialScore(totalCells: number): PlayerScoreState {
  return {
    score: 0,
    streak: 0,
    maxStreak: 0,
    filledCount: 0,
    mistakesCount: 0,
    totalEmpty: totalCells,
  }
}

export function recordCorrectPlacement(prev: PlayerScoreState): PlayerScoreState {
  const nextStreak = prev.streak + 1
  const streakBonus = Math.min(250, (nextStreak - 1) * 25)
  const points = 100 + streakBonus

  return {
    ...prev,
    score: prev.score + points,
    streak: nextStreak,
    maxStreak: Math.max(prev.maxStreak, nextStreak),
    filledCount: prev.filledCount + 1,
  }
}

export function recordMistakePlacement(prev: PlayerScoreState): PlayerScoreState {
  return {
    ...prev,
    score: Math.max(0, prev.score - 150),
    streak: 0,
    mistakesCount: prev.mistakesCount + 1,
  }
}

export function calculateFinalTimeBonus(seconds: number, isWinner: boolean): number {
  if (!isWinner) return 0
  return Math.max(100, 3000 - seconds * 10)
}
