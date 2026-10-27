// Skin shop: the SKINS button on the menu opens a panel to buy and wear skins. Also keeps the
// crowd leader and the champion dressed in the equipped skin. Talks to the game only through
// `game.save`, `game.player`, `game.champion` and `game.state`.
import * as THREE from 'three';
import { SKINS, buySkin, equipSkin, ownsSkin, skinById } from './skins.js';
import { writeSave } from './save.js';
import { createLeader, dressChampion } from './art/skinModels.js';
import { formatCoins } from './rules.js';

const LEADER_SCALE = 1.2; // the leader stands a little taller than the rest of the crowd
const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const leaderScale = new THREE.Vector3(LEADER_SCALE, LEADER_SCALE, LEADER_SCALE);

export class SkinShop {
  constructor({ game, hud, scene }) {
    this.game = game;
    this.hud = hud;
    this.leader = createLeader();
    scene.add(this.leader.root);
    this.panel = $('skins');
    this.grid = $('skin-cards');
    this.worn = null;
    $('skins-btn').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('skins-btn').addEventListener('click', () => this.open());
    $('skins-back').addEventListener('click', () => this.close());
    this.dress();
  }

  get save() {
    return this.game.save; // replaced after every level, so never cached
  }

  open() {
    this.render();
    this.panel.hidden = false;
  }

  close() {
    this.panel.hidden = true;
  }

  // Persists a purchase/equip result into the live save (the game keeps a reference to it).
  commit({ ok, save }) {
    if (!ok) return;
    Object.assign(this.game.save, save);
    writeSave(this.game.save);
    this.hud.setCoins(this.game.save.coins);
    this.dress();
    this.render();
  }

  select(skin) {
    this.commit(ownsSkin(this.save, skin.id) ? equipSkin(this.save, skin.id) : buySkin(this.save, skin.id));
  }

  render() {
    const { coins, skins } = this.save;
    this.grid.replaceChildren(...SKINS.map((skin) => {
      const owned = ownsSkin(this.save, skin.id);
      const card = document.createElement('button');
      card.className = `upgrade-card skin-card${!owned && coins < skin.price ? ' locked' : ''}${skins.equipped === skin.id ? ' equipped' : ''}`;
      const status = skins.equipped === skin.id ? 'WEARING' : owned ? 'USE'
        : `<i class="coin-icon"></i>${formatCoins(skin.price)}`;
      card.innerHTML = `
        <span class="upgrade-title">${skin.name}</span>
        <span class="skin-swatch" style="--top:${hex(skin.colors.top)};--bottom:${hex(skin.colors.bottom)}">${skin.icon}</span>
        <span class="upgrade-cost">${status}</span>`;
      card.addEventListener('click', () => this.select(skin));
      return card;
    }));
  }

  // Puts the equipped skin on the champion and the leader (nothing separate to draw for classic).
  dress() {
    const skin = skinById(this.save.skins.equipped);
    if (this.worn === skin.id) return;
    this.worn = skin.id;
    dressChampion(this.game.champion, skin);
    this.leader.set(skin);
  }

  /** Call every frame after game.update(). */
  update() {
    this.dress(); // cheap when unchanged; catches a save replaced by a new game
    if (!this.panel.hidden && this.game.state !== 'menu') this.close(); // e.g. a dev cheat jumped to the boss
    const { player } = this.game;
    const dressed = this.worn !== 'classic';
    player.leaderSeparate = dressed;
    this.leader.root.visible = dressed && player.units.length > 0;
    if (this.leader.root.visible) this.leader.root.matrix.copy(player.leaderMatrix).scale(leaderScale);
  }
}
