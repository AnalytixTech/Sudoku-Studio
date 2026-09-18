import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generate, isDifficulty, type Difficulty } from './lib/generator'
import { analyzeHint } from './lib/hint'
import { SudokuSolver, type Step } from './lib/solver'
import { markersFor } from './lib/markers'
import { sound } from './lib/audio'
import { triggerConfetti } from './lib/confetti'
import {
  loadStats,
  recordGameStart,
  recordGameWin,
  recordBattlePlayed,
  recordBattleWin,
  type AllStats,
} from './lib/stats'
import {
  COSTS,
  battleWinReward,
  continueOffer,
  dailyReward,
  grant,
  grantXp,
  levelFromXp,
  loadWallet,
  overwriteWallet,
  spend,
  takeContinue,
  winReward,
  BATTLE_PLAYED_XP,
  type Wallet,
} from './lib/economy'
import {
  clearGame,
  loadGame,
  notesFromJson,
  notesToJson,
  saveGame,
  summarize,
  SAVE_VERSION,
  type SavedGame,
} from './lib/persistence'
import {
  confettiColors,
  loadInventory,
  mergeServerEntitlements,
  type Inventory,
} from './lib/cosmetics'
import { clearSession, loadSession, saveSession, type Session } from './lib/api'
import { onAuthChange, supabaseEnabled } from './lib/supabase'
import {
  migrateLocal,
  queueEarn,
  queueSpend,
  reconcile,
  startAutoFlush,
} from './lib/walletSync'
import { generateDailyPuzzle, recordDailyCompletion, getTodayDateString } from './lib/daily'
import {
  DEFAULT_CONFIG,
  VARIANT_CONFIGS,
  getDynamicConfig,
  cloneGrid,
  computeCandidates,
  countEmpty,
  emptyGrid,
  findConflicts,
  type Grid,
  type VariantConfig,
  type VariantId,
} from './sudoku'
import Board from './components/Board'
import Keypad from './components/Keypad'
import ExplanationPanel from './components/ExplanationPanel'
import StartScreen from './components/StartScreen'
import SolverScreen from './components/SolverScreen'
import StatsModal from './components/StatsModal'
import CustomSelect from './components/CustomSelect'
import SinglePlayerModal from './components/SinglePlayerModal'
import MultiplayerModal from './components/MultiplayerModal'
import HelperConfirmModal from './components/HelperConfirmModal'
import GameOverModal from './components/GameOverModal'
import ShopModal from './components/ShopModal'
import AccountModal from './components/AccountModal'
import BattleHUD from './components/BattleHUD'
import BattleCountdownOverlay from './components/BattleCountdownOverlay'
import {
  MultiplayerClient,
  getDeviceId,
  getUsername,
  type ConnectionState,
  type MatchPayload,
  type MultiplayerPlayer,
  type NetMessage,
} from './lib/multiplayer'
import {
  calculateFinalTimeBonus,
  createInitialScore,
  recordCorrectPlacement,
  recordMistakePlacement,
  type PlayerScoreState,
} from './lib/scoring'
import {
  IconTrophy,
  IconSoundOn,
  IconSoundOff,
  IconPlay,
  IconRefresh,
  IconArrowLeft,
  IconClose,
  IconCoin,
  IconPalette,
  IconUser,
} from './components/Icons'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master', 'grand master']
const DIFFICULTY_OPTIONS = DIFFICULTIES.map((d) => ({ value: d, label: d }))

const VARIANT_OPTIONS = Object.values(VARIANT_CONFIGS).map((v) => ({
  value: v.id,
  label: v.name,
}))

interface Status {
  type: 'info' | 'ok' | 'warn' | 'error'
  text: string
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type Screen = 'menu' | 'game' | 'solver'

/** Mistakes allowed before a single-player or daily puzzle fails. */
const MISTAKE_LIMIT = 3

interface HistoryEntry {
  board: Grid
  notes: Record<string, Set<number>>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [variantId, setVariantId] = useState<VariantId>('9x9')
  const [variantConfig, setVariantConfig] = useState<VariantConfig>(() =>
    getDynamicConfig(VARIANT_CONFIGS['9x9'])
  )

  const [original, setOriginal] = useState<Grid>(emptyGrid(variantConfig))
  const [solution, setSolution] = useState<Grid>(emptyGrid(variantConfig))
  const [board, setBoard] = useState<Grid>(emptyGrid(variantConfig))
  const [userNotes, setUserNotes] = useState<Record<string, Set<number>>>({})
  const [noteMode, setNoteMode] = useState(false)
  // Whether any pencil note was used this game, for the "Pure Tactician" achievement.
  const [usedNotes, setUsedNotes] = useState(false)

  // History stack for Undo / Redo
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIdx, setHistoryIdx] = useState<number>(-1)

