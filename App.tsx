import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { applyRunProgress, claimDailyReward, claimMission, DEFAULT_PROGRESS, DEFAULT_SETTINGS, GameSettings, getDailyMissions, hydrateProgress, masteryLevel, milestoneReward, ProgressData } from './game/progression';
import { trackGameEvent } from './services/analytics';
import { downloadCloudSave, uploadCloudSave } from './services/cloud-save';
import { fetchLeaderboard, LeaderboardMode, LeaderboardPeriod, LeaderboardRow, submitRun } from './services/leaderboard';
import { initializeMonetization, purchaseProduct as storePurchase, restorePurchases, showRewardedAd } from './services/monetization';
import { claimJourney, JOURNEY_REWARDS, claimWeekly, getWeeklyChallenges, claimMastery, MASTERY_REWARDS, weekKey } from './game/progression';
import { ensurePlayerSession } from './services/player-session';

type Screen = 'home' | 'game' | 'shop' | 'leaderboard' | 'missions' | 'settings';
type GameState = 'ready' | 'playing' | 'gameover';
type OutfitId = 'classic' | 'sprout' | 'sunny' | 'scout' | 'pirate' | 'chef' | 'rainbow' | 'royal' | 'ninja' | 'astronaut' | 'cowboy' | 'dragon' | 'strawberry' | 'wizard' | 'bee' | 'unicorn' | 'mermaid' | 'dinosaur' | 'champion';
type ObstacleId = 'log' | 'rock' | 'stump' | 'mushrooms' | 'puddle' | 'tallStack' | 'jaguar';
type Outfit = { id: OutfitId; name: string; detail: string; price: number; premium?: boolean; color: string; accent: string; emoji: string };
type BoosterId = 'shield' | 'slow' | 'continue' | 'triple';
type BonusId = 'melon' | 'legume' | 'strawberry';
type WorldId = 'forest' | 'beach' | 'jungle' | 'snow' | 'volcano';
type OutfitPerk = { label: string; acornBonus?: number; bonusChance?: number; extraPasses?: number; melonBonus?: number; jaguarSpeed?: number };
type RewardAdLedger = { date: string; acorns: number; boosters: number };
type SaveData = { acorns: number; bestScore: number; selected: OutfitId; owned: OutfitId[]; boosters: Record<BoosterId, number>; boosterDate: string; rewardedAds: RewardAdLedger; selectedWorld: WorldId; worldBests: Record<WorldId, number>; displayName: string; settings: GameSettings; progress: ProgressData };

const OUTFITS: Outfit[] = [
  { id: 'classic', name: 'Classic Cappy', detail: 'Comfy by nature', price: 0, color: '#A96F44', accent: '#7A452B', emoji: '🌿' },
  { id: 'sprout', name: 'Sprout Scout', detail: 'Earn 150 acorns', price: 150, color: '#AD7448', accent: '#62A94C', emoji: '🌱' },
  { id: 'sunny', name: 'Sunshine Scout', detail: 'Earn 400 acorns', price: 400, color: '#BD7B42', accent: '#F6C847', emoji: '☀️' },
  { id: 'scout', name: 'Trail Scout', detail: 'Earn 650 acorns', price: 650, color: '#A86C40', accent: '#4F8B58', emoji: '🎒' },
  { id: 'pirate', name: 'Captain Cappy', detail: 'Earn 900 acorns', price: 900, color: '#A76D45', accent: '#282D3B', emoji: '🏴‍☠️' },
  { id: 'chef', name: 'Snack Chef', detail: 'Earn 1,200 acorns', price: 1200, color: '#B9794C', accent: '#F7F4E9', emoji: '👨‍🍳' },
  { id: 'rainbow', name: 'Rainbow Hop', detail: 'Earn 1,600 acorns', price: 1600, color: '#C47C55', accent: '#67B7E1', emoji: '🌈' },
  { id: 'royal', name: 'Cappy Royal', detail: 'Earn 2,200 acorns', price: 2200, color: '#B6744B', accent: '#F4C94D', emoji: '👑' },
  { id: 'ninja', name: 'Midnight Captain', detail: 'Earn 2,800 acorns', price: 2800, color: '#9F6947', accent: '#25272B', emoji: '🌙' },
  { id: 'astronaut', name: 'Space Cappy', detail: 'Earn 3,500 acorns', price: 3500, color: '#AA704A', accent: '#D8E8EF', emoji: '🚀' },
  { id: 'cowboy', name: 'Mars Explorer', detail: 'Earn 4,200 acorns', price: 4200, color: '#AD734D', accent: '#91552E', emoji: '🪐' },
  { id: 'dragon', name: 'Emerald Captain', detail: 'Earn 5,000 acorns', price: 5000, color: '#A96F49', accent: '#4DA86A', emoji: '🐲' },
  { id: 'strawberry', name: 'Berry Baker', detail: '$1.99', price: 199, premium: true, color: '#BC745C', accent: '#F35E75', emoji: '🍓' },
  { id: 'wizard', name: 'Cappy Wizard', detail: '$2.99', price: 299, premium: true, color: '#8D6CC9', accent: '#FFD968', emoji: '🪄' },
  { id: 'bee', name: 'Honey Baker', detail: '$2.99', price: 299, premium: true, color: '#D39A35', accent: '#2F2B29', emoji: '🍯' },
  { id: 'unicorn', name: 'Unicorn Cappy', detail: '$3.99', price: 399, premium: true, color: '#D69BC4', accent: '#7DCFE2', emoji: '🦄' },
  { id: 'mermaid', name: 'Mer-Cappy', detail: '$3.99', price: 399, premium: true, color: '#A9785B', accent: '#58C8B8', emoji: '🧜‍♀️' },
  { id: 'dinosaur', name: 'Ocean Explorer', detail: '$3.99', price: 399, premium: true, color: '#A96C48', accent: '#6CB46E', emoji: '🌊' },
  { id: 'champion', name: 'Golden Champion', detail: '$4.99', price: 499, premium: true, color: '#A96C48', accent: '#D7A62C', emoji: '🏅' },
];
const OUTFIT_PERKS: Partial<Record<OutfitId, OutfitPerk>> = {
  sprout: { label: '+5% run acorns', acornBonus: .05 },
  sunny: { label: 'Melons give +2 extra hops', melonBonus: 2 },
  scout: { label: '+5% bonus-item chance', bonusChance: .05 },
  pirate: { label: 'Jaguars move 6% slower', jaguarSpeed: .94 },
  chef: { label: 'Melons give +5 extra hops', melonBonus: 5 },
  rainbow: { label: '+8% bonus-item chance', bonusChance: .08 },
  royal: { label: '+15% run acorns', acornBonus: .15 },
  ninja: { label: 'Jaguars move 10% slower', jaguarSpeed: .9 },
  astronaut: { label: 'Flight lasts +1 obstacle', extraPasses: 1 },
  cowboy: { label: '+20% run acorns', acornBonus: .2 },
  dragon: { label: 'Power-ups last +2 obstacles', extraPasses: 2 },
  strawberry: { label: 'Phase lasts +1 obstacle', extraPasses: 1 },
  wizard: { label: '+12% bonus-item chance', bonusChance: .12 },
  bee: { label: '+25% run acorns', acornBonus: .25 },
  unicorn: { label: 'Power-ups last +2 obstacles', extraPasses: 2 },
  mermaid: { label: '+15% bonus-item chance', bonusChance: .15 },
  dinosaur: { label: 'Jaguars move 15% slower', jaguarSpeed: .85 },
  champion: { label: '+30% acorns & +5% bonuses', acornBonus: .3, bonusChance: .05 },
};
const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_WORLD_BESTS: Record<WorldId, number> = { forest: 0, beach: 0, jungle: 0, snow: 0, volcano: 0 };
const DEFAULT_SAVE: SaveData = { acorns: 0, bestScore: 0, selected: 'classic', owned: ['classic'], boosters: { shield: 1, slow: 1, continue: 1, triple: 1 }, boosterDate: today(), rewardedAds: { date: today(), acorns: 0, boosters: 0 }, selectedWorld: 'forest', worldBests: DEFAULT_WORLD_BESTS, displayName: 'Happy Capy', settings: DEFAULT_SETTINGS, progress: DEFAULT_PROGRESS };
const STORAGE_KEY = 'capybara-hop-save-v1';
const BACKUP_STORAGE_KEY = `${STORAGE_KEY}-backup`;
const GROUND_HEIGHT = 92;
const CAPY_X = 58;
const CAPY_SIZE = 70;
const BASE_HOPS = 10;
const ENVIRONMENTS = {
  forest: { name: 'Sunny Forest', colors: ['#77D7EF', '#C9F0C2', '#FFE69A'] as const, decor: '🌳  🌼  🌿', unlock: 0, speed: .95, reward: 25, ground: '#B88954', edge: '#75A84E', bits: '· 🌱  ·  🌼  ·  🌱  ·  🌼', feature: 'Gentle logs & flower fields' },
  beach: { name: 'Cappy Beach', colors: ['#58CBE8', '#BCEEF2', '#FFD889'] as const, decor: '🌴  🐚  🌊', unlock: 250, speed: 1, reward: 40, ground: '#E9C67C', edge: '#F5E1A4', bits: '· 🐚  ·  🫧  ·  🐚  ·  🫧', feature: 'Driftwood, shells & tide pools' },
  jungle: { name: 'Jaguar Jungle', colors: ['#4E9D74', '#8FD19A', '#E8CF74'] as const, decor: '🌴  🌺  🍃', unlock: 500, speed: 1.06, reward: 55, ground: '#75573A', edge: '#3E7A49', bits: '· 🍃  ·  🌺  ·  🍃  ·  🌺', feature: 'Vines, ruins & quicker jaguars' },
  snow: { name: 'Snowy Springs', colors: ['#92CFF1', '#DDF4FF', '#F7FCFF'] as const, decor: '🌲  ❄️  ⛄', unlock: 750, speed: 1.11, reward: 70, ground: '#A8D3E4', edge: '#F4FCFF', bits: '· ❄️  ·  ✦  ·  ❄️  ·  ✦', feature: 'Ice banks & snowy stacks' },
  volcano: { name: 'Lava Leap', colors: ['#472D55', '#C4513B', '#F2A23A'] as const, decor: '🌋  🔥  🪨', unlock: 1000, speed: 1.17, reward: 100, ground: '#302632', edge: '#E44E2F', bits: '· 🔥  ·  ◇  ·  🔥  ·  ◇', feature: 'Obsidian, magma & max speed' },
};
const WORLD_ORDER = Object.keys(ENVIRONMENTS) as WorldId[];
const NAME_SUGGESTIONS = ['Orange Cappy', 'Cozy Hopper', 'Melon Sprinter', 'River Bean', 'Tiny Thunder', 'Cappy Champ'];
const BLOCKED_NICKNAME_TERMS = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'cunt', 'nigger', 'nigga', 'fag', 'slut', 'whore', 'cock', 'porn', 'rape', 'nazi', 'retard', 'admin', 'moderator', 'support', 'official'];
function nicknameIsAllowed(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return !BLOCKED_NICKNAME_TERMS.some(term => normalized.includes(term));
}
type NameOnboardingProps = { visible: boolean; nameDraft: string; onChangeName: (value: string) => void; onSubmit: () => void };
function NameOnboardingModal({ visible, nameDraft, onChangeName, onSubmit }: NameOnboardingProps) {
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={() => undefined}><View style={styles.modalShade}><View style={styles.nameCard}>
    <Text style={styles.adLabel}>WELCOME TO CAPYBARA HOP!</Text><Text style={styles.nameCapy}>🍊</Text><Text selectable style={styles.adTitle}>What should Cappy call you?</Text><Text style={styles.adBody}>Your nickname appears on leaderboards. Choose something fun—no real name needed.</Text>
    <TextInput value={nameDraft} onChangeText={onChangeName} maxLength={20} placeholder="Enter a nickname" style={styles.nameInput} autoCapitalize="words" autoCorrect={false} autoFocus returnKeyType="done" blurOnSubmit onSubmitEditing={onSubmit} />
    <View style={styles.nameSuggestions}>{NAME_SUGGESTIONS.slice(0,3).map(name => <Pressable key={name} onPress={() => onChangeName(name)} style={styles.nameSuggestion}><Text style={styles.nameSuggestionText}>{name}</Text></Pressable>)}</View>
    <Pressable onPress={onSubmit} style={styles.primaryButton}><Text style={styles.primaryButtonText}>START MY ADVENTURE</Text></Pressable>
  </View></View></Modal>;
}
function featuredWorldFor(bestScore: number): WorldId {
  const unlocked = WORLD_ORDER.filter(id => bestScore >= ENVIRONMENTS[id].unlock);
  const dayNumber = Math.floor(Date.parse(`${today()}T00:00:00Z`) / 86400000);
  return unlocked[dayNumber % unlocked.length] ?? 'forest';
}
const OUTFIT_SPRITES: Partial<Record<OutfitId, number>> = {
  sprout: require('./assets/outfits-v2/sprout.png'), sunny: require('./assets/outfits-v2/sunny.png'), scout: require('./assets/outfits/scout.png'),
  pirate: require('./assets/outfits/pirate.png'), ninja: require('./assets/outfits-v2/ninja.png'), dragon: require('./assets/outfits-v2/dragon.png'),
  chef: require('./assets/outfits/chef.png'), strawberry: require('./assets/outfits-v2/strawberry.png'), bee: require('./assets/outfits-v2/bee.png'),
  royal: require('./assets/outfits/royal.png'), wizard: require('./assets/outfits-v2/wizard.png'), mermaid: require('./assets/outfits-v2/mermaid.png'),
  astronaut: require('./assets/outfits/astronaut.png'), cowboy: require('./assets/outfits-v2/cowboy.png'), dinosaur: require('./assets/outfits-v2/dinosaur.png'),
  unicorn: require('./assets/outfits/unicorn.png'), rainbow: require('./assets/outfits-v2/rainbow.png'), champion: require('./assets/outfits-v2/champion.png'),
};
const CLASSIC_FRAMES = {
  runContact: require('./assets/capybara-v2/run-contact.png'),
  runStride: require('./assets/capybara-v2/run-stride.png'),
  jumpOne: require('./assets/capybara-v2/jump-one.png'),
  jumpTwo: require('./assets/capybara-v2/jump-two.png'),
};
const BONUS_SPRITES: Record<BonusId, number> = {
  melon: require('./assets/powerups/melon.png'),
  legume: require('./assets/powerups/flying-legume.png'),
  strawberry: require('./assets/powerups/phase-strawberry.png'),
};
const AnimatedImage = Animated.createAnimatedComponent(Image);

function Capybara({ outfit, jumping = false, size = CAPY_SIZE, motion = false }: { outfit: Outfit; jumping?: boolean; size?: number; motion?: boolean }) {
  const frameMix = useSharedValue(motion ? 1 : 0);
  useEffect(() => { frameMix.value = withTiming(motion ? 1 : 0, { duration: 75 }); }, [frameMix, motion]);
  const firstFrameStyle = useAnimatedStyle(() => ({ opacity: 1 - frameMix.value }));
  const secondFrameStyle = useAnimatedStyle(() => ({ opacity: frameMix.value }));
  const sprite = OUTFIT_SPRITES[outfit.id];
  return (
    <View style={{ width: size * 1.65, height: size, transform: [{ translateY: outfit.id === 'classic' ? 0 : (motion && !jumping ? -1 : 0) }, { rotate: outfit.id === 'classic' ? '0deg' : jumping ? '-5deg' : (motion ? '.7deg' : '-.7deg') }] }}>
      {outfit.id === 'classic' ? <>
        <AnimatedImage source={jumping ? CLASSIC_FRAMES.jumpOne : CLASSIC_FRAMES.runContact} style={[styles.capyFrame, firstFrameStyle]} contentFit="contain" transition={0} />
        <AnimatedImage source={jumping ? CLASSIC_FRAMES.jumpTwo : CLASSIC_FRAMES.runStride} style={[styles.capyFrame, secondFrameStyle]} contentFit="contain" transition={0} />
      </> : <Image source={sprite!} style={styles.capyFrame} contentFit="contain" transition={0} />}
    </View>
  );
}

