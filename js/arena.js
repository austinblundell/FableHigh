import * as THREE from 'three';
import { COURT, TEAMS } from './constants.js';

const FLOOR_W = 34, FLOOR_D = 20; // wood floor extends past lines

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.buildFloor();
    this.hoops = [this.buildHoop(1), this.buildHoop(-1)];
    this.buildStands();
    this.buildAdBoards();
    this.buildJumbotron();
    this.buildCeiling();
    this.buildTables();
  }

  // ---------- court floor ----------
  buildFloor() {
    const scale = 60; // px per meter
    const W = FLOOR_W * scale, H = FLOOR_D * scale;
    const mx = (x) => (x + FLOOR_W / 2) * scale;
    const mz = (z) => (z + FLOOR_D / 2) * scale;
    const m = (v) => v * scale;

    const tex = canvasTexture(2048, Math.round(2048 * FLOOR_D / FLOOR_W), (g, cw, ch) => {
      const sx = cw / W, sy = ch / H;
      g.scale(sx, sy);

      // apron (darker stain outside the lines)
      g.fillStyle = '#5e3a1e';
      g.fillRect(0, 0, W, H);
      this.drawPlanks(g, 0, 0, W, H, '#6b4423', 14);

      // playing surface (lighter maple)
      const cx0 = mx(-COURT.HALF_L), cz0 = mz(-COURT.HALF_W);
      const cw2 = m(COURT.LENGTH), chh = m(COURT.WIDTH);
      g.fillStyle = '#c89355';
      g.fillRect(cx0, cz0, cw2, chh);
      this.drawPlanks(g, cx0, cz0, cw2, chh, '#c89355', 12);

      const line = (fn) => { g.beginPath(); fn(); g.stroke(); };
      g.strokeStyle = '#f5f0e6';
      g.lineWidth = m(0.05);

      // boundary + half court
      g.strokeRect(cx0, cz0, cw2, chh);
      line(() => { g.moveTo(mx(0), cz0); g.lineTo(mx(0), cz0 + chh); });

      // center circle w/ logo
      g.fillStyle = TEAMS[0].css;
      g.beginPath(); g.arc(mx(0), mz(0), m(COURT.CENTER_CIRCLE_R), 0, Math.PI * 2); g.fill();
      line(() => g.arc(mx(0), mz(0), m(COURT.CENTER_CIRCLE_R), 0, Math.PI * 2));
      g.fillStyle = '#fdb927';
      g.font = `bold ${m(0.62)}px Arial Black, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('FABLE', mx(0), mz(0) - m(0.34));
      g.fillText('LEAGUE', mx(0), mz(0) + m(0.42));

      for (const side of [1, -1]) {
        const rimX = COURT.RIM_X * side;
        const baseX = COURT.HALF_L * side;
        const ftX = (COURT.HALF_L - COURT.KEY_LENGTH) * side;

        // key (paint)
        const keyX = Math.min(baseX, ftX), keyW = Math.abs(baseX - ftX);
        g.fillStyle = side > 0 ? 'rgba(85,37,131,0.85)' : 'rgba(0,122,51,0.85)';
        g.fillRect(mx(keyX), mz(-COURT.KEY_WIDTH / 2), m(keyW), m(COURT.KEY_WIDTH));
        g.strokeRect(mx(keyX), mz(-COURT.KEY_WIDTH / 2), m(keyW), m(COURT.KEY_WIDTH));

        // free-throw circle
        line(() => g.arc(mx(ftX), mz(0), m(COURT.FT_CIRCLE_R), 0, Math.PI * 2));

        // restricted area
        const a0 = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        line(() => g.arc(mx(rimX), mz(0), m(1.22), a0, a0 + Math.PI, false));

        // three-point line: corner straights + arc
        const cornerZ = 6.71;
        const zAng = Math.asin(Math.min(1, cornerZ / COURT.THREE_R)); // angle where arc reaches corner z
        const arcMeetX = rimX - side * COURT.THREE_R * Math.cos(zAng);
        for (const zs of [1, -1]) {
          line(() => {
            g.moveTo(mx(baseX), mz(zs * cornerZ));
            g.lineTo(mx(arcMeetX), mz(zs * cornerZ));
          });
        }
        line(() => {
          if (side > 0) {
            g.arc(mx(rimX), mz(0), m(COURT.THREE_R), Math.PI - zAng, Math.PI + zAng, false);
          } else {
            g.arc(mx(rimX), mz(0), m(COURT.THREE_R), -zAng, zAng, false);
          }
        });
      }

      // subtle sheen streaks
      for (let i = 0; i < 24; i++) {
        g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
        const x = Math.random() * W;
        g.fillRect(x, 0, m(0.4 + Math.random()), H);
      }
    });

    const mat = new THREE.MeshPhysicalMaterial({
      map: tex, roughness: 0.28, metalness: 0.0,
      clearcoat: 0.65, clearcoatRoughness: 0.25,
      envMapIntensity: 0.9,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_D), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // dark concrete beyond the hardwood
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 70),
      new THREE.MeshStandardMaterial({ color: 0x17171d, roughness: 0.95 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    this.scene.add(outer);
  }

  drawPlanks(g, x, y, w, h, base, plankPx) {
    const rows = Math.ceil(h / plankPx);
    for (let r = 0; r < rows; r++) {
      const shade = (Math.random() - 0.5) * 18;
      g.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 230 : 20},${shade > 0 ? 180 : 5},${Math.abs(shade) / 255})`;
      g.fillRect(x, y + r * plankPx, w, plankPx - 1);
      // plank end seams
      let px = x + Math.random() * 80;
      g.fillStyle = 'rgba(0,0,0,0.12)';
      while (px < x + w) {
        g.fillRect(px, y + r * plankPx, 1.5, plankPx);
        px += 60 + Math.random() * 90;
      }
    }
  }

  // ---------- hoops ----------
  buildHoop(side) {
    const group = new THREE.Group();
    const rimX = COURT.RIM_X * side;
    const boardX = COURT.BOARD_X * side;

    // stanchion
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.4, metalness: 0.7 });
    const baseX = (COURT.HALF_L + 1.7) * side;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.9, 12), steel);
    post.position.set(baseX, 1.45, 0);
    group.add(post);
    const armLen = Math.abs(baseX - boardX);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.14, 0.14), steel);
    arm.position.set((baseX + boardX) / 2, 2.9 + 0.35, 0);
    group.add(arm);
    const basePad = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 1.3),
      new THREE.MeshStandardMaterial({ color: side > 0 ? TEAMS[0].jersey : TEAMS[1].jersey, roughness: 0.8 }));
    basePad.position.set(baseX + side * 0.35, 0.28, 0);
    group.add(basePad);

    // backboard glass
    const boardTex = canvasTexture(512, 300, (g) => {
      g.clearRect(0, 0, 512, 300);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 10;
      g.strokeRect(5, 5, 502, 290);
      // shooter square
      g.lineWidth = 7;
      g.strokeRect(512 / 2 - 66, 300 - 132, 132, 100);
    });
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, COURT.BOARD_HEIGHT, COURT.BOARD_WIDTH),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transparent: true, opacity: 0.22,
        roughness: 0.05, metalness: 0, transmission: 0,
      })
    );
    glass.position.set(boardX + side * 0.02, COURT.BOARD_BOTTOM + COURT.BOARD_HEIGHT / 2, 0);
    group.add(glass);
    const marking = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.BOARD_WIDTH, COURT.BOARD_HEIGHT),
      new THREE.MeshBasicMaterial({ map: boardTex, transparent: true })
    );
    marking.position.set(boardX - side * 0.005, COURT.BOARD_BOTTOM + COURT.BOARD_HEIGHT / 2, 0);
    marking.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(marking);

    // rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(COURT.RIM_RADIUS, COURT.RIM_TUBE, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0xe8501e, roughness: 0.35, metalness: 0.55 })
    );
    rim.position.set(rimX, COURT.RIM_HEIGHT, 0);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    // rim-to-board bracket
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(boardX - rimX) - COURT.RIM_RADIUS, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xe8501e, roughness: 0.4, metalness: 0.5 }));
    bracket.position.set((rimX + side * COURT.RIM_RADIUS + boardX) / 2, COURT.RIM_HEIGHT - 0.05, 0);
    group.add(bracket);

    // net (lathe wireframe)
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector2(
        COURT.RIM_RADIUS * (1 - t * 0.45) - t * t * 0.01,
        -t * 0.42
      ));
    }
    const net = new THREE.Mesh(
      new THREE.LatheGeometry(pts, 12),
      new THREE.MeshBasicMaterial({ color: 0xf8f8f8, wireframe: true, transparent: true, opacity: 0.75 })
    );
    net.position.set(rimX, COURT.RIM_HEIGHT, 0);
    group.add(net);

    // shot-clock unit above board
    const sc = this.makeShotClockDisplay();
    sc.mesh.position.set(boardX, COURT.BOARD_BOTTOM + COURT.BOARD_HEIGHT + 0.35, 0);
    sc.mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(sc.mesh);
    if (!this.shotClockDisplays) this.shotClockDisplays = [];
    this.shotClockDisplays.push(sc);

    group.traverse((o) => { if (o.isMesh && o !== net) o.castShadow = true; });
    this.scene.add(group);
    return { group, net, rimX, side };
  }

  makeShotClockDisplay() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.35),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.42, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111111 }));
    frame.position.z = -0.06;
    mesh.add(frame);
    return { mesh, canvas: c, tex };
  }

  updateShotClocks(value) {
    if (!this.shotClockDisplays) return;
    const txt = String(Math.max(0, Math.ceil(value)));
    for (const d of this.shotClockDisplays) {
      const g = d.canvas.getContext('2d');
      g.fillStyle = '#0a0a0a';
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = value <= 5 ? '#ff2222' : '#ff8c1a';
      g.font = 'bold 52px Consolas, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 64, 36);
      d.tex.needsUpdate = true;
    }
  }

  // ---------- stands & crowd ----------
  buildStands() {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x23232c, roughness: 0.9 });
    const rows = 14;
    const rise = 0.55, depth = 0.9;

    const sides = [
      { axis: 'z', dir: 1, start: 11.2, length: 40 },
      { axis: 'z', dir: -1, start: 11.2, length: 40 },
      { axis: 'x', dir: 1, start: 18.4, length: 24 },
      { axis: 'x', dir: -1, start: 18.4, length: 24 },
    ];

    const bodyGeo = new THREE.BoxGeometry(0.38, 0.52, 0.28);
    const headGeo = new THREE.SphereGeometry(0.11, 6, 5);
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });

    let totalSeats = 0;
    for (const s of sides) {
      totalSeats += Math.floor(s.length / 0.55) * rows;
    }
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, totalSeats);
    const heads = new THREE.InstancedMesh(headGeo, headMat, totalSeats);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const skinColors = [0x8d5524, 0xc68642, 0xe0ac69, 0x6b4226, 0xffdbac];
    let idx = 0;

    sides.forEach((s, si) => {
      // tier steps
      for (let r = 0; r < rows; r++) {
        const dist = s.start + r * depth;
        const y = 0.6 + r * rise;
        const stepGeo = s.axis === 'z'
          ? new THREE.BoxGeometry(s.length, rise, depth)
          : new THREE.BoxGeometry(depth, rise, s.length);
        const step = new THREE.Mesh(stepGeo, standMat);
        if (s.axis === 'z') step.position.set(0, y - rise / 2, s.dir * dist);
        else step.position.set(s.dir * dist, y - rise / 2, 0);
        this.scene.add(step);
      }
      // crowd
      const cols = Math.floor(s.length / 0.55);
      for (let r = 0; r < rows; r++) {
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          if (Math.random() < 0.07) { // empty seat
            dummy.position.set(0, -50, 0);
          } else {
            const along = -s.length / 2 + 0.3 + cIdx * 0.55 + (Math.random() - 0.5) * 0.1;
            const dist = s.start + r * depth - 0.15;
            const y = 0.6 + r * rise + 0.35;
            if (s.axis === 'z') dummy.position.set(along, y, s.dir * dist);
            else dummy.position.set(s.dir * dist, y, along);
            dummy.rotation.y = s.axis === 'z'
              ? (s.dir > 0 ? Math.PI : 0)
              : (s.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
          }
          dummy.updateMatrix();
          bodies.setMatrixAt(idx, dummy.matrix);
          color.setHSL(Math.random(), 0.32, 0.13 + Math.random() * 0.24);
          bodies.setColorAt(idx, color);
          // head above body
          dummy.position.y += 0.38;
          dummy.updateMatrix();
          heads.setMatrixAt(idx, dummy.matrix);
          color.set(skinColors[Math.floor(Math.random() * skinColors.length)]);
          heads.setColorAt(idx, color);
          idx++;
        }
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.scene.add(bodies, heads);

    // arena shell
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(88, 40, 68),
      new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 1, side: THREE.BackSide })
    );
    shell.position.y = 14;
    this.scene.add(shell);
  }

  // ---------- ad boards ----------
  buildAdBoards() {
    const ads = ['FABLE AIR', 'CLAW COLA', 'CODE SPORTS', 'ANTHRO BANK', 'HOOP+ STREAM', 'MYTHOS MOTORS'];
    const tex = canvasTexture(2048, 96, (g) => {
      g.fillStyle = '#0d1030';
      g.fillRect(0, 0, 2048, 96);
      g.font = 'bold 52px Arial Black, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = 2048 / ads.length;
      ads.forEach((a, i) => {
        g.fillStyle = ['#ffd23f', '#ff4b3e', '#4ecdc4', '#f8f8f8', '#a29bfe', '#ff9f43'][i];
        g.fillText(a, w * i + w / 2, 50);
        g.strokeStyle = 'rgba(255,255,255,0.2)';
        g.beginPath(); g.moveTo(w * i, 10); g.lineTo(w * i, 86); g.stroke();
      });
    });
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55,
    });
    for (const dir of [1, -1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(30, 0.85, 0.15), mat);
      board.position.set(0, 0.45, dir * 10.4);
      if (dir > 0) board.rotation.y = Math.PI;
      this.scene.add(board);
    }
    for (const dir of [1, -1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(14, 0.85, 0.15), mat);
      board.position.set(dir * 17.4, 0.45, 0);
      board.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(board);
    }
  }

  // ---------- jumbotron ----------
  buildJumbotron() {
    this.jumboCanvas = document.createElement('canvas');
    this.jumboCanvas.width = 512; this.jumboCanvas.height = 288;
    this.jumboTex = new THREE.CanvasTexture(this.jumboCanvas);
    this.jumboTex.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 3.4, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.6, metalness: 0.4 })
    );
    group.add(frame);
    const mat = new THREE.MeshBasicMaterial({ map: this.jumboTex });
    for (let i = 0; i < 4; i++) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.8), mat);
      const ang = (i * Math.PI) / 2;
      screen.position.set(Math.sin(ang) * 2.83, 0, Math.cos(ang) * 2.83);
      screen.rotation.y = ang;
      group.add(screen);
    }
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    cable.position.y = 4.7;
    group.add(cable);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.6, 0.12, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1a24, emissive: 0x2244aa, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.9;
    group.add(ring);
    group.position.set(0, 11.5, 0);
    this.scene.add(group);
    this.updateJumbotron({ home: 0, away: 0, quarterLabel: 'Q1', clock: '3:00' });
  }

  updateJumbotron({ home, away, quarterLabel, clock }) {
    const g = this.jumboCanvas.getContext('2d');
    const W = 512, H = 288;
    g.fillStyle = '#05060f';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a3cff';
    g.lineWidth = 6;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.textAlign = 'center';
    g.fillStyle = TEAMS[0].accent;
    g.font = 'bold 38px Arial Black, sans-serif';
    g.fillText(TEAMS[0].short, 110, 70);
    g.fillStyle = '#ffffff';
    g.font = 'bold 74px Consolas, monospace';
    g.fillText(String(home), 110, 155);
    g.fillStyle = TEAMS[1].accent === '#ffffff' ? '#7fffb2' : TEAMS[1].accent;
    g.font = 'bold 38px Arial Black, sans-serif';
    g.fillText(TEAMS[1].short, W - 110, 70);
    g.fillStyle = '#ffffff';
    g.font = 'bold 74px Consolas, monospace';
    g.fillText(String(away), W - 110, 155);
    g.fillStyle = '#ffd23f';
    g.font = 'bold 34px Consolas, monospace';
    g.fillText(quarterLabel, W / 2, 90);
    g.fillStyle = '#ff8c1a';
    g.font = 'bold 46px Consolas, monospace';
    g.fillText(clock, W / 2, 150);
    g.fillStyle = '#4a4a66';
    g.font = 'bold 26px Arial Black, sans-serif';
    g.fillText('FABLE LEAGUE BASKETBALL', W / 2, 240);
    this.jumboTex.needsUpdate = true;
  }

  // ---------- ceiling ----------
  buildCeiling() {
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });
    for (let i = -2; i <= 2; i++) {
      for (let j = -1; j <= 1; j++) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), panelMat);
        panel.position.set(i * 8, 17.5, j * 9);
        panel.rotation.x = Math.PI / 2;
        this.scene.add(panel);
      }
    }
    // truss beams
    const truss = new THREE.MeshStandardMaterial({ color: 0x20202a, roughness: 0.7, metalness: 0.5 });
    for (let j = -1; j <= 1; j++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 0.5), truss);
      beam.position.set(0, 17.2, j * 9);
      this.scene.add(beam);
    }
  }

  // ---------- scorer's table & benches ----------
  buildTables() {
    const tex = canvasTexture(1024, 64, (g) => {
      g.fillStyle = '#111433';
      g.fillRect(0, 0, 1024, 64);
      g.fillStyle = '#ffd23f';
      g.font = 'bold 40px Arial Black, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('FABLE LEAGUE  •  LIVE  •  FABLE LEAGUE', 512, 34);
    });
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.8, 0.7),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.4 })
    );
    table.position.set(0, 0.4, 8.6);
    this.scene.add(table);

    const benchMat = new THREE.MeshStandardMaterial({ color: 0x30303a, roughness: 0.8 });
    for (const x of [-7.5, 7.5]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.45, 0.6), benchMat);
      bench.position.set(x, 0.23, 8.7);
      this.scene.add(bench);
    }
  }
}
