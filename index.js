// Spirit of the Woods - Minimal, no-celebration build
// AI + 2P fixed; Phaser only draws the static board (no piece animations)

const gameState = {
  board: Array(9).fill(null),
  currentPlayer: 'shell',
  player1Symbol: 'shell',
  player2Symbol: 'feather',
  playerSymbol: 'shell',
  aiSymbol: 'feather',
  difficulty: 'easy',
  audioEnabled: true,
  musicEnabled: true,
  gameMode: 'single',
  gameActive: false,
  currentRoundWinner: null,
  isProcessingMove: false,
  aiIsThinking: false,
  stats: { wins: 0, losses: 0, draws: 0, totalGames: 0 },
  sessionScores: { player1: 0, player2: 0 },
  phaserGame: null
};

// ---------- Audio ----------
const audioManager = {
  currentMusic: null,
  playSound(id) {
    if (!gameState.audioEnabled) return;
    const el = document.getElementById(id);
    if (el) { el.currentTime = 0; el.volume = 0.5; el.play().catch(()=>{}); }
  },
  playMusic(id) {
    if (!gameState.musicEnabled) return;
    const music = document.getElementById(id);
    if (!music) return;
    if (this.currentMusic && this.currentMusic !== music) this.fadeOut(this.currentMusic);
    music.volume = 0;
    music.loop = true;
    music.play().catch(()=>{});
    this.fadeIn(music);
    this.currentMusic = music;
  },
  stopMusic(){ if (this.currentMusic) this.fadeOut(this.currentMusic); },
  fadeIn(audio, duration=1000){
    const end=0.3, step=(end-0)/(duration/50); audio.volume=0;
    const t=setInterval(()=>{ if(audio.volume<end-step){audio.volume+=step;}else{audio.volume=end;clearInterval(t);} },50);
  },
  fadeOut(audio, duration=1000){
    const start=audio.volume, step=start/(duration/50);
    const t=setInterval(()=>{ if(audio.volume>step){audio.volume-=step;}else{audio.volume=0;audio.pause();clearInterval(t);} },50);
  }
};

// ---------- Phaser Scene (static grid only; no piece/VFX) ----------
class GameScene extends Phaser.Scene {
  constructor(){ super({ key:'GameScene' }); this.boardData=null; }

  create(){
    const boardElement = document.getElementById('game-board');
    const W = boardElement?.clientWidth || this.game.config.width || 450;
    const H = boardElement?.clientHeight || this.game.config.height || 450;
    const boardSize = Math.min(W, H) - 20;
    const boardX = (W - boardSize)/2;
    const boardY = (H - boardSize)/2;
    const cell = boardSize / 3;          // ✅ define cell

    // No drawings; CSS overlay handles visuals
    this.boardData = { x: boardX, y: boardY, size: boardSize, cellSize: cell };
  }

  reset(){
    this.children.list.slice().forEach(child => { if(child.type==='Graphics') child.destroy(); });
    this.boardData = null;
    this.create();
  }

  // keep method for compatibility; do nothing
  addSymbol(){ return; }
}

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', () => {
  loadStats(); updateStatsDisplay(); initializeEventListeners();

  document.addEventListener('click', function startMusic(){
    audioManager.playMusic('gameplay-music');
    document.removeEventListener('click', startMusic);
  }, { once:true });

  console.log('✅ Spirit of the Woods - Game Ready!');
  console.log('🎮 Game Rules: Get 3 in a row to win!');
});

// Create Phaser only when board is visible
function initializePhaserGame(){
  if (gameState.phaserGame) return;

  const canvas = document.getElementById('game-canvas');
  const board = document.getElementById('game-board');
  if (!canvas || !board) return;

  const w = board.clientWidth || 450;

  gameState.phaserGame = new Phaser.Game({
    type: Phaser.CANVAS,
    canvas,
    width: w - 20,
    height: w - 20,
    transparent: true,
    scene: GameScene
  });
}