function Obstacle({ type, world, motion = false }: { type: ObstacleId; world: WorldId; motion?: boolean }) {
  if (type === 'jaguar') return <View style={[styles.jaguar, motion && styles.jaguarPounceMotion]}><Image source={require('./assets/jaguar-pounce.png')} style={styles.jaguarImage} contentFit="contain" transition={0} /><Text style={styles.jaguarPounce}>!</Text></View>;
  const rockColors: Record<WorldId, [string,string]> = { forest:['#687780','#46535A'], beach:['#D2A96D','#9B7447'], jungle:['#607B56','#3C5638'], snow:['#A6D8EA','#6DA9C2'], volcano:['#423848','#211C26'] };
  const woodColors: Record<WorldId, [string,string,string]> = { forest:['#86502E','#60361F','🍃'], beach:['#C79055','#835B36','🐚'], jungle:['#596F36','#344824','🌿'], snow:['#8CB8C8','#567D8B','❄️'], volcano:['#4A3031','#271B20','🔥'] };
  if (type === 'rock') return <View style={[styles.rock,{backgroundColor:rockColors[world][0],borderBottomColor:rockColors[world][1]}]}><View style={styles.rockHighlight} /><Text style={styles.worldObstacleAccent}>{world==='volcano'?'🔥':world==='snow'?'❄️':''}</Text></View>;
  if (type === 'stump') return <View style={[styles.stump,{backgroundColor:woodColors[world][0],borderBottomColor:woodColors[world][1]}]}><View style={styles.stumpTop} /><Text style={styles.stumpTwig}>{woodColors[world][2]}</Text></View>;
  if (type === 'mushrooms') return <View style={styles.mushroomGroup}><Text style={styles.mushrooms}>{world==='beach'?'🐚🐚':world==='jungle'?'🌺🌺':world==='snow'?'☃️☃️':world==='volcano'?'🔥🔥':'🍄🍄'}</Text></View>;
  if (type === 'puddle') return <View style={[styles.puddle,world==='volcano'&&styles.lavaPuddle,world==='snow'&&styles.icePuddle]}><View style={styles.puddleShine} /></View>;
  if (type === 'tallStack') { const icon=world==='beach'?'🪵':world==='jungle'?'🗿':world==='snow'?'⛄':world==='volcano'?'🪨':'📦'; return <View style={styles.tallStack}><Text style={styles.stackFace}>{icon}</Text><Text style={styles.stackFace}>{icon}</Text></View>; }
  return <View style={[styles.obstacle,{backgroundColor:woodColors[world][0],borderBottomColor:woodColors[world][1]}]}><View style={styles.logEnd} /><View style={styles.logStripe} /><Text style={styles.logLeaf}>{woodColors[world][2]}</Text></View>;
}

function Pill({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <View style={[styles.pill, dark && { backgroundColor: '#304B38' }]}>{children}</View>;
}

class GameErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { trackGameEvent('app_error', { message: error.message.slice(0, 180) }).catch(() => undefined); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <LinearGradient colors={['#DDF2EE','#FFF0C5']} style={{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:14}}><Text style={{fontSize:64}}>🦫</Text><Text selectable style={{fontSize:27,fontWeight:'900',color:'#38513A'}}>Cappy tripped!</Text><Text selectable style={{color:'#617267',textAlign:'center',lineHeight:21}}>Your progress is safe. Tap below to reload the game screen.</Text><Pressable onPress={() => this.setState({failed:false})} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Try again</Text></Pressable></LinearGradient>;
  }
}

