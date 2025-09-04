import { useState, useEffect, useCallback, useRef } from 'react';

// 定数
const CRACKER_HP = 100;

// レベル制の定数
const LEVEL_CONFIG = {
  // レベルアップに必要なXP（累積）- 100レベルまで
  requiredXP: (() => {
    const xp = [0];
    for (let i = 1; i <= 100; i++) {
      // レベルごとに必要なXPを段階的に増加
      const baseXP = 100 + (i - 1) * 50; // 基本100XP + レベルごとに50XP増加
      xp.push(xp[i - 1] + baseXP);
    }
    return xp;
  })(),
  // 各レベルの基本ステータスボーナス - 100レベルまで
  baseStats: {
    hp: (() => {
      const hp = [0];
      for (let i = 1; i <= 100; i++) {
        hp.push(i * 5); // レベルごとに5HP増加
      }
      return hp;
    })(),
    attack: (() => {
      const attack = [0];
      for (let i = 1; i <= 100; i++) {
        attack.push(i); // レベルごとに1攻撃力増加
      }
      return attack;
    })()
  },
  // パスワード制約の解除レベル - 100レベルまで
  constraints: {
    maxLength: (() => {
      const lengths = [];
      for (let i = 0; i <= 100; i++) {
        if (i <= 1) {
          lengths.push(8);
        } else if (i <= 2) {
          lengths.push(10);
        } else if (i <= 3) {
          lengths.push(12);
        } else if (i <= 4) {
          lengths.push(14);
        } else if (i <= 5) {
          lengths.push(16);
        } else {
          // レベル6以降は段階的に増加、最大128文字まで
          lengths.push(Math.min(16 + (i - 5) * 2, 128));
        }
      }
      return lengths;
    })(),
    allowUppercase: (() => {
      const allowed = [];
      for (let i = 0; i <= 100; i++) {
        allowed.push(i >= 2); // レベル3から大文字使用可能
      }
      return allowed;
    })(),
    allowNumbers: (() => {
      const allowed = [];
      for (let i = 0; i <= 100; i++) {
        allowed.push(i >= 3); // レベル4から数字使用可能
      }
      return allowed;
    })(),
    allowSymbols: (() => {
      const allowed = [];
      for (let i = 0; i <= 100; i++) {
        allowed.push(i >= 5); // レベル6から記号使用可能
      }
      return allowed;
    })()
  }
};