function initializeEventListeners(){
  document.querySelectorAll('.cell').forEach(c => c.addEventListener('click', handleCellClick));

  document.getElementById('audio-toggle').addEventListener('change', e=>{
    gameState.audioEnabled = e.target.checked;
    if (e.target.checked) audioManager.playSound('button-select');
  });

  document.getElementById('music-toggle').addEventListener('change', e=>{
    gameState.musicEnabled = e.target.checked;
    if (e.target.checked) audioManager.playMusic('gameplay-music'); else audioManager.stopMusic();
  });

  document.querySelectorAll('.diff-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      gameState.difficulty = btn.dataset.level;
      audioManager.playSound('button-select');
    });
  });

  document.querySelectorAll('.symbol-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.symbol-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      gameState.player1Symbol = btn.dataset.symbol;
      gameState.player2Symbol = btn.dataset.symbol === 'shell' ? 'feather' : 'shell';
      gameState.playerSymbol = gameState.player1Symbol;
      gameState.aiSymbol = gameState.player2Symbol;
      audioManager.playSound('button-select');
    });
  });

  document.querySelectorAll('button').forEach(btn=>{
    if (!btn.onclick) btn.addEventListener('click', ()=>audioManager.playSound('button-select'));
  });
}

function handleCellClick(e){
  const idx = parseInt(e.target.dataset.index, 10);
  if (!gameState.gameActive || gameState.board[idx]) return;
  if (gameState.aiIsThinking) return;
  if (gameState.gameMode==='single' && gameState.currentPlayer!==gameState.playerSymbol) return;
  makeMove(idx, gameState.currentPlayer);
}

function makeMove(index, symbol){
  if (gameState.board[index] || !gameState.gameActive) return;

  gameState.board[index] = symbol;

  const cell = document.querySelector(`.cell[data-index="${index}"]`);
  cell.textContent = symbol === 'shell' ? '🐚' : '🪶';
  cell.classList.add('occupied');

  const sfx = (gameState.gameMode==='single')
    ? (symbol===gameState.playerSymbol ? 'player-select' : 'opponent-select')
    : (symbol===gameState.player1Symbol ? 'player-select' : 'opponent-select');
  audioManager.playSound(sfx);

  const winPattern = checkWin(symbol);
  if (winPattern){ endGame(symbol, winPattern); return; }
  if (gameState.board.every(c => c!==null)){ endGame('draw'); return; }

  gameState.currentPlayer = (gameState.currentPlayer==='shell') ? 'feather' : 'shell';
  updateTurnIndicator();

  if (gameState.gameMode==='single' && gameState.currentPlayer===gameState.aiSymbol && gameState.gameActive){
    gameState.aiIsThinking = true;
    setTimeout(makeAIMove, 800);
  }
}

function makeAIMove(){
  if (!gameState.gameActive || !gameState.aiIsThinking) return;

  let move;
  switch(gameState.difficulty){
    case 'easy': move = getRandomMove(); break;
    case 'medium': move = Math.random()<0.7 ? getBestMove() : getRandomMove(); break;
    case 'hard': default: move = getBestMove();
  }

  gameState.aiIsThinking = false;
  if (move !== -1) makeMove(move, gameState.aiSymbol);
}

function getRandomMove(){
  const open = [];
  for (let i=0;i<9;i++) if (!gameState.board[i]) open.push(i);
  if (!open.length) return -1;
  return open[Math.floor(Math.random()*open.length)];
}

function getBestMove(){
  // try to win
  for (let i=0;i<9;i++){ if(!gameState.board[i]){ gameState.board[i]=gameState.aiSymbol;
    if (checkWinForBoard(gameState.board, gameState.aiSymbol)){ gameState.board[i]=null; return i; }
    gameState.board[i]=null; } }
  // block player
  for (let i=0;i<9;i++){ if(!gameState.board[i]){ gameState.board[i]=gameState.playerSymbol;
    if (checkWinForBoard(gameState.board, gameState.playerSymbol)){ gameState.board[i]=null; return i; }
    gameState.board[i]=null; } }
  // minimax fallback
  let best=-Infinity, m=-1;
  for (let i=0;i<9;i++){ if(!gameState.board[i]){ gameState.board[i]=gameState.aiSymbol;
    const score=minimax(gameState.board,0,false,-Infinity,Infinity); gameState.board[i]=null;
    if (score>best){ best=score; m=i; } } }
  return m!==-1 ? m : getRandomMove();
}

