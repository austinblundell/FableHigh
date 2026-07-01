import * as THREE from 'three';

const SKIN_TONES = [0x8d5524, 0xc68642, 0xe0ac69, 0x6b4226, 0xa0703c, 0x503335];

function numberTexture(num, color, bg) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.font = 'bold 84px Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Articulated low-poly basketball player with procedural animation.
// Root group sits at the feet; model faces local +Z.
export class PlayerModel {
  constructor(teamDef, rosterEntry, number) {
    this.height = rosterEntry.h;
    const s = this.height / 2.0; // built at 2.0m, scaled

    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.rig.scale.setScalar(s);
    this.group.add(this.rig);

    const skin = new THREE.MeshStandardMaterial({
      color: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      roughness: 0.75,
    });
    const jersey = new THREE.MeshStandardMaterial({ color: teamDef.jersey, roughness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: teamDef.trim, roughness: 0.6 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    this.skinMat = skin;

    // torso
    const torsoGeo = new THREE.CapsuleGeometry(0.17, 0.32, 6, 12);
    this.torso = new THREE.Mesh(torsoGeo, jersey);
    this.torso.position.y = 1.28;
    this.torso.scale.set(1.15, 1, 0.78);
    this.rig.add(this.torso);

    // shorts
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.24, 12), trim);
    shorts.position.y = 0.98;
    shorts.scale.set(1.1, 1, 0.8);
    this.rig.add(shorts);

    // head + neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skin);
    neck.position.y = 1.56;
    this.rig.add(neck);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
    this.head.position.y = 1.7;
    this.head.scale.set(0.9, 1.05, 0.95);
    this.rig.add(this.head);

    // number decals
    const numTexBack = numberTexture(number, '#' + teamDef.trim.toString(16).padStart(6, '0'), 'rgba(0,0,0,0)');
    const decalMat = new THREE.MeshBasicMaterial({ map: numTexBack, transparent: true });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), decalMat);
    back.position.set(0, 1.36, -0.145);
    back.rotation.y = Math.PI;
    this.rig.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), decalMat);
    front.position.set(0, 1.34, 0.145);
    this.rig.add(front);

    // limbs
    this.armL = this.makeLimb(0.28, 0.26, 0.045, skin, skin, 0.055);
    this.armL.pivot.position.set(-0.26, 1.47, 0);
    this.rig.add(this.armL.pivot);
    this.armR = this.makeLimb(0.28, 0.26, 0.045, skin, skin, 0.055);
    this.armR.pivot.position.set(0.26, 1.47, 0);
    this.rig.add(this.armR.pivot);

    // shoulder pads (jersey sleeves)
    for (const x of [-0.26, 0.26]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), jersey);
      pad.position.set(x, 1.47, 0);
      this.rig.add(pad);
    }

    this.legL = this.makeLimb(0.44, 0.42, 0.065, skin, skin, 0);
    this.legL.pivot.position.set(-0.11, 0.9, 0);
    this.rig.add(this.legL.pivot);
    this.legR = this.makeLimb(0.44, 0.42, 0.065, skin, skin, 0);
    this.legR.pivot.position.set(0.11, 0.9, 0);
    this.rig.add(this.legR.pivot);

    // shoes on lower-leg tips
    for (const leg of [this.legL, this.legR]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.24), shoe);
      sh.position.set(0, -0.4, 0.05);
      leg.joint.add(sh);
    }

    // ball hand anchor (right hand)
    this.handAnchor = new THREE.Object3D();
    this.handAnchor.position.set(0, -0.3, 0);
    this.armR.joint.add(this.handAnchor);

    // overhead anchor for shot release point
    this.releaseAnchor = new THREE.Object3D();
    this.releaseAnchor.position.set(0.12, 2.15, 0.12);
    this.rig.add(this.releaseAnchor);

    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    // animation state
    this.runPhase = Math.random() * Math.PI * 2;
    this.shootBlend = 0;   // 0 = normal, 1 = arms up
    this.shootTarget = 0;
    this.defenseBlend = 0;
    this.defenseTarget = 0;
    this.releaseKick = 0;
  }

  makeLimb(upperLen, lowerLen, radius, upperMat, lowerMat, handR) {
    const pivot = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(radius, upperLen - radius, 4, 8), upperMat);
    upper.position.y = -upperLen / 2;
    pivot.add(upper);
    const joint = new THREE.Group();
    joint.position.y = -upperLen;
    pivot.add(joint);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.85, lowerLen - radius, 4, 8), lowerMat);
    lower.position.y = -lowerLen / 2;
    joint.add(lower);
    if (handR > 0) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(handR, 8, 6), lowerMat);
      hand.position.y = -lowerLen;
      joint.add(hand);
    }
    return { pivot, joint, upper, lower };
  }

  setShooting(on) { this.shootTarget = on ? 1 : 0; }
  setDefense(on) { this.defenseTarget = on ? 1 : 0; }
  triggerRelease() { this.releaseKick = 1; }

  getHandWorldPos(out) { return this.handAnchor.getWorldPosition(out); }
  getReleaseWorldPos(out) { return this.releaseAnchor.getWorldPosition(out); }

  // speed: current horizontal speed (m/s); dt: frame delta
  update(dt, speed) {
    const lerpRate = 1 - Math.pow(0.0001, dt);
    this.shootBlend += (this.shootTarget - this.shootBlend) * Math.min(1, dt * 12);
    this.defenseBlend += (this.defenseTarget - this.defenseBlend) * Math.min(1, dt * 8);
    this.releaseKick = Math.max(0, this.releaseKick - dt * 4);

    const runAmount = Math.min(1, speed / 4.5);
    this.runPhase += dt * (4 + speed * 2.2);
    const p = this.runPhase;

    // legs
    const legSwing = 0.75 * runAmount;
    const crouch = this.defenseBlend * 0.35;
    this.legL.pivot.rotation.x = Math.sin(p) * legSwing - crouch;
    this.legR.pivot.rotation.x = Math.sin(p + Math.PI) * legSwing - crouch;
    this.legL.joint.rotation.x = Math.max(0, Math.sin(p + Math.PI * 0.5)) * 1.1 * runAmount + crouch * 1.6;
    this.legR.joint.rotation.x = Math.max(0, Math.sin(p + Math.PI * 1.5)) * 1.1 * runAmount + crouch * 1.6;

    // torso bob + lean
    const bob = Math.abs(Math.sin(p)) * 0.03 * runAmount - crouch * 0.12;
    this.rig.position.y = bob;
    this.torso.rotation.x = runAmount * -0.12 + crouch * 0.3;

    // arms: blend run swing vs shooting form vs defensive spread
    const armSwing = 0.6 * runAmount * (1 - this.shootBlend);
    const sb = this.shootBlend;
    const db = this.defenseBlend * (1 - sb);
    const release = this.releaseKick;

    // shooting: both arms up, right arm extends on release
    const shootShoulder = -2.55 + release * 0.35;
    const shootElbowR = (1.9 - release * 1.6);
    const shootElbowL = 1.4;

    this.armR.pivot.rotation.x =
      Math.sin(p + Math.PI) * armSwing * (1 - db) + sb * shootShoulder + db * -0.5;
    this.armR.pivot.rotation.z = db * -1.0 + sb * 0.15;
    this.armR.joint.rotation.x =
      (-0.5 * runAmount) * (1 - sb) * (1 - db) - sb * shootElbowR + db * -0.3;

    this.armL.pivot.rotation.x =
      Math.sin(p) * armSwing * (1 - db) + sb * (shootShoulder + 0.3) + db * -0.5;
    this.armL.pivot.rotation.z = db * 1.0 + sb * -0.15;
    this.armL.joint.rotation.x =
      (-0.5 * runAmount) * (1 - sb) * (1 - db) - sb * shootElbowL + db * -0.3;

    // idle sway when standing
    if (runAmount < 0.05 && sb < 0.05 && db < 0.05) {
      const t = p * 0.3;
      this.armL.pivot.rotation.x = Math.sin(t) * 0.05;
      this.armR.pivot.rotation.x = Math.cos(t) * 0.05;
      this.armL.joint.rotation.x = -0.15;
      this.armR.joint.rotation.x = -0.15;
    }
  }
}