function App() {
  // 画面表示ステート
  const [screen, setScreen] = useState('start');
  // ユーザー関連ステート
  const [username, setUsername] = useState('');
  // レベル関連ステート
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerXP, setPlayerXP] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  // パスワード関連ステート
  const [password, setPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [playerStats, setPlayerStats] = useState({});
  // バトル関連ステート
  const [playerHp, setPlayerHp] = useState(0);
  const [crackerHp, setCrackerHp] = useState(CRACKER_HP);
  const [battleLog, setBattleLog] = useState([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isAutoBattle, setIsAutoBattle] = useState(false);
  // タイミングゲームステート
  const [isTimingGameActive, setIsTimingGameActive] = useState(false);
  const [timingPosition, setTimingPosition] = useState(0);
  // バトルログの自動スクロール用
  const battleLogRef = useRef(null);

  // ローカルストレージからユーザー名とレベル情報をロード
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    const storedLevel = localStorage.getItem('playerLevel');
    const storedXP = localStorage.getItem('playerXP');
    
    if (storedUsername) {
      setUsername(storedUsername);
      setScreen('home');
    }
    
    if (storedLevel) {
      setPlayerLevel(parseInt(storedLevel));
    }
    
    if (storedXP) {
      setPlayerXP(parseInt(storedXP));
    }
  }, []);

  // レベル関連のヘルパー関数
  const getCurrentLevel = (xp) => {
    for (let i = LEVEL_CONFIG.requiredXP.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_CONFIG.requiredXP[i]) {
        return i;
      }
    }
    return 1;
  };

  const getXPToNextLevel = (currentXP, currentLevel) => {
    if (currentLevel >= LEVEL_CONFIG.requiredXP.length - 1) {
      return 0; // 最大レベル
    }
    return LEVEL_CONFIG.requiredXP[currentLevel + 1] - currentXP;
  };

  const addXP = useCallback((amount) => {
    const newXP = playerXP + amount;
    const newLevel = getCurrentLevel(newXP);
    
    setPlayerXP(newXP);
    localStorage.setItem('playerXP', newXP.toString());
    
    if (newLevel > playerLevel) {
      setPlayerLevel(newLevel);
      localStorage.setItem('playerLevel', newLevel.toString());
      setShowLevelUp(true);
      return true; // レベルアップした
    }
    return false; // レベルアップしなかった
  }, [playerXP, playerLevel]);

  const getPasswordConstraints = () => {
    const level = Math.min(playerLevel, LEVEL_CONFIG.constraints.maxLength.length - 1);
    return {
      maxLength: LEVEL_CONFIG.constraints.maxLength[level],
      allowUppercase: LEVEL_CONFIG.constraints.allowUppercase[level],
      allowNumbers: LEVEL_CONFIG.constraints.allowNumbers[level],
      allowSymbols: LEVEL_CONFIG.constraints.allowSymbols[level]
    };
  };

  // パスワード強度の計算ロジック
  const commonPasswords = ['password', '123456', 'qwerty', '123456789', '12345', '12345678', '1234', '111111', '123123', 'admin'];

  const calculateStrength = (pass) => {
    if (pass.length === 0) return { score: 0, feedback: [] };

    const constraints = getPasswordConstraints();
    let score = 0;
    const feedback = [];

    // レベル制約のチェック
    if (pass.length > constraints.maxLength) {
      feedback.push(`現在のレベルでは${constraints.maxLength}文字までしか使用できません。`);
      return { score: 0, feedback };
    }

    // 文字種の制約チェック
    const has = {
      upper: /[A-Z]/.test(pass),
      lower: /[a-z]/.test(pass),
      num: /[0-9]/.test(pass),
      sym: /[^A-Za-z0-9]/.test(pass),
    };

    if (has.upper && !constraints.allowUppercase) {
      feedback.push('現在のレベルでは大文字は使用できません。');
      return { score: 0, feedback };
    }
    if (has.num && !constraints.allowNumbers) {
      feedback.push('現在のレベルでは数字は使用できません。');
      return { score: 0, feedback };
    }
    if (has.sym && !constraints.allowSymbols) {
      feedback.push('現在のレベルでは記号は使用できません。');
      return { score: 0, feedback };
    }

    // 長さの評価
    if (pass.length >= 12) {
      score += 25;
    } else if (pass.length >= 8) {
      score += 15;
    } else {
      feedback.push('8文字以上にしてください。');
    }

    // 文字種の評価
    if (has.upper) score += 15; else if (constraints.allowUppercase) feedback.push('大文字を含めてください。');
    if (has.lower) score += 5; // 小文字は基本点
    if (has.num) score += 15; else if (constraints.allowNumbers) feedback.push('数字を含めてください。');
    if (has.sym) score += 20; else if (constraints.allowSymbols) feedback.push('記号 (!@#$%) を含めてください。');

    // 複数文字種のボーナス
    const typesCount = Object.values(has).filter(Boolean).length;
    if (typesCount >= 3) {
      score += typesCount * 5;
    }

    // 一般的なパスワードのペナルティ
    if (commonPasswords.includes(pass.toLowerCase())) {
      score = Math.min(score, 10); // スコアを最大10に制限
      feedback.push('非常に一般的なパスワードです。変更してください。');
    }

    if (feedback.length === 0 && pass.length >= 8) {
      feedback.push('強力なパスワードです！');
    }

    return { score: Math.min(score, 100), feedback };
  };

  // 推定クラック時間の計算
  const calculateCrackTime = (score) => {
    if (score < 20) return "一瞬";
    if (score < 40) return "数秒";
    if (score < 60) return "数分";
    if (score < 80) return "数時間";
    if (score < 95) return "数日";
    return "数百年";
  };

  // 強度レベルを計算
  const getStrengthLevel = (score) => {
    if (score < 20) return 0;
    if (score < 40) return 1;
    if (score < 60) return 2;
    if (score < 80) return 3;
    if (score < 95) return 4;
    return 5;
  };

  // パスワード入力時の処理
  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    const strengthData = calculateStrength(newPassword);
    const strengthLevel = getStrengthLevel(strengthData.score);
    setPasswordStrength(strengthLevel);

    // 強度レベルに応じたキャラクターのステータス（レベルボーナス付き）
    const hpLevels = [50, 70, 95, 110, 130, 150];
    const attackLevels = [5, 6, 8, 9, 14, 18];
    
    // レベルボーナスを計算
    const levelBonus = {
      hp: LEVEL_CONFIG.baseStats.hp[Math.min(playerLevel, LEVEL_CONFIG.baseStats.hp.length - 1)],
      attack: LEVEL_CONFIG.baseStats.attack[Math.min(playerLevel, LEVEL_CONFIG.baseStats.attack.length - 1)]
    };

    setPlayerStats({
      strength: strengthLevel,
      hp: (hpLevels[strengthLevel] || 50) + levelBonus.hp,
      attack: (attackLevels[strengthLevel] || 5) + levelBonus.attack,
      score: strengthData.score,
      feedback: strengthData.feedback,
      levelBonus: levelBonus
    });
  };

  // バトル開始
  const startBattle = () => {
    setPlayerHp(playerStats.hp);
    const crackerInfo = getCrackerInfo();
    setCrackerHp(crackerInfo.hp);
    setBattleLog([]);
    setIsPlayerTurn(true);
    setScreen('battle');
  };

  // 敵クラッカーの進化システム
  const getCrackerInfo = useCallback(() => {
    // レベルに応じた基本ステータス（調整済み）
    const baseHP = 80 + (playerLevel - 1) * 8; // レベル1で80HP、レベルごとに8HP増加
    const baseAttack = 6 + (playerLevel - 1) * 1.5; // レベルごとに1.5攻撃力増加（2→1.5に減少）
    
    if (playerLevel <= 5) {
      return { 
        name: '初心者クラッカー', 
        hp: baseHP, 
        attackPower: Math.floor(baseAttack), 
        description: '辞書攻撃を使用' 
      };
    } else if (playerLevel <= 10) {
      return { 
        name: '中級クラッカー', 
        hp: baseHP + 15, // 20→15に減少
        attackPower: Math.floor(baseAttack + 2), // 4→2に減少
        description: '大文字・数字を狙う' 
      };
    } else {
      return { 
        name: '上級クラッカー', 
        hp: baseHP + 25, // 40→25に減少
        attackPower: Math.floor(baseAttack + 4), // 8→4に減少
        description: '記号パターンを解析' 
      };
    }
  }, [playerLevel]);

  // バトルの進行
  const advanceTurn = useCallback(() => {
    // プレイヤーの攻撃
    const playerDamage = Math.floor(Math.random() * playerStats.attack) + 1;
    setCrackerHp((prev) => Math.max(prev - playerDamage, 0));
    setBattleLog((prevLog) => [...prevLog, `あなたの攻撃！クラッカーに ${playerDamage} のダメージを与えた！`]);

    // クラッカーの攻撃
    setTimeout(() => {
      const crackerInfo = getCrackerInfo();
      const crackerAttackPower = Math.floor(crackerInfo.attackPower + (5 - playerStats.strength) * 2);
      const crackerDamage = Math.floor(Math.random() * crackerAttackPower) + 1;
      setPlayerHp((prev) => Math.max(prev - crackerDamage, 0));
      setBattleLog((prevLog) => [...prevLog, `${crackerInfo.name}の攻撃！あなたは ${crackerDamage} のダメージを受けた！`]);
    }, 500);
  }, [playerStats.attack, playerStats.strength, getCrackerInfo]);

  // オートバトル
  useEffect(() => {
    if (isAutoBattle && screen === 'battle') {
      const battleInterval = setInterval(() => {
        advanceTurn();
      }, 1500); // 1.5秒ごとに攻撃

      // クリーンアップ関数
      return () => clearInterval(battleInterval);
    }
  }, [isAutoBattle, screen, advanceTurn]);

  // バトル終了判定
  useEffect(() => {
    if (playerHp <= 0 || crackerHp <= 0) {
      if (screen === 'battle') {
        // 勝利時にXPを獲得
        if (crackerHp <= 0) {
          //const xpGained = Math.floor((playerStats.score || 0) * 0.5) + 10; // スコアの50% + 基本10XP
          const xpGained = Math.floor((playerStats.score || 0) * 0.4) + (5 + playerLevel * 2);//修正しました

          addXP(xpGained);
        }
        
        setTimeout(() => {
          setScreen('result');
        }, 1500); // 結果画面へ遷移
      }
    }
  }, [playerHp, crackerHp, screen, playerStats.score, addXP]);

  // バトルログの自動スクロール
  useEffect(() => {
    if (battleLogRef.current) {
      battleLogRef.current.scrollTop = battleLogRef.current.scrollHeight;
    }
  }, [battleLog]);

  // タイミングゲームの実行ロジック
  const handleTimingResult = useCallback((multiplier, resultText) => {
    setIsTimingGameActive(false);
    setTimingPosition(0);

    const playerDamage = Math.floor((Math.random() * playerStats.attack + 1) * multiplier);
    setCrackerHp((prev) => {
      const newHp = Math.max(prev - playerDamage, 0);
      setBattleLog((prevLog) => [...prevLog, `タイミング攻撃！${resultText} クラッカーに ${playerDamage} のダメージ！`]);
      return newHp;
    });

    // クラッカーのターン
    setTimeout(() => {
      const crackerInfo = getCrackerInfo();
      const crackerAttackPower = Math.floor(crackerInfo.attackPower + (5 - playerStats.strength) * 2);
      const crackerDamage = Math.floor(Math.random() * crackerAttackPower) + 1;
      setPlayerHp((prev) => Math.max(prev - crackerDamage, 0));
      setBattleLog((prevLog) => [...prevLog, `${crackerInfo.name}の攻撃！あなたは ${crackerDamage} のダメージを受けた！`]);
      setIsPlayerTurn(true); // プレイヤーにターンを戻す
    }, 1000);
  }, [playerStats.attack, playerStats.strength, getCrackerInfo]);

  // タイミングゲームのアニメーション
  useEffect(() => {
    let animationId;
    if (isTimingGameActive) {
      const animate = () => {
        setTimingPosition((prev) => {
          // 強度が高いほどバーが遅く動く
          const strength = playerStats.strength || 0;
          const speed = 0.6 - strength * 0.05;
          const newPos = prev + speed;
          if (newPos >= 100) {
            handleTimingResult(0.5, 'MISS...');
            return 0;
          }
          return newPos;
        });
        animationId = requestAnimationFrame(animate);
      };
      animate(); // 最初のフレームを開始
    }
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isTimingGameActive, playerStats.strength, handleTimingResult]);

  // キーボードイベント
  const stopTimingGame = useCallback(() => {
    if (!isTimingGameActive) return;

    const strength = playerStats.strength || 0;
    const goodWidth = Math.max(5, 22 - (5 - strength) * 4);
    const perfectWidth = Math.max(2, 10 - (5 - strength) * 1.8);
    const targetStart = (100 - goodWidth) / 2;
    const perfectStart = (100 - perfectWidth) / 2;

    let multiplier = 0.5;
    let resultText = 'MISS...';

    const currentPos = timingPosition; // 最新のタイミング位置を取得

    if (currentPos >= perfectStart && currentPos <= perfectStart + perfectWidth) {
      multiplier = 2.0;
      resultText = 'PERFECT!';
    } else if (currentPos >= targetStart && currentPos <= targetStart + goodWidth) {
      multiplier = 1.5;
      resultText = 'GOOD!';
    }

    handleTimingResult(multiplier, resultText);
  }, [isTimingGameActive, timingPosition, playerStats.strength, handleTimingResult]);