function minimax(board, depth, isMax, a, b){
  const aiWin = checkWinForBoard(board, gameState.aiSymbol);
  const plWin = checkWinForBoard(board, gameState.playerSymbol);
  if (aiWin) return 10 - depth;
  if (plWin) return depth - 10;
  if (board.every(c=>c!==null)) return 0;
  if (depth>6) return 0;

  if (isMax){
    let max=-Infinity;
    for (let i=0;i<9;i++){ if(!board[i]){ board[i]=gameState.aiSymbol;
      const v=minimax(board, depth+1, false, a, b); board[i]=null;
      max=Math.max(max,v); a=Math.max(a,v); if (b<=a) break; } }
    return max;
  } else {
    let min=Infinity;
    for (let i=0;i<9;i++){ if(!board[i]){ board[i]=gameState.playerSymbol;
      const v=minimax(board, depth+1, true, a, b); board[i]=null;
      min=Math.min(min,v); b=Math.min(b,v); if (b<=a) break; } }
    return min;
  }
}

function checkWin(sym){ return checkWinForBoard(gameState.board, sym); }
function checkWinForBoard(board, sym){
  const P=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const p of P){ if (p.every(i=>board[i]===sym)) return p; }
  return false;
}

function endGame(result, pattern=null){
  gameState.gameActive=false; gameState.aiIsThinking=false; gameState.currentRoundWinner=result;
  gameState.stats.totalGames++;

  const modal=document.getElementById('game-modal');
  const title=document.getElementById('modal-title');
  const msg=document.getElementById('modal-message');

  if (result==='draw'){
    gameState.stats.draws++;
    title.textContent='Balance Achieved';
    msg.textContent='The spirits are in harmony';
  } else {
    if (pattern){
      pattern.forEach(i=>document.querySelector(`.cell[data-index="${i}"]`).classList.add('winner'));
    }
    if (gameState.gameMode==='single'){
      if (result===gameState.playerSymbol){
        gameState.stats.wins++; gameState.sessionScores.player1++;
        title.textContent='Victory!'; msg.textContent='The spirits smile upon you';
      } else {
        gameState.stats.losses++; gameState.sessionScores.player2++;
        title.textContent='Wisdom Gained'; msg.textContent='The journey continues';
      }
    } else {
      if (result===gameState.player1Symbol){
        gameState.sessionScores.player1++; title.textContent='Player 1 Wins!'; msg.textContent=`The ${result} spirit prevails`;
      } else {
        gameState.sessionScores.player2++; title.textContent='Player 2 Wins!'; msg.textContent=`The ${result} spirit prevails`;
      }
      gameState.stats.wins++; // aggregate
    }
    audioManager.stopMusic();
    audioManager.playSound('victory-sound');
  }

  updateScore(); saveStats(); updateStatsDisplay();
  setTimeout(()=>modal.classList.add('active'), 800);
}

function startNewGame(){
  // ensure modal is gone before resetting
  document.getElementById('game-modal').classList.remove('active');

  audioManager.stopMusic();
  audioManager.playSound('newgame-sound');
  setTimeout(()=>audioManager.playMusic('gameplay-music'), 300);

  resetGame();
}

function resetGame(){
  gameState.board = Array(9).fill(null);
  gameState.currentPlayer = gameState.player1Symbol; // Player 1 always starts
  gameState.gameActive = true;
  gameState.isProcessingMove = false;
  gameState.aiIsThinking = false;

  document.querySelectorAll('.cell').forEach(c=>{ c.textContent=''; c.classList.remove('occupied','winner'); });

  if (gameState.phaserGame?.scene.scenes[0]) gameState.phaserGame.scene.scenes[0].reset();

  updateTurnIndicator();
  document.getElementById('game-modal').classList.remove('active');

  if (gameState.gameMode==='single' && gameState.currentPlayer===gameState.aiSymbol){
    gameState.aiIsThinking = true;
    setTimeout(makeAIMove, 600);
  }
}

function updateTurnIndicator(){
  const el=document.getElementById('turn-indicator');
  if (gameState.gameMode==='single'){
    if (gameState.currentPlayer===gameState.playerSymbol){ el.textContent='Your Turn'; el.style.color='#40E0D0'; }
    else { el.textContent='Spirit\'s Turn'; el.style.color='#FF6B35'; }
  } else {
    const sym = gameState.currentPlayer==='shell' ? '🐚' : '🪶';
    if (gameState.currentPlayer===gameState.player1Symbol){ el.textContent=`Player 1's Turn ${sym}`; el.style.color='#40E0D0'; }
    else { el.textContent=`Player 2's Turn ${sym}`; el.style.color='#FF6B35'; }
  }
}