  // Sound & Theme & Stats
  const [muted, setMuted] = useState(() => sound.isMuted())
  const [inventory, setInventory] = useState<Inventory>(() => loadInventory())
  const [showShop, setShowShop] = useState(false)
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [showAccount, setShowAccount] = useState(false)
  const theme = inventory.equipped.theme
  const [stats, setStats] = useState<AllStats>(() => loadStats())
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showSinglePlayerModal, setShowSinglePlayerModal] = useState(false)
  const [isDailyChallenge, setIsDailyChallenge] = useState(false)
  const [wallet, setWallet] = useState<Wallet>(() => loadWallet())
  const [pendingHelper, setPendingHelper] = useState<{
    title: string
    cost: number
    description: string
    /** Which entry in the server's cost table this is. */
    item: 'hint' | 'autoNotes' | 'autoSolve'
    action: () => void
  } | null>(null)
  const [lastReward, setLastReward] = useState<{ coins: number; xp: number; lines: string[] } | null>(
    null
  )

  // Resume support: what was in progress when the app was last closed.
  const [resumable, setResumable] = useState<SavedGame | null>(() => loadGame())

  const [selected, setSelected] = useState<string | null>(null)
  const [digitHighlight, setDigitHighlight] = useState(0)

  const [feed, setFeed] = useState<Step[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hintStep, setHintStep] = useState<Step | null>(null)
  const [autoSolve, setAutoSolve] = useState<{ steps: Step[]; index: number; playing: boolean }>({
    steps: [],
    index: 0,
    playing: false,
  })
  const replayStepRef = useRef<Step | null>(null)

  const [wrongCells, setWrongCells] = useState<Set<string>>(new Set())
  const [clearedRows, setClearedRows] = useState<Set<number>>(new Set())
  const [clearedCols, setClearedCols] = useState<Set<number>>(new Set())
  const [clearedBoxes, setClearedBoxes] = useState<Set<number>>(new Set())
  const [status, setStatus] = useState<Status | null>({
    type: 'info',
    text: 'Pick a difficulty and start a new game.',
  })
  const dismissStatus = useCallback(() => setStatus(null), [])
  const [seconds, setSeconds] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [failed, setFailed] = useState(false)
  const [solved, setSolved] = useState(false)
  const [showWinModal, setShowWinModal] = useState(false)
  const [loading, setLoading] = useState(false)

  // ---------------- MULTIPLAYER BATTLE STATE ----------------
  const [roomId, setRoomId] = useState<string | null>(null)
  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [isBattleActive, setIsBattleActive] = useState(false)
  const [showBattleCountdown, setShowBattleCountdown] = useState(false)
  const [battleHidden, setBattleHidden] = useState(false)

  const localDeviceId = useMemo(() => getDeviceId(), [])
  const [localPlayer, setLocalPlayer] = useState<MultiplayerPlayer>(() => ({
    deviceId: getDeviceId(),
    name: getUsername(),
    ready: false,
    isHost: true,
    score: createInitialScore(81),
    finished: false,
  }))

  const [remotePlayer, setRemotePlayer] = useState<MultiplayerPlayer | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('offline')
  const netClientRef = useRef<MultiplayerClient | null>(null)

  const totalCells = variantConfig.size * variantConfig.size

  // Daily Challenge and Battle are competitive modes: Auto-Solve and
  // Auto-Fill Notes are withheld there. Hints stay available.
  const helpersRestricted = isDailyChallenge || isBattleActive
  const { cand } = useMemo(() => computeCandidates(board, variantConfig), [board, variantConfig])
  const conflictSet = useMemo(
    () => (wrongCells.size ? wrongCells : findConflicts(board, variantConfig)),
    [board, wrongCells, variantConfig]
  )

  const currentStep = autoSolve.steps.length > 0 ? autoSolve.steps[autoSolve.index] : hintStep
  const markers = useMemo(() => markersFor(currentStep, variantConfig), [currentStep, variantConfig])

  // Count placed digits for Keypad HUD
  const digitCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (let i = 1; i <= variantConfig.size; i++) counts[i] = 0
    for (const row of board) {
      for (const val of row) {
        if (val >= 1 && val <= variantConfig.size) counts[val]++
      }
    }
    return counts
  }, [board, variantConfig])

  // Equipped cosmetics are expressed as body classes: the theme swaps the CSS
  // variable set, the numeral style restyles digits, pips and the keypad.
  useEffect(() => {
    document.body.className = `theme-${inventory.equipped.theme} digits-${inventory.equipped.digits}`
  }, [inventory.equipped.theme, inventory.equipped.digits])

  // Auto-join room from URL query param `?room=ROOM_ID`.
  //
  // Deliberately NOT guarded against StrictMode's double-invoke: the unmount
  // cleanup below disconnects the client between the two runs, so a guard here
  // would leave the guest permanently disconnected. The relay handles the
  // duplicate connection instead, by treating a second socket from the same
  // device as taking over its own slot.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlRoom = params.get('room')
    if (urlRoom && !roomId) {
      joinBattleRoom(urlRoom, false)
    }
  }, [])

  // Timer
  useEffect(() => {
    if (solved || failed || screen !== 'game' || battleHidden) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [solved, failed, screen, battleHidden])

  // ---------------- MULTIPLAYER LOGIC ----------------

  // Starts the battle locally from the host's payload. The relay never echoes a
  // message to its sender, so the host has to apply this itself rather than
  // waiting to receive its own START_MATCH.
  const applyMatchStart = useCallback((payload: MatchPayload) => {
    const cfg = VARIANT_CONFIGS[payload.variantId] || DEFAULT_CONFIG
    setVariantId(payload.variantId)
    setVariantConfig(cfg)
    setDifficulty(payload.difficulty)
    setOriginal(payload.puzzle.map((row) => row.slice()))
    setSolution(payload.solution.map((row) => row.slice()))
    setBoard(payload.puzzle.map((row) => row.slice()))
    setUserNotes({})
    setUsedNotes(false)
    setWrongCells(new Set())
    setClearedRows(new Set())
    setClearedCols(new Set())
    setClearedBoxes(new Set())
    setFeed([])
    setActiveIndex(null)
    setHintStep(null)
    setAutoSolve({ steps: [], index: 0, playing: false })
    setHistory([{ board: payload.puzzle.map((row) => row.slice()), notes: {} }])
    setHistoryIdx(0)
    setSelected(null)
    setMistakes(0)
    setSeconds(0)
    setSolved(false)
    setFailed(false)
    setLastReward(null)
    setShowWinModal(false)
    setShowMultiplayerModal(false)
    setIsDailyChallenge(false)
    setIsBattleActive(true)
    setBattleHidden(true)
    setShowBattleCountdown(true)
    setScreen('game')
    setLocalPlayer((p) => ({
      ...p,
      score: createInitialScore(cfg.size * cfg.size),
      finished: false,
    }))
    setStatus({ type: 'info', text: 'Battle Started! Puzzle revealed after countdown.' })
    // Counted here rather than on victory, so losing a match still counts as
    // having competed in one.
    recordBattlePlayed()
    setWallet(grantXp(BATTLE_PLAYED_XP))
    queueEarn({ type: 'battlePlayed' })
  }, [])

  const handleNetMessage = useCallback(
    (msg: NetMessage) => {
      if (msg.type === 'JOIN_ROOM') {
        if (msg.player.deviceId !== localDeviceId) {
          setRemotePlayer(msg.player)
          // Host replies with current status
          if (netClientRef.current) {
            netClientRef.current.send({
              type: 'PLAYER_STATE',
              roomId: msg.roomId,
              player: { ...localPlayer, isHost },
            })
          }
        }
      } else if (msg.type === 'PLAYER_STATE') {
        if (msg.player.deviceId !== localDeviceId) {
          setRemotePlayer(msg.player)
        }
      } else if (msg.type === 'TOGGLE_READY') {
        if (msg.deviceId !== localDeviceId) {
          setRemotePlayer((prev) => (prev ? { ...prev, ready: msg.ready } : null))
        }
      } else if (msg.type === 'START_MATCH') {
        applyMatchStart(msg.payload)
      } else if (msg.type === 'PROGRESS_UPDATE') {
        if (msg.deviceId !== localDeviceId) {
          setRemotePlayer((prev) => (prev ? { ...prev, score: msg.score } : null))
        }
      } else if (msg.type === 'LEAVE_ROOM') {
        if (msg.deviceId !== localDeviceId) {
          setRemotePlayer(null)
        }
      }
    },
    [localDeviceId, localPlayer, isHost, applyMatchStart]
  )

  // MultiplayerClient.connect captures its listener once, so route messages
  // through a ref to keep the handler from going stale as state changes.
  const netHandlerRef = useRef(handleNetMessage)
  useEffect(() => {
    netHandlerRef.current = handleNetMessage
  }, [handleNetMessage])

  // Leave the room if the app unmounts mid-battle.
  useEffect(() => () => netClientRef.current?.disconnect(), [])

  // The server owns the balance once signed in: drain anything queued offline,
  // then take the server's figures over the local cache.
  const syncFromServer = useCallback(async () => {
    const state = await reconcile()
    if (!state) return
    setWallet(overwriteWallet(state.coins, state.xp))
    if (state.entitlements.length > 0) setInventory(mergeServerEntitlements(state.entitlements))
  }, [])

  useEffect(() => {
    if (!session) return
    void syncFromServer()
    return startAutoFlush()
  }, [session, syncFromServer])

  // Supabase owns the credential when configured: its access token is what the
  // API verifies, so there is no second session to keep in step. This also
  // catches the OAuth redirect landing back on the page.
  useEffect(() => {
    if (!supabaseEnabled()) return
    return onAuthChange((sbSession) => {
      if (!sbSession) {
        clearSession()
        setSession(null)
        return
      }
      const next: Session = {
        token: sbSession.access_token,
        user: {
          id: sbSession.user.id,
          email: sbSession.user.email ?? '',
          name: (sbSession.user.user_metadata?.full_name as string) ?? null,
        },
      }
      saveSession(next)
      setSession((prev) => (prev?.token === next.token ? prev : next))
      void migrateLocal(loadWallet().coins).then(syncFromServer)
    })
  }, [syncFromServer])

  const joinBattleRoom = useCallback(
    (rId: string, asHost: boolean) => {
      setRoomId(rId)
      setIsHost(asHost)
      setShowMultiplayerModal(true)

      if (netClientRef.current) {
        netClientRef.current.disconnect()
      }
      const client = new MultiplayerClient()
      netClientRef.current = client
      client.connect(
        rId,
        (msg) => netHandlerRef.current(msg),
        (state) => setConnection(state)
      )

      setRemotePlayer(null)
      const me: MultiplayerPlayer = {
        deviceId: localDeviceId,
        name: getUsername(),
        ready: false,
        isHost: asHost,
        score: createInitialScore(totalCells),
        finished: false,
      }
      setLocalPlayer(me)
      client.send({ type: 'JOIN_ROOM', roomId: rId, player: me })
    },
    [localDeviceId, totalCells]
  )

  const createBattleRoom = useCallback(() => {
    const newRoom = 'room_' + Math.random().toString(36).substring(2, 8)
    joinBattleRoom(newRoom, true)
  }, [joinBattleRoom])

  const toggleLocalReady = useCallback(() => {
    setLocalPlayer((prev) => {
      const nextReady = !prev.ready
      if (netClientRef.current && roomId) {
        netClientRef.current.send({
          type: 'TOGGLE_READY',
          roomId,
          deviceId: localDeviceId,
          ready: nextReady,
        })
      }
      return { ...prev, ready: nextReady }
    })
  }, [roomId, localDeviceId])

  const startBattleMatch = useCallback(() => {
    if (!isHost || !roomId) return
    const { puzzle, solution } = generate(difficulty, variantConfig)
    const payload: MatchPayload = { variantId, difficulty, puzzle, solution }
    netClientRef.current?.send({ type: 'START_MATCH', roomId, payload })
    // The host is not sent its own message back, so start locally too.
    applyMatchStart(payload)
  }, [isHost, roomId, difficulty, variantConfig, variantId, applyMatchStart])

  // Broadcast progress over P2P data channel
  const sendProgressUpdate = useCallback(
    (newScore: PlayerScoreState) => {
      if (isBattleActive && netClientRef.current && roomId) {
        netClientRef.current.send({
          type: 'PROGRESS_UPDATE',
          roomId,
          deviceId: localDeviceId,
          score: newScore,
        })
      }
    },
    [isBattleActive, roomId, localDeviceId]
  )

  // Win Detection
  useEffect(() => {
    if (solved || loading || countEmpty(board) === totalCells) return
    if (countEmpty(board) === 0 && conflictSet.size === 0) {
      setSolved(true)
      setShowWinModal(true)
      setAutoSolve((as) => ({ ...as, playing: false }))

      const timeBonus = calculateFinalTimeBonus(seconds, true)
      const finalScoreState = {
        ...localPlayer.score,
        score: localPlayer.score.score + timeBonus,
      }
      setLocalPlayer((p) => ({ ...p, score: finalScoreState, finished: true }))
      sendProgressUpdate(finalScoreState)

      setStatus({ type: 'ok', text: `Puzzle Solved! Final Score: ${finalScoreState.score} pts` })
      sound.playWinFanfare()
      triggerConfetti(confettiColors(inventory.equipped.confetti))

      // The puzzle is finished, so there is nothing left to resume into.
      clearGame()
      setResumable(null)

      // ---- payout ----
      const flawless = mistakes === 0
      let coins = 0
      let xp = 0
      const lines: string[] = []

      if (isBattleActive) {
        // Battle results feed the battle achievements, not the single-player
        // tiers. The match was already counted at start, so only a win is
        // recorded here.
        if (remotePlayer && finalScoreState.score > remotePlayer.score.score) {
          recordBattleWin()
          const r = battleWinReward()
          coins += r.coins
          xp += r.xp
          lines.push(...r.lines)
          queueEarn({ type: 'battleWin' })
        }
      } else {
        setStats(recordGameWin(difficulty, seconds, mistakes, usedNotes))
        const r = winReward(difficulty, flawless)
        coins += r.coins
        xp += r.xp
        lines.push(...r.lines)
        // The server re-prices this from the event; the amounts above are the
        // optimistic local view.
        queueEarn({ type: 'win', difficulty, flawless, durationSec: seconds })
      }

      if (isDailyChallenge) {
        const { newStreak } = recordDailyCompletion()
        const r = dailyReward(newStreak)
        coins += r.coins
        xp += r.xp
        lines.push(...r.lines)
        queueEarn({ type: 'daily', streak: newStreak })
        setStatus({
          type: 'ok',
          text: `Daily Challenge solved! ${newStreak}-day streak.`,
        })
      }

      if (coins > 0 || xp > 0) {
        setWallet(grant({ coins, xp, lines }))
        setLastReward({ coins, xp, lines })
      } else {
        setLastReward(null)
      }
    }
  }, [
    board,
    conflictSet,
    solved,
    loading,
    difficulty,
    seconds,
    totalCells,
    localPlayer.score,
    sendProgressUpdate,
    isDailyChallenge,
    isBattleActive,
    remotePlayer,
    mistakes,
    usedNotes,
    inventory.equipped.confetti,
  ])

  // Helper to record history state
  const pushHistory = useCallback(
    (newBoard: Grid, newNotes: Record<string, Set<number>>) => {
      const entry: HistoryEntry = {
        board: cloneGrid(newBoard),
        notes: Object.fromEntries(Object.entries(newNotes).map(([k, set]) => [k, new Set(set)])),
      }
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1)
        return [...sliced, entry]
      })
      setHistoryIdx((idx) => idx + 1)
    },
    [historyIdx]
  )

  // ---------------- new game ----------------
  const startNewGame = useCallback(
    async (diff: Difficulty = difficulty, varId: VariantId = variantId) => {
      setLoading(true)
      setSolved(false)
      setFailed(false)
      setLastReward(null)
      setShowWinModal(false)
      setIsBattleActive(false)
      // Leaving daily/battle mode must clear the flag, or its helper
      // restrictions and completion credit would leak into later games.
      setIsDailyChallenge(false)
      const baseCfg = VARIANT_CONFIGS[varId] || DEFAULT_CONFIG
      const cfg = getDynamicConfig(baseCfg)
      setVariantId(varId)
      setVariantConfig(cfg)
      setBoard(emptyGrid(cfg))
      setMistakes(0)
      setSeconds(0)
      setFeed([])
      setActiveIndex(null)
      setHintStep(null)
      setAutoSolve({ steps: [], index: 0, playing: false })
      setWrongCells(new Set())
      setSelected(null)
      setUserNotes({})
      setUsedNotes(false)
      setHistory([])
      setHistoryIdx(-1)
      setLocalPlayer((p) => ({ ...p, score: createInitialScore(cfg.size * cfg.size) }))
      await new Promise((r) => setTimeout(r, 40))
      try {
        const { puzzle, solution } = generate(diff, cfg)
        setDifficulty(diff)
        setOriginal(puzzle.map((row) => row.slice()))
        setSolution(solution.map((row) => row.slice()))
        setBoard(puzzle.map((row) => row.slice()))
        setStatus({ type: 'ok', text: `New ${cfg.name} (${diff}) puzzle. Good luck!` })
        setStats(recordGameStart(diff))

        const initialEntry: HistoryEntry = {
          board: cloneGrid(puzzle),
          notes: {},
        }
        setHistory([initialEntry])
        setHistoryIdx(0)
      } catch {
        setStatus({ type: 'error', text: 'Could not generate puzzle. Please try again.' })
      } finally {
        setLoading(false)
      }
    },
    [difficulty, variantId]
  )

  const startDailyGame = useCallback(() => {
    sound.playPlaceDigit()
    setLoading(true)
    setSolved(false)
    setFailed(false)
    setLastReward(null)
    setShowWinModal(false)
    setIsBattleActive(false)
    setIsDailyChallenge(true)

    const { puzzle, solution: sol, difficulty: diff, config } = generateDailyPuzzle()
    setVariantId(config.id)
    setVariantConfig(config)
    setDifficulty(diff)
    setOriginal(puzzle.map((row) => row.slice()))
    setSolution(sol.map((row) => row.slice()))
    setBoard(puzzle.map((row) => row.slice()))
    setUserNotes({})
    setUsedNotes(false)
    setFeed([])
    setActiveIndex(null)
    setHintStep(null)
    setAutoSolve({ steps: [], index: 0, playing: false })
    setWrongCells(new Set())
    setClearedRows(new Set())
    setClearedCols(new Set())
    setClearedBoxes(new Set())
    setSelected(null)
    setMistakes(0)
    setSeconds(0)
    setHistory([{ board: puzzle.map((row) => row.slice()), notes: {} }])
    setHistoryIdx(0)
    setLocalPlayer((p) => ({ ...p, score: createInitialScore(config.size * config.size) }))
    setScreen('game')
    setLoading(false)
    setStatus({ type: 'ok', text: `Daily Challenge for ${getTodayDateString()} loaded.` })
  }, [])

  // ---------------- screen navigation ----------------
  const stopAutoSolveStatic = useCallback(() => {
    setAutoSolve((as) => ({ ...as, playing: false }))
  }, [])

  const openGame = useCallback(
    (diff: Difficulty, varId: VariantId) => {
      setScreen('game')
      startNewGame(diff, varId)
    },
    [startNewGame]
  )

  const openSolver = useCallback(() => {
    stopAutoSolveStatic()
    setScreen('solver')
  }, [stopAutoSolveStatic])

  const backToMenu = useCallback(() => {
    stopAutoSolveStatic()
    setScreen('menu')
    setSelected(null)
    setWrongCells(new Set())
    // The autosave effect has already written any in-progress game, so re-read
    // it to keep the menu's Continue card in sync.
    setResumable(loadGame())
  }, [stopAutoSolveStatic])

  // ---------------- player input & note editing ----------------
  const selectCell = useCallback(
    (r: number, c: number) => {
      if (autoSolve.playing || failed || battleHidden) return
      setSelected(`${r},${c}`)
      setWrongCells(new Set())
      sound.playSelect()
    },
    [autoSolve.playing, failed, battleHidden]
  )

  const placeDigit = useCallback(
    (v: number) => {
      if (!selected || autoSolve.playing || solved || failed || battleHidden) return
      const [r, c] = selected.split(',').map(Number)
      if (original[r][c]) return

      const cellKey = `${r},${c}`

      if (noteMode) {
        sound.playNoteToggle()
        setUsedNotes(true)
        // Built outside the updater: nesting pushHistory inside one makes the
        // updater impure and double-pushes history under StrictMode.
        const next = Object.fromEntries(
          Object.entries(userNotes).map(([k, set]) => [k, new Set(set)])
        )
        const set = new Set(next[cellKey] || [])
        if (set.has(v)) set.delete(v)
        else set.add(v)
        next[cellKey] = set
        setUserNotes(next)
        pushHistory(board, next)
        return
      }

      // Place actual digit
      setWrongCells(new Set())
      const wasSame = board[r][c] === v
      const nextBoard = cloneGrid(board)
      nextBoard[r][c] = wasSame ? 0 : v

      const nextNotes = Object.fromEntries(
        Object.entries(userNotes).map(([k, set]) => [k, new Set(set)])
      )
      delete nextNotes[cellKey]

      if (!wasSame && v !== 0) {
        for (let i = 0; i < variantConfig.size; i++) {
          nextNotes[`${r},${i}`]?.delete(v)
          nextNotes[`${i},${c}`]?.delete(v)
        }
      }

      setBoard(nextBoard)
      setUserNotes(nextNotes)
      pushHistory(nextBoard, nextNotes)

      if (!wasSame && v !== 0) {
        if (solution[r][c] !== v) {
          sound.playError()
          setMistakes((m) => {
            const next = m + 1
            // Battles are a race already scored by points, and ending one on a
            // mistake would hand the win to the opponent, so the limit is a
            // single-player and daily rule only.
            if (!isBattleActive && next >= MISTAKE_LIMIT) {
              setFailed(true)
              setStatus({ type: 'error', text: `${MISTAKE_LIMIT} mistakes — puzzle failed.` })
            }
            return next
          })
          setLocalPlayer((p) => {
            const nextScore = recordMistakePlacement(p.score)
            sendProgressUpdate(nextScore)
            return { ...p, score: nextScore }
          })
        } else {
          const wasRowComplete = board[r].every((val, colIdx) => val !== 0 && val === solution[r][colIdx])
          const isRowComplete = nextBoard[r].every((val, colIdx) => val !== 0 && val === solution[r][colIdx])

          const wasColComplete = board.every((rowArr, rowIdx) => rowArr[c] !== 0 && rowArr[c] === solution[rowIdx][c])
          const isColComplete = nextBoard.every((rowArr, rowIdx) => rowArr[c] !== 0 && rowArr[c] === solution[rowIdx][c])

          let clearedLine = false
          if (!wasRowComplete && isRowComplete) {
            clearedLine = true
            setClearedRows((prev) => new Set([...prev, r]))
          }
          if (!wasColComplete && isColComplete) {
            clearedLine = true
            setClearedCols((prev) => new Set([...prev, c]))
          }

          if (clearedLine) {
            sound.playLineClear()
            setTimeout(() => {
              setClearedRows(new Set())
              setClearedCols(new Set())
              setClearedBoxes(new Set())
            }, 700)
          } else {
            sound.playPlaceDigit()
          }

          setLocalPlayer((p) => {
            const nextScore = recordCorrectPlacement(p.score)
            sendProgressUpdate(nextScore)
            return { ...p, score: nextScore }
          })
        }
      }
    },
    [
      selected,
      original,
      solution,
      board,
      userNotes,
      noteMode,
      autoSolve.playing,
      solved,
      failed,
      isBattleActive,
      battleHidden,
      variantConfig.size,
      pushHistory,
      sendProgressUpdate,
    ]
  )

  const eraseCell = useCallback(() => {
    if (!selected || autoSolve.playing || solved || failed || battleHidden) return
    const [r, c] = selected.split(',').map(Number)
    if (original[r][c]) return
    const cellKey = `${r},${c}`

    setWrongCells(new Set())
    sound.playErase()

    const nextBoard = cloneGrid(board)
    nextBoard[r][c] = 0

    const nextNotes = { ...userNotes }
    delete nextNotes[cellKey]

    setBoard(nextBoard)
    setUserNotes(nextNotes)
    pushHistory(nextBoard, nextNotes)
  }, [selected, original, board, userNotes, autoSolve.playing, solved, failed, battleHidden, pushHistory])

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIdx <= 0 || autoSolve.playing || solved || battleHidden) return
    sound.playSelect()
    const prevEntry = history[historyIdx - 1]
    setHistoryIdx((i) => i - 1)
    setBoard(cloneGrid(prevEntry.board))
    setUserNotes(
      Object.fromEntries(Object.entries(prevEntry.notes).map(([k, set]) => [k, new Set(set)]))
    )
  }, [historyIdx, history, autoSolve.playing, solved, battleHidden])

  const handleRedo = useCallback(() => {
    if (historyIdx >= history.length - 1 || autoSolve.playing || solved || battleHidden) return
    sound.playSelect()
    const nextEntry = history[historyIdx + 1]
    setHistoryIdx((i) => i + 1)
    setBoard(cloneGrid(nextEntry.board))
    setUserNotes(
      Object.fromEntries(Object.entries(nextEntry.notes).map(([k, set]) => [k, new Set(set)]))
    )
  }, [historyIdx, history, autoSolve.playing, solved, battleHidden])

  // Auto-Fill Notes
  const handleAutoNotes = useCallback(() => {
    if (autoSolve.playing || solved || battleHidden || helpersRestricted) return
    sound.playHint()
    const computed = computeCandidates(board, variantConfig).cand
    const nextNotes: Record<string, Set<number>> = {}
    for (let r = 0; r < variantConfig.size; r++) {
      for (let c = 0; c < variantConfig.size; c++) {
        if (board[r][c] === 0) {
          nextNotes[`${r},${c}`] = new Set(computed[r][c])
        }
      }
    }
    setUsedNotes(true)
    setUserNotes(nextNotes)
    pushHistory(board, nextNotes)
    setStatus({ type: 'info', text: 'All valid candidate notes populated.' })
  }, [board, variantConfig, autoSolve.playing, solved, battleHidden, helpersRestricted, pushHistory])

  // Clear Notes
  const handleClearNotes = useCallback(() => {
    if (autoSolve.playing || solved || battleHidden) return
    sound.playErase()
    setUserNotes({})
    pushHistory(board, {})
    setStatus({ type: 'info', text: 'Cleared all pencil notes.' })
  }, [board, autoSolve.playing, solved, battleHidden, pushHistory])

  const resetBoard = useCallback(() => {
    if (autoSolve.playing || battleHidden) return
    sound.playErase()
    const origClone = original.map((row) => row.slice())
    setBoard(origClone)
    setUserNotes({})
    setUsedNotes(false)
    setFeed([])
    setActiveIndex(null)
    setHintStep(null)
    setWrongCells(new Set())
    setMistakes(0)
    setFailed(false)
    setHistory([{ board: origClone, notes: {} }])
    setHistoryIdx(0)
    setStatus({ type: 'info', text: 'Board reset to the original puzzle.' })
  }, [original, autoSolve.playing, battleHidden])

  // Hint
  const handleHint = useCallback(() => {
    if (autoSolve.steps.length > 0 || loading || battleHidden) return
    sound.playHint()
    const res = analyzeHint(board, original, solution, variantConfig)
    if (res.status === 'conflict' || res.status === 'wrong') {
      sound.playError()
      setWrongCells(new Set(res.cells.map(([r, c]) => `${r},${c}`)))
      return setStatus({ type: 'warn', text: res.message })
    }
    if (res.status === 'complete') {
      setSolved(true)
      return setStatus({ type: 'ok', text: res.message })
    }
    if (res.status === 'unsolvable') {
      sound.playError()
      return setStatus({ type: 'warn', text: res.message })
    }
    const step = res.step
    setHintStep(step)
    const isDup = feed.length > 0 && feed[feed.length - 1]?.id === step.id
    setFeed((f) => (isDup ? f : [...f, step]))
    setActiveIndex(feed.length + (isDup ? -1 : 0))
    setStatus({
      type: 'ok',
      text: `Next move (${step.technique}): ${
        step.placement ? `place ${step.placement.value}` : 'see eliminations'
      }`,
    })
  }, [board, original, solution, variantConfig, autoSolve.steps.length, loading, battleHidden, feed.length])

  // Auto-solve replay
  const startAutoSolve = useCallback(() => {
    if (autoSolve.steps.length > 0 || loading || battleHidden || helpersRestricted) return
    sound.playHint()
    setLoading(true)
    setStatus({ type: 'info', text: 'Planning logical solve steps…' })
    setTimeout(() => {
      const { steps } = new SudokuSolver(original, variantConfig).solve()
      setHintStep(null)
      setWrongCells(new Set())
      setBoard(original.map((row) => row.slice()))
      setFeed(steps)
      setActiveIndex(0)
      setAutoSolve({ steps, index: 0, playing: false })
      setStatus({ type: 'ok', text: `${steps.length} moves planned. Click Next Step or Play Auto-Solve.` })
      setLoading(false)
    }, 60)
  }, [original, variantConfig, autoSolve.steps.length, loading, battleHidden, helpersRestricted])

  // XP Cost Request Wrappers
  const requestAutoCandidates = useCallback(() => {
    setPendingHelper({
      title: 'Auto-Fill Pencil Notes',
      cost: COSTS.autoNotes,
      item: 'autoNotes',
      description: 'Populate all valid candidate notes across empty cells in the puzzle grid.',
      action: handleAutoNotes,
    })
  }, [handleAutoNotes])

  const requestHint = useCallback(() => {
    setPendingHelper({
      title: 'Get Logical Hint',
      cost: COSTS.hint,
      item: 'hint',
      description: 'Analyze board state and highlight the next logical move techniques.',
      action: handleHint,
    })
  }, [handleHint])

  const requestAutoSolve = useCallback(() => {
    setPendingHelper({
      title: 'Auto-Solve Puzzle',
      cost: COSTS.autoSolve,
      item: 'autoSolve',
      description: 'Watch the step-by-step solver deduce and solve the puzzle step by step.',
      action: startAutoSolve,
    })
  }, [startAutoSolve])

  // Keyboard navigation. Declared after the hint helpers so the listener binds
  // the current handlers rather than a stale first-render closure.
  useEffect(() => {
    if (screen !== 'game') return

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setNoteMode((m) => !m)
        sound.playNoteToggle()
        return
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        let [r, c] = selected ? selected.split(',').map(Number) : [0, 0]
        const key = e.key.toLowerCase()
        const S = variantConfig.size
        if (key === 'arrowup' || key === 'w') r = (r + S - 1) % S
        else if (key === 'arrowdown' || key === 's') r = (r + 1) % S
        else if (key === 'arrowleft' || key === 'a') c = (c + S - 1) % S
        else if (key === 'arrowright' || key === 'd') c = (c + 1) % S

        setSelected(`${r},${c}`)
        sound.playSelect()
        return
      }

      const digit = Number(e.key)
      if (digit >= 1 && digit <= variantConfig.size) placeDigit(digit)
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') eraseCell()
      // Route through the XP prompt so the shortcut costs the same as the button.
      else if (e.key.toLowerCase() === 'h') requestHint()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    screen,
    selected,
    variantConfig.size,
    placeDigit,
    eraseCell,
    handleUndo,
    handleRedo,
    requestHint,
  ])

  const confirmHelper = useCallback(() => {
    if (!pendingHelper) return
    const next = spend(pendingHelper.cost)
    if (!next) return // not enough coins; the modal already says so
    setWallet(next)
    queueSpend(pendingHelper.item)
    const act = pendingHelper.action
    setPendingHelper(null)
    act()
  }, [pendingHelper])

  // ---------------- autosave / resume ----------------

  // Kept in a ref so the save effect can read the live clock without re-running
  // once per second.
  const secondsRef = useRef(seconds)
  secondsRef.current = seconds

  const snapshot = useCallback((): SavedGame | null => {
    // Battles are transient and depend on an opponent; a finished or unstarted
    // board is not worth resuming into either.
    if (isBattleActive || solved || screen !== 'game') return null
    if (countEmpty(board) === totalCells || countEmpty(board) === 0) return null
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      variantId,
      config: variantConfig,
      difficulty,
      original,
      solution,
      board,
      notes: notesToJson(userNotes),
      history: history.map((h) => ({ board: h.board, notes: notesToJson(h.notes) })),
      historyIdx,
      seconds: secondsRef.current,
      mistakes,
      usedNotes,
      isDaily: isDailyChallenge,
      dailyDate: isDailyChallenge ? getTodayDateString() : undefined,
    }
  }, [
    isBattleActive,
    solved,
    screen,
    board,
    totalCells,
    variantId,
    variantConfig,
    difficulty,
    original,
    solution,
    userNotes,
    history,
    historyIdx,
    mistakes,
    usedNotes,
    isDailyChallenge,
  ])

  useEffect(() => {
    const snap = snapshot()
    if (snap) saveGame(snap)
  }, [snapshot])

  // The clock only lives in the snapshot when something else changes, so flush
  // on the way out to keep the resumed time honest.
  useEffect(() => {
    const flush = () => {
      const snap = snapshot()
      if (snap) saveGame(snap)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [snapshot])

  const resumeGame = useCallback(() => {
    const g = loadGame()
    if (!g) {
      setResumable(null)
      return
    }
    sound.playSelect()
    setVariantId(g.variantId)
    setVariantConfig(g.config)
    setDifficulty(g.difficulty)
    setOriginal(g.original)
    setSolution(g.solution)
    setBoard(g.board)
    setUserNotes(notesFromJson(g.notes))
    setHistory(
      g.history.length > 0
        ? g.history.map((h) => ({ board: h.board, notes: notesFromJson(h.notes) }))
        : [{ board: g.board.map((r) => r.slice()), notes: notesFromJson(g.notes) }]
    )
    setHistoryIdx(g.history.length > 0 ? g.historyIdx : 0)
    setSeconds(g.seconds)
    setMistakes(g.mistakes)
    setUsedNotes(g.usedNotes)
    setIsDailyChallenge(g.isDaily)
    setFailed(g.mistakes >= MISTAKE_LIMIT)
    setIsBattleActive(false)
    setSolved(false)
    setShowWinModal(false)
    setLastReward(null)
    setSelected(null)
    setWrongCells(new Set())
    setFeed([])
    setActiveIndex(null)
    setHintStep(null)
    setAutoSolve({ steps: [], index: 0, playing: false })
    setLocalPlayer((p) => ({
      ...p,
      score: createInitialScore(g.config.size * g.config.size),
    }))
    setScreen('game')
    setStatus({ type: 'ok', text: 'Resumed your saved puzzle.' })
  }, [])

  const discardResume = useCallback(() => {
    clearGame()
    setResumable(null)
  }, [])

  // ---------------- fail / continue ----------------
  const offer = useMemo(() => continueOffer(wallet), [wallet])

  const handleSignedIn = useCallback(
    async (next: Session) => {
      setSession(next)
      // Offer whatever was earned signed out; the server caps what it honours.
      await migrateLocal(loadWallet().coins)
      const state = await reconcile()
      if (state) {
        setWallet(overwriteWallet(state.coins, state.xp))
        if (state.entitlements.length > 0) setInventory(mergeServerEntitlements(state.entitlements))
      }
      setStatus({ type: 'ok', text: `Signed in as ${next.user.email}. Progress is saved to your account.` })
    },
    []
  )

  const handleSignedOut = useCallback(() => {
    setSession(null)
    setStatus({ type: 'info', text: 'Signed out. Progress is saved on this device.' })
  }, [])

  const handleContinue = useCallback(() => {
    const next = takeContinue()
    if (!next) return
    setWallet(next)
    // Only a paid continue is a spend; the daily free one costs nothing.
    if (offer.freeRemaining === 0) queueSpend('continue')
    setFailed(false)
    setMistakes(0)
    sound.playHint()
    setStatus({ type: 'ok', text: 'Back in. Mistakes reset — good luck.' })
  }, [offer.freeRemaining])

  const stepAutoSolve = useCallback(() => {
    const step = replayStepRef.current
    if (!step) return
    step.done = true
    const p = step.placement
    if (p) {
      sound.playPlaceDigit()
      setBoard((b) => {
        if (b[p.row][p.col]) return b
        const nb = cloneGrid(b)
        nb[p.row][p.col] = p.value
        return nb
      })
    }
    setAutoSolve((as) => {
      const nextIdx = Math.min(as.index + 1, as.steps.length)
      setActiveIndex(nextIdx < as.steps.length ? nextIdx : as.steps.length - 1)
      return { ...as, index: nextIdx }
    })
  }, [])

  const prevStepAutoSolve = useCallback(() => {
    setAutoSolve((as) => {
      if (as.index <= 0) return as
      const prevIdx = as.index - 1
      const nb = original.map((row) => row.slice())
      for (let i = 0; i < prevIdx; i++) {
        const p = as.steps[i]?.placement
        if (p) nb[p.row][p.col] = p.value
      }
      setBoard(nb)
      setActiveIndex(prevIdx)
      return { ...as, index: prevIdx }
    })
  }, [original])

  useEffect(() => {
    replayStepRef.current = autoSolve.steps[autoSolve.index] ?? null
  }, [autoSolve.index, autoSolve.steps])

  const [solveSpeed, setSolveSpeed] = useState(1)

  useEffect(() => {
    if (!autoSolve.playing) return
    const step = autoSolve.steps[autoSolve.index]
    if (!step) return
    const delay = Math.round(2000 / solveSpeed)
    const t = setTimeout(stepAutoSolve, delay)
    return () => clearTimeout(t)
  }, [autoSolve.playing, autoSolve.index, autoSolve.steps, solveSpeed, stepAutoSolve])

  const focusStep = useCallback((step: Step) => {
    sound.playSelect()
    if (step.placement) setSelected(`${step.placement.row},${step.placement.col}`)
    else if (step.focus?.length) setSelected(step.focus.map(([r, c]) => `${r},${c}`)[0])
  }, [])

  const playing = autoSolve.playing

  if (screen === 'menu') {
    return (
      <div className={`app theme-${theme}`}>
        <StartScreen
          muted={muted}
          onOpenSinglePlayerModal={() => setShowSinglePlayerModal(true)}
          onOpenSolver={openSolver}
          onOpenBattle={createBattleRoom}
          onStartDaily={startDailyGame}
          onOpenStats={() => setShowStatsModal(true)}
          onToggleSound={() => setMuted(sound.toggleMute())}
          onOpenShop={() => setShowShop(true)}
          onOpenAccount={() => setShowAccount(true)}
          accountEmail={session?.user.email ?? null}
          resume={resumable ? summarize(resumable) : null}
          onResume={resumeGame}
          onDiscardResume={discardResume}
          coins={wallet.coins}
          level={levelFromXp(wallet.xp).level}
        />
        {showSinglePlayerModal && (
          <SinglePlayerModal
            difficulty={difficulty}
            variantId={variantId}
            onDifficultyChange={setDifficulty}
            onVariantChange={setVariantId}
            onStartGame={(d, v) => {
              openGame(d, v)
              setShowSinglePlayerModal(false)
            }}
            onClose={() => setShowSinglePlayerModal(false)}
          />
        )}
        {showMultiplayerModal && roomId && (
          <MultiplayerModal
            roomId={roomId}
            isHost={isHost}
            localPlayer={localPlayer}
            remotePlayer={remotePlayer}
            connection={connection}
            variantId={variantId}
            difficulty={difficulty}
            onVariantChange={setVariantId}
            onDifficultyChange={setDifficulty}
            onToggleReady={toggleLocalReady}
            onStartMatch={startBattleMatch}
            onClose={() => setShowMultiplayerModal(false)}
          />
        )}
        {showStatsModal && <StatsModal stats={stats} onClose={() => setShowStatsModal(false)} />}
        {showAccount && (
          <AccountModal
            session={session}
            coins={wallet.coins}
            onSignedIn={handleSignedIn}
            onSignedOut={handleSignedOut}
            onClose={() => setShowAccount(false)}
          />
        )}
        {showShop && (
          <ShopModal
            inventory={inventory}
            coins={wallet.coins}
            level={levelFromXp(wallet.xp).level}
            onInventoryChange={setInventory}
            onCoinsChange={(c) => setWallet((w) => ({ ...w, coins: c }))}
            onClose={() => setShowShop(false)}
          />
        )}
      </div>
    )
  }

  if (screen === 'solver') {
    return (
      <div className={`app theme-${theme}`}>
        <SolverScreen onBack={backToMenu} />
      </div>
    )
  }

  const showExplanation = feed.length > 0 || autoSolve.steps.length > 0 || hintStep !== null

  return (
    <div className={`app theme-${theme}`}>
      {showBattleCountdown && (
        <BattleCountdownOverlay
          onFinished={() => {
            setShowBattleCountdown(false)
            setBattleHidden(false)
          }}
        />
      )}

      <header className="topbar">
        <div className="brand">
          <span className="logo-cell">{variantConfig.size}</span>
          <div>
            <h1>Sudoku Studio</h1>
            <p className="tagline">
              {isBattleActive
                ? `1v1 Online Battle (${variantConfig.name})`
                : `${variantConfig.name} - ${difficulty} mode`}
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className="top-tool-btn"
            onClick={() => setMuted(sound.toggleMute())}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <IconSoundOff /> : <IconSoundOn />}
          </button>
          <button className="top-tool-btn" onClick={() => setShowStatsModal(true)}>
            <IconTrophy /> Stats
          </button>
          <button
            className="top-tool-btn"
            onClick={() => setShowShop(true)}
            title="Themes, numerals and win effects"
          >
            <IconPalette size={15} /> Shop
          </button>
          <button
            className="top-tool-btn"
            onClick={() => setShowAccount(true)}
            title={session ? session.user.email : 'Sign in to save your progress'}
          >
            <IconUser size={15} /> {session ? 'Account' : 'Sign in'}
          </button>
        </div>

        <div className="stats">
          <span className="xp-top-pill" title="Coins — spend on hints and continues">
            <IconCoin size={14} /> {wallet.coins}
          </span>
          <span className="lvl-top-pill" title={`Level ${levelFromXp(wallet.xp).level}`}>
            LVL {levelFromXp(wallet.xp).level}
          </span>
          <div className="stat">
            <span className="stat-label">Time</span>
            <span className="stat-value">{fmt(seconds)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Mistakes</span>
            <span className="stat-value">{mistakes}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Filled</span>
            <span className="stat-value">
              {totalCells - countEmpty(board)}/{totalCells}
            </span>
          </div>
          <button className="btn" onClick={backToMenu}>
            Menu
          </button>
        </div>
      </header>

      {isBattleActive && (
        <BattleHUD
          localPlayer={localPlayer}
          remotePlayer={remotePlayer}
          totalCells={totalCells}
        />
      )}

      <div className="toolbar">
        <label className="pill diff-picker">
          Variant:
          <CustomSelect
            options={VARIANT_OPTIONS}
            value={variantId}
            onChange={(val) => {
              const v = val as VariantId
              startNewGame(difficulty, v)
            }}
            disabled={loading || playing || isBattleActive}
          />
        </label>
        <label className="pill diff-picker">
          Difficulty:
          <CustomSelect
            options={DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={(val) => {
              if (isDifficulty(val)) startNewGame(val, variantId)
            }}
            disabled={loading || playing || isBattleActive}
          />
        </label>
        <button
          className="btn"
          onClick={() => startNewGame(difficulty, variantId)}
          disabled={loading || playing || isBattleActive}
        >
          New game
        </button>
        <span className="toolbar-spacer" />
        {!isBattleActive && (
          <button className="btn btn-warn" onClick={createBattleRoom}>
            <IconTrophy /> 1v1 Battle Lobby
          </button>
        )}
        {!helpersRestricted && (
          <button
            className="btn btn-solve"
            onClick={requestAutoSolve}
            disabled={loading || autoSolve.steps.length > 0 || solved}
          >
            <IconPlay /> Auto-Solve
          </button>
        )}
        {solved && !showWinModal && (
          <button className="btn btn-primary" onClick={() => setShowWinModal(true)}>
            <IconTrophy /> View Results
          </button>
        )}
        <button className="btn" onClick={resetBoard} disabled={loading || playing || isBattleActive}>
          <IconRefresh /> Reset
        </button>
      </div>

      <main className={`layout ${!showExplanation ? 'layout-centered' : ''}`}>
        <section className="board-col">
          {!showExplanation && status?.text && (
            <div className={`status status-${status.type} status-dismissible`}>
              <span>{status.text}</span>
              <button className="status-dismiss-btn" onClick={dismissStatus} title="Dismiss message">
                <IconClose size={13} />
              </button>
            </div>
          )}
          <div className="board-wrap">
            <Board
              grid={board}
              original={original}
              selected={selected}
              candidates={cand}
              userNotes={userNotes}
              showNotes={true}
              conflictSet={conflictSet}
              focusCells={markers.focus}
              placementCell={markers.placement}
              strikeMap={markers.strike}
              stepRows={markers.stepRows}
              stepCols={markers.stepCols}
              stepBoxes={markers.stepBoxes}
              clearedRows={clearedRows}
              clearedCols={clearedCols}
              clearedBoxes={clearedBoxes}
              digitHighlight={digitHighlight}
              config={variantConfig}
              onSelect={selectCell}
            />
          </div>
          <Keypad
            digitCounts={digitCounts}
            digitHighlight={digitHighlight}
            noteMode={noteMode}
            canUndo={historyIdx > 0}
            canRedo={historyIdx < history.length - 1}
            size={variantConfig.size}
            onDigitHover={setDigitHighlight}
            onDigit={placeDigit}
            onErase={eraseCell}
            onToggleNoteMode={() => {
              setNoteMode((m) => !m)
              sound.playNoteToggle()
            }}
            onHint={requestHint}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onAutoNotes={requestAutoCandidates}
            onClearNotes={handleClearNotes}
            autoNotesDisabled={helpersRestricted}
            disabled={playing || solved || failed || battleHidden}
          />
        </section>

        {showExplanation && (
          <aside className="explain-col">
            <ExplanationPanel
              steps={feed}
              activeIndex={
                autoSolve.steps.length > 0
                  ? Math.min(autoSolve.index, Math.max(feed.length - 1, 0))
                  : activeIndex
              }
              playing={playing}
              speed={solveSpeed}
              onChangeSpeed={setSolveSpeed}
              canPrev={
                autoSolve.steps.length > 0
                  ? autoSolve.index > 0
                  : activeIndex !== null && activeIndex > 0
              }
              canNext={
                autoSolve.steps.length > 0
                  ? autoSolve.index < autoSolve.steps.length - 1
                  : activeIndex !== null && activeIndex < feed.length - 1
              }
              onTogglePlay={
                helpersRestricted && autoSolve.steps.length === 0
                  ? undefined
                  : () => {
                      if (autoSolve.steps.length === 0) startAutoSolve()
                      else setAutoSolve((as) => ({ ...as, playing: !as.playing }))
                    }
              }
              onPrevStep={prevStepAutoSolve}
              onNextStep={stepAutoSolve}
              onFocus={focusStep}
              status={status}
              onDismissStatus={dismissStatus}
            />
          </aside>
        )}
      </main>

      {showMultiplayerModal && roomId && (
        <MultiplayerModal
          roomId={roomId}
          isHost={isHost}
          localPlayer={localPlayer}
          remotePlayer={remotePlayer}
          connection={connection}
          variantId={variantId}
          difficulty={difficulty}
          onVariantChange={(v) => {
            setVariantId(v)
            startNewGame(difficulty, v)
          }}
          onDifficultyChange={(d) => {
            setDifficulty(d)
            startNewGame(d, variantId)
          }}
          onToggleReady={toggleLocalReady}
          onStartMatch={startBattleMatch}
          onClose={() => setShowMultiplayerModal(false)}
        />
      )}

      {solved && showWinModal && (
        <div className="overlay">
          <div className="overlay-card win-card">
            <h2>{isBattleActive ? 'Battle Finished!' : 'Puzzle Solved!'}</h2>
            <p>
              {isBattleActive
                ? remotePlayer && localPlayer.score.score > remotePlayer.score.score
                  ? 'VICTORY! You defeated your opponent!'
                  : 'Great match! Check the final battle scores below.'
                : 'Congratulations! Every digit has been placed correctly.'}
            </p>
            <div className="overlay-stats">
              <span>Time {fmt(seconds)}</span>
              <span>Score {localPlayer.score.score} pts</span>
              <span>Mistakes {mistakes}</span>
              <span>Max Streak {localPlayer.score.maxStreak}x</span>
            </div>

            {lastReward && (lastReward.coins > 0 || lastReward.xp > 0) && (
              <div className="reward-panel">
                <div className="reward-totals">
                  {lastReward.coins > 0 && (
                    <span className="reward-coins">
                      <IconCoin size={17} /> +{lastReward.coins}
                    </span>
                  )}
                  {lastReward.xp > 0 && <span className="reward-xp">+{lastReward.xp} XP</span>}
                </div>
                {lastReward.lines.length > 0 && (
                  <ul className="reward-lines">
                    {lastReward.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                <div className="reward-level">
                  Level {levelFromXp(wallet.xp).level} · {levelFromXp(wallet.xp).into}/
                  {levelFromXp(wallet.xp).span} XP
                  <div className="reward-level-track">
                    <div
                      className="reward-level-fill"
                      style={{ width: `${levelFromXp(wallet.xp).pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {!isBattleActive && (
              <div className="win-difficulty-selector">
                <label className="pill diff-picker">
                  Next Game Difficulty:
                  <CustomSelect
                    options={DIFFICULTY_OPTIONS}
                    value={difficulty}
                    onChange={(val) => {
                      if (isDifficulty(val)) setDifficulty(val)
                    }}
                  />
                </label>
              </div>
            )}

            <div className="overlay-actions">
              <button
                className="btn btn-primary flex-btn"
                onClick={() => startNewGame(difficulty, variantId)}
              >
                <IconPlay size={16} /> Play Again ({variantConfig.name})
              </button>
              <button className="btn flex-btn" onClick={backToMenu}>
                <IconArrowLeft size={16} /> Main Menu
              </button>
              <button className="btn" onClick={() => setShowWinModal(false)}>
                Inspect Board
              </button>
            </div>
          </div>
        </div>
      )}

      {failed && !solved && (
        <GameOverModal
          mistakeLimit={MISTAKE_LIMIT}
          seconds={seconds}
          freeContinues={offer.freeRemaining}
          continueCost={offer.cost}
          coins={wallet.coins}
          onContinue={handleContinue}
          onNewGame={() => startNewGame(difficulty, variantId)}
          onMenu={backToMenu}
        />
      )}

      {pendingHelper && (
        <HelperConfirmModal
          title={pendingHelper.title}
          cost={pendingHelper.cost}
          currentCoins={wallet.coins}
          description={pendingHelper.description}
          onConfirm={confirmHelper}
          onClose={() => setPendingHelper(null)}
        />
      )}

      {showStatsModal && <StatsModal stats={stats} onClose={() => setShowStatsModal(false)} />}

      {showAccount && (
        <AccountModal
          session={session}
          coins={wallet.coins}
          onSignedIn={handleSignedIn}
          onSignedOut={handleSignedOut}
          onClose={() => setShowAccount(false)}
        />
      )}

      {showShop && (
        <ShopModal
          inventory={inventory}
          coins={wallet.coins}
          level={levelFromXp(wallet.xp).level}
          onInventoryChange={setInventory}
          onCoinsChange={(c) => setWallet((w) => ({ ...w, coins: c }))}
          onClose={() => setShowShop(false)}
        />
      )}
    </div>
  )
}