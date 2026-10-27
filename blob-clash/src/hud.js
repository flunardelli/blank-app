// DOM overlay: coins, progress, count bubbles and the menu / complete / lose screens.
import * as THREE from 'three';
import { formatCoins } from './rules.js';

const projected = new THREE.Vector3();
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.coins = $('coins-value');
    this.topbar = $('topbar');
    this.progress = $('progress-fill');
    this.bubbles = $('bubbles');
    this.screens = { title: $('title'), ending: $('ending'), map: $('map'), menu: $('menu'), complete: $('complete'), lose: $('lose') };
    this.pauseButton = $('pause-btn');
    this.pauseScreen = $('pause');
    this.keySlots = [...document.querySelectorAll('.key-slot')];
    this.levelBadge = $('level-badge');
    this.fight = $('fight');
    this.hpPlayer = $('hp-player');
    this.hpBoss = $('hp-boss');
  }

  setLevel(level) {
    this.levelBadge.textContent = level;
  }

  setKeys(count) {
    this.keySlots.forEach((slot, i) => slot.classList.toggle('filled', i < count));
  }

  showFight(visible, bossColor = 0x6fe04a) {
    this.fight.hidden = !visible;
    this.fight.style.setProperty('--boss-color', `#${bossColor.toString(16).padStart(6, '0')}`);
    this.topbar.classList.toggle('fighting', visible);
  }

  // Restarts a one-shot CSS animation on an element showing `text`.
  flash(el, text) {
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth; // reflow so the animation restarts
    el.style.animation = '';
    clearTimeout(el.hideTimer);
    el.hideTimer = setTimeout(() => { el.hidden = true; }, 1600);
  }

  showBanner(text) {
    this.flash($('banner'), text);
  }

  popText(text) {
    this.flash($('pop'), text);
  }

  setFight(playerFraction, bossFraction) {
    this.hpPlayer.style.width = `${THREE.MathUtils.clamp(playerFraction, 0, 1) * 100}%`;
    this.hpBoss.style.width = `${THREE.MathUtils.clamp(bossFraction, 0, 1) * 100}%`;
  }

  setCoins(n) {
    this.coins.textContent = formatCoins(n);
  }

  setProgress(fraction) {
    this.progress.style.width = `${THREE.MathUtils.clamp(fraction, 0, 1) * 100}%`;
  }

  createBubble(kind) {
    const el = Object.assign(document.createElement('div'), { className: `bubble ${kind}` });
    this.bubbles.append(el);
    return el;
  }

  clearBubbles() {
    this.bubbles.replaceChildren();
  }

  // Pins a count bubble above a 3D position.
  placeBubble(el, worldPosition, camera, text, show = true) {
    projected.copy(worldPosition).project(camera);
    const visible = show && projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2;
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) * 50}vw, ${(1 - projected.y) * 50}vh)`;
    if (el.textContent !== String(text)) el.textContent = text;
  }

  show(name) {
    Object.entries(this.screens).forEach(([key, el]) => { el.hidden = key !== name; });
    this.topbar.classList.toggle('hidden-progress', ['menu', 'title', 'map'].includes(name));
    this.pauseButton.hidden = name !== null; // only offered while a level is being played
  }

  /** True while the pause button is on screen, i.e. a level is running and no other screen is up. */
  canPause() {
    return !this.pauseButton.hidden;
  }

  showPause(visible) {
    this.pauseScreen.hidden = !visible;
  }

  bindPause({ onPause, onResume, onMap }) {
    this.pauseButton.addEventListener('click', onPause);
    $('pause-resume').addEventListener('click', onResume);
    $('pause-map').addEventListener('click', onMap);
  }

  /** First screen: Continue (or Play when there is nothing to continue) and New game, which asks before erasing. */
  showTitle({ level, hasProgress, onContinue, onNew, onMap }) {
    const confirm = $('title-confirm');
    const buttons = $('title-buttons');
    const ask = (asking) => {
      confirm.hidden = !asking;
      buttons.hidden = asking;
    };
    ask(false);
    $('title-continue').innerHTML = hasProgress ? `CONTINUAR<small>FASE ${level}</small>` : 'JOGAR';
    $('title-continue').onclick = onContinue;
    $('title-map').onclick = onMap;
    $('title-new').hidden = !hasProgress;
    $('title-new').onclick = () => ask(true);
    $('title-confirm-no').onclick = () => ask(false);
    $('title-confirm-yes').onclick = onNew;
    this.show('title');
  }

  showMenu({ level, upgrades, onBuy, onMap }) {
    $('menu-level').textContent = `Level ${level}`;
    $('menu-map').onclick = onMap;
    $('menu-map').addEventListener('pointerdown', (e) => e.stopPropagation());
    const cards = $('upgrade-cards');
    cards.replaceChildren(...upgrades.map((upgrade) => {
      const card = document.createElement('button');
      card.className = `upgrade-card${upgrade.affordable ? '' : ' locked'}`;
      card.innerHTML = `
        <span class="upgrade-title">${upgrade.title}</span>
        <span class="upgrade-level">Level ${upgrade.level}</span>
        <span class="upgrade-icon">${upgrade.icon}</span>
        <span class="upgrade-cost"><i class="coin-icon"></i>${formatCoins(upgrade.cost)}</span>`;
      card.addEventListener('pointerdown', (e) => e.stopPropagation());
      card.addEventListener('click', () => onBuy(upgrade.id));
      return card;
    }));
    this.show('menu');
  }

  // Rows come from mapRows(); only squares that are not locked can be played.
  showMap({ rows, onPlay, onBack }) {
    const kindMark = { mini: '🥊', boss: '👑', chest: '🎁' };
    $('map-rows').replaceChildren(...rows.map(({ world, levels }) => {
      const row = Object.assign(document.createElement('div'), { className: 'map-row' });
      row.style.setProperty('--accent', world.accent);
      const cells = levels.map(({ level, kind, status, stars }) => {
        const cell = Object.assign(document.createElement('button'), { className: `map-cell ${status} ${kind}` });
        cell.disabled = status === 'locked';
        cell.setAttribute('aria-label', `Fase ${level}`);
        cell.innerHTML = `<span class="mark">${status === 'locked' ? '🔒' : kindMark[kind]}</span><span class="num">${level}</span>`
          + (stars ? `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : '');
        cell.onclick = () => onPlay(level);
        return cell;
      });
      row.innerHTML = `<h2 class="ink">${world.name}</h2><div class="map-cells"></div>`;
      row.querySelector('.map-cells').append(...cells);
      return row;
    }));
    $('map-back').onclick = onBack;
    this.show('map');
    $('map-rows').querySelector('.current')?.scrollIntoView({ block: 'center' });
  }

  showComplete({ level, coins, multiplier, chest, onNext, onMap }) {
    $('complete-level').textContent = `Level ${level}`;
    $('complete-chest').hidden = !chest;
    $('complete-chest').querySelector('span').textContent = `Chest +${chest}`;
    $('complete-coins').textContent = coins;
    $('complete-multiplier').textContent = `x${multiplier.toFixed(1)}`;
    $('complete-next').onclick = onNext;
    $('complete-map').onclick = onMap;
    this.show('complete');
    this.confetti();
  }

  showEnding({ stars, maxStars, onMap, onTitle }) {
    $('ending-stars').textContent = `${stars}/${maxStars}`;
    $('ending-map').onclick = onMap;
    $('ending-title').onclick = onTitle;
    this.show('ending');
    this.confetti('ending-confetti');
  }

  showLose({ coins, onContinue }) {
    $('lose-coins').textContent = `+${coins}`;
    $('lose-continue').onclick = onContinue;
    this.show('lose');
  }

  hideScreens() {
    this.show(null);
  }

  confetti(layerId = 'confetti') {
    const layer = $(layerId);
    const colors = ['#ff4d6d', '#4dabf7', '#51cf66', '#ffd43b', '#9775fa', '#22d3ee'];
    layer.replaceChildren(...Array.from({ length: 70 }, () => {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = `${Math.random() * 0.8}s`;
      piece.style.animationDuration = `${2 + Math.random() * 1.5}s`;
      piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
      return piece;
    }));
  }
}