function updateScore(){
  if (gameState.gameMode==='single'){
    document.getElementById('player1-label').textContent='You: ';
    document.getElementById('player2-label').textContent='Spirit: ';
  } else {
    document.getElementById('player1-label').textContent='Player 1: ';
    document.getElementById('player2-label').textContent='Player 2: ';
  }
  document.getElementById('player1-score').textContent = gameState.sessionScores.player1;
  document.getElementById('player2-score').textContent = gameState.sessionScores.player2;
}

// ---- Navigation ----
function showGameModeSelection(){
  audioManager.playSound('button-select');
  hideAllScreens();
  document.getElementById('game-mode-screen').classList.add('active');
}

function startSinglePlayer(){
  audioManager.playSound('button-select');
  gameState.gameMode='single';
  gameState.sessionScores.player1=0; gameState.sessionScores.player2=0;
  gameState.playerSymbol = gameState.player1Symbol;
  gameState.aiSymbol = gameState.player2Symbol;
  showGameScreen();
}

function startTwoPlayer(){
  audioManager.playSound('button-select');
  gameState.gameMode='two';
  gameState.sessionScores.player1=0; gameState.sessionScores.player2=0;
  showGameScreen();
}

function showStartScreen(){
  audioManager.playSound('button-select');

  // hide any lingering modal
  document.getElementById('game-modal').classList.remove('active');

  hideAllScreens();
  document.getElementById('start-screen').classList.add('active');

  if (gameState.musicEnabled) audioManager.playMusic('gameplay-music');
}

function showGameScreen(){
  // make sure modal isn't visible when returning to board
  document.getElementById('game-modal').classList.remove('active');

  hideAllScreens();
  document.getElementById('game-screen').classList.add('active');

  requestAnimationFrame(()=>{ 
    initializePhaserGame();
    if (gameState.phaserGame){
      const board = document.getElementById('game-board');
      const size = (board?.clientWidth || 450) - 20;
      gameState.phaserGame.scale.resize(size, size);
    }
    updateScore();
    audioManager.playSound('newgame-sound');
    resetGame();
  });
}

function showSettings(){ audioManager.playSound('button-select'); hideAllScreens(); document.getElementById('settings-screen').classList.add('active'); }
function showStats(){ audioManager.playSound('button-select'); hideAllScreens(); document.getElementById('stats-screen').classList.add('active'); updateStatsDisplay(); }
function hideAllScreens(){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); }

// ---- Stats ----
function saveStats(){ localStorage.setItem('spiritOfTheWoodsStats', JSON.stringify(gameState.stats)); }
function loadStats(){ const s=localStorage.getItem('spiritOfTheWoodsStats'); if (s) gameState.stats=JSON.parse(s); }
function updateStatsDisplay(){
  document.getElementById('wins-count').textContent=gameState.stats.wins;
  document.getElementById('losses-count').textContent=gameState.stats.losses;
  document.getElementById('draws-count').textContent=gameState.stats.draws;
  document.getElementById('total-games').textContent=gameState.stats.totalGames;
}
function resetStats(){
  if (confirm('Clear all journey records?')){
    gameState.stats={ wins:0, losses:0, draws:0, totalGames:0 };
    saveStats(); updateStatsDisplay(); audioManager.playSound('button-select');
  }
}

// Responsive canvas resize
window.addEventListener('resize', ()=>{
  if (gameState.phaserGame){
    const board=document.getElementById('game-board');
    const size=(board?.clientWidth || 450) - 20;
    gameState.phaserGame.scale.resize(size, size);
    const scene=gameState.phaserGame.scene.scenes[0];
    if (scene?.reset) scene.reset();
  }
});

// Prevent touch scroll during gameplay
document.addEventListener('touchmove',(e)=>{
  if (document.getElementById('game-screen').classList.contains('active')) e.preventDefault();
},{ passive:false });

window.addEventListener('beforeunload', ()=>audioManager.stopMusic());
