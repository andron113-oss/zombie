import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine, GameState, WeaponType, WEAPON_STATS } from './game/engine';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    squadCount: 5,
    maxSquad: 100,
    weapon: WeaponType.RIFLE,
    wave: 1,
    score: 0,
    health: 100,
    maxHealth: 100,
    shieldActive: false,
    shieldTimer: 0,
    speedBoost: false,
    speedBoostTimer: 0,
    gameOver: false,
    paused: false,
    squadX: 0,
  });
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('Инициализация...');
  const [damageFlash, setDamageFlash] = useState(false);
  const [waveNotification, setWaveNotification] = useState(false);
  const [combo, setCombo] = useState(0);
  const prevHealthRef = useRef(100);
  const prevWaveRef = useRef(1);
  const prevScoreRef = useRef(0);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStateChange = useCallback((state: GameState) => {
    if (state.health < prevHealthRef.current) {
      setDamageFlash(true);
      setTimeout(() => setDamageFlash(false), 200);
    }
    if (state.wave > prevWaveRef.current) {
      setWaveNotification(true);
      setTimeout(() => setWaveNotification(false), 2000);
    }
    // Combo system
    if (state.score > prevScoreRef.current) {
      setCombo(prev => prev + 1);
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
      comboTimerRef.current = setTimeout(() => setCombo(0), 2000);
    }
    prevHealthRef.current = state.health;
    prevWaveRef.current = state.wave;
    prevScoreRef.current = state.score;
    setGameState(state);
  }, []);

  useEffect(() => {
    if (!started || !containerRef.current) return;

    setLoading(true);
    setLoadingProgress('Инициализация...');
    const engine = new GameEngine(
      containerRef.current, 
      handleStateChange,
      () => {
        setLoading(false);
        setLoadingProgress('');
      },
      (message: string) => {
        setLoadingProgress(message);
      }
    );
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [started, handleStateChange]);

  const handleRestart = () => {
    if (engineRef.current) {
      engineRef.current.restart();
    }
  };

  const weaponStats = WEAPON_STATS[gameState.weapon];
  const healthPercent = (gameState.health / gameState.maxHealth) * 100;

  if (!started) {
    return (
      <div className="w-full h-screen bg-gradient-to-b from-gray-900 via-purple-950 to-black flex items-center justify-center overflow-hidden relative">
        {/* Background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-red-500/30 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>

        <div className="text-center z-10 px-4">
          {/* Logo */}
          <div className="mb-6">
            <div className="text-7xl mb-2">🧟‍♂️</div>
            <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-red-600 mb-2 drop-shadow-[0_0_30px_rgba(255,0,0,0.3)]">
              ZOMBIE DEFENSE
            </h1>
            <div className="text-2xl font-bold text-red-400 tracking-widest">3D</div>
          </div>

          <p className="text-lg text-gray-300 mb-1">Обороняй позицию от орд зомби!</p>
          <p className="text-sm text-gray-500 mb-6">Стреляй • Собирай бонусы • Выживай</p>
          
          {/* Instructions */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg mx-auto mb-8 text-left text-sm">
            <div className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-xl border border-blue-500/30">
              <span className="text-blue-400 font-bold block">🔵 +1 Боец</span>
              <span className="text-gray-400 text-xs">Набор в отряд</span>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-xl border border-green-500/30">
              <span className="text-green-400 font-bold block">🟢 Оружие</span>
              <span className="text-gray-400 text-xs">Улучшение</span>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-xl border border-red-500/30">
              <span className="text-red-400 font-bold block">❤️ Лечение</span>
              <span className="text-gray-400 text-xs">+30 HP</span>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-xl border border-blue-400/30">
              <span className="text-blue-300 font-bold block">🛡️ Щит</span>
              <span className="text-gray-400 text-xs">Неуязвимость</span>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-xl border border-yellow-500/30">
              <span className="text-yellow-400 font-bold block">⚡ Скорость</span>
              <span className="text-gray-400 text-xs">Быстрая стрельба</span>
            </div>
            <div className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-xl border border-orange-500/30">
              <span className="text-orange-400 font-bold block">💀 5 типов</span>
              <span className="text-gray-400 text-xs">Зомби</span>
            </div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="group relative px-12 py-4 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white text-2xl font-bold rounded-2xl shadow-2xl shadow-red-600/40 transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden"
          >
            <span className="relative z-10">▶ НАЧАТЬ ИГРУ</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>
          
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-gray-600">
            <span>🎮 VK Play</span>
            <span>•</span>
            <span>🌐 Three.js</span>
            <span>•</span>
            <span>⚡ WebGL</span>
            <span>•</span>
            <span>🎨 Реальные 3D модели</span>
          </div>
          <div className="mt-2 text-xs text-gray-700">
            Модели: Three.js Examples (MIT License)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative overflow-hidden bg-black">
      {/* Game Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">🎮</div>
            <div className="text-2xl text-white font-bold mb-2">Загрузка 3D моделей...</div>
            <div className="text-sm text-gray-400 mb-4">Скачивание реальных моделей из GitHub</div>
            <div className="text-lg text-blue-400 mb-4 min-h-[28px]">{loadingProgress}</div>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <div className="text-xs text-gray-500 mt-4">
              Модели: ~14 MB (zombie.glb + soldier.glb)
            </div>
          </div>
        </div>
      )}

      {/* Damage flash overlay */}
      {damageFlash && (
        <div className="absolute inset-0 pointer-events-none z-40"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.4) 100%)',
            animation: 'fadeOut 0.2s ease-out forwards',
          }}
        />
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start">
          {/* Left - Squad & Health */}
          <div className="flex flex-col gap-2">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">👥</span>
                <span className="text-white font-bold text-lg">{gameState.squadCount}</span>
                <span className="text-gray-400 text-sm">/ {gameState.maxSquad}</span>
              </div>
            </div>
            
            {/* Health Bar */}
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/50 w-40">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">❤️</span>
                <span className="text-white text-xs font-bold">{Math.round(gameState.health)} HP</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${healthPercent}%`,
                    backgroundColor: healthPercent > 60 ? '#22c55e' : healthPercent > 30 ? '#eab308' : '#ef4444',
                  }}
                />
              </div>
            </div>

            {/* Active Effects */}
            <div className="flex gap-1">
              {gameState.shieldActive && (
                <div className="bg-blue-600/60 backdrop-blur-sm rounded px-2 py-1 text-xs text-white border border-blue-400/50 animate-pulse">
                  🛡️ {Math.ceil(gameState.shieldTimer)}s
                </div>
              )}
              {gameState.speedBoost && (
                <div className="bg-yellow-600/60 backdrop-blur-sm rounded px-2 py-1 text-xs text-white border border-yellow-400/50 animate-pulse">
                  ⚡ {Math.ceil(gameState.speedBoostTimer)}s
                </div>
              )}
            </div>
          </div>

          {/* Center - Wave */}
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700/50">
            <div className="text-center">
              <div className="text-gray-400 text-xs uppercase tracking-wider">Волна</div>
              <div className="text-white font-bold text-2xl">{gameState.wave}</div>
            </div>
          </div>

          {/* Right - Score & Weapon */}
          <div className="flex flex-col gap-2 items-end">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/50">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Счёт:</span>
                <span className="text-white font-bold text-lg">{gameState.score}</span>
              </div>
            </div>
            
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">{weaponStats.icon}</span>
                <div>
                  <div className="text-white font-bold text-sm">{weaponStats.name}</div>
                  <div className="text-gray-400 text-xs">DMG: {weaponStats.damage}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave notification */}
        {waveNotification && (
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center z-30">
            <div className="text-4xl font-bold text-red-500 animate-pulse drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]">
              ⚠️ ВОЛНА {gameState.wave} ⚠️
            </div>
            <div className="text-lg text-gray-300 mt-2">
              Зомби становятся сильнее!
            </div>
          </div>
        )}

        {/* Squad position indicator */}
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2">
          <div className="w-64 h-2 bg-gray-800/50 rounded-full overflow-hidden border border-gray-600/30">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-100"
              style={{ 
                width: '8px',
                marginLeft: `${((gameState.squadX + 5) / 10) * 100}%`,
                transform: 'translateX(-50%)'
              }}
            />
          </div>
          <div className="text-center text-xs text-gray-400 mt-1">Позиция отряда</div>
        </div>

        {/* Combo indicator */}
        {combo > 2 && (
          <div className="absolute top-1/2 right-8 transform -translate-y-1/2">
            <div className="text-right">
              <div className="text-3xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(255,200,0,0.8)]">
                x{combo}
              </div>
              <div className="text-xs text-yellow-300 uppercase tracking-wider">COMBO</div>
            </div>
          </div>
        )}

        {/* Zombie direction indicators */}
        <div className="absolute top-12 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center gap-2 bg-black/30 rounded-full px-3 py-1">
            <span className="text-xs text-gray-400">🧟</span>
            <div className="w-32 h-1 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (gameState.score / (gameState.wave * 10)) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">Прогресс</span>
          </div>
        </div>

        {/* Bottom hint */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-2 text-gray-400 text-xs text-center">
            ← → Двигай мышью для перемещения отряда • Бойцы стреляют автоматически
          </div>
        </div>
      </div>

      {/* Game Over Screen */}
      {gameState.gameOver && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="text-6xl mb-4">💀</div>
            <h2 className="text-5xl font-black text-red-500 mb-2 drop-shadow-[0_0_20px_rgba(255,0,0,0.5)]">
              GAME OVER
            </h2>
            <p className="text-gray-400 mb-6">Твоя позиция пала...</p>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-white">{gameState.wave}</div>
                <div className="text-xs text-gray-400 uppercase">Волна</div>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-red-400">{gameState.score}</div>
                <div className="text-xs text-gray-400 uppercase">Убито</div>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-blue-400">{gameState.squadCount}</div>
                <div className="text-xs text-gray-400 uppercase">Бойцов</div>
              </div>
            </div>

            {/* Rating */}
            <div className="mb-6">
              <div className="text-sm text-gray-400 mb-1">Рейтинг</div>
              <div className="text-2xl">
                {gameState.score > 100 ? '⭐⭐⭐' : gameState.score > 50 ? '⭐⭐' : '⭐'}
              </div>
            </div>

            <button
              onClick={handleRestart}
              className="pointer-events-auto px-10 py-4 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white text-xl font-bold rounded-2xl shadow-2xl shadow-red-600/30 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              🔄 ИГРАТЬ СНОВА
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