function GameApp() {
  const { width, height } = useWindowDimensions();
  const jumpSound = useAudioPlayer(require('./assets/audio/jump.wav'));
  const doubleJumpSound = useAudioPlayer(require('./assets/audio/double-jump.wav'));
  const landSound = useAudioPlayer(require('./assets/audio/land.wav'));
  const bonusSound = useAudioPlayer(require('./assets/audio/bonus.wav'));
  const crashSound = useAudioPlayer(require('./assets/audio/crash.wav'));
  const jaguarSound = useAudioPlayer(require('./assets/audio/jaguar.wav'));
  const forestMusic = useAudioPlayer(require('./assets/audio/forest-loop.m4a'));
  const beachMusic = useAudioPlayer(require('./assets/audio/beach-loop.m4a'));
  const jungleMusic = useAudioPlayer(require('./assets/audio/jungle-loop.m4a'));
  const snowMusic = useAudioPlayer(require('./assets/audio/snow-loop.m4a'));
  const volcanoMusic = useAudioPlayer(require('./assets/audio/volcano-loop.m4a'));
  const [screen, setScreen] = useState<Screen>('home');
  const [gameState, setGameState] = useState<GameState>('ready');
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [loaded, setLoaded] = useState(false);
  const [score, setScore] = useState(0);
  const [earned, setEarned] = useState(0);
  const [newHighScore, setNewHighScore] = useState(false);
  const [isAirborne, setIsAirborne] = useState(false);
  const [showDoubleJumpWarning, setShowDoubleJumpWarning] = useState(false);
  const [obstacleType, setObstacleType] = useState<ObstacleId>('log');
  const [obstacleTall, setObstacleTall] = useState(false);
  const [motionFrame, setMotionFrame] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [rewardBooster, setRewardBooster] = useState<BoosterId | null>(null);
  const [rewardFromStore, setRewardFromStore] = useState(false);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [continueCountdown, setContinueCountdown] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>('standard');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>('weekly');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(DEFAULT_SAVE.displayName);
  const [showNameOnboarding, setShowNameOnboarding] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFruitGuide, setShowFruitGuide] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [milestonePop, setMilestonePop] = useState(0);
  const [worldRewardPop, setWorldRewardPop] = useState(0);
  const [monetizationStatus, setMonetizationStatus] = useState<'loading' | 'native' | 'preview'>('loading');
  const [activeBooster, setActiveBooster] = useState<'shield' | 'slow' | null>(null);
  const [boosterSeconds, setBoosterSeconds] = useState(0);
  const [bonusType, setBonusType] = useState<BonusId | null>(null);
  const [bonusY, setBonusY] = useState(110);
  const [flightPasses, setFlightPasses] = useState(0);
  const [phasePasses, setPhasePasses] = useState(0);
  const [continueGracePasses, setContinueGracePasses] = useState(0);
  const [tripleHopActive, setTripleHopActive] = useState(false);
  const [preRunBoosters, setPreRunBoosters] = useState<Record<BoosterId, boolean>>({ shield: false, slow: false, continue: false, triple: false });
  const velocityRef = useRef(0), yRef = useRef(0), obstacleRef = useRef(width + 120), scoreRef = useRef(0);
  const runningRef = useRef(false), lastTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const obstacleTypeRef = useRef<ObstacleId>('log');
  const obstacleTallRef = useRef(false);
  const runStartedAtRef = useRef(0), nextJaguarAtRef = useRef(16000);
  const obstaclesPassedRef = useRef(0);
  const doubleJumpsRef = useRef(0), bonusesCaughtRef = useRef(0), jaguarsEscapedRef = useRef(0);
  const recordedStatsRef = useRef({ obstacles: 0, doubleJumps: 0, bonuses: 0, jaguars: 0, run: false });
  const rewardedScoreRef = useRef(0), runAcornsRef = useRef(0);
  const saveRef = useRef(DEFAULT_SAVE);
  const continuedRunRef = useRef(false);
  const lastHardObstacleRef = useRef(false);
  const wasAirborneRef = useRef(false);
  const jumpsRef = useRef(0);
  const shieldUntilRef = useRef(0), slowUntilRef = useRef(0);
  const bonusTypeRef = useRef<BonusId | null>(null), bonusXRef = useRef(width + 300), bonusYRef = useRef(110);
  const flightPassesRef = useRef(0), phasePassesRef = useRef(0);
  const continueGracePassesRef = useRef(0);
  const tripleRunRef = useRef(false);
  const boostedRunRef = useRef(false);
  const continueArmedRef = useRef(false);
  const musicPlayers = { forest: forestMusic, beach: beachMusic, jungle: jungleMusic, snow: snowMusic, volcano: volcanoMusic };
  const musicPlayer = musicPlayers[save.selectedWorld];
  const selectedOutfit = OUTFITS.find(item => item.id === save.selected) ?? OUTFITS[0];
  const selectedPerk = OUTFIT_PERKS[selectedOutfit.id];
  const hopMultiplier = selectedOutfit.premium ? 2 : selectedOutfit.price >= 2800 ? 1.5 : selectedOutfit.price >= 1500 ? 1.25 : 1;
  const capyPositionY = useSharedValue(0);
  const obstaclePositionX = useSharedValue(width + 120);
  const bonusPositionX = useSharedValue(width + 300);
  const highScoreScale = useSharedValue(.55);
  const scoreScale = useSharedValue(1);
  const worldShakeX = useSharedValue(0);
  const dustProgress = useSharedValue(1);
  const capyAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -capyPositionY.value }] }));
  const obstacleAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: obstaclePositionX.value }] }));
  const bonusAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: bonusPositionX.value }] }));
  const highScoreAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: highScoreScale.value }] }));
  const scoreAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scoreScale.value }] }));
  const worldAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: worldShakeX.value }] }));
  const dustAnimatedStyle = useAnimatedStyle(() => ({ opacity: 1 - dustProgress.value, transform: [{ scale: .55 + dustProgress.value * .8 }, { translateX: dustProgress.value * 8 }] }));
  const environment = ENVIRONMENTS[save.selectedWorld];
  const featuredWorld = featuredWorldFor(save.bestScore);
  const nextWorld = WORLD_ORDER.map(id => ({ id, ...ENVIRONMENTS[id] })).find(world => save.bestScore < world.unlock);
  const missions = getDailyMissions();
  const weeklyChallenges = getWeeklyChallenges();
  const playEffect = useCallback((player: typeof jumpSound) => {
    if (!save.settings.sound) return;
    player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [save.settings.sound]);
  const haptic = useCallback((action: () => Promise<void>) => {
    if (save.settings.haptics) action().catch(() => undefined);
  }, [save.settings.haptics]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(async value => {
      let parsed: Partial<SaveData> = {};
      if (value) {
        try { parsed = JSON.parse(value) as Partial<SaveData>; }
        catch {
          const backup = await AsyncStorage.getItem(BACKUP_STORAGE_KEY);
          try { parsed = backup ? JSON.parse(backup) as Partial<SaveData> : {}; } catch { parsed = {}; }
        }
      }
      let stored: SaveData = {
        ...DEFAULT_SAVE,
        ...parsed,
        boosters: { ...DEFAULT_SAVE.boosters, ...(parsed.boosters ?? {}) },
        rewardedAds: parsed.rewardedAds?.date === today() ? { ...DEFAULT_SAVE.rewardedAds, ...parsed.rewardedAds } : { date: today(), acorns: 0, boosters: 0 },
        selectedWorld: parsed.selectedWorld && WORLD_ORDER.includes(parsed.selectedWorld) ? parsed.selectedWorld : 'forest',
        worldBests: { ...DEFAULT_WORLD_BESTS, ...(parsed.worldBests ?? {}) },
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        progress: { ...hydrateProgress(parsed.progress), profileComplete: parsed.progress?.profileComplete ?? (!!parsed.displayName && parsed.displayName !== DEFAULT_SAVE.displayName) },
      };
      if (ENVIRONMENTS[stored.selectedWorld].unlock > stored.bestScore) stored.selectedWorld = 'forest';
      if (stored.boosterDate !== today()) { stored = { ...stored, boosters: { shield: Math.max(1, stored.boosters.shield), slow: Math.max(1, stored.boosters.slow), continue: Math.max(1, stored.boosters.continue), triple: Math.max(1, stored.boosters.triple) }, boosterDate: today() }; }
      if (!active) return;
      setSave(stored); setNameDraft(stored.displayName); setLoaded(true);
      try {
        const session = await ensurePlayerSession();
        if (!active || !session.connected) { if (active) setCloudStatus('offline'); return; }
        setPlayerId(session.userId); setCloudStatus('online');
        if (!value) {
          const cloud = await downloadCloudSave();
          if (cloud && active) {
            const cloudWorld = WORLD_ORDER.includes(cloud.selectedWorld as WorldId) && ENVIRONMENTS[cloud.selectedWorld as WorldId].unlock <= cloud.bestScore ? cloud.selectedWorld as WorldId : 'forest';
            setSave(current => ({ ...current, ...cloud, selected: cloud.selected as OutfitId, owned: cloud.owned as OutfitId[], boosters: { ...current.boosters, ...cloud.boosters } as Record<BoosterId, number>, rewardedAds: cloud.rewardedAds?.date === today() ? cloud.rewardedAds : { date: today(), acorns: 0, boosters: 0 }, selectedWorld: cloudWorld, worldBests: { ...DEFAULT_WORLD_BESTS, ...(cloud.worldBests as Partial<Record<WorldId,number>> ?? {}) }, settings: { ...DEFAULT_SETTINGS, ...cloud.settings }, progress: { ...hydrateProgress(cloud.progress as Partial<ProgressData>), profileComplete: (cloud.progress as Partial<ProgressData>)?.profileComplete ?? cloud.displayName !== DEFAULT_SAVE.displayName } }));
            setNameDraft(cloud.displayName);
          }
        }
      } catch { if (active) setCloudStatus('offline'); }
    }).catch(() => setLoaded(true));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(save);
    Promise.all([AsyncStorage.setItem(STORAGE_KEY, serialized), AsyncStorage.setItem(BACKUP_STORAGE_KEY, serialized)]).catch(() => undefined);
  }, [save, loaded]);
  useEffect(() => {
    if (!loaded || save.progress.profileComplete) { setShowNameOnboarding(false); return; }
    const timer = setTimeout(() => { setNameDraft(''); setShowNameOnboarding(true); }, 450);
    return () => clearTimeout(timer);
  }, [loaded, save.progress.profileComplete]);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(() => setSave(current => current.progress.missionDate === today() && current.progress.weekStart === weekKey()
      ? current : { ...current, progress: hydrateProgress(current.progress) }), 30000);
    return () => clearInterval(timer);
  }, [loaded]);
  useEffect(() => {
    if (!loaded || cloudStatus !== 'online') return;
    const timer = setTimeout(() => uploadCloudSave({ bestScore: save.bestScore, acorns: save.acorns, selected: save.selected, owned: save.owned, displayName: save.displayName, boosters: save.boosters, rewardedAds: save.rewardedAds, selectedWorld: save.selectedWorld, worldBests: save.worldBests, settings: save.settings, progress: save.progress }).catch(() => setCloudStatus('offline')), 1200);
    return () => clearTimeout(timer);
  }, [cloudStatus, loaded, save]);
  useEffect(() => {
    const players = [forestMusic, beachMusic, jungleMusic, snowMusic, volcanoMusic];
    players.forEach(player => { player.loop = true; player.volume = .45; if (player !== musicPlayer || !save.settings.music || gameState !== 'playing') player.pause(); });
    if (save.settings.music && gameState === 'playing') musicPlayer.play();
  }, [beachMusic, forestMusic, gameState, jungleMusic, musicPlayer, save.settings.music, snowMusic, volcanoMusic]);
  useEffect(() => { initializeMonetization().then(result => setMonetizationStatus(result.native ? 'native' : 'preview')); }, []);
  useEffect(() => {
    if (!activeBooster) return;
    const timer = setInterval(() => {
      const until = activeBooster === 'shield' ? shieldUntilRef.current : slowUntilRef.current;
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setBoosterSeconds(remaining);
      if (!remaining) setActiveBooster(null);
    }, 250);
    return () => clearInterval(timer);
  }, [activeBooster]);
  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = setInterval(() => setMotionFrame(frame => !frame), 150);
    return () => clearInterval(timer);
  }, [gameState]);
  useEffect(() => {
    if (!newHighScore) return;
    highScoreScale.value = .55;
    highScoreScale.value = withSpring(1, { damping: 8, stiffness: 180 });
  }, [newHighScore, highScoreScale]);
  useEffect(() => () => {
    runningRef.current = false;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);
  const awardHops = useCallback((amount: number) => {
    scoreRef.current += amount;
    setScore(scoreRef.current);
    scoreScale.value = withSequence(withTiming(1.18, { duration: 80 }), withSpring(1, { damping: 10, stiffness: 260 }));
  }, [scoreScale]);
  const finishRun = useCallback(() => {
    runningRef.current = false;
    worldShakeX.value = withSequence(withTiming(-7, { duration: 45 }), withTiming(7, { duration: 55 }), withTiming(-4, { duration: 45 }), withTiming(0, { duration: 55 }));
    setGameState('gameover');
    playEffect(crashSound);
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    const currentSave = saveRef.current;
    const recorded = recordedStatsRef.current;
    const stats = {
      obstacles: obstaclesPassedRef.current - recorded.obstacles,
      doubleJumps: doubleJumpsRef.current - recorded.doubleJumps,
      bonuses: bonusesCaughtRef.current - recorded.bonuses,
      jaguars: jaguarsEscapedRef.current - recorded.jaguars,
      outfitId: currentSave.selected,
      score: scoreRef.current,
      countRun: !recorded.run,
    };
    let progress = applyRunProgress(currentSave.progress, stats);
    const milestone = milestoneReward(progress, scoreRef.current);
    progress = milestone.progress;
    const scoreDelta = Math.max(0, scoreRef.current - rewardedScoreRef.current);
    const baseCoins = scoreDelta > 0 ? Math.max(1, Math.floor(scoreDelta / 40)) : 0;
    const runPerk = OUTFIT_PERKS[currentSave.selected];
    const outfitAcornBonus = Math.ceil(baseCoins * (runPerk?.acornBonus ?? 0));
    const previousWorldBest = currentSave.worldBests[currentSave.selectedWorld] ?? 0;
    const firstStarReward = previousWorldBest < 100 && scoreRef.current >= 100 ? ENVIRONMENTS[currentSave.selectedWorld].reward : 0;
    const featuredBonus = currentSave.selectedWorld === featuredWorldFor(currentSave.bestScore) ? Math.ceil(baseCoins * .5) : 0;
    const coins = baseCoins + outfitAcornBonus + milestone.reward + firstStarReward + featuredBonus;
    rewardedScoreRef.current = scoreRef.current;
    runAcornsRef.current += coins;
    recordedStatsRef.current = { obstacles: obstaclesPassedRef.current, doubleJumps: doubleJumpsRef.current, bonuses: bonusesCaughtRef.current, jaguars: jaguarsEscapedRef.current, run: true };
    setEarned(runAcornsRef.current);
    if (milestone.milestone) { setMilestonePop(milestone.milestone); setTimeout(() => setMilestonePop(0), 2400); }
    if (firstStarReward) { setWorldRewardPop(firstStarReward); setTimeout(() => setWorldRewardPop(0), 2600); }
    setShowContinuePrompt((currentSave.boosters.continue > 0 || continueArmedRef.current) && !continuedRunRef.current);
    setNewHighScore(scoreRef.current > currentSave.bestScore);
    setSave(current => ({ ...current, acorns: current.acorns + coins, bestScore: Math.max(current.bestScore, scoreRef.current), worldBests: { ...current.worldBests, [current.selectedWorld]: Math.max(current.worldBests[current.selectedWorld], scoreRef.current) }, progress }));
    const outfitHasPerk = currentSave.selected !== 'classic' && Boolean(OUTFIT_PERKS[currentSave.selected]);
    const mode: LeaderboardMode = outfitHasPerk || hopMultiplier > 1 || boostedRunRef.current ? 'boosted' : 'standard';
    submitRun({ score: scoreRef.current, mode, durationMs: Date.now() - runStartedAtRef.current, obstaclesPassed: obstaclesPassedRef.current, displayName: currentSave.displayName }).catch(() => undefined);
    trackGameEvent('run_finished', { score: scoreRef.current, obstacles: obstaclesPassedRef.current, mode, continued: continuedRunRef.current, world: currentSave.selectedWorld, featuredBonus, firstStarReward, outfitAcornBonus }).catch(() => undefined);
  }, [crashSound, haptic, hopMultiplier, playEffect, worldShakeX]);

  const runFrame = useCallback((time: number) => {
    if (!runningRef.current) return;
    const delta = Math.min((time - lastTimeRef.current) / 16.67, 2);
    lastTimeRef.current = time;
    velocityRef.current -= .74 * delta;
    yRef.current += velocityRef.current * delta;
    if (yRef.current < 0) {
      yRef.current = 0; velocityRef.current = 0; jumpsRef.current = 0;
      if (wasAirborneRef.current) {
        wasAirborneRef.current = false; setIsAirborne(false);
        dustProgress.value = 0; dustProgress.value = withTiming(1, { duration: 280 });
        playEffect(landSound); haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
      }
    }
    const slowMultiplier = Date.now() < slowUntilRef.current ? .52 : 1;
    const runPerk = OUTFIT_PERKS[saveRef.current.selected];
    const hazardPerk = obstacleTypeRef.current === 'jaguar' ? (runPerk?.jaguarSpeed ?? 1) : 1;
    const travel = (obstacleTypeRef.current === 'jaguar' ? 12.8 : Math.min(7.8 + obstaclesPassedRef.current * .28, 13.5)) * ENVIRONMENTS[saveRef.current.selectedWorld].speed * hazardPerk * slowMultiplier * delta;
    obstacleRef.current -= travel;
    if (bonusTypeRef.current) {
      bonusXRef.current -= travel;
      if (bonusXRef.current < -60) { bonusTypeRef.current = null; setBonusType(null); }
    }
    if (obstacleRef.current < -70) {
      if (obstacleTypeRef.current === 'jaguar') jaguarsEscapedRef.current += 1;
      obstaclesPassedRef.current += 1;
      const elapsed = Date.now() - runStartedAtRef.current;
      const jaguarSpawn = elapsed >= nextJaguarAtRef.current;
      awardHops(Math.round(BASE_HOPS * (tripleRunRef.current ? 3 : hopMultiplier)));
      if (continueGracePassesRef.current > 0) {
        continueGracePassesRef.current -= 1;
        setContinueGracePasses(continueGracePassesRef.current);
      }
      if (flightPassesRef.current > 0) { flightPassesRef.current -= 1; setFlightPasses(flightPassesRef.current); }
      if (phasePassesRef.current > 0) { phasePassesRef.current -= 1; setPhasePasses(phasePassesRef.current); }
      const pool: ObstacleId[] = obstaclesPassedRef.current < 3 ? ['log', 'rock'] : obstaclesPassedRef.current < 6 ? ['log', 'rock', 'stump', 'mushrooms'] : ['log', 'rock', 'stump', 'mushrooms', 'puddle', 'tallStack'];
      obstacleTypeRef.current = jaguarSpawn ? 'jaguar' : pool[Math.floor(Math.random() * pool.length)];
      obstacleTallRef.current = obstaclesPassedRef.current >= 3 && ['log', 'rock', 'stump'].includes(obstacleTypeRef.current) && !lastHardObstacleRef.current && Math.random() < .32;
      if (lastHardObstacleRef.current && obstacleTypeRef.current === 'tallStack') obstacleTypeRef.current = 'log';
      const finalHardObstacle = obstacleTallRef.current || obstacleTypeRef.current === 'tallStack' || obstacleTypeRef.current === 'jaguar';
      obstacleRef.current = width + (finalHardObstacle ? 430 : lastHardObstacleRef.current ? 380 : 285) + Math.random() * 90;
      lastHardObstacleRef.current = finalHardObstacle;
      setObstacleType(obstacleTypeRef.current);
      setObstacleTall(obstacleTallRef.current);
      setShowDoubleJumpWarning(obstacleTallRef.current || obstacleTypeRef.current === 'tallStack');
      if (jaguarSpawn) { const baseDelay = saveRef.current.selectedWorld === 'jungle' ? 12000 : saveRef.current.selectedWorld === 'volcano' ? 13500 : 15000; nextJaguarAtRef.current = elapsed + baseDelay + Math.random() * 5000; playEffect(jaguarSound); }
      const worldBonusChance = saveRef.current.selectedWorld === 'volcano' ? .38 : saveRef.current.selectedWorld === 'snow' ? .35 : saveRef.current.selectedWorld === 'jungle' ? .33 : .3;
      const bonusChance = Math.min(.58, worldBonusChance + (runPerk?.bonusChance ?? 0));
      if (!bonusTypeRef.current && obstaclesPassedRef.current >= 2 && Math.random() < bonusChance) {
        const bonusPool: BonusId[] = ['melon', 'legume', 'strawberry'];
        bonusTypeRef.current = bonusPool[Math.floor(Math.random() * bonusPool.length)];
        bonusXRef.current = obstacleRef.current + 150 + Math.random() * 80;
        bonusYRef.current = 100 + Math.random() * 38;
        setBonusType(bonusTypeRef.current); setBonusY(bonusYRef.current);
      }
    }
    if (bonusTypeRef.current) {
      const effectiveY = yRef.current + (flightPassesRef.current > 0 ? 125 : 0);
      const caughtX = CAPY_X + CAPY_SIZE * 1.35 > bonusXRef.current && CAPY_X < bonusXRef.current + 46;
      const caughtY = Math.abs((effectiveY + CAPY_SIZE * .5) - bonusYRef.current) < 56;
      if (caughtX && caughtY) {
        const caught = bonusTypeRef.current;
        bonusTypeRef.current = null; setBonusType(null);
        bonusesCaughtRef.current += 1;
        if (caught === 'melon') awardHops(5 + (runPerk?.melonBonus ?? 0));
        if (caught === 'legume') { const passes = 3 + (runPerk?.extraPasses ?? 0); flightPassesRef.current = passes; setFlightPasses(passes); }
        if (caught === 'strawberry') { const passes = 3 + (runPerk?.extraPasses ?? 0); phasePassesRef.current = passes; setPhasePasses(passes); }
        playEffect(bonusSound); haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      }
    }
    const obstacleWidth = obstacleTypeRef.current === 'jaguar' ? 76 : 50;
    const hitX = CAPY_X + CAPY_SIZE * 1.15 > obstacleRef.current + 9 && CAPY_X + 18 < obstacleRef.current + obstacleWidth - 5;
    const obstacleHeight = obstacleTypeRef.current === 'jaguar' ? 68 : obstacleTypeRef.current === 'tallStack' ? 138 : obstacleTypeRef.current === 'puddle' ? 13 : obstacleTypeRef.current === 'mushrooms' ? 27 : obstacleTallRef.current ? 118 : 37;
    if (hitX && yRef.current < obstacleHeight) {
      const timedShield = Date.now() < shieldUntilRef.current;
      const collectibleProtection = flightPassesRef.current > 0 || phasePassesRef.current > 0;
      const continueGrace = continueGracePassesRef.current > 0;
      if (timedShield || continueGrace) obstacleRef.current = -71;
      else if (!collectibleProtection) { finishRun(); return; }
    }
    capyPositionY.value = yRef.current + (flightPassesRef.current > 0 ? 125 : 0);
    obstaclePositionX.value = obstacleRef.current;
    bonusPositionX.value = bonusXRef.current;
    animationFrameRef.current = requestAnimationFrame(runFrame);
  }, [awardHops, bonusPositionX, bonusSound, capyPositionY, dustProgress, finishRun, haptic, hopMultiplier, jaguarSound, landSound, obstaclePositionX, playEffect, width]);

  useEffect(() => {
    if (!continueCountdown) return;
    const timer = setTimeout(() => {
      if (continueCountdown > 1) setContinueCountdown(continueCountdown - 1);
      else {
        setContinueCountdown(0); setGameState('playing'); runningRef.current = true;
        lastTimeRef.current = performance.now(); animationFrameRef.current = requestAnimationFrame(runFrame);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [continueCountdown, runFrame]);

  const startRun = useCallback(() => {
    scoreRef.current = 0; yRef.current = 0; velocityRef.current = 0; jumpsRef.current = 0; obstacleRef.current = width + 260;
    continuedRunRef.current = false; lastHardObstacleRef.current = false; wasAirborneRef.current = false; obstaclesPassedRef.current = 0;
    doubleJumpsRef.current = 0; bonusesCaughtRef.current = 0; jaguarsEscapedRef.current = 0; rewardedScoreRef.current = 0; runAcornsRef.current = 0;
    recordedStatsRef.current = { obstacles: 0, doubleJumps: 0, bonuses: 0, jaguars: 0, run: false };
    obstacleTypeRef.current = 'log'; obstacleTallRef.current = false; setObstacleType('log'); setObstacleTall(false);
    runStartedAtRef.current = Date.now();
    const jaguarDelay = saveRef.current.selectedWorld === 'jungle' ? 12000 : saveRef.current.selectedWorld === 'volcano' ? 13500 : 15000;
    nextJaguarAtRef.current = jaguarDelay + Math.random() * 5000;
    bonusTypeRef.current = null; bonusXRef.current = width + 300; flightPassesRef.current = 0; phasePassesRef.current = 0;
    continueGracePassesRef.current = 0;
    tripleRunRef.current = false;
    boostedRunRef.current = false;
    setTripleHopActive(false);
    continueArmedRef.current = preRunBoosters.continue;
    setActiveBooster(null); setBoosterSeconds(0); shieldUntilRef.current = 0; slowUntilRef.current = 0;
    const armed = preRunBoosters;
    const inventory = saveRef.current.boosters;
    const consumptions = (['shield', 'slow', 'triple'] as BoosterId[]).filter(id => armed[id] && inventory[id] > 0);
    if (consumptions.length || armed.continue) boostedRunRef.current = true;
    if (consumptions.length) setSave(current => ({ ...current, boosters: { ...current.boosters, ...Object.fromEntries(consumptions.map(id => [id, current.boosters[id] - 1])) } }));
    if (armed.shield && inventory.shield > 0) { shieldUntilRef.current = Date.now() + 10000; setActiveBooster('shield'); setBoosterSeconds(10); }
    if (armed.slow && inventory.slow > 0) { slowUntilRef.current = Date.now() + 10000; if (!armed.shield) setActiveBooster('slow'); setBoosterSeconds(10); }
    if (armed.triple && inventory.triple > 0) { tripleRunRef.current = true; setTripleHopActive(true); }
    setPreRunBoosters({ shield: false, slow: false, continue: false, triple: false });
    setBonusType(null); setFlightPasses(0); setPhasePasses(0); setContinueGracePasses(0);
    capyPositionY.value = 0; obstaclePositionX.value = obstacleRef.current; bonusPositionX.value = bonusXRef.current;
    setScore(0); setEarned(0); setIsAirborne(false); setShowDoubleJumpWarning(false); setGameState('playing');
    setNewHighScore(false);
    if (saveRef.current.settings.music) { musicPlayer.loop = true; musicPlayer.play(); }
    trackGameEvent('run_started', { outfit: saveRef.current.selected, multiplier: hopMultiplier, world: saveRef.current.selectedWorld, featured: saveRef.current.selectedWorld === featuredWorldFor(saveRef.current.bestScore) }).catch(() => undefined);
    runningRef.current = true; lastTimeRef.current = performance.now(); animationFrameRef.current = requestAnimationFrame(runFrame);
  }, [bonusPositionX, capyPositionY, hopMultiplier, musicPlayer, obstaclePositionX, preRunBoosters, runFrame, width]);

  const jump = () => {
    if (gameState === 'gameover') return;
    if (gameState !== 'playing') { startRun(); velocityRef.current = 13.2; jumpsRef.current = 1; wasAirborneRef.current = true; setIsAirborne(true); playEffect(jumpSound); return; }
    const maxJumps = tripleRunRef.current ? 3 : 2;
    if (jumpsRef.current < maxJumps) {
      velocityRef.current = jumpsRef.current === 0 ? 13.2 : Math.max(velocityRef.current, jumpsRef.current === 1 ? 14.4 : 13.8);
      jumpsRef.current += 1; wasAirborneRef.current = true; setIsAirborne(true);
      if (jumpsRef.current === 2) { doubleJumpsRef.current += 1; playEffect(doubleJumpSound); }
      else playEffect(jumpSound);
      haptic(() => Haptics.impactAsync(jumpsRef.current === 2 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light));
    }
  };

  const buyOrEquip = async (outfit: Outfit) => {
    if (save.owned.includes(outfit.id)) { setSave(c => ({ ...c, selected: outfit.id })); setScreen('home'); return; }
    if (!outfit.premium && save.acorns >= outfit.price) { setSave(c => ({ ...c, acorns: c.acorns - outfit.price, owned: [...c.owned, outfit.id], selected: outfit.id })); setScreen('home'); return; }
    if (outfit.premium) {
      const result = await purchaseProduct(`capy_outfit_${outfit.id}`);
      if (result.purchased) { setSave(c => ({ ...c, owned: [...new Set([...c.owned, outfit.id])], selected: outfit.id })); setScreen('home'); trackGameEvent('purchase_completed',{product:`capy_outfit_${outfit.id}`}).catch(()=>undefined); }
      else if (result.reason !== 'cancelled') Alert.alert('Store unavailable', monetizationStatus === 'preview' ? 'Premium purchases require an EAS development build or TestFlight.' : 'This product is not available yet. Check its RevenueCat offering.');
    }
  };
  // Every checkout uses this path. Cancelled/failed/preview checkouts never grant gifts.
  const purchaseProduct = async (product: Parameters<typeof storePurchase>[0]) => {
    const result = await storePurchase(product);
    if (result.purchased) {
      setSave(current => ({ ...current,
        owned: [...new Set([...current.owned, 'strawberry' as OutfitId])],
        progress: { ...current.progress, firstPurchaseGift: true },
      }));
    }
    return result;
  };
  const watchRewardedAd = () => {
    setShowReward(false);
    setSave(c => rewardBooster ? ({ ...c, boosters: { ...c.boosters, [rewardBooster]: c.boosters[rewardBooster] + 1 }, rewardedAds: rewardFromStore ? { ...c.rewardedAds, date: today(), boosters: c.rewardedAds.boosters + 1 } : c.rewardedAds }) : ({ ...c, acorns: c.acorns + 25, rewardedAds: rewardFromStore ? { ...c.rewardedAds, date: today(), acorns: c.rewardedAds.acorns + 1 } : c.rewardedAds }));
    setRewardBooster(null); setRewardFromStore(false);
  };
  const requestRewardBooster = async (id: BoosterId, storeLimited = false) => {
    if (storeLimited && save.rewardedAds.boosters >= 3) { Alert.alert('Daily ad limit reached', 'You can watch three store booster ads each day. Come back tomorrow for more.'); return; }
    setRewardBooster(id); setRewardFromStore(storeLimited);
    const result = await showRewardedAd();
    if (result.earned) { setSave(c => ({ ...c, boosters: { ...c.boosters, [id]: c.boosters[id] + 1 }, rewardedAds: storeLimited ? { ...c.rewardedAds, date: today(), boosters: c.rewardedAds.boosters + 1 } : c.rewardedAds })); setRewardBooster(null); setRewardFromStore(false); trackGameEvent('rewarded_ad',{reward:id,source:storeLimited?'store':'game'}).catch(()=>undefined); }
    else if (result.reason === 'expo_go') setShowReward(true);
    else Alert.alert('Ad unavailable', 'No rewarded ad is ready. Please try again shortly.');
  };
  const openAcornAd = async (storeLimited = false) => {
    if (storeLimited && save.rewardedAds.acorns >= 3) { Alert.alert('Daily ad limit reached', 'You can watch three store acorn ads each day. Come back tomorrow for more.'); return; }
    setRewardBooster(null); setRewardFromStore(storeLimited);
    const result = await showRewardedAd();
    if (result.earned) { setSave(c => ({ ...c, acorns: c.acorns + 25, rewardedAds: storeLimited ? { ...c.rewardedAds, date: today(), acorns: c.rewardedAds.acorns + 1 } : c.rewardedAds })); setRewardFromStore(false); trackGameEvent('rewarded_ad',{reward:'acorns',source:storeLimited?'store':'game'}).catch(()=>undefined); }
    else if (result.reason === 'expo_go') setShowReward(true);
    else Alert.alert('Ad unavailable', 'No rewarded ad is ready. Please try again shortly.');
  };
  const togglePreRunBooster = (id: BoosterId) => {
    if (save.boosters[id] <= 0 || (id === 'continue' && continueArmedRef.current)) return;
    setPreRunBoosters(current => ({ ...current, [id]: !current[id] }));
  };
  const useBooster = (id: BoosterId) => {
    if (save.boosters[id] <= 0) return;
    boostedRunRef.current = true;
    if (id === 'continue') { beginContinue(); return; }
    if (id === 'triple') {
      if (tripleRunRef.current) return;
      tripleRunRef.current = true; setTripleHopActive(true);
    }
    setSave(c => ({ ...c, boosters: { ...c.boosters, [id]: c.boosters[id] - 1 } }));
    if (id === 'shield') { shieldUntilRef.current = Date.now() + 10000; setActiveBooster('shield'); setBoosterSeconds(10); }
    if (id === 'slow') { slowUntilRef.current = Date.now() + 10000; setActiveBooster('slow'); setBoosterSeconds(10); }
  };
  const beginContinue = () => {
    boostedRunRef.current = true;
    setShowContinuePrompt(false);
    continuedRunRef.current = true;
    if (continueArmedRef.current || saveRef.current.boosters.continue > 0) setSave(c => ({ ...c, boosters: { ...c.boosters, continue: Math.max(0, c.boosters.continue - 1) } }));
    continueArmedRef.current = false;
    obstacleRef.current = width + 180; yRef.current = 0; velocityRef.current = 0; jumpsRef.current = 0;
    continueGracePassesRef.current = 1;
    capyPositionY.value = 0; obstaclePositionX.value = obstacleRef.current; setIsAirborne(false); setShowDoubleJumpWarning(false); setContinueGracePasses(1); setContinueCountdown(3);
  };
  const buyBoosterPack = async () => { const result=await purchaseProduct('capy_booster_pack_3'); if(result.purchased) setSave(c => ({ ...c, boosters: { ...c.boosters, shield: c.boosters.shield + 3, slow: c.boosters.slow + 3, continue: c.boosters.continue + 3 } })); else if(result.reason!=='cancelled') Alert.alert('Store unavailable','Purchases require an EAS development build and configured RevenueCat products.'); };
  const buyTriplePack = async () => { const result=await purchaseProduct('capy_triple_pack_3'); if(result.purchased) setSave(c => ({ ...c, boosters: { ...c.boosters, triple: c.boosters.triple + 3 } })); else if(result.reason!=='cancelled') Alert.alert('Store unavailable','Purchases require an EAS development build and configured RevenueCat products.'); };
  const unlockAllOutfits = async () => { const result=await purchaseProduct('capy_unlock_all_outfits'); if(result.purchased) setSave(c => ({ ...c, owned: OUTFITS.map(outfit => outfit.id) })); else if(result.reason!=='cancelled') Alert.alert('Store unavailable','Purchases require an EAS development build and configured RevenueCat products.'); };
  const buyAcorns = async (amount: 250 | 1500 | 4000) => { const result=await purchaseProduct(`capy_acorns_${amount}`); if(result.purchased) setSave(c => ({ ...c, acorns: c.acorns + amount })); else if(result.reason!=='cancelled') Alert.alert('Store unavailable','Purchases require an EAS development build and configured RevenueCat products.'); };
  const restoreOwnedPurchases = async () => {
    const result = await restorePurchases();
    if (!result.restored) { Alert.alert('Restore unavailable','Open this build through TestFlight or an EAS development build, then try again.'); return; }
    const restoredOutfits = OUTFITS.filter(item => item.premium && result.activeProductIds.includes(`capy_outfit_${item.id}`)).map(item => item.id);
    const ownsAll = result.activeProductIds.includes('capy_unlock_all_outfits');
    if (result.hasPurchaseHistory) setSave(current => ({ ...current, owned: [...new Set([...current.owned, 'strawberry' as OutfitId])], progress: { ...current.progress, firstPurchaseGift: true } }));
    setSave(current => ({ ...current, owned: ownsAll ? OUTFITS.map(item=>item.id) : [...new Set([...current.owned,...restoredOutfits])] }));
    Alert.alert('Purchases restored', ownsAll ? 'All outfits are unlocked.' : `${restoredOutfits.length} premium outfits restored.`);
  };
  const convertAcornsToBoosters = (cost: number, amount: number) => setSave(c => c.acorns < cost ? c : ({ ...c, acorns: c.acorns - cost, boosters: { ...c.boosters, shield: c.boosters.shield + amount, slow: c.boosters.slow + amount, continue: c.boosters.continue + amount } }));
  const loadLeaderboard = useCallback(() => {
    setLeaderboardLoading(true);
    fetchLeaderboard(leaderboardPeriod, leaderboardMode).then(setLeaderboard).catch(() => setLeaderboard([])).finally(() => setLeaderboardLoading(false));
  }, [leaderboardMode, leaderboardPeriod]);
  useEffect(() => { if (screen === 'leaderboard') loadLeaderboard(); }, [loadLeaderboard, screen]);
  const savePlayerName = (finishOnboarding = false) => {
    const clean = nameDraft.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 20);
    if (clean.length < 2) { Alert.alert('Name too short', 'Use at least 2 letters or numbers.'); return; }
    if (!nicknameIsAllowed(clean)) { Alert.alert('Choose a different nickname', 'That nickname contains a word that is not allowed. Please choose another.'); return; }
    setNameDraft(clean); setSave(current => ({ ...current, displayName: clean, progress: { ...current.progress, profileComplete: true } }));
    if (finishOnboarding) setShowNameOnboarding(false);
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    trackGameEvent('player_name_set', { onboarding: finishOnboarding }).catch(() => undefined);
  };
  const collectDailyReward = () => {
    const result = claimDailyReward(save.progress);
    if (!result.reward) return;
    setSave(current => ({ ...current, acorns: current.acorns + result.reward, progress: result.progress }));
    playEffect(bonusSound); haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  };
  const collectMission = (mission: ReturnType<typeof getDailyMissions>[number]) => {
    const result = claimMission(save.progress, mission);
    if (!result.reward) return;
    setSave(current => ({ ...current, acorns: current.acorns + result.reward, progress: result.progress }));
    playEffect(bonusSound); haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    trackGameEvent('mission_claimed', { mission: mission.id, reward: result.reward }).catch(() => undefined);
  };
  const collectJourney = (goal: number) => setSave(current => {
    const result = claimJourney(current.progress, goal);
    return { ...current, progress: result.progress, acorns: current.acorns + result.reward };
  });
  const collectWeekly = (id: string, expectedWeek: string) => setSave(current => {
    const result = claimWeekly(current.progress, id, expectedWeek);
    return { ...current, progress: result.progress, acorns: current.acorns + result.reward };
  });
  const collectMastery = (outfitId: OutfitId, level: number) => setSave(current => {
    if (!current.owned.includes(outfitId)) return current;
    const result = claimMastery(current.progress, outfitId, level);
    return { ...current, progress: result.progress, acorns: current.acorns + result.reward };
  });
  const weeklyCards = <View style={{ width: '100%', gap: 10 }}>
    <Text style={styles.sectionTitle}>This week’s challenges</Text>
    <Text style={styles.worldMapHint}>Resets Monday at 00:00 UTC. Collect completed rewards before reset. No ads or purchases needed.</Text>
    {weeklyChallenges.map(item => {
      const progress = hydrateProgress(save.progress);
      const value = Math.min(progress.weekly[item.metric], item.goal);
      const claimed = progress.weeklyClaimed.includes(item.id);
      return <View key={item.id} style={styles.missionCard}>
        <Text selectable style={styles.missionName}>{item.label}</Text>
        <Text selectable style={styles.missionReward}>{value}/{item.goal} • {item.reward} acorns</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${100 * value / item.goal}%` }]} /></View>
        <Pressable accessibilityRole="button" disabled={claimed || value < item.goal} onPress={() => collectWeekly(item.id, progress.weekStart)} style={[styles.claimButton, (claimed || value < item.goal) && styles.disabledButton]}><Text style={styles.claimButtonText}>{claimed ? 'COLLECTED' : value >= item.goal ? 'COLLECT ACORNS' : 'IN PROGRESS'}</Text></Pressable>
      </View>;
    })}
  </View>;
  const journeyCards = <View style={{ gap: 10, width: '100%' }}>
    <Text style={styles.sectionTitle}>Adventure Passport</Text>
    <Text style={styles.worldMapHint}>Clear obstacles across any number of runs. Rewards never expire. No purchase or ad needed.</Text>
    {JOURNEY_REWARDS.map(tier => {
      const claimed = save.progress.journeyClaimed.includes(tier.goal);
      const ready = save.progress.journeyObstacles >= tier.goal;
      return <View key={tier.goal} style={styles.missionCard}><Text style={styles.missionName}>{tier.goal} obstacles • {tier.reward} acorns</Text>
        <Text style={styles.missionReward}>{Math.min(save.progress.journeyObstacles, tier.goal)}/{tier.goal} cleared</Text>
        <Pressable accessibilityRole="button" disabled={!ready || claimed} onPress={() => collectJourney(tier.goal)} style={[styles.claimButton, (!ready || claimed) && styles.disabledButton]}><Text style={styles.claimButtonText}>{claimed ? 'COLLECTED' : ready ? 'COLLECT ACORNS' : 'KEEP EXPLORING'}</Text></Pressable>
      </View>;
    })}
  </View>;
  const firstPurchaseCard = <View style={styles.storeCard}>
    <Text style={styles.storeTitle}>{save.progress.firstPurchaseGift ? 'Thank-you outfit unlocked!' : 'Your first purchase includes Berry Baker'}</Text>
    <Capybara outfit={OUTFITS.find(item => item.id === 'strawberry')!} size={75} />
    <Text style={styles.storeSub}>{save.progress.firstPurchaseGift ? 'Berry Baker is ready to wear in your closet.' : 'Any successful purchase includes this $1.99 outfit at no extra cost. One outfit unlock per player; already-owned outfits do not grant a duplicate or currency. No countdown or minimum spend.'}</Text>
  </View>;
  const toggleSetting = (key: keyof GameSettings) => setSave(current => ({ ...current, settings: { ...current.settings, [key]: !current.settings[key] } }));
  const openGame = () => {
    setScreen('game'); setGameState('ready');
    if (!save.progress.tutorialComplete) { setTutorialStep(0); setShowTutorial(true); }
  };
  const selectWorld = (worldId: WorldId) => {
    const world = ENVIRONMENTS[worldId];
    if (save.bestScore < world.unlock) { Alert.alert('World locked', `Reach ${world.unlock} hops in any run to unlock ${world.name}.`); return; }
    setSave(current => ({ ...current, selectedWorld: worldId }));
    setScreen('home');
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    trackGameEvent('world_selected', { world: worldId }).catch(() => undefined);
  };
  const tutorialPages = [
    { emoji: '☝️', title: 'Tap to hop', body: 'Tap anywhere in the play area to jump over logs, rocks, and puddles.' },
    { emoji: '☝️☝️', title: 'Double jump', body: 'Tap again while airborne to clear tall obstacles marked DOUBLE.' },
    { emoji: '🍉 🫘 🍓', title: 'Catch bonuses', body: 'Melons add hops. Legumes fly over 3 obstacles. Strawberries phase through 3.' },
  ];
  const TutorialModal = () => {
    const page = tutorialPages[tutorialStep];
    return <Modal transparent animationType="fade" visible={showTutorial}><View style={styles.modalShade}><View style={styles.adPreview}><Text style={styles.adLabel}>QUICK TUTORIAL • {tutorialStep + 1}/3</Text><Text style={styles.adEmoji}>{page.emoji}</Text><Text style={styles.adTitle}>{page.title}</Text><Text style={styles.adBody}>{page.body}</Text><Pressable onPress={() => {
      if (tutorialStep < 2) setTutorialStep(step => step + 1);
      else { setSave(current => ({ ...current, progress: { ...current.progress, tutorialComplete: true } })); setShowTutorial(false); }
    }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{tutorialStep < 2 ? 'Next' : 'Let’s hop!'}</Text></Pressable></View></View></Modal>;
  };
  const boosterLabel = rewardBooster === 'shield' ? 'Shield' : rewardBooster === 'slow' ? 'Slow Time' : rewardBooster === 'triple' ? 'Triple Hop' : 'Continue';
  const RewardModal = () => <Modal transparent animationType="fade" visible={showReward} onRequestClose={() => setShowReward(false)}><View style={styles.modalShade}><View style={styles.adPreview}>
    <Text style={styles.adLabel}>REWARDED AD PREVIEW</Text><Text style={styles.adEmoji}>🎬</Text><Text style={styles.adTitle}>{rewardBooster ? `Free ${boosterLabel} booster` : '25 free acorns'}</Text>
    <Text style={styles.adBody}>Finish the rewarded ad to receive your {rewardBooster ? 'booster' : 'acorns'}.</Text>
    <Pressable onPress={watchRewardedAd} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{rewardBooster ? `Finish ad +1 ${boosterLabel}` : 'Finish ad +25 🌰'}</Text></Pressable>
    <Pressable onPress={() => setShowReward(false)}><Text style={styles.homeLink}>Close</Text></Pressable>
  </View></View></Modal>;
  const ContinueModal = () => <Modal transparent animationType="fade" visible={showContinuePrompt} onRequestClose={() => setShowContinuePrompt(false)}><View style={styles.modalShade}><View style={styles.adPreview}><Text style={styles.adEmoji}>💚</Text><Text style={styles.adTitle}>Use Continue booster?</Text><Text style={styles.adBody}>Resume at {score} hops. You’ll get a 3-second countdown and safely pass through the first obstacle.</Text><Pressable onPress={beginContinue} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Yes, continue</Text></Pressable><Pressable onPress={() => setShowContinuePrompt(false)}><Text style={styles.homeLink}>No, finish run</Text></Pressable></View></View></Modal>;
  const preRunLoadout = <View style={styles.preRunLoadout} onStartShouldSetResponder={() => true}>
    <Text style={styles.preRunTitle}>POWER-UP LOADOUT</Text>
    <Text style={styles.preRunHint}>Choose boosters before your first hop</Text>
    <View style={styles.preRunGrid}>
      {([['shield', '🛡️', 'Shield'], ['slow', '⏳', 'Slow'], ['continue', '💚', 'Continue'], ['triple', '3×', 'Triple']] as [BoosterId, string, string][]).map(([id, icon, label]) => {
        const selected = preRunBoosters[id]; const available = save.boosters[id] > 0;
        return <Pressable key={id} disabled={!available} onPress={() => togglePreRunBooster(id)} style={[styles.preRunBooster, selected && styles.preRunBoosterSelected, !available && styles.disabledButton]}>
          <Text style={id === 'triple' ? styles.preRunTriple : styles.preRunEmoji}>{icon}</Text><Text style={styles.preRunLabel}>{label}</Text><Text style={styles.preRunCount}>{selected ? 'ARMED' : `${save.boosters[id]} left`}</Text>
        </Pressable>;
      })}
    </View>
    {preRunBoosters.continue && <Text style={styles.preRunNote}>Continue will appear as an option after a crash.</Text>}
  </View>;
  const fruitGuide = <Modal transparent animationType="fade" visible={showFruitGuide} onRequestClose={() => setShowFruitGuide(false)}><View style={styles.modalShade}><View style={styles.fruitGuideModal}>
    <Text style={styles.adLabel}>CAPPY’S POWER-UPS</Text><Text style={styles.adTitle}>Catch these while hopping!</Text><Text style={styles.adBody}>Each bonus appears on the path. Jump into it to activate the effect immediately.</Text>
    <View style={styles.fruitGuideList}>
      <View style={styles.fruitGuideRow}><Image source={BONUS_SPRITES.melon} style={styles.fruitGuideImage} contentFit="contain" /><View style={styles.fruitGuideCopy}><Text style={styles.fruitGuideName}>🍉 Melon</Text><Text style={styles.fruitGuideText}>Adds 5 hops to your score instantly.</Text></View></View>
      <View style={styles.fruitGuideRow}><Image source={BONUS_SPRITES.legume} style={styles.fruitGuideImage} contentFit="contain" /><View style={styles.fruitGuideCopy}><Text style={styles.fruitGuideName}>🫘 Flying legume</Text><Text style={styles.fruitGuideText}>Flies Cappy safely over the next 3 obstacles.</Text></View></View>
      <View style={styles.fruitGuideRow}><Image source={BONUS_SPRITES.strawberry} style={styles.fruitGuideImage} contentFit="contain" /><View style={styles.fruitGuideCopy}><Text style={styles.fruitGuideName}>🍓 Strawberry</Text><Text style={styles.fruitGuideText}>Lets Cappy pass through the next 3 objects. Watch the countdown.</Text></View></View>
    </View>
    <Pressable onPress={() => setShowFruitGuide(false)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>GOT IT — LET’S HOP!</Text></Pressable>
  </View></View></Modal>;

  if (screen === 'missions') return <LinearGradient colors={['#FFE8A8', '#C8EDD1']} style={styles.fill}><StatusBar style="dark" /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.shopContent}>
    <View style={styles.topRow}><Pressable onPress={() => setScreen('home')} style={styles.roundButton}><Text style={styles.roundButtonText}>‹</Text></Pressable><Text selectable style={styles.shopTitle}>Cappy Quests</Text><Pill><Text style={styles.pillText}>🌰 {save.acorns}</Text></Pill></View>
    <Pressable disabled={save.progress.lastDailyClaim === today()} onPress={collectDailyReward} style={[styles.dailyReward, save.progress.lastDailyClaim === today() && styles.claimedCard]}><Text style={styles.dailyRewardEmoji}>🎁</Text><View style={{flex:1}}><Text style={styles.boosterTitle}>Daily streak • Day {save.progress.streakDays || 1}</Text><Text style={styles.boosterSub}>{save.progress.lastDailyClaim === today() ? 'Collected today — come back tomorrow' : `Collect ${25 + Math.min(save.progress.streakDays + 1, 7) * 5} acorns`}</Text></View><Text style={styles.claimText}>{save.progress.lastDailyClaim === today() ? '✓' : 'CLAIM'}</Text></Pressable>
    {weeklyCards}
    {journeyCards}
    <Text style={styles.sectionTitle}>Today’s missions</Text>
    {missions.map(mission => { const value = Math.min(save.progress.daily[mission.metric], mission.goal), complete = value >= mission.goal, claimed = save.progress.claimedMissions.includes(mission.id); return <View key={mission.id} style={styles.missionCard}><View style={styles.missionTop}><View style={{flex:1}}><Text style={styles.missionName}>{mission.label}</Text><Text style={styles.missionReward}>Reward: {mission.reward} 🌰</Text></View><Pressable disabled={!complete || claimed} onPress={() => collectMission(mission)} style={[styles.claimButton, (!complete || claimed) && styles.disabledButton]}><Text style={styles.claimButtonText}>{claimed ? 'CLAIMED' : complete ? 'CLAIM' : `${value}/${mission.goal}`}</Text></Pressable></View><View style={styles.progressTrack}><View style={[styles.progressFill,{width:`${Math.round(value/mission.goal*100)}%`}]} /></View></View>; })}
    <Text style={styles.sectionTitle}>Achievements</Text>
    <View style={styles.badgeGrid}>{['Forest Flyer','Double Trouble','Snack Collector','Jaguar Escape','Persistent Cappy'].map(name => { const unlocked = save.progress.achievements.includes(name); return <View key={name} style={[styles.badgeCard,!unlocked&&styles.lockedBadge]}><Text style={styles.badgeEmoji}>{unlocked?'🏅':'🔒'}</Text><Text style={styles.badgeName}>{name}</Text></View>; })}</View>
    <Text style={styles.sectionTitle}>Worlds</Text>
    <Text style={styles.worldMapHint}>Choose any unlocked world. Reach 100 hops there to open its one-time acorn chest.</Text>
    {WORLD_ORDER.map(key => { const world=ENVIRONMENTS[key], unlocked=save.bestScore>=world.unlock, selected=save.selectedWorld===key, worldBest=save.worldBests[key], stars=worldBest>=500?3:worldBest>=250?2:worldBest>=100?1:0, featured=featuredWorld===key; return <Pressable key={key} onPress={()=>selectWorld(key)} style={[styles.worldRow,!unlocked&&styles.lockedBadge,selected&&styles.selectedWorld,featured&&styles.featuredWorld]}><View style={[styles.worldPreview,{backgroundColor:world.colors[1]}]}><Text style={styles.worldPreviewText}>{world.decor}</Text></View><View style={{flex:1}}><Text style={styles.missionName}>{world.name} {featured?'• DAILY +50% 🌰':''}</Text><Text style={styles.missionReward}>{unlocked?world.feature:`Reach ${world.unlock} hops to unlock`}</Text>{unlocked&&<Text style={styles.worldRecord}>Best {worldBest} • {'★'.repeat(stars)}{'☆'.repeat(3-stars)} • First star +{world.reward} 🌰</Text>}</View><Text style={[styles.worldSelectText,selected&&styles.worldSelectedText]}>{!unlocked?'🔒':selected?'SELECTED':'CHOOSE'}</Text></Pressable>; })}
  </ScrollView></LinearGradient>;

  if (screen === 'settings') return <LinearGradient colors={['#DDF2EE', '#FFF0C5']} style={styles.fill}><StatusBar style="dark" /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.shopContent}>
    <View style={styles.topRow}><Pressable onPress={() => setScreen('home')} style={styles.roundButton}><Text style={styles.roundButtonText}>‹</Text></Pressable><Text selectable style={styles.shopTitle}>Settings</Text><Text style={{fontSize:30}}>⚙️</Text></View>
    <View style={styles.settingsCard}>{(['music','sound','haptics'] as const).map(key => <Pressable key={key} onPress={() => toggleSetting(key)} style={styles.settingRow}><Text style={styles.settingLabel}>{key === 'music' ? '🎵 Music' : key === 'sound' ? '🔊 Sound effects' : '📳 Haptics'}</Text><View style={[styles.toggle,save.settings[key]&&styles.toggleOn]}><View style={[styles.toggleKnob,save.settings[key]&&styles.toggleKnobOn]} /></View></Pressable>)}</View>
    <View style={styles.settingsCard}><Text style={styles.sectionTitle}>Player & cloud</Text><TextInput value={nameDraft} onChangeText={setNameDraft} maxLength={20} placeholder="Happy Capy" style={styles.nameInput} autoCapitalize="words" /><Pressable onPress={() => savePlayerName()} style={styles.refreshButton}><Text style={styles.rewardButtonText}>Save player name</Text></Pressable><Text style={styles.syncStatus}>{cloudStatus === 'online' ? '● Cloud save connected' : cloudStatus === 'connecting' ? '● Connecting…' : '○ Playing offline — enable anonymous sign-ins in Supabase'} </Text></View>
    <View style={styles.settingsCard}><Text style={styles.sectionTitle}>Privacy</Text><Text style={styles.privacyText}>Capybara Hop stores game progress, a player-chosen display name, gameplay events, and leaderboard scores. It does not require your real name. Advertising consent will be requested before personalized advertising is enabled.</Text><Pressable onPress={() => Linking.openURL('mailto:dballas88@gmail.com?subject=Capybara%20Hop%20Support')} style={styles.refreshButton}><Text style={styles.rewardButtonText}>Contact support</Text></Pressable><Pressable onPress={() => { setSave(current => ({...current,progress:{...current.progress,tutorialComplete:false}})); setShowTutorial(true); setTutorialStep(0); setScreen('game'); }}><Text style={styles.homeLink}>Replay tutorial</Text></Pressable></View>
    <Text style={styles.finePrint}>Capybara Hop! version 3.19.0</Text>
  </ScrollView></LinearGradient>;

  if (screen === 'leaderboard') return <LinearGradient colors={['#C8F0E2', '#FFF3BF']} style={styles.fill}><StatusBar style="dark" /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.shopContent}>
    <View style={styles.topRow}><Pressable onPress={() => setScreen('home')} style={styles.roundButton}><Text style={styles.roundButtonText}>‹</Text></Pressable><Text selectable style={styles.shopTitle}>Top Hoppers</Text><Text style={{fontSize:32}}>🏆</Text></View>
    <View style={styles.yourScoreCard}><Text style={styles.gameOverEyebrow}>{save.displayName.toUpperCase()}</Text><Text style={styles.finalScore}>{save.bestScore}</Text><Text style={styles.syncStatus}>{cloudStatus==='online'?'Cloud leaderboard connected':'Offline scores stay on this device'}</Text></View>
    <View style={styles.segmentRow}>{(['weekly','all-time'] as LeaderboardPeriod[]).map(period => <Pressable key={period} onPress={() => setLeaderboardPeriod(period)} style={[styles.segment,leaderboardPeriod===period&&styles.segmentActive]}><Text style={[styles.segmentText,leaderboardPeriod===period&&styles.segmentTextActive]}>{period==='weekly'?'This week':'All time'}</Text></Pressable>)}</View>
    <View style={styles.segmentRow}>{(['standard','boosted'] as LeaderboardMode[]).map(mode => <Pressable key={mode} onPress={() => setLeaderboardMode(mode)} style={[styles.segment,leaderboardMode===mode&&styles.segmentActive]}><Text style={[styles.segmentText,leaderboardMode===mode&&styles.segmentTextActive]}>{mode==='standard'?'Standard':'Outfit boosts'}</Text></Pressable>)}</View>
    <Pressable onPress={loadLeaderboard} style={styles.refreshButton}><Text style={styles.rewardButtonText}>{leaderboardLoading?'Loading…':'Refresh leaderboard'}</Text></Pressable>
    <View style={styles.board}>{leaderboard.length ? leaderboard.slice(0,20).map((row,index) => <View key={`${row.user_id}-${index}`} style={[styles.boardRow, row.user_id === playerId && styles.youRow]}><Text style={styles.rank}>{index < 3 ? ['🥇','🥈','🥉'][index] : `#${index+1}`}</Text><Text style={styles.playerName}>{row.display_name}{row.user_id===playerId?' • You':''}</Text><Text style={styles.boardScore}>{row.best_score}</Text></View>) : <Text style={styles.emptyBoard}>{leaderboardLoading?'Loading hoppers…':'No scores yet — be the first!'}</Text>}</View>
  </ScrollView></LinearGradient>;

  if (screen === 'shop') return <LinearGradient colors={['#FFF4C8', '#EAF8D9']} style={styles.fill}><StatusBar style="dark" /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.shopContent}>
    <View style={styles.topRow}><Pressable onPress={() => setScreen('home')} style={styles.roundButton}><Text style={styles.roundButtonText}>‹</Text></Pressable><Text selectable style={styles.shopTitle}>Cappy Closet</Text><Pill><Text style={styles.pillText}>🌰 {save.acorns}</Text></Pill></View>
    <Text selectable style={styles.shopSubtitle}>Dress cute. Hop farther.</Text>
    {firstPurchaseCard}
    <View style={styles.storeCard}><Text style={styles.storeTitle}>Optional Ad Rewards</Text><Text style={styles.storeSub}>Only plays when you choose. Daily store limit: 3 acorn ads and 3 booster ads.</Text><Pressable disabled={save.rewardedAds.acorns >= 3} onPress={() => openAcornAd(true)} style={[styles.rewardButton,save.rewardedAds.acorns >= 3&&styles.disabledButton]}><Text style={styles.rewardButtonText}>▶ +25 🌰 • {3-save.rewardedAds.acorns} left today</Text></Pressable><Text style={styles.adChoiceTitle}>Choose one booster • {3-save.rewardedAds.boosters} ads left</Text><View style={styles.adChoiceRow}>{([['shield','🛡️'],['slow','⏳'],['continue','💚'],['triple','✕3']] as const).map(([id,icon])=><Pressable key={id} disabled={save.rewardedAds.boosters >= 3} onPress={()=>requestRewardBooster(id,true)} style={[styles.adChoiceButton,save.rewardedAds.boosters >= 3&&styles.disabledButton]}><Text style={styles.adChoiceIcon}>{icon}</Text><Text style={styles.adChoiceText}>+1</Text></Pressable>)}</View></View>
    <View style={styles.grid}>{OUTFITS.map(outfit => { const owned = save.owned.includes(outfit.id), equipped = save.selected === outfit.id, canAfford = outfit.premium || save.acorns >= outfit.price, perk = OUTFIT_PERKS[outfit.id]; return <View key={outfit.id} style={[styles.outfitCard, outfit.premium && styles.premiumCard]}>
      {outfit.premium && <View style={styles.premiumTag}><Text style={styles.premiumTagText}>PREMIUM</Text></View>}<View style={styles.outfitStage}><Capybara outfit={outfit} size={86} /></View><Text style={styles.outfitMultiplier}>{outfit.premium ? '2x hops' : outfit.price >= 2800 ? '1.5x hops' : outfit.price >= 1500 ? '1.25x hops' : '1x hops'}</Text>
      <Text selectable style={styles.outfitName}>{outfit.name}</Text><Text selectable style={styles.outfitDetail}>{outfit.detail}</Text><Text style={styles.outfitPerk}>{perk ? `✨ ${perk.label}` : '🤎 Classic balance'}</Text><Text style={styles.masteryText}>Mastery Lv. {masteryLevel(save.progress.outfitMastery[outfit.id] ?? 0)}</Text>
      {owned && MASTERY_REWARDS.map(tier => {
        const claimed = save.progress.masteryClaimed.includes(`${outfit.id}:${tier.level}`);
        const ready = masteryLevel(save.progress.outfitMastery[outfit.id] ?? 0) >= tier.level;
        return <Pressable key={tier.level} accessibilityRole="button" disabled={!ready || claimed} onPress={() => collectMastery(outfit.id, tier.level)} style={[styles.claimButton, { width: '100%', minHeight: 44 }, (!ready || claimed) && styles.disabledButton]}><Text style={styles.claimButtonText}>Lv. {tier.level} • {claimed ? 'COLLECTED' : `${tier.reward} ACORNS${ready ? ' • CLAIM' : ''}`}</Text></Pressable>;
      })}
      <Pressable disabled={!owned && !canAfford} onPress={() => buyOrEquip(outfit)} style={[styles.smallButton, equipped && styles.equippedButton, !owned && !canAfford && styles.disabledButton]}><Text style={styles.smallButtonText}>{equipped ? 'Wearing' : owned ? 'Wear' : outfit.premium ? 'Buy' : `🌰 ${outfit.price}`}</Text></Pressable>
    </View>; })}</View><Pressable onPress={restoreOwnedPurchases} style={styles.refreshButton}><Text style={styles.rewardButtonText}>Restore Purchases</Text></Pressable><Text selectable style={styles.finePrint}>{monetizationStatus==='native'?'Store purchases are verified before rewards unlock.':'Expo Go preview: premium purchases activate in an EAS development build or TestFlight.'}</Text>
  </ScrollView></LinearGradient>;

  if (screen === 'game') return <Pressable accessibilityLabel="Jump" onPress={jump} style={styles.fill}><LinearGradient colors={environment.colors} locations={[0,.58,1]} style={styles.fill}><StatusBar style="dark" /><Animated.View style={[styles.gameWorld, { height: Math.min(height, 820) }, worldAnimatedStyle]}>
    <View style={styles.cloudOne}><Text style={styles.cloudText}>☁️</Text></View><View style={styles.cloudTwo}><Text style={styles.cloudText}>☁️</Text></View><View style={styles.distantHill} /><View style={styles.nearHill} />
    <View style={styles.worldBanner}><Text style={styles.worldBannerText}>{environment.name}</Text></View><Text style={styles.worldBackgroundDecor}>{environment.decor}</Text>
    <View style={styles.gameTopRow}><Pressable onPress={event => { event.stopPropagation(); runningRef.current = false; setScreen('home'); setGameState('ready'); }} style={styles.roundButton}><Text style={styles.pauseText}>Ⅱ</Text></Pressable><Animated.View style={[styles.scoreWrap, scoreAnimatedStyle]}><Text selectable style={styles.score}>{score}</Text><Text selectable style={styles.scoreLabel}>HOPS {(tripleHopActive ? 3 : hopMultiplier) > 1 ? `• ${tripleHopActive ? 3 : hopMultiplier}X` : ''}</Text></Animated.View><Pill><Text style={styles.pillText}>BEST {save.bestScore}</Text></Pill></View>
    {gameState === 'playing' && <View style={styles.boosterRail}><Pressable disabled={!save.boosters.shield} onPress={event => { event.stopPropagation(); useBooster('shield'); }} style={[styles.boosterButton,!save.boosters.shield&&styles.disabledButton]}><Text style={styles.boosterEmoji}>🛡️</Text><Text style={styles.boosterCount}>{save.boosters.shield}</Text></Pressable><Pressable disabled={!save.boosters.slow} onPress={event => { event.stopPropagation(); useBooster('slow'); }} style={[styles.boosterButton,!save.boosters.slow&&styles.disabledButton]}><Text style={styles.boosterEmoji}>⏳</Text><Text style={styles.boosterCount}>{save.boosters.slow}</Text></Pressable><Pressable disabled={!save.boosters.triple||tripleHopActive} onPress={event => { event.stopPropagation(); useBooster('triple'); }} style={[styles.boosterButton,(!save.boosters.triple||tripleHopActive)&&styles.disabledButton]}><Text style={styles.tripleBoosterIcon}>3×</Text><Text style={styles.boosterCount}>{save.boosters.triple}</Text></Pressable></View>}
    {activeBooster === 'shield' && <View style={[styles.shieldCountdown, boosterSeconds <= 3 && styles.shieldCountdownEnding]}><Text style={styles.shieldCountdownText}>🛡️ SHIELD {boosterSeconds}s</Text><Text style={styles.shieldCountdownSub}>{boosterSeconds <= 3 ? 'ENDING — GET READY' : 'OBSTACLES ARE SAFE'}</Text></View>}
    {activeBooster === 'shield' && boosterSeconds <= 3 && <View pointerEvents="none" style={styles.shieldEndingOverlay}><Text style={styles.shieldEndingNumber}>{boosterSeconds}</Text><Text style={styles.shieldEndingText}>SHIELD ENDING</Text><Text style={styles.shieldEndingSub}>GET READY TO HOP</Text></View>}
    {activeBooster === 'slow' && <View style={styles.activeBooster}><Text style={styles.activeBoosterText}>⏳ SLOW TIME {boosterSeconds}s</Text></View>}
    {continueGracePasses > 0 && <View style={styles.activeBooster}><Text style={styles.activeBoosterText}>💚 SAFE START • FIRST OBSTACLE</Text></View>}
    {tripleHopActive && <View style={styles.tripleActive}><Text style={styles.tripleActiveText}>⚡ 3× HOPS • TRIPLE JUMP</Text></View>}
    {(flightPasses > 0 || phasePasses > 0) && <View style={styles.collectibleEffect}><Text style={styles.collectibleEffectText}>{flightPasses > 0 ? `🫘 FLYING • ${flightPasses} LEFT` : `🍓 PHASE • ${phasePasses} LEFT`}</Text></View>}
    {showDoubleJumpWarning && <View style={styles.doubleJumpWarning}><Text style={styles.doubleJumpWarningText}>DOUBLE JUMP AHEAD</Text><Text style={styles.doubleJumpWarningSub}>get ready • tap twice</Text></View>}
    {bonusType && <Animated.View style={[styles.bonusCollectible, { left: 0, bottom: GROUND_HEIGHT + bonusY - 22 }, bonusAnimatedStyle]}><Image source={BONUS_SPRITES[bonusType]} style={styles.bonusImage} contentFit="contain" transition={0} /><Text style={styles.bonusHint}>{bonusType === 'melon' ? `+${5+(selectedPerk?.melonBonus??0)}` : bonusType === 'legume' ? `FLY ${3+(selectedPerk?.extraPasses??0)}` : `PHASE ${3+(selectedPerk?.extraPasses??0)}`}</Text></Animated.View>}
    <Animated.View pointerEvents="none" style={[styles.landingDust, dustAnimatedStyle]}><View style={styles.dustCloudLarge} /><View style={styles.dustCloudSmall} /></Animated.View>
    <Animated.View style={[styles.capyPosition, { bottom: GROUND_HEIGHT - 7 }, capyAnimatedStyle]}>{activeBooster === 'shield' && <View pointerEvents="none" style={[styles.shieldAura, boosterSeconds <= 3 && motionFrame && styles.shieldAuraFlicker]} />}<Capybara outfit={selectedOutfit} jumping={isAirborne || flightPasses > 0} motion={motionFrame} /></Animated.View>
    <Animated.View style={[styles.obstacleWrap, { left: 0, bottom: GROUND_HEIGHT }, obstacleAnimatedStyle]}><View style={{ transform: [{ scaleY: obstacleTall ? 2.85 : obstacleType === 'tallStack' ? 2.15 : 1 }, ...(obstacleType === 'jaguar' ? [{ translateX: motionFrame ? -5 : 0 }, { scale: motionFrame ? 1.08 : 1 }] : [])], transformOrigin: 'bottom' }}><Obstacle type={obstacleType} world={save.selectedWorld} motion={motionFrame} /></View>{(obstacleTall || obstacleType === 'tallStack') && <View style={styles.doubleJumpFlag}><Text style={styles.doubleJumpFlagText}>DOUBLE!</Text></View>}{obstacleType === 'jaguar' && <View style={styles.jaguarFlag}><Text style={styles.jaguarFlagText}>JAGUAR!</Text></View>}</Animated.View>
    <View style={[styles.ground, { height: GROUND_HEIGHT, backgroundColor: environment.ground }]}><View style={[styles.grassLine,{backgroundColor:environment.edge,borderTopColor:environment.edge}]} /><Text style={[styles.groundBits,{color:save.selectedWorld==='volcano'?'#F69B54':'#87623E'}]}>{environment.bits}</Text></View>
    {gameState === 'ready' && <View style={styles.readyStack}>{preRunLoadout}<View style={styles.centerCard}><Text style={styles.readyEmoji}>☝️☝️</Text><Text selectable style={styles.readyTitle}>Tap twice to double jump!</Text><Text selectable style={styles.readyText}>Save the second hop for tall obstacles.</Text><Pressable onPress={event => { event.stopPropagation(); setShowFruitGuide(true); }} style={styles.guideButton}><Text style={styles.guideButtonText}>🍉 Learn power-ups</Text></Pressable></View></View>}
    {continueCountdown > 0 && <View style={styles.countdownOverlay}><Text style={styles.countdownReady}>GET READY</Text><Text style={styles.countdownNumber}>{continueCountdown}</Text></View>}
    {!!milestonePop && <View style={styles.milestonePop}><Text style={styles.milestoneTitle}>MILESTONE CHEST!</Text><Text style={styles.milestoneText}>{milestonePop} hops • +25 🌰</Text></View>}
    {!!worldRewardPop && <View style={[styles.milestonePop,styles.worldRewardPop]}><Text style={styles.milestoneTitle}>WORLD STAR CHEST!</Text><Text style={styles.milestoneText}>New world record • +{worldRewardPop} 🌰</Text></View>}
    {gameState === 'gameover' && <View style={styles.gameOverCard}>{newHighScore && <Animated.View style={[styles.highScorePop, highScoreAnimatedStyle]}><Text style={styles.highScorePopText}>NEW HIGH SCORE!</Text><Text style={styles.highScorePopSub}>🎉 TOP HOPPER 🎉</Text></Animated.View>}<Text selectable style={styles.gameOverEyebrow}>{continuedRunRef.current ? 'CONTINUED RUN COMPLETE' : 'ROUND COMPLETE'}</Text><Text style={styles.resultsLabel}>HOPS</Text><Text selectable style={styles.finalScore}>{score}</Text><Text selectable style={styles.earned}>🌰 +{earned} ACORNS</Text>{!continuedRunRef.current && (save.boosters.continue > 0 ? <Pressable onPress={event => { event.stopPropagation(); setShowContinuePrompt(true); }} style={styles.continueButton}><Text style={styles.continueText}>💚 Continue from {score}  •  {save.boosters.continue} left</Text></Pressable> : <Pressable onPress={event => { event.stopPropagation(); requestRewardBooster('continue'); }} style={styles.continueButton}><Text style={styles.continueText}>▶ Watch ad for Continue</Text></Pressable>)}<Pressable onPress={event => { event.stopPropagation(); startRun(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Hop again</Text></Pressable><Pressable onPress={event => { event.stopPropagation(); setScreen('home'); }}><Text style={styles.homeLink}>Back home</Text></Pressable></View>}
  </Animated.View></LinearGradient><RewardModal /><ContinueModal /><TutorialModal />{fruitGuide}</Pressable>;

  return <LinearGradient colors={['#F9F0B7', '#BCEACD']} style={styles.fill}><StatusBar style="dark" /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.homeContent}>
    <View style={styles.homeTop}><Pill><Text style={styles.pillText}>🌰 {save.acorns}</Text></Pill><Pill dark><Text style={[styles.pillText, { color: '#FFF' }]}>BEST {save.bestScore}</Text></Pill></View>
    <View style={styles.logoWrap}><Text selectable style={styles.logoSmall}>CAPYBARA</Text><Text selectable style={styles.logoBig}>HOP!</Text><Text selectable style={styles.tagline}>tiny legs • big adventure</Text></View>
    <View style={[styles.heroStage,{backgroundColor:environment.colors[1]}]}><Text style={styles.sun}>{save.selectedWorld==='volcano'?'🌋':save.selectedWorld==='snow'?'❄️':'☀️'}</Text><Text style={styles.heroPlant}>{environment.decor.split('  ')[0]}</Text><Text style={styles.heroPlantTwo}>{environment.decor.split('  ')[1]}</Text><Capybara outfit={selectedOutfit} size={150} jumping /><Pressable onPress={()=>setScreen('missions')} style={styles.homeWorldPill}><Text style={styles.homeWorldText}>{environment.name} • Change{featuredWorld===save.selectedWorld?' • +50% 🌰':''}</Text></Pressable></View>
    <Pressable onPress={() => setShowFruitGuide(true)} style={styles.fruitGuideCard}><View style={styles.fruitGuideHeader}><Text style={styles.fruitGuideCardTitle}>POWER-UP GUIDE</Text><Text style={styles.guideArrow}>›</Text></View><View style={styles.fruitGuideMiniRow}><Text style={styles.fruitGuideMini}>🍉 +5 hops</Text><Text style={styles.fruitGuideMini}>🫘 fly 3</Text><Text style={styles.fruitGuideMini}>🍓 phase 3</Text></View><Text style={styles.fruitGuideCardSub}>Learn what each bonus does before your next run</Text></Pressable>
    <View style={styles.equippedPerk}><Text style={styles.equippedPerkTitle}>{selectedOutfit.name.toUpperCase()} PERK</Text><Text style={styles.equippedPerkText}>{selectedPerk?.label ?? 'Classic balanced hopping'}</Text></View>
    <Pressable onPress={openGame} style={styles.primaryButton}><Text style={styles.primaryButtonText}>PLAY</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setScreen('missions')} style={styles.nextWorldCard}><Text style={styles.nextWorldText}>WEEKLY CHALLENGES • 375 ACORNS TOTAL</Text><Text style={styles.worldMapHint}>Three goals to work toward across your runs. Tap to view.</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setScreen('missions')} style={styles.nextWorldCard}><Text style={styles.nextWorldText}>ADVENTURE PASSPORT</Text><Text style={styles.nextWorldCount}>{save.progress.journeyObstacles} obstacles cleared • {JOURNEY_REWARDS.filter(tier => save.progress.journeyObstacles >= tier.goal && !save.progress.journeyClaimed.includes(tier.goal)).length} rewards ready</Text><Text style={styles.worldMapHint}>Tap to see your next acorn milestone</Text></Pressable>
    <Pressable disabled={save.progress.lastDailyClaim === today()} onPress={collectDailyReward} style={[styles.homeDaily,save.progress.lastDailyClaim === today()&&styles.claimedCard]}><Text style={styles.homeDailyEmoji}>🎁</Text><View style={{flex:1}}><Text style={styles.homeDailyTitle}>Daily streak • Day {save.progress.streakDays || 1}</Text><Text style={styles.homeDailyText}>{save.progress.lastDailyClaim === today()?'Collected — new reward tomorrow':`Tap to collect ${25 + Math.min(save.progress.streakDays + 1,7)*5} acorns`}</Text></View><Text style={styles.claimText}>{save.progress.lastDailyClaim === today()?'✓':'CLAIM'}</Text></Pressable>
    {nextWorld && <View style={styles.nextWorldCard}><Text style={styles.nextWorldText}>NEXT WORLD • {nextWorld.name}</Text><Text style={styles.nextWorldCount}>{nextWorld.unlock-save.bestScore} hops to unlock</Text><View style={styles.progressTrack}><View style={[styles.progressFill,{width:`${Math.min(100,Math.round(save.bestScore/nextWorld.unlock*100))}%`}]} /></View></View>}
    <View style={styles.homeActions}><Pressable onPress={() => setScreen('shop')} style={styles.secondaryButton}><Text style={styles.secondaryEmoji}>👒</Text><Text style={styles.secondaryText}>Cappy Store</Text></Pressable><Pressable onPress={() => setScreen('shop')} style={styles.secondaryButton}><Text style={styles.secondaryEmoji}>🎁</Text><Text style={styles.secondaryText}>Optional rewards</Text></Pressable></View><Text selectable style={styles.tip}>Tap twice for a double jump over tall obstacles.</Text>
    <View style={styles.homeActions}><Pressable onPress={() => setScreen('missions')} style={styles.secondaryButton}><Text style={styles.secondaryEmoji}>🎯</Text><Text style={styles.secondaryText}>Daily quests</Text></Pressable><Pressable onPress={() => setScreen('settings')} style={styles.secondaryButton}><Text style={styles.secondaryEmoji}>⚙️</Text><Text style={styles.secondaryText}>Settings</Text></Pressable></View>
    <Pressable onPress={() => setScreen('leaderboard')} style={styles.leaderboardButton}><Text style={styles.secondaryEmoji}>🏆</Text><Text style={styles.leaderboardText}>Weekly & All-Time Leaderboards</Text></Pressable>
    <View style={styles.boosterCard}><View style={styles.boosterHeader}><View><Text style={styles.boosterTitle}>Daily Boosters</Text><Text style={styles.boosterSub}>1 free of all four each day</Text></View><Pressable onPress={buyBoosterPack} style={styles.buyPack}><Text style={styles.buyPackText}>Original +3 • $0.99</Text></Pressable></View><View style={styles.boosterGrid}>{([['shield','🛡️','Shield','10s invincible'],['slow','⏳','Slow Time','10s slower'],['continue','💚','Continue','Resume safely'],['triple','⚡','Triple Hop','3× full run']] as const).map(([id,emoji,name,desc]) => <View key={id} style={styles.boosterItem}><Text style={styles.boosterBig}>{emoji}</Text><Text style={styles.boosterName}>{name}</Text><Text style={styles.boosterDesc}>{desc}</Text><Text style={styles.boosterOwned}>Owned {save.boosters[id]}</Text>{save.boosters[id] === 0 && <Pressable onPress={() => requestRewardBooster(id)} style={styles.miniAdButton}><Text style={styles.miniAdText}>▶ Free</Text></Pressable>}</View>)}</View><View style={styles.monetizeRow}><Pressable onPress={buyTriplePack} style={styles.buyPack}><Text style={styles.buyPackText}>+3 Triple Hop • $0.99</Text></Pressable><Pressable onPress={() => convertAcornsToBoosters(100, 1)} disabled={save.acorns < 100} style={[styles.monetizeButton, save.acorns < 100 && styles.disabledButton]}><Text style={styles.monetizeButtonText}>🌰 100 → +1 original each</Text></Pressable></View></View>
    <View style={styles.storeCard}><Text style={styles.storeTitle}>Cappy Store</Text><Text style={styles.storeSub}>{monetizationStatus==='native'?'Secure purchases powered by the App Store • no automatic ads':'Preview mode • all ads remain optional'}</Text><View style={styles.monetizeRow}><Pressable onPress={() => buyAcorns(250)} style={styles.storeButton}><Text style={styles.storeButtonText}>250 🌰 • $0.99</Text></Pressable><Pressable onPress={() => buyAcorns(1500)} style={styles.storeButton}><Text style={styles.storeButtonText}>1,500 🌰 • $4.99</Text></Pressable></View><View style={styles.monetizeRow}><Pressable onPress={() => buyAcorns(4000)} style={styles.storeButton}><Text style={styles.storeButtonText}>4,000 🌰 • $9.99</Text></Pressable><Pressable onPress={unlockAllOutfits} style={styles.unlockButton}><Text style={styles.storeButtonText}>Unlock all • $19.99</Text></Pressable></View><Pressable onPress={() => openAcornAd(true)} disabled={save.rewardedAds.acorns >= 3} style={[styles.rewardButton,save.rewardedAds.acorns >= 3&&styles.disabledButton]}><Text style={styles.rewardButtonText}>▶ +25 🌰 • {3-save.rewardedAds.acorns} left today</Text></Pressable><View style={styles.adChoiceRow}>{([['shield','🛡️'],['slow','⏳'],['continue','💚'],['triple','✕3']] as const).map(([id,icon])=><Pressable key={id} disabled={save.rewardedAds.boosters >= 3} onPress={()=>requestRewardBooster(id,true)} style={[styles.adChoiceButton,save.rewardedAds.boosters >= 3&&styles.disabledButton]}><Text style={styles.adChoiceIcon}>{icon}</Text><Text style={styles.adChoiceText}>+1</Text></Pressable>)}</View><Text style={styles.storeSub}>{3-save.rewardedAds.boosters} optional booster ads left today</Text><Pressable onPress={restoreOwnedPurchases}><Text style={styles.homeLink}>Restore Purchases</Text></Pressable></View>
  </ScrollView><RewardModal /><TutorialModal />{fruitGuide}<NameOnboardingModal visible={showNameOnboarding} nameDraft={nameDraft} onChangeName={setNameDraft} onSubmit={() => savePlayerName(true)} /></LinearGradient>;
}

export default function App() {
  return <GameErrorBoundary><GameApp /></GameErrorBoundary>;
}

const styles = StyleSheet.create({capyFrame:{position:'absolute',width:'100%',height:'100%'},highScorePop:{backgroundColor:'#F6B83D',borderRadius:22,paddingHorizontal:18,paddingVertical:10,alignItems:'center'},highScorePopText:{color:'#FFFDF0',fontSize:22,fontWeight:'900',letterSpacing:1,textAlign:'center'},highScorePopSub:{color:'#FFF5B8',fontSize:10,fontWeight:'900',letterSpacing:2,marginTop:2},resultsLabel:{color:'#71806D',fontSize:10,fontWeight:'900',letterSpacing:3},
  fill:{flex:1},homeContent:{flexGrow:1,paddingHorizontal:24,paddingTop:24,paddingBottom:34,alignItems:'center',gap:18},homeTop:{width:'100%',flexDirection:'row',justifyContent:'space-between'},pill:{backgroundColor:'#FFF9E5',borderRadius:99,paddingHorizontal:16,paddingVertical:9,boxShadow:'0 4px 0 rgba(77,79,39,.14)'},pillText:{color:'#39513B',fontWeight:'900',fontSize:14,fontVariant:['tabular-nums']},logoWrap:{alignItems:'center'},buildBadge:{color:'#FFFFFF',backgroundColor:'#4E8055',fontSize:10,fontWeight:'900',letterSpacing:1.4,paddingHorizontal:12,paddingVertical:5,borderRadius:99,overflow:'hidden',marginBottom:5},logoSmall:{color:'#527441',fontSize:22,fontWeight:'900',letterSpacing:7},logoBig:{color:'#F27D4C',fontSize:70,lineHeight:74,fontWeight:'900',letterSpacing:-3,textShadowColor:'#FFF8D8',textShadowOffset:{width:0,height:4},textShadowRadius:0},tagline:{color:'#57705C',fontWeight:'700',letterSpacing:1.2},heroStage:{height:215,width:'100%',alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.28)',borderRadius:42,borderCurve:'continuous',overflow:'hidden'},sun:{position:'absolute',right:28,top:16,fontSize:42},heroPlant:{position:'absolute',left:20,bottom:12,fontSize:55},heroPlantTwo:{position:'absolute',right:20,bottom:15,fontSize:35},homeWorldPill:{position:'absolute',bottom:10,alignSelf:'center',backgroundColor:'rgba(48,75,56,.86)',borderRadius:99,paddingHorizontal:14,paddingVertical:7},homeWorldText:{color:'#FFF',fontWeight:'900',fontSize:11},
  primaryButton:{width:'100%',maxWidth:360,minHeight:64,alignItems:'center',justifyContent:'center',backgroundColor:'#F06E45',borderRadius:24,borderCurve:'continuous',borderBottomWidth:7,borderBottomColor:'#BD4A2C',boxShadow:'0 7px 15px rgba(125,62,35,.2)'},primaryButtonText:{color:'#FFFDF2',fontSize:22,fontWeight:'900',letterSpacing:1},equippedPerk:{width:'100%',maxWidth:360,backgroundColor:'rgba(255,251,231,.86)',borderRadius:16,paddingHorizontal:14,paddingVertical:9,alignItems:'center',borderWidth:1,borderColor:'#E9DCA9'},equippedPerkTitle:{color:'#A16535',fontSize:9,fontWeight:'900',letterSpacing:1.2},equippedPerkText:{color:'#3E5B42',fontSize:12,fontWeight:'900',paddingTop:2},homeDaily:{width:'100%',maxWidth:360,minHeight:66,flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF7D8',borderRadius:20,borderCurve:'continuous',paddingHorizontal:14,borderWidth:2,borderColor:'#F2C65B'},homeDailyEmoji:{fontSize:31},homeDailyTitle:{color:'#3E5941',fontSize:14,fontWeight:'900'},homeDailyText:{color:'#73806D',fontSize:10,fontWeight:'700',paddingTop:2},nextWorldCard:{width:'100%',maxWidth:360,backgroundColor:'rgba(255,255,255,.55)',borderRadius:18,padding:12,gap:6},nextWorldText:{color:'#45604A',fontSize:11,fontWeight:'900',letterSpacing:.8},nextWorldCount:{color:'#C16C39',fontSize:11,fontWeight:'800'},homeActions:{flexDirection:'row',gap:12,width:'100%',maxWidth:360},secondaryButton:{flex:1,minHeight:82,backgroundColor:'#FFFAE9',borderRadius:22,borderCurve:'continuous',alignItems:'center',justifyContent:'center',borderBottomWidth:4,borderBottomColor:'#D6CCA3'},secondaryEmoji:{fontSize:27},secondaryText:{color:'#3F583F',fontWeight:'800',fontSize:14},tip:{color:'#66806B',fontWeight:'600',fontSize:13},gameWorld:{flex:1,overflow:'hidden'},distantHill:{position:'absolute',left:-100,right:-100,bottom:GROUND_HEIGHT-14,height:160,borderRadius:999,backgroundColor:'rgba(90,178,112,.25)'},nearHill:{position:'absolute',left:130,right:-190,bottom:GROUND_HEIGHT-20,height:105,borderRadius:999,backgroundColor:'rgba(48,142,79,.2)'},gameTopRow:{position:'absolute',zIndex:3,left:18,right:18,top:52,flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},roundButton:{width:47,height:47,borderRadius:99,alignItems:'center',justifyContent:'center',backgroundColor:'#FFF9E8',boxShadow:'0 4px 0 rgba(45,68,49,.18)'},roundButtonText:{fontSize:34,lineHeight:38,color:'#38543E',fontWeight:'800'},pauseText:{color:'#38543E',fontSize:18,fontWeight:'900'},scoreWrap:{alignItems:'center'},score:{color:'#37553D',fontWeight:'900',fontSize:42,lineHeight:44,fontVariant:['tabular-nums']},scoreLabel:{color:'#5F7764',fontSize:10,letterSpacing:3,fontWeight:'900'},cloudOne:{position:'absolute',top:140,left:20,opacity:.75},cloudTwo:{position:'absolute',top:235,right:28,opacity:.55,transform:[{scale:1.4}]},cloudText:{fontSize:56},capyPosition:{position:'absolute',left:CAPY_X,zIndex:2},
  landingDust:{position:'absolute',left:CAPY_X+22,bottom:GROUND_HEIGHT+3,width:72,height:22,zIndex:1},dustCloudLarge:{position:'absolute',left:2,bottom:0,width:42,height:15,borderRadius:99,backgroundColor:'rgba(255,238,184,.72)'},dustCloudSmall:{position:'absolute',right:3,bottom:2,width:27,height:10,borderRadius:99,backgroundColor:'rgba(255,248,214,.82)'},obstacleWrap:{position:'absolute',width:72,height:86,zIndex:1,justifyContent:'flex-end'},obstacle:{width:50,height:47,backgroundColor:'#86502E',borderRadius:13,borderCurve:'continuous',borderBottomWidth:6,borderBottomColor:'#60361F'},logEnd:{position:'absolute',right:-4,top:3,width:18,height:37,borderRadius:99,backgroundColor:'#B97B49',borderWidth:3,borderColor:'#734326'},logStripe:{position:'absolute',left:14,top:0,bottom:5,width:5,backgroundColor:'#663B24'},logLeaf:{position:'absolute',top:-22,left:5,fontSize:25},rock:{width:55,height:40,borderTopLeftRadius:28,borderTopRightRadius:18,borderBottomLeftRadius:10,borderBottomRightRadius:14,backgroundColor:'#687780',borderBottomWidth:7,borderBottomColor:'#46535A'},rockHighlight:{width:18,height:8,borderRadius:99,backgroundColor:'#D8E2E2',marginLeft:10,marginTop:8,transform:[{rotate:'-18deg'}]},worldObstacleAccent:{position:'absolute',right:-6,top:-18,fontSize:17},stump:{width:46,height:54,borderRadius:9,backgroundColor:'#825031',borderBottomWidth:6,borderBottomColor:'#53301E'},stumpTop:{position:'absolute',top:-5,left:-3,width:52,height:16,borderRadius:99,backgroundColor:'#B77B4D',borderWidth:3,borderColor:'#684027'},stumpTwig:{position:'absolute',right:-17,top:-25,fontSize:27},mushroomGroup:{width:70,height:40,justifyContent:'flex-end'},mushrooms:{fontSize:31,letterSpacing:-10},puddle:{width:70,height:17,borderRadius:99,backgroundColor:'#3D9FCA',borderBottomWidth:4,borderBottomColor:'#237DA5',transform:[{scaleY:.72}]},lavaPuddle:{backgroundColor:'#FF6A2E',borderBottomColor:'#A52E22'},icePuddle:{backgroundColor:'#BDEBFA',borderBottomColor:'#70B7D2'},puddleShine:{width:27,height:4,borderRadius:99,backgroundColor:'#EAFBFF',marginLeft:11,marginTop:3},tallStack:{width:46,height:82,justifyContent:'flex-end',alignItems:'center'},stackFace:{fontSize:39,lineHeight:37},ground:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#B88954'},grassLine:{height:18,backgroundColor:'#75A84E',borderTopWidth:6,borderTopColor:'#5A913E'},groundBits:{fontSize:17,color:'#87623E',letterSpacing:7,paddingTop:15},centerCard:{alignSelf:'center',alignItems:'center',backgroundColor:'rgba(255,253,237,.92)',paddingHorizontal:30,paddingVertical:20,borderRadius:28,borderCurve:'continuous',gap:5},readyStack:{position:'absolute',top:'21%',alignSelf:'center',alignItems:'center',gap:12,width:'92%',zIndex:6},preRunLoadout:{width:'100%',backgroundColor:'rgba(255,253,237,.96)',paddingHorizontal:12,paddingVertical:11,borderRadius:24,borderCurve:'continuous',gap:5,boxShadow:'0 5px 12px rgba(52,76,57,.18)'},preRunTitle:{color:'#36543C',fontWeight:'900',fontSize:12,letterSpacing:1,textAlign:'center'},preRunHint:{color:'#718171',fontWeight:'700',fontSize:10,textAlign:'center'},preRunGrid:{flexDirection:'row',gap:6,justifyContent:'center'},preRunBooster:{flex:1,minHeight:67,borderRadius:15,backgroundColor:'#F3F3D9',alignItems:'center',justifyContent:'center',paddingVertical:6},preRunBoosterSelected:{backgroundColor:'#D9F0C9',borderWidth:2,borderColor:'#5E9B61'},preRunEmoji:{fontSize:21},preRunTriple:{fontSize:19,fontWeight:'900',color:'#9A4CC0'},preRunLabel:{color:'#3E5541',fontWeight:'900',fontSize:10},preRunCount:{color:'#D46743',fontWeight:'900',fontSize:8,marginTop:2},preRunNote:{color:'#477354',fontWeight:'800',fontSize:9,textAlign:'center'},readyEmoji:{fontSize:32},readyTitle:{color:'#36543C',fontWeight:'900',fontSize:21,textAlign:'center'},readyText:{color:'#627766',fontWeight:'600',textAlign:'center'},
  gameOverCard:{position:'absolute',zIndex:5,alignSelf:'center',top:'22%',width:'84%',maxWidth:370,backgroundColor:'#FFF9E8',padding:24,borderRadius:34,borderCurve:'continuous',alignItems:'center',gap:12,boxShadow:'0 15px 30px rgba(48,65,43,.22)'},gameOverEyebrow:{color:'#67805F',fontWeight:'900',letterSpacing:2},finalScore:{color:'#34523A',fontSize:68,lineHeight:70,fontWeight:'900',fontVariant:['tabular-nums']},earned:{color:'#A26C2B',fontSize:18,fontWeight:'900'},rewardButton:{width:'100%',minHeight:48,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#E9F3D4'},rewardButtonText:{color:'#45623F',fontWeight:'900'},homeLink:{color:'#617267',padding:8,fontWeight:'800'},shopContent:{paddingHorizontal:18,paddingTop:22,paddingBottom:40,gap:10},topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},shopTitle:{color:'#38513A',fontSize:27,fontWeight:'900'},shopSubtitle:{color:'#6B795F',fontSize:15,fontWeight:'700',textAlign:'center',paddingBottom:8},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},outfitCard:{width:'48%',flexGrow:1,minWidth:145,backgroundColor:'#FFFBEC',borderRadius:25,borderCurve:'continuous',padding:13,alignItems:'center',gap:7,borderWidth:2,borderColor:'#ECE2BB'},premiumCard:{borderColor:'#F6A9B5',backgroundColor:'#FFF4F1'},premiumTag:{position:'absolute',top:9,right:9,zIndex:2,backgroundColor:'#E75D77',borderRadius:99,paddingHorizontal:7,paddingVertical:4},premiumTagText:{color:'#FFF',fontSize:8,fontWeight:'900',letterSpacing:.7},outfitStage:{height:102,justifyContent:'flex-end'},outfitName:{color:'#354A36',fontSize:16,fontWeight:'900',textAlign:'center'},outfitDetail:{color:'#73806D',fontSize:11,fontWeight:'600'},smallButton:{minWidth:100,backgroundColor:'#F17A50',borderRadius:14,paddingHorizontal:14,paddingVertical:10,alignItems:'center'},equippedButton:{backgroundColor:'#6B9953'},disabledButton:{opacity:.4},smallButtonText:{color:'#FFF',fontWeight:'900'},finePrint:{color:'#7C8172',fontSize:11,lineHeight:16,textAlign:'center',paddingHorizontal:18,paddingTop:8},
  modalShade:{flex:1,backgroundColor:'rgba(38,47,39,.62)',alignItems:'center',justifyContent:'center',padding:24},adPreview:{width:'100%',maxWidth:370,backgroundColor:'#FFF9E8',borderRadius:30,borderCurve:'continuous',alignItems:'center',padding:24,gap:13},nameCard:{width:'100%',maxWidth:380,backgroundColor:'#FFF9E8',borderRadius:34,borderCurve:'continuous',alignItems:'center',padding:24,gap:14,boxShadow:'0 18px 38px rgba(31,52,36,.3)'},fruitGuideModal:{width:'100%',maxWidth:390,backgroundColor:'#FFF9E8',borderRadius:30,borderCurve:'continuous',padding:22,gap:12,boxShadow:'0 18px 38px rgba(31,52,36,.3)'},fruitGuideList:{width:'100%',gap:9},fruitGuideRow:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:'#F1F5D9',borderRadius:17,padding:10},fruitGuideImage:{width:52,height:52},fruitGuideCopy:{flex:1,gap:3},fruitGuideName:{color:'#355039',fontSize:15,fontWeight:'900'},fruitGuideText:{color:'#657166',fontSize:12,lineHeight:17},fruitGuideCard:{width:'100%',maxWidth:360,backgroundColor:'#FFF9E8',borderRadius:20,borderCurve:'continuous',padding:14,gap:8,borderWidth:1,borderColor:'#E9DCA9'},fruitGuideHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},fruitGuideCardTitle:{color:'#A16535',fontSize:11,fontWeight:'900',letterSpacing:1.2},guideArrow:{color:'#F27D4C',fontSize:27,fontWeight:'900',lineHeight:24},fruitGuideMiniRow:{flexDirection:'row',justifyContent:'space-between'},fruitGuideMini:{color:'#3E5B42',fontWeight:'900',fontSize:11},fruitGuideCardSub:{color:'#73806D',fontSize:11,fontWeight:'700'},guideButton:{marginTop:7,backgroundColor:'#E8F2D2',borderRadius:99,paddingHorizontal:13,paddingVertical:8},guideButtonText:{color:'#477354',fontWeight:'900',fontSize:11},nameCapy:{fontSize:68,lineHeight:74,backgroundColor:'#E6F3D2',width:104,height:104,borderRadius:52,textAlign:'center',paddingTop:14,overflow:'hidden'},nameSuggestions:{width:'100%',flexDirection:'row',gap:6},nameSuggestion:{flex:1,minHeight:39,backgroundColor:'#E8F2D2',borderRadius:12,alignItems:'center',justifyContent:'center',paddingHorizontal:3},nameSuggestionText:{color:'#49634A',fontSize:9,fontWeight:'900',textAlign:'center'},adLabel:{color:'#889083',fontSize:10,fontWeight:'900',letterSpacing:1.6},adEmoji:{fontSize:58},adTitle:{color:'#355039',fontSize:25,fontWeight:'900'},adBody:{color:'#657166',lineHeight:20,textAlign:'center'},
  leaderboardButton:{width:'100%',maxWidth:360,minHeight:60,borderRadius:20,backgroundColor:'#FFF9E8',flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center',borderBottomWidth:4,borderBottomColor:'#D7CA94'},leaderboardText:{color:'#3D573F',fontWeight:'900',fontSize:16},yourScoreCard:{alignItems:'center',backgroundColor:'#FFF9E9',borderRadius:28,padding:18,boxShadow:'0 8px 18px rgba(55,81,58,.14)'},refreshButton:{alignSelf:'center',backgroundColor:'#E8F4D5',borderRadius:99,paddingHorizontal:20,paddingVertical:12},board:{backgroundColor:'#FFFDF3',borderRadius:26,overflow:'hidden'},boardRow:{minHeight:58,flexDirection:'row',alignItems:'center',paddingHorizontal:17,borderBottomWidth:1,borderBottomColor:'#EDE8D1'},youRow:{backgroundColor:'#E5F5D2'},rank:{width:48,color:'#687568',fontWeight:'900',fontSize:18},playerName:{flex:1,color:'#3B503E',fontWeight:'800',fontSize:16},boardScore:{color:'#E06C43',fontWeight:'900',fontSize:20,fontVariant:['tabular-nums']},
  boosterCard:{width:'100%',maxWidth:360,backgroundColor:'#FFF9EA',padding:16,borderRadius:24,borderCurve:'continuous',gap:14},boosterHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},boosterTitle:{color:'#38533C',fontWeight:'900',fontSize:19},boosterSub:{color:'#718171',fontWeight:'700',fontSize:12},buyPack:{backgroundColor:'#F06E45',borderRadius:99,paddingHorizontal:12,paddingVertical:9,alignItems:'center',justifyContent:'center'},buyPackText:{color:'#FFF',fontWeight:'900',fontSize:12},boosterGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},boosterItem:{width:'48%',flexGrow:1,alignItems:'center',backgroundColor:'#F3F3D9',borderRadius:17,paddingVertical:10,paddingHorizontal:4},boosterBig:{fontSize:27},boosterName:{color:'#3E5541',fontWeight:'900',fontSize:12},boosterDesc:{color:'#718071',fontSize:9},boosterOwned:{color:'#D46743',fontWeight:'900',fontSize:10,paddingTop:4},miniAdButton:{marginTop:5,backgroundColor:'#477354',borderRadius:99,paddingHorizontal:9,paddingVertical:4},miniAdText:{color:'#FFF',fontWeight:'900',fontSize:9},boosterRail:{position:'absolute',right:16,top:120,zIndex:4,gap:9},boosterButton:{width:50,height:50,borderRadius:17,backgroundColor:'#FFF8E7',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 8px rgba(45,65,48,.2)'},boosterEmoji:{fontSize:23},tripleBoosterIcon:{fontSize:20,fontWeight:'900',color:'#9A4CC0'},boosterCount:{position:'absolute',right:3,bottom:2,color:'#FFF',fontWeight:'900',fontSize:10,backgroundColor:'#E36C45',width:17,height:17,borderRadius:99,textAlign:'center',lineHeight:17},activeBooster:{position:'absolute',top:115,alignSelf:'center',zIndex:3,backgroundColor:'#304F3D',borderRadius:99,paddingHorizontal:15,paddingVertical:8},activeBoosterText:{color:'#FFF',fontWeight:'900',fontSize:12},shieldCountdown:{position:'absolute',top:108,alignSelf:'center',zIndex:6,backgroundColor:'#245F68',borderRadius:22,borderWidth:3,borderColor:'#A8F2E4',paddingHorizontal:22,paddingVertical:10,alignItems:'center',boxShadow:'0 5px 13px rgba(24,81,88,.3)'},shieldCountdownEnding:{backgroundColor:'#C14E38',borderColor:'#FFE09A'},shieldCountdownText:{color:'#FFF',fontSize:20,fontWeight:'900',fontVariant:['tabular-nums'],letterSpacing:.5},shieldCountdownSub:{color:'#D8FFF5',fontSize:10,fontWeight:'900',letterSpacing:1,paddingTop:2},shieldEndingOverlay:{position:'absolute',left:0,right:0,top:'34%',alignItems:'center',zIndex:7},shieldEndingNumber:{color:'#FFF6B2',fontSize:96,lineHeight:100,fontWeight:'900',textShadowColor:'#A53D31',textShadowOffset:{width:0,height:5},textShadowRadius:0},shieldEndingText:{color:'#FFF',fontSize:21,fontWeight:'900',letterSpacing:2,textShadowColor:'#7A2F2A',textShadowOffset:{width:0,height:2},textShadowRadius:4},shieldEndingSub:{color:'#FFE6B5',fontSize:12,fontWeight:'900',letterSpacing:1,paddingTop:3},shieldAura:{position:'absolute',left:-24,top:-24,width:118,height:118,borderRadius:60,borderWidth:5,borderColor:'#A8F2E4',backgroundColor:'rgba(111,231,214,.24)',boxShadow:'0 0 20px rgba(101,239,221,.95)'},shieldAuraFlicker:{opacity:.35},tripleActive:{position:'absolute',top:154,alignSelf:'center',zIndex:3,backgroundColor:'#7C45A1',borderRadius:99,paddingHorizontal:15,paddingVertical:7},tripleActiveText:{color:'#FFF5A8',fontWeight:'900',fontSize:11},
  continueButton:{width:'100%',minHeight:48,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#DFF2C9',borderWidth:2,borderColor:'#88B267'},
  continueText:{color:'#3E673D',fontWeight:'900'},countdownOverlay:{position:'absolute',zIndex:10,top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(37,65,45,.35)'},countdownReady:{color:'#FFF',fontWeight:'900',fontSize:21,letterSpacing:3,textShadowColor:'rgba(0,0,0,.25)',textShadowOffset:{width:0,height:2},textShadowRadius:4},countdownNumber:{color:'#FFF8D2',fontWeight:'900',fontSize:110,lineHeight:120,textShadowColor:'#3E6248',textShadowOffset:{width:0,height:6},textShadowRadius:0},doubleJumpFlag:{position:'absolute',bottom:132,left:-10,backgroundColor:'#E95845',borderRadius:99,paddingHorizontal:8,paddingVertical:4},doubleJumpFlagText:{color:'#FFF',fontSize:8,fontWeight:'900',letterSpacing:1},doubleJumpWarning:{position:'absolute',top:184,alignSelf:'center',zIndex:4,backgroundColor:'#B94D3C',borderRadius:16,paddingHorizontal:14,paddingVertical:8,alignItems:'center',boxShadow:'0 4px 10px rgba(84,38,31,.22)'},doubleJumpWarningText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:1},doubleJumpWarningSub:{color:'#FFE5C9',fontSize:9,fontWeight:'700',marginTop:2},bonusCollectible:{position:'absolute',zIndex:5,width:66,height:76,alignItems:'center',justifyContent:'flex-end'},bonusImage:{width:66,height:66,position:'absolute',top:0},bonusHint:{color:'#FFF',backgroundColor:'#D95643',borderRadius:99,overflow:'hidden',paddingHorizontal:7,paddingVertical:2,fontSize:8,fontWeight:'900'},collectibleEffect:{position:'absolute',top:154,alignSelf:'center',zIndex:5,backgroundColor:'#743F77',borderRadius:99,paddingHorizontal:14,paddingVertical:7},collectibleEffectText:{color:'#FFF',fontWeight:'900',fontSize:11,fontVariant:['tabular-nums']},
  jaguar:{width:84,height:78,alignItems:'center',justifyContent:'flex-end'},jaguarImage:{width:84,height:78},jaguarPounceMotion:{transform:[{translateX:-4},{rotate:'-4deg'}]},jaguarPounce:{position:'absolute',right:-2,top:-6,color:'#FFF',backgroundColor:'#D94E3F',borderRadius:99,fontSize:15,fontWeight:'900',paddingHorizontal:5},jaguarFlag:{position:'absolute',bottom:92,left:-7,backgroundColor:'#5D314D',borderRadius:99,paddingHorizontal:8,paddingVertical:4},jaguarFlagText:{color:'#FFE5B8',fontSize:9,fontWeight:'900',letterSpacing:1},monetizeRow:{flexDirection:'row',gap:8,width:'100%'},monetizeButton:{flex:1,minHeight:40,borderRadius:14,backgroundColor:'#E8F2D2',alignItems:'center',justifyContent:'center',paddingHorizontal:6},monetizeButtonText:{color:'#466445',fontSize:10,fontWeight:'900',textAlign:'center'},storeCard:{width:'100%',maxWidth:360,backgroundColor:'#FFF5D9',padding:16,borderRadius:24,borderCurve:'continuous',gap:10,borderWidth:2,borderColor:'#EED58C'},storeTitle:{color:'#704D2E',fontSize:19,fontWeight:'900'},storeSub:{color:'#8B755E',fontSize:10,fontWeight:'600',lineHeight:14},storeButton:{flex:1,minHeight:43,borderRadius:14,backgroundColor:'#F07A50',alignItems:'center',justifyContent:'center',paddingHorizontal:5},unlockButton:{flex:1,minHeight:43,borderRadius:14,backgroundColor:'#A556B0',alignItems:'center',justifyContent:'center',paddingHorizontal:5},storeButtonText:{color:'#FFF',fontSize:10,fontWeight:'900',textAlign:'center'},adChoiceTitle:{color:'#704D2E',fontSize:11,fontWeight:'900',paddingTop:2},adChoiceRow:{flexDirection:'row',gap:7,width:'100%'},adChoiceButton:{flex:1,minHeight:45,borderRadius:14,backgroundColor:'#E8F2D2',alignItems:'center',justifyContent:'center'},adChoiceIcon:{fontSize:17,fontWeight:'900',color:'#784498'},adChoiceText:{fontSize:9,fontWeight:'900',color:'#466445'},outfitMultiplier:{color:'#C46D35',fontSize:11,fontWeight:'900'},outfitPerk:{color:'#73508F',fontSize:9,fontWeight:'900',textAlign:'center',minHeight:22},masteryText:{color:'#628062',fontSize:10,fontWeight:'800'},
  dailyReward:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FFF7D8',borderRadius:24,borderCurve:'continuous',padding:16,borderWidth:2,borderColor:'#F2C65B'},claimedCard:{opacity:.65,borderColor:'#C8D1B7'},dailyRewardEmoji:{fontSize:38},claimText:{color:'#D66B42',fontWeight:'900',fontSize:13},sectionTitle:{color:'#38513A',fontSize:19,fontWeight:'900',paddingTop:10},missionCard:{backgroundColor:'#FFFDF1',borderRadius:20,borderCurve:'continuous',padding:15,gap:10},missionTop:{flexDirection:'row',alignItems:'center',gap:10},missionName:{color:'#39513D',fontSize:15,fontWeight:'900'},missionReward:{color:'#7A836F',fontSize:11,fontWeight:'700',paddingTop:2},claimButton:{backgroundColor:'#F0774E',borderRadius:13,paddingHorizontal:12,paddingVertical:9,minWidth:70,alignItems:'center'},claimButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},progressTrack:{height:9,borderRadius:99,overflow:'hidden',backgroundColor:'#E6E7D4'},progressFill:{height:'100%',borderRadius:99,backgroundColor:'#6FAA58'},badgeGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},badgeCard:{width:'31%',minHeight:86,backgroundColor:'#FFF9E5',borderRadius:18,alignItems:'center',justifyContent:'center',padding:8,gap:5},lockedBadge:{opacity:.45},badgeEmoji:{fontSize:27},badgeName:{color:'#465C48',fontSize:10,fontWeight:'900',textAlign:'center'},worldMapHint:{color:'#667668',fontSize:12,fontWeight:'700',lineHeight:18},worldRow:{minHeight:82,flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF9E8',borderRadius:20,borderCurve:'continuous',padding:10,borderWidth:2,borderColor:'transparent'},selectedWorld:{borderColor:'#5E995A',backgroundColor:'#F1F8DB'},featuredWorld:{borderColor:'#EAB64E'},worldPreview:{width:74,height:60,borderRadius:15,alignItems:'center',justifyContent:'center',overflow:'hidden'},worldPreviewText:{fontSize:18,letterSpacing:2},worldRecord:{color:'#C17A2C',fontSize:10,fontWeight:'900',paddingTop:4},worldSelectText:{color:'#6B7B6D',fontSize:9,fontWeight:'900',maxWidth:58,textAlign:'center'},worldSelectedText:{color:'#4F8A4D'},
  settingsCard:{backgroundColor:'#FFFDF0',borderRadius:24,borderCurve:'continuous',padding:17,gap:13},settingRow:{minHeight:50,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},settingLabel:{color:'#39513D',fontSize:16,fontWeight:'800'},toggle:{width:52,height:31,borderRadius:99,backgroundColor:'#CBD0C5',padding:3},toggleOn:{backgroundColor:'#6AA657'},toggleKnob:{width:25,height:25,borderRadius:99,backgroundColor:'#FFF',boxShadow:'0 2px 4px rgba(40,55,42,.2)'},toggleKnobOn:{transform:[{translateX:21}]},nameInput:{minHeight:52,borderRadius:16,borderWidth:2,borderColor:'#D8DDC7',backgroundColor:'#FFF',paddingHorizontal:14,color:'#354D39',fontWeight:'800',fontSize:16},syncStatus:{color:'#718071',fontSize:11,fontWeight:'700',textAlign:'center'},privacyText:{color:'#5E6D61',fontSize:13,lineHeight:20},segmentRow:{flexDirection:'row',gap:7,backgroundColor:'rgba(255,255,255,.45)',borderRadius:16,padding:4},segment:{flex:1,minHeight:39,alignItems:'center',justifyContent:'center',borderRadius:13},segmentActive:{backgroundColor:'#42694D'},segmentText:{color:'#58705D',fontSize:12,fontWeight:'900'},segmentTextActive:{color:'#FFF'},emptyBoard:{color:'#708071',fontWeight:'700',textAlign:'center',padding:30},
  worldBanner:{position:'absolute',top:108,alignSelf:'center',zIndex:2,backgroundColor:'rgba(255,255,255,.68)',borderRadius:99,paddingHorizontal:12,paddingVertical:5},worldBannerText:{color:'#435F4B',fontSize:9,fontWeight:'900',letterSpacing:1},worldBackgroundDecor:{position:'absolute',bottom:GROUND_HEIGHT+14,left:18,right:18,fontSize:31,letterSpacing:34,opacity:.42},milestonePop:{position:'absolute',zIndex:9,top:'29%',alignSelf:'center',backgroundColor:'#7C4EA1',borderRadius:22,paddingHorizontal:22,paddingVertical:13,alignItems:'center',boxShadow:'0 8px 18px rgba(55,30,70,.28)'},worldRewardPop:{top:'38%',backgroundColor:'#3F8552'},milestoneTitle:{color:'#FFF6B0',fontSize:18,fontWeight:'900',letterSpacing:1},milestoneText:{color:'#FFF',fontSize:12,fontWeight:'800',paddingTop:3},
});