/*
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && isTimingGameActive) {
        e.preventDefault();
        stopTimingGame();
      }
    };

    if (isTimingGameActive) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTimingGameActive, stopTimingGame]);
*/
  const startTimingGame = () => {
    setIsTimingGameActive(true);
    setTimingPosition(0);
    setIsPlayerTurn(false);
  };

  // キャラクターの色の取得
  const getCharacterColor = () => {
    const hue = (passwordStrength / 5) * 120;
    return `hsl(${hue}, 70%, 50%)`;
  };

  // 結果の取得
  // パスワードの強度に応じてキャラクターのアイコンを決定する関数
  const getCharacterIcon = () => {
    switch (passwordStrength) {
      case 0:
        return '🥚'; // 卵
      case 1:
        return '🐣'; // ひよこ
      case 2:
        return '🐥'; // 少し成長したひよこ
      case 3:
        return '🐔'; // 鶏
      case 4:
        return '🐉'; // ドラゴン
      case 5:
        return '🛡️'; // 盾
      default:
        return '👾'; // エラー時など
    }
  };

  const getResult = () => {
    const isWin = crackerHp <= 0;
    const crackTime = calculateCrackTime(playerStats.score || 0);
    const hint = getHint(isWin, passwordStrength);
    return { isWin, crackTime, hint };
  };

  // ヒントの取得
  const getHint = (isWin, score) => {
    if (isWin) {
      if (score >= 5) {
        return '完璧なパスワードです！これ以上ない強度で、クラッカーを寄せ付けません。';
      } else if (score === 4) {
        return '素晴らしいパスワードです！ほぼ完璧ですが、さらに文字数を増やしたり、普段使わない記号を混ぜると、まさに鉄壁になりますよ。';
      } else if (score === 3) {
        return '強力なパスワードで見事勝利！さらに良くするには、大文字・小文字・数字・記号の4種類を全て使うことと、12文字以上の長さにすることを意識してみましょう。';
      } else {
        return '勝利おめでとうございます！ただ、そのパスワードにはまだ改善の余地があります。大文字、小文字、数字、記号をすべて含んだ、8文字以上のパスワードを目指すと、もっと安全になります。';
      }
    } else {
      if (score <= 1) {
        return 'パスワードが短すぎます！もっと文字数を増やしてみましょう。';
      } else if (score <= 3) {
        return '文字の種類を増やしてみましょう。大文字、数字、記号などを組み合わせるとより強くなります。';
      } else {
        return 'もう少し複雑にしてみましょう。辞書に載っている単語は避け、ランダムな文字列を使うのがおすすめです。';
      }
    }
  };

  // ゲーム開始時の処理
  const handleStartGame = () => {
    localStorage.setItem('username', username || 'プレイヤー');
    setScreen('input');
  };

  // 各画面のレンダリング
  const renderScreen = () => {
    switch (screen) {
      case 'start':
        return (
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">パスワード育成バトル</h1>
            <p className="mb-4 text-gray-200">パスワードを育ててクラッカーと戦うRPG風教育シミュレーション</p>
            <button
              className="w-full py-3 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-600/80 text-white font-bold backdrop-blur-sm border border-blue-400/30 transition-all duration-300 shadow-lg"
              onClick={() => setScreen('home')}
            >
              スタート
            </button>
          </div>
        );
      case 'home':
        return (
          <div className="text-center">
            <h1 className="text-xl font-bold mb-4 text-blue-300">ようこそ、{username || 'プレイヤー'}！</h1>
            
            {/* レベル表示 */}
            <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-blue-200">レベル {playerLevel}</span>
                <span className="text-sm text-gray-300">{playerXP} XP</span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-in-out"
                  style={{ 
                    width: `${playerLevel >= LEVEL_CONFIG.requiredXP.length - 1 ? 100 : 
                      ((playerXP - LEVEL_CONFIG.requiredXP[playerLevel]) / 
                       (LEVEL_CONFIG.requiredXP[playerLevel + 1] - LEVEL_CONFIG.requiredXP[playerLevel])) * 100}%` 
                  }}
                ></div>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                次のレベルまで: {getXPToNextLevel(playerXP, playerLevel)} XP
              </p>
            </div>

            <div className="text-left p-4 bg-white/5 rounded-lg my-4 border border-white/10">
              <h2 className="font-bold text-lg mb-2 text-blue-200">目的</h2>
              <p className="text-sm text-gray-200 mb-4">
                このゲームは、楽しみながら「安全なパスワード」の作り方を学ぶためのものです。強力なパスワードを育てて、悪意のあるクラッカーを倒しましょう！
              </p>
              <h2 className="font-bold text-lg mb-2 text-blue-200">遊び方</h2>
              <ol className="list-decimal list-inside text-sm space-y-1 text-gray-200">
                <li>
                  <strong>パスワード育成:</strong> 強力なパスワードを作成し、キャラクターを強化します。
                </li>
                <li>
                  <strong>バトル:</strong> タイミングを合わせて攻撃するか、オートバトルで戦います。
                </li>
                <li>
                  <strong>勝利を目指せ:</strong> 最強のパスワードメーカーを目指しましょう！
                </li>
              </ol>
            </div>
            <div className="mb-4 text-left">
              <label htmlFor="username" className="block text-sm font-medium text-gray-200">
                名前を入力してください:
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="名前"
                className="mt-1 block w-full rounded-md border-white/20 bg-white/10 text-white shadow-sm focus:border-blue-400 focus:ring-blue-400 sm:text-sm placeholder-gray-400"
              />
            </div>
            <button
              className="w-full py-3 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-600/80 text-white font-bold backdrop-blur-sm border border-blue-400/30 transition-all duration-300 shadow-lg"
              onClick={handleStartGame}
            >
              次へ
            </button>
          </div>
        );
      case 'input':
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">パスワード入力</h2>
            <div className="mb-4 text-left">
              <label htmlFor="password-input" className="block text-sm font-medium text-gray-200">
                パスワードを入力:
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password-input"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="パスワード"
                  className="mt-1 block w-full pr-16 rounded-md border-white/20 bg-white/10 text-white shadow-sm focus:border-blue-400 focus:ring-blue-400 sm:text-sm placeholder-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-300 hover:text-white transition-colors"
                >
                  {showPassword ? '非表示' : '表示'}
                </button>
              </div>
            </div>

            {/* レベル制約表示 */}
            <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <h3 className="text-sm font-bold text-blue-200 mb-2">現在のレベル制約 (レベル {playerLevel})</h3>
              <div className="text-xs text-gray-300 space-y-1">
                <p>最大文字数: {getPasswordConstraints().maxLength}文字</p>
                <p>使用可能文字: 小文字</p>
                {getPasswordConstraints().allowUppercase && <p>+ 大文字</p>}
                {getPasswordConstraints().allowNumbers && <p>+ 数字</p>}
                {getPasswordConstraints().allowSymbols && <p>+ 記号</p>}
              </div>
            </div>

            {/* パスワード強度メーター */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>強度スコア: {playerStats.score || 0} / 100</span>
                <span>レベル: {passwordStrength} / 5</span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 ease-in-out"
                  style={{
                    width: `${playerStats.score || 0}%`,
                    backgroundColor:
                      (playerStats.score || 0) < 40 ? '#ef4444' : (playerStats.score || 0) < 75 ? '#f59e0b' : '#10b981',
                  }}
                ></div>
              </div>
              <p className="text-sm mt-1">
                推定耐久時間: <span className="font-bold">{calculateCrackTime(playerStats.score || 0)}</span>
              </p>
            </div>

            {/* フィードバック */}
            {playerStats.feedback && playerStats.feedback.length > 0 && (
              <div className="mb-4 p-3 bg-white/5 rounded-lg text-left border border-white/10">
                <p className="text-sm text-gray-200">{playerStats.feedback.join(' ')}</p>
              </div>
            )}

            <div className="flex justify-between items-center my-4">
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-blue-300">あなたのキャラクター</p>
                <div className="w-16 h-16 rounded-full mx-auto shadow-lg text-4xl flex items-center justify-center" style={{ backgroundColor: getCharacterColor() }}>{getCharacterIcon()}</div><p className="text-xs text-gray-300 mt-1">レベル {playerLevel}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-red-300">{getCrackerInfo().name}</p>
                <div className="w-16 h-16 rounded-full mx-auto bg-red-500 shadow-lg"></div>
                <p className="text-xs text-gray-300 mt-1">{getCrackerInfo().description}</p>
              </div>
            </div>

            {/* オートバトル設定 */}
            <div className="mb-4 text-left">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={isAutoBattle}
                  onChange={(e) => setIsAutoBattle(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600 text-blue-500 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm">オートバトルをオンにする</span>
              </label>
            </div>

            <div className="flex space-x-4">
              <button
                className="flex-1 py-3 px-4 rounded-lg bg-gray-500/80 hover:bg-gray-600/80 text-white font-bold backdrop-blur-sm border border-gray-400/30 transition-all duration-300 shadow-lg"
                onClick={() => setScreen('home')}
              >
                戻る
              </button>
              <button
                className="flex-1 py-3 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-600/80 text-white font-bold disabled:bg-gray-500/50 backdrop-blur-sm border border-blue-400/30 transition-all duration-300 shadow-lg"
                onClick={startBattle}
                disabled={!password}
              >
                バトル開始
              </button>
            </div>
          </div>
        );
      case 'battle': {
        const strength = playerStats.strength || 0;
        const goodWidth = Math.max(5, 22 - (5 - strength) * 4);
        const perfectWidth = Math.max(2, 10 - (5 - strength) * 1.8);
        const targetStart = (100 - goodWidth) / 2;
        const perfectStart = (100 - perfectWidth) / 2;

        const crackerInfo = getCrackerInfo();
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">バトル！</h2>
            <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm font-bold text-red-300 mb-1">{crackerInfo.name}</p>
              <p className="text-xs text-gray-300 mb-2">{crackerInfo.description}</p>
              <div className="flex justify-between text-xs text-gray-400">
                <span>HP: {crackerInfo.hp}</span>
                <span>攻撃力: {crackerInfo.attackPower}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-bold">あなたのHP</div>
              <div className="text-sm font-bold">{crackerInfo.name}のHP</div>
            </div>
            <div className="flex justify-between items-center">
              <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden mr-2">
                <div
                  className="h-full bg-green-500 transition-all duration-500 ease-linear"
                  style={{ width: `${(playerHp / playerStats.hp) * 100}%` }}
                ></div>
              </div>
              <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden ml-2">
                <div
                  className="h-full bg-red-500 transition-all duration-500 ease-linear"
                  style={{ width: `${(crackerHp / crackerInfo.hp) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="flex justify-between items-center my-4">
              <div className="w-16 h-16 rounded-full mx-auto shadow-lg" style={{ backgroundColor: getCharacterColor() }}></div>
              <div className="w-16 h-16 rounded-full mx-auto bg-red-500 shadow-lg"></div>
            </div>
            <div 
              ref={battleLogRef}
              className="h-32 bg-white/5 rounded-lg p-2 overflow-y-auto text-left text-sm mb-4 border border-white/10 custom-scrollbar">
              {battleLog.map((log, index) => (
                <p key={index} className="mb-1 text-gray-200">{log}</p>
              ))}
            </div>

            {/* タイミングゲーム */}
            {!isAutoBattle && (
              <div className="mb-4">
                <div className="relative w-full h-8 bg-white/10 rounded-full overflow-hidden border-2 border-white/20 mb-2">
                  <div
                    className="absolute h-full bg-blue-500/50"
                    style={{
                      width: `${goodWidth}%`,
                      left: `${targetStart}%`,
                    }}
                  ></div>
                  <div
                    className="absolute h-full bg-blue-800/50"
                    style={{
                      width: `${perfectWidth}%`,
                      left: `${perfectStart}%`,
                    }}
                  ></div>
                  <div
                    className="absolute h-full w-2 bg-yellow-300"
                    style={{ left: `${timingPosition}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-300">
                  インジケーターが青いエリアに来たら【スペースキー】か【STOP!】ボタンを押せ！
                </p>
              </div>
            )}

            {/* アクションボタン */}
            {!isAutoBattle && isPlayerTurn && (
              <button
                className="w-full py-3 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-600/80 text-white font-bold backdrop-blur-sm border border-blue-400/30 transition-all duration-300 shadow-lg"
                onClick={startTimingGame}
              >
                攻撃
              </button>
            )}

            {!isAutoBattle && isTimingGameActive && (
              <button
                className="w-full py-3 px-4 rounded-lg bg-yellow-500/80 hover:bg-yellow-600/80 text-white font-bold backdrop-blur-sm border border-yellow-400/30 transition-all duration-300 shadow-lg"
                onClick={stopTimingGame}
              >
                STOP!
              </button>
            )}
          </div>
        );
      }
      case 'result': {
        const result = getResult();
        const xpGained = result.isWin ? Math.floor((playerStats.score || 0) * 0.5) + 10 : 0;
        return (
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4" style={{ color: result.isWin ? '#22c55e' : '#ef4444' }}>
              {result.isWin ? '勝利！' : '敗北...'}
            </h1>
            {result.isWin && (
              <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-yellow-300 font-bold">
                  🎉 {xpGained} XP を獲得しました！
                </p>
              </div>
            )}
            <p className="mb-2 font-bold text-gray-200">
              このパスワードは総当たり攻撃で
              <br />
              {result.crackTime}で破られると推定されます。
            </p>
            <p className="mt-4 text-sm p-3 bg-white/5 rounded-lg border border-white/10 text-gray-200">{result.hint}</p>
            <button
              className="w-full py-3 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-600/80 text-white font-bold mt-8 backdrop-blur-sm border border-blue-400/30 transition-all duration-300 shadow-lg"
              onClick={() => {
                setPassword('');
                setPasswordStrength(0);
                setPlayerStats({});
                setPlayerHp(0);
                setCrackerHp(CRACKER_HP);
                setScreen('input');
              }}
            >
              もう一度遊ぶ
            </button>
          </div>
        );
      }
      default: {
        return null;
      }
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white min-h-screen flex justify-center items-center p-4">
      <style>
        {`
        /* スクロールバーのカスタマイズ */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #4b5563; /* bg-gray-600 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #6b7280; /* bg-gray-500 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af; /* bg-gray-400 */
        }
      `}
      </style>
      
      {/* レベルアップモーダル */}
      {showLevelUp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 p-6 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-yellow-400 mb-4">🎉 レベルアップ！</h2>
              <p className="text-lg font-bold text-blue-300 mb-2">レベル {playerLevel} に到達！</p>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 mb-4">
                <h3 className="font-bold text-blue-200 mb-2">新しく解放された機能:</h3>
                <div className="text-sm text-gray-200 space-y-1">
                  <p>最大文字数: {getPasswordConstraints().maxLength}文字</p>
                  {getPasswordConstraints().allowUppercase && <p>✅ 大文字が使用可能</p>}
                  {getPasswordConstraints().allowNumbers && <p>✅ 数字が使用可能</p>}
                  {getPasswordConstraints().allowSymbols && <p>✅ 記号が使用可能</p>}
                </div>
              </div>
              <button
                className="w-full py-3 px-4 rounded-lg bg-yellow-500/80 hover:bg-yellow-600/80 text-white font-bold backdrop-blur-sm border border-yellow-400/30 transition-all duration-300 shadow-lg"
                onClick={() => setShowLevelUp(false)}
              >
                続ける
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 p-8 rounded-2xl shadow-2xl w-full max-w-sm">
        {renderScreen()}
      </div>
    </div>
  );
}

export default App;
