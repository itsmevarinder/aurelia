import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

gsap.registerPlugin(ScrollTrigger);
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------- photography: fade in when loaded, graceful fallback if not ---------- */
$$('.ph img').forEach(img => {
    const done = () => img.classList.add('loaded');
    const fail = () => img.closest('.ph').classList.add('ph-fail');
    if (img.complete && img.naturalWidth) done();
    else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', fail, { once: true }); }
});

/* =========================================================
   PRELOADER
   ========================================================= */
const plNum = $('#plNum'), plBar = $('#plBar');
const prog = { v: 0 };
let progTween;
function setProgress(p, d = 0.8) {
    return new Promise(res => {
        progTween && progTween.kill();
        progTween = gsap.to(prog, {
            v: p, duration: d, ease: 'power2.out', onComplete: res,
            onUpdate() { plNum.textContent = Math.round(prog.v); plBar.style.transform = `scaleX(${prog.v / 100})`; }
        });
    });
}
setProgress(10);

/* =========================================================
   LENIS  <->  GSAP
   ========================================================= */
const lenis = new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9 });
lenis.stop();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

const nav = $('#nav');
const railBar = $('#railBar');
lenis.on('scroll', ({ scroll, progress }) => {
    nav.classList.toggle('scrolled', scroll > 40);
    railBar.style.transform = `scaleY(${progress || 0})`;
});
$$('[data-scroll]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    lenis.scrollTo(a.getAttribute('href'), { duration: 2.2, easing: t => 1 - Math.pow(1 - t, 4) });
}));

/* =========================================================
   THREE — renderer / camera
   ========================================================= */
const canvas = $('#webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x070709, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.05, 8.2);

const isMobile = () => window.innerWidth < 960;
function visibleSize() {
    const h = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { w: h * camera.aspect, h };
}
let respScale = 1;
const computeRespScale = () => { respScale = THREE.MathUtils.clamp(visibleSize().w / 4.8, 0.55, 1); };
computeRespScale();

/* =========================================================
   STUDIO SOFTBOX ENVIRONMENT (custom PMREM scene)
   ========================================================= */
const pmrem = new THREE.PMREMGenerator(renderer);
function buildStudioEnvironment() {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x030303);
    const room = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0x0a0908, side: THREE.BackSide }));
    env.add(room);
    const panel = (w, h, hex, intensity, pos) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide }));
        m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(2.4, 7, '#ffffff', 3.2, [-6.5, 1.2, 3.2]);   // large key softbox, front-left
    panel(0.55, 9, '#ffffff', 16, [6.5, 0.4, 1.6]);    // crisp vertical strip, right
    panel(0.45, 9, '#fff0cf', 9, [4.6, 0.6, -5.5]);    // warm strip, back-right (gold edge)
    panel(0.45, 8, '#ffffff', 10, [-4.8, 0.2, -5.4]);  // rim strip, back-left
    panel(0.35, 6, '#ffffff', 6, [2.4, 0.4, 8.5]);     // thin front glint strip
    panel(9, 2.2, '#fff6e6', 3.5, [0, 8.5, 0.5]);      // overhead
    panel(7, 1.4, '#d4af37', 2.4, [0, -6.5, 2.5]);     // gold floor bounce
    const tex = pmrem.fromScene(env, 0).texture;
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return tex;
}
scene.environment = buildStudioEnvironment();

/* ---------- lights ---------- */
scene.add(new THREE.AmbientLight(0xfff2dc, 0.05));
const keyLight = new THREE.DirectionalLight(0xffdcae, 2.6);
keyLight.position.set(-4, 5, 5);
scene.add(keyLight);
const RIM_DEFAULT = new THREE.Color('#7f98ff');
const rimLight = new THREE.DirectionalLight(RIM_DEFAULT.clone(), 3.6);
rimLight.position.set(5, 2.5, -4);
scene.add(rimLight);
const rimPoint = new THREE.PointLight(RIM_DEFAULT.clone(), 22, 14, 2);
rimPoint.position.set(-3.6, 1.4, -2.6);
scene.add(rimPoint);
const underGlow = new THREE.PointLight(0xd4af37, 10, 9, 2);
underGlow.position.set(0, -2.6, 1.8);
scene.add(underGlow);

/* =========================================================
   GEOMETRY HELPERS
   ========================================================= */
function roundedRect(w, h, rTop, rBot) {
    const s = new THREE.Shape(), x = w / 2, y = h / 2;
    s.moveTo(-x + rBot, -y); s.lineTo(x - rBot, -y); s.quadraticCurveTo(x, -y, x, -y + rBot);
    s.lineTo(x, y - rTop); s.quadraticCurveTo(x, y, x - rTop, y);
    s.lineTo(-x + rTop, y); s.quadraticCurveTo(-x, y, -x, y - rTop);
    s.lineTo(-x, -y + rBot); s.quadraticCurveTo(-x, -y, -x + rBot, -y);
    return s;
}
function sculpt(shape, depth, bevelT, bevelS, segs = 6, curve = 14) {
    const g = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: bevelT, bevelSize: bevelS, bevelSegments: segs, curveSegments: curve
    });
    g.translate(0, 0, -depth / 2);
    return toCreasedNormals(g, Math.PI / 4.2); // smooth rounded bevels, crisp large-angle edges
}
const canvasTex = (c, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
};

/* =========================================================
   GROUPS
   ========================================================= */
const scrollGroup = new THREE.Group();   // driven by scroll timeline
const floatGroup = new THREE.Group();    // idle float + mouse + intro
const sizeGroup = new THREE.Group();     // 50 / 100 ml
const assembly = new THREE.Group();      // all parts
assembly.position.y = -0.52;
scene.add(scrollGroup); scrollGroup.add(floatGroup); floatGroup.add(sizeGroup); sizeGroup.add(assembly);

/* =========================================================
   MATERIALS
   ========================================================= */
const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03,
    transmission: 0.96, ior: 1.54, thickness: 2.5,
    attenuationColor: new THREE.Color('#ffe8b3'), attenuationDistance: 1.8,
    clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.05
});
const liquidMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#c58a22'), emissive: new THREE.Color('#8a5a06'), emissiveIntensity: 0.16,
    roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    sheen: 0.4, sheenColor: new THREE.Color('#ffd27a'), envMapIntensity: 0.7, vertexColors: true
});
const goldMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d3a63a'), metalness: 0.95, roughness: 0.18, envMapIntensity: 1.1,
    anisotropy: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.2
});
const polishedGold = goldMat.clone(); polishedGold.roughness = 0.1; polishedGold.anisotropy = 0;
const silverMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.12, envMapIntensity: 1.2 });
const obsidianMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0b0e'), metalness: 0.15, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 1.25, sheen: 0.2, sheenColor: new THREE.Color('#3a2c1a')
});
const holeMat = new THREE.MeshBasicMaterial({ color: 0x030303 });
const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false });

/* =========================================================
   SCULPTED HEAVY CRYSTAL FLACON
   ========================================================= */
const GLASS_W = 1.42, GLASS_H = 1.9, GLASS_D = 0.72, BEV_T = 0.14, BEV_S = 0.1;
const glass = new THREE.Mesh(sculpt(roundedRect(GLASS_W, GLASS_H, 0.34, 0.16), GLASS_D, BEV_T, BEV_S, 6, 16), glassMat);
assembly.add(glass);
const FRONT_Z = GLASS_D / 2 + BEV_T;      // 0.50
const GLASS_TOP = GLASS_H / 2 + BEV_S;    // 1.05
const GLASS_BOTTOM = -GLASS_TOP;

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.08, 64), glassMat);
neck.position.y = GLASS_TOP + 0.02;
assembly.add(neck);

/* ---------- internal liquid (thick clear crystal base below it) ---------- */
const LIQ_W = 1.12, LIQ_H = 1.02, LIQ_D = 0.44, LIQ_B = 0.05;
const LIQ_BOTTOM = -0.62;
const LIQ_TOP = LIQ_BOTTOM + LIQ_H + LIQ_B * 2;
const liquidGeo = sculpt(roundedRect(LIQ_W, LIQ_H, 0.06, 0.1), LIQ_D, LIQ_B, LIQ_B, 3, 10);
liquidGeo.translate(0, LIQ_BOTTOM + LIQ_B + LIQ_H / 2, 0);
(() => { // depth absorption: denser colour toward the base
    const p = liquidGeo.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
        const k = THREE.MathUtils.clamp((p.getY(i) - LIQ_BOTTOM) / (LIQ_TOP - LIQ_BOTTOM), 0, 1);
        const v = 0.42 + Math.pow(k, 1.4) * 0.68;
        cols[i * 3] = v; cols[i * 3 + 1] = v * (0.94 + k * 0.06); cols[i * 3 + 2] = v * (0.86 + k * 0.14);
    }
    liquidGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
})();
const liquid = new THREE.Mesh(liquidGeo, liquidMat);
assembly.add(liquid);

/* ---------- curved meniscus surface with shimmer ---------- */
const MEN_W = LIQ_W + LIQ_B * 1.6, MEN_D = LIQ_D + LIQ_B * 1.6;
const meniscusGeo = new THREE.PlaneGeometry(MEN_W, MEN_D, 48, 20);
meniscusGeo.rotateX(-Math.PI / 2);
const menBase = Float32Array.from(meniscusGeo.attributes.position.array);
meniscusGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(meniscusGeo.attributes.position.count * 3).fill(1.08), 3));
const meniscus = new THREE.Mesh(meniscusGeo, liquidMat);
meniscus.position.y = LIQ_TOP - 0.012;
assembly.add(meniscus);
function updateMeniscus(t, slosh) {
    const p = meniscusGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = menBase[i * 3], z = menBase[i * 3 + 2];
        const edge = Math.max(Math.abs(x) / (MEN_W / 2), Math.abs(z) / (MEN_D / 2));
        const curl = Math.pow(edge, 6) * 0.03;                       // capillary rise at the walls
        const shimmer = Math.sin(x * 9 + t * 1.7) * Math.cos(z * 11 - t * 1.3) * 0.0028 + Math.sin(x * 23 - t * 2.6) * 0.0009;
        p.setY(i, curl + shimmer * (1 - edge * 0.6) + x * slosh);
    }
    p.needsUpdate = true;
    meniscusGeo.computeVertexNormals();
}

/* =========================================================
   EMBOSSED COTTON-PAPER + GOLD-FOIL LABEL (1024²: colour, roughness, metalness, bump)
   ========================================================= */
const LBL = 1024;
const mkCanvas = () => { const c = document.createElement('canvas'); c.width = c.height = LBL; return c; };
const lblColor = mkCanvas(), lblRough = mkCanvas(), lblMetal = mkCanvas(), lblBump = mkCanvas();
const noiseCanvas = (() => {   // cotton fibre grain
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), d = x.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 118 + Math.random() * 20; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    x.globalAlpha = 0.16; x.strokeStyle = '#000'; x.lineWidth = 0.6;
    for (let i = 0; i < 220; i++) { x.beginPath(); const sx = Math.random() * 256, sy = Math.random() * 256; x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.random() * 20 - 10, sy + Math.random() * 20 - 10, sx + Math.random() * 30 - 15, sy + Math.random() * 30 - 15); x.stroke(); }
    return c;
})();
function spaced(ctx, text, cx, y, spacing) {
    const chars = [...text], widths = chars.map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = cx - total / 2; ctx.textAlign = 'left';
    chars.forEach((ch, i) => { ctx.fillText(ch, x, y); x += widths[i] + spacing; });
}
function paintLabel(ctx, mode, ml) {
    const W = LBL, H = LBL;
    const paper = { color: '#efe7d6', rough: '#d6d6d6', metal: '#000', bump: '#7a7a7a' }[mode];
    const foil = mode === 'color'
        ? (() => { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#8d6a1c'); g.addColorStop(.3, '#f1d98e'); g.addColorStop(.52, '#c9a03a'); g.addColorStop(.75, '#f6e2a2'); g.addColorStop(1, '#8d6a1c'); return g; })()
        : { rough: '#3a3a3a', metal: '#fff', bump: '#c8c8c8' }[mode];
    const ink = { color: '#1b1612', rough: '#b0b0b0', metal: '#000', bump: '#a2a2a2' }[mode];
    const inkSoft = { color: 'rgba(27,22,18,.62)', rough: '#b8b8b8', metal: '#000', bump: '#949494' }[mode];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
    if (mode === 'color' || mode === 'bump') {
        ctx.save(); ctx.globalAlpha = mode === 'color' ? 0.22 : 0.9; ctx.globalCompositeOperation = mode === 'color' ? 'multiply' : 'source-over';
        ctx.fillStyle = ctx.createPattern(noiseCanvas, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (mode === 'color') {
        const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(70,50,20,.18)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    ctx.filter = mode === 'bump' ? 'blur(1.6px)' : 'none';
    // double gold-foil border
    ctx.strokeStyle = foil; ctx.lineWidth = 5; ctx.strokeRect(46, 46, W - 92, H - 92);
    ctx.lineWidth = 2; ctx.strokeRect(66, 66, W - 132, H - 132);
    ctx.fillStyle = foil;
    [[66, 66], [W - 66, 66], [66, H - 66], [W - 66, H - 66]].forEach(([x, y]) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-9, -9, 18, 18); ctx.restore(); });
    // monogram crest
    ctx.save(); ctx.translate(W / 2, 214); ctx.rotate(Math.PI / 4); ctx.lineWidth = 3; ctx.strokeStyle = foil; ctx.strokeRect(-34, -34, 68, 68); ctx.restore();
    ctx.font = 'italic 500 62px "Cormorant Garamond", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('A', W / 2, 216);
    ctx.textBaseline = 'alphabetic';
    // AURELIA — gold foil
    ctx.font = '500 150px "Cormorant Garamond", serif';
    spaced(ctx, 'AURELIA', W / 2, 452, 26);
    ctx.fillRect(W / 2 - 170, 500, 340, 2.5);
    // L'ÉLIXIR NOCTURNE — embossed ink
    ctx.fillStyle = ink;
    ctx.font = 'italic 500 66px "Cormorant Garamond", serif';
    spaced(ctx, "L'ÉLIXIR NOCTURNE", W / 2, 600, 5);
    ctx.fillStyle = inkSoft;
    ctx.font = '500 25px "Plus Jakarta Sans", sans-serif';
    spaced(ctx, `EXTRAIT DE PARFUM  •  ${ml} ML  •  ${ml === 50 ? '1.7' : '3.4'} FL.OZ`, W / 2, 704, 6);
    // PARIS — foil
    ctx.fillStyle = foil;
    ctx.fillRect(W / 2 - 60, 790, 120, 1.5);
    ctx.font = '500 34px "Cormorant Garamond", serif';
    spaced(ctx, 'PARIS', W / 2, 858, 22);
    ctx.filter = 'none';
}
const labelTex = canvasTex(lblColor), labelRoughTex = canvasTex(lblRough, false), labelMetalTex = canvasTex(lblMetal, false), labelBumpTex = canvasTex(lblBump, false);
function drawLabel(ml = 100) {
    paintLabel(lblColor.getContext('2d'), 'color', ml);
    paintLabel(lblRough.getContext('2d'), 'rough', ml);
    paintLabel(lblMetal.getContext('2d'), 'metal', ml);
    paintLabel(lblBump.getContext('2d'), 'bump', ml);
    [labelTex, labelRoughTex, labelMetalTex, labelBumpTex].forEach(t => t.needsUpdate = true);
}
const labelMat = new THREE.MeshPhysicalMaterial({
    map: labelTex, roughnessMap: labelRoughTex, metalnessMap: labelMetalTex, bumpMap: labelBumpTex, bumpScale: 1.6,
    roughness: 1, metalness: 1, envMapIntensity: 0.9, clearcoat: 0.08, transparent: true, sheen: 0.3, sheenColor: new THREE.Color('#fff4dd')
});
const label = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), labelMat);
label.position.set(0, -0.08, FRONT_Z + 0.003);
label.renderOrder = 2;
assembly.add(label);

/* =========================================================
   ATOMIZER: knurled 24K collar, actuator, micro-orifice, curved dip tube
   ========================================================= */
const collarGroup = new THREE.Group();
assembly.add(collarGroup);
const COLLAR_Y = GLASS_TOP + 0.02;
const knurlGeo = (() => {
    const g = new THREE.CylinderGeometry(0.27, 0.27, 0.2, 288, 4, false);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        if (Math.hypot(x, z) < 0.2) continue;
        const ridge = Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 96), 0.7);
        const k = 1 + ridge * 0.03;
        p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
})();
const knurl = new THREE.Mesh(knurlGeo, goldMat);
knurl.position.y = COLLAR_Y + 0.14;
const bandLo = new THREE.Mesh(new THREE.CylinderGeometry(0.288, 0.296, 0.04, 96), polishedGold);
bandLo.position.y = COLLAR_Y + 0.02;
const bandHi = new THREE.Mesh(new THREE.CylinderGeometry(0.276, 0.288, 0.035, 96), polishedGold);
bandHi.position.y = COLLAR_Y + 0.258;
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 32), silverMat);
stem.position.y = COLLAR_Y + 0.305;

const actuatorGroup = new THREE.Group();
actuatorGroup.rotation.y = 1.0;                // orifice faces right-front, slightly toward the viewer
const ACT_Y = COLLAR_Y + 0.43;
const actuator = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.16, 0.19, 96), polishedGold);
actuator.position.y = ACT_Y;
const actDome = new THREE.Mesh(new THREE.SphereGeometry(0.148, 64, 16, 0, Math.PI * 2, 0, Math.PI / 2), polishedGold);
actDome.scale.y = 0.32; actDome.position.y = ACT_Y + 0.095;
const orificeRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 16, 40), silverMat);
orificeRing.position.set(0, ACT_Y + 0.01, 0.156);
const orificeHole = new THREE.Mesh(new THREE.CircleGeometry(0.02, 24), holeMat);
orificeHole.position.set(0, ACT_Y + 0.01, 0.1575);
const nozzleTip = new THREE.Object3D(); nozzleTip.position.set(0, ACT_Y + 0.01, 0.175);
actuatorGroup.add(actuator, actDome, orificeRing, orificeHole, nozzleTip);
const actuatorPress = new THREE.Group(); actuatorPress.add(actuatorGroup);

// barely-visible curved glass dip tube reaching the bottom corner
const tubeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, COLLAR_Y + 0.05, 0), new THREE.Vector3(0.01, 0.62, 0), new THREE.Vector3(0.06, 0.05, 0.02),
    new THREE.Vector3(0.24, -0.4, 0.05), new THREE.Vector3(0.44, LIQ_BOTTOM + 0.04, 0.08)
]);
const dipTube = new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 80, 0.0075, 10, false), tubeMat);
dipTube.renderOrder = 1;
collarGroup.add(knurl, bandLo, bandHi, stem, actuatorPress, dipTube);
[knurl, bandLo, bandHi, stem, actuator, actDome, orificeRing, orificeHole].forEach(m => m.renderOrder = 2);

/* =========================================================
   HEAVY MAGNETIC CAP — smoked obsidian + gold
   ========================================================= */
const capGroup = new THREE.Group();
assembly.add(capGroup);
const CAP_W = 0.8, CAP_H = 0.92, CAP_D = 0.6, CAP_BEV = 0.06;
const CAP_BASE = GLASS_TOP + 0.03;
const capBody = new THREE.Mesh(sculpt(roundedRect(CAP_W, CAP_H, 0.14, 0.03), CAP_D, CAP_BEV, CAP_BEV, 5, 12), obsidianMat);
capBody.position.y = CAP_BASE + CAP_BEV + CAP_H / 2;
const capBand = new THREE.Mesh(sculpt(roundedRect(CAP_W + 0.05, 0.06, 0.01, 0.01), CAP_D + 0.05, 0.03, 0.02, 3, 6), polishedGold);
capBand.position.y = CAP_BASE + 0.06;
const plaqueCanvas = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; return c; })();
const plaqueTex = canvasTex(plaqueCanvas);
function drawPlaque() {
    const x = plaqueCanvas.getContext('2d');
    x.clearRect(0, 0, 256, 256);
    const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#9c7623'); g.addColorStop(.45, '#f3dc94'); g.addColorStop(1, '#a37b25');
    x.strokeStyle = g; x.fillStyle = g; x.lineWidth = 5;
    x.save(); x.translate(128, 128); x.rotate(Math.PI / 4); x.strokeRect(-70, -70, 140, 140); x.restore();
    x.font = 'italic 500 120px "Cormorant Garamond", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('A', 128, 134);
    plaqueTex.needsUpdate = true;
}
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshPhysicalMaterial({ map: plaqueTex, transparent: true, metalness: 0.9, roughness: 0.2, envMapIntensity: 1.2 }));
plaque.position.set(0, CAP_BASE + CAP_BEV + CAP_H * 0.56, CAP_D / 2 + CAP_BEV + 0.002);
capGroup.add(capBody, capBand, plaque);
[capBody, capBand, plaque].forEach(m => m.renderOrder = 2);

/* ---------- 3D anchors ---------- */
const anchorCrystal = new THREE.Object3D(); anchorCrystal.position.set(0.78, -0.82, 0.3); assembly.add(anchorCrystal);
const anchorAtomizer = new THREE.Object3D(); anchorAtomizer.position.set(0.28, COLLAR_Y + 0.14, 0.05); collarGroup.add(anchorAtomizer);
const anchorLiquid = new THREE.Object3D(); anchorLiquid.position.set(-0.5, 0.2, 0.22); assembly.add(anchorLiquid);
const anchorBase = new THREE.Object3D(); anchorBase.position.set(0, GLASS_BOTTOM, 0); assembly.add(anchorBase);

/* =========================================================
   BACKDROP GLOW, CONTACT SHADOW, LIGHT POOL
   ========================================================= */
function radialCanvas(size, stops, bg = null) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
}
const glowMat = new THREE.MeshBasicMaterial({
    map: canvasTex(radialCanvas(512, [[0, 'rgba(255,255,255,.7)'], [.2, 'rgba(255,255,255,.3)'], [.5, 'rgba(255,255,255,.07)'], [1, 'rgba(0,0,0,1)']], '#000')),
    color: new THREE.Color('#D4AF37').multiplyScalar(0.4), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
});
const glow = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), glowMat);
glow.position.z = -3;
scene.add(glow);

const shadowMat = new THREE.MeshBasicMaterial({
    map: canvasTex(radialCanvas(256, [[0, 'rgba(0,0,0,.95)'], [.35, 'rgba(0,0,0,.6)'], [.7, 'rgba(0,0,0,.18)'], [1, 'rgba(0,0,0,0)']])),
    transparent: true, depthWrite: false, toneMapped: false
});
const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
contactShadow.rotation.x = -Math.PI / 2;
scene.add(contactShadow);
const poolMat = new THREE.MeshBasicMaterial({
    map: canvasTex(radialCanvas(256, [[0, 'rgba(255,255,255,.5)'], [.4, 'rgba(255,255,255,.14)'], [1, 'rgba(255,255,255,0)']])),
    color: new THREE.Color('#d4af37'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
});
const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat);
lightPool.rotation.x = -Math.PI / 2;
scene.add(lightPool);

/* =========================================================
   AMBIENT GOLDEN DUST (150)
   ========================================================= */
const dotTex = canvasTex(radialCanvas(64, [[0, 'rgba(255,240,205,1)'], [.3, 'rgba(255,214,130,.55)'], [1, 'rgba(255,200,90,0)']]));
const P_COUNT = 150;
const pBase = new Float32Array(P_COUNT * 3), pPos = new Float32Array(P_COUNT * 3), pSeed = new Float32Array(P_COUNT * 3);
for (let i = 0; i < P_COUNT; i++) {
    const r = 1.5 + Math.random() * 2.6, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pBase[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pBase[i * 3 + 1] = r * Math.cos(ph) * 0.85;
    pBase[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    pSeed[i * 3] = Math.random() * Math.PI * 2; pSeed[i * 3 + 1] = 0.2 + Math.random() * 0.5; pSeed[i * 3 + 2] = Math.random();
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ size: 0.045, map: dotTex, color: 0xd4af37, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
const dust = new THREE.Points(pGeo, pMat);
dust.frustumCulled = false;
scene.add(dust);

/* =========================================================
   VOLUMETRIC PERFUME SPRAY (soft sprite particles with air drag)
   ========================================================= */
const MIST_MAX = 1100;
const mistTexCanvas = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 7; i++) { // irregular soft puff
        const px = 64 + (Math.random() - .5) * 34, py = 64 + (Math.random() - .5) * 34, r = 26 + Math.random() * 30;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(.5, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    return c;
})();
const mistGeo = new THREE.BufferGeometry();
const mPos = new Float32Array(MIST_MAX * 3), mSize = new Float32Array(MIST_MAX), mAlpha = new Float32Array(MIST_MAX), mTint = new Float32Array(MIST_MAX);
mistGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
mistGeo.setAttribute('aSize', new THREE.BufferAttribute(mSize, 1));
mistGeo.setAttribute('aAlpha', new THREE.BufferAttribute(mAlpha, 1));
mistGeo.setAttribute('aTint', new THREE.BufferAttribute(mTint, 1));
const mistMat = new THREE.ShaderMaterial({
    uniforms: {
        uTex: { value: canvasTex(mistTexCanvas) },
        uScale: { value: 1 },
        uWarm: { value: new THREE.Color('#ffd98c') },
        uCool: { value: new THREE.Color('#fff8ec') }
    },
    vertexShader: `
    attribute float aSize; attribute float aAlpha; attribute float aTint;
    uniform float uScale; varying float vA; varying float vT;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uScale / max(0.1, -mv.z);
      vA = aAlpha; vT = aTint;
    }`,
    fragmentShader: `
    uniform sampler2D uTex; uniform vec3 uWarm; uniform vec3 uCool;
    varying float vA; varying float vT;
    void main(){
      vec4 t = texture2D(uTex, gl_PointCoord);
      gl_FragColor = vec4(mix(uCool, uWarm, vT), t.a * vA);
    }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
const mist = new THREE.Points(mistGeo, mistMat);
mist.frustumCulled = false;
scene.add(mist);
const mVel = new Float32Array(MIST_MAX * 3), mAge = new Float32Array(MIST_MAX).fill(1e9), mLife = new Float32Array(MIST_MAX).fill(1),
    mS0 = new Float32Array(MIST_MAX), mS1 = new Float32Array(MIST_MAX), mA0 = new Float32Array(MIST_MAX), mSeed = new Float32Array(MIST_MAX), mDrag = new Float32Array(MIST_MAX);
let mistCursor = 0;
const emitter = { remaining: 0, rate: 0 };
const _tip = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
function updateMistScale() { mistMat.uniforms.uScale.value = renderer.getPixelRatio() * window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }
updateMistScale();
function emitMist(n) {
    nozzleTip.getWorldPosition(_tip);
    nozzleTip.getWorldQuaternion(_q);
    const ws = respScale * sizeGroup.scale.x * scrollGroup.scale.x;
    for (let k = 0; k < n; k++) {
        const i = mistCursor; mistCursor = (mistCursor + 1) % MIST_MAX;
        const droplet = Math.random() < 0.28;
        // fine conical plume around the nozzle axis
        const cone = (droplet ? 0.1 : 0.2) * Math.sqrt(Math.random()), phi = Math.random() * Math.PI * 2;
        _dir.set(Math.sin(cone) * Math.cos(phi), Math.sin(cone) * Math.sin(phi) + 0.03, Math.cos(cone)).applyQuaternion(_q).normalize();
        const speed = (droplet ? 5.5 : 3.4) * (0.75 + Math.random() * 0.5) * ws;
        mPos[i * 3] = _tip.x + _dir.x * 0.02; mPos[i * 3 + 1] = _tip.y + _dir.y * 0.02; mPos[i * 3 + 2] = _tip.z + _dir.z * 0.02;
        mVel[i * 3] = _dir.x * speed; mVel[i * 3 + 1] = _dir.y * speed; mVel[i * 3 + 2] = _dir.z * speed;
        mAge[i] = 0;
        mLife[i] = droplet ? 0.9 + Math.random() * 0.7 : 2.4 + Math.random() * 1.8;
        mS0[i] = (droplet ? 0.015 : 0.04) * ws;
        mS1[i] = (droplet ? 0.05 + Math.random() * 0.04 : 0.55 + Math.random() * 0.75) * ws;
        mA0[i] = droplet ? 0.55 + Math.random() * 0.3 : 0.1 + Math.random() * 0.12;
        mDrag[i] = droplet ? 2.0 : 2.9 + Math.random() * 0.8;
        mSeed[i] = Math.random() * 100;
        mTint[i] = Math.random() * 0.75;
    }
}
let mistAlive = false;
function updateMist(dt, t) {
    if (emitter.remaining > 0) {
        const n = Math.min(emitter.remaining, Math.ceil(emitter.rate * dt));
        emitMist(n); emitter.remaining -= n;
    }
    let any = false;
    for (let i = 0; i < MIST_MAX; i++) {
        if (mAge[i] > mLife[i]) { if (mAlpha[i] !== 0) { mAlpha[i] = 0; mSize[i] = 0; } continue; }
        any = true;
        const a = mAge[i] = mAge[i] + dt, k = Math.min(a / mLife[i], 1), j = i * 3, s = mSeed[i];
        const drag = Math.exp(-mDrag[i] * dt);                     // air resistance
        mVel[j] *= drag; mVel[j + 1] *= drag; mVel[j + 2] *= drag;
        const slow = Math.min(1, k * 3);                           // buoyant vapour + turbulence once slowed
        mVel[j + 1] += (0.16 + Math.sin(s) * 0.05) * dt * slow;
        mVel[j] += Math.sin(t * 1.3 + s + mPos[j + 1] * 2.2) * 0.22 * dt * slow;
        mVel[j + 2] += Math.cos(t * 1.1 + s * 1.7 + mPos[j] * 1.8) * 0.18 * dt * slow;
        mPos[j] += mVel[j] * dt; mPos[j + 1] += mVel[j + 1] * dt; mPos[j + 2] += mVel[j + 2] * dt;
        mSize[i] = mS0[i] + (mS1[i] - mS0[i]) * (1 - Math.pow(1 - k, 2.4));
        mAlpha[i] = mA0[i] * Math.min(1, k / 0.05) * Math.pow(1 - k, 1.5);
    }
    if (any || mistAlive) {
        mistGeo.attributes.position.needsUpdate = true;
        mistGeo.attributes.aSize.needsUpdate = true;
        mistGeo.attributes.aAlpha.needsUpdate = true;
        mistGeo.attributes.aTint.needsUpdate = true;
    }
    mistAlive = any;
}

/* =========================================================
   STATE
   ========================================================= */
const S = { x: 0, y: 0, rx: 0, ry: 0, rz: 0, s: 1, cap: 0, collar: 0, mist: 0, call: 0 };
const manual = { cap: 0, press: 0 };
const intro = { s: 0.55, r: -1.6, y: -0.9 };
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
});

/* ---------- spray choreography ---------- */
let sprayBusy = false;
function pressAndSpray() {
    gsap.timeline()
        .to(manual, { press: 1, duration: 0.11, ease: 'power2.in' })
        .add(() => { emitter.remaining = 620; emitter.rate = 2600; })
        .to(manual, { press: 0, duration: 0.45, ease: 'power3.out' }, '+=0.16');
}
function sprayMist(btn) {
    if (sprayBusy) return;
    sprayBusy = true;
    if (btn) { btn.classList.remove('firing'); void btn.offsetWidth; btn.classList.add('firing'); }
    const closed = Math.max(S.cap, manual.cap) < 0.6;
    const tl = gsap.timeline({ onComplete: () => { sprayBusy = false; } });
    if (closed) tl.to(manual, { cap: 1, duration: 1.0, ease: 'power3.inOut' });
    tl.add(pressAndSpray);
    if (closed) tl.to(manual, { cap: 0, duration: 1.2, ease: 'power3.inOut' }, '+=2.0');
    else tl.to({}, { duration: 1.2 });
}
$$('[data-spray]').forEach(b => b.addEventListener('click', () => sprayMist(b)));
let autoSprayed = false;

/* =========================================================
   CALLOUTS (projected from 3D anchors)
   ========================================================= */
const callouts = [
    { obj: anchorCrystal, side: 1, dy: 30 },
    { obj: anchorAtomizer, side: 1, dy: -60 },
    { obj: anchorLiquid, side: -1, dy: 50 }
].map((c, i) => ({ ...c, line: $('#cl-line-' + i), dot: $('#cl-dot-' + i), ring: $('#cl-ring-' + i), box: $('#cl-box-' + i) }));
const calloutLayer = $('#callouts');
const _v = new THREE.Vector3();
function updateCallouts() {
    calloutLayer.style.opacity = S.call.toFixed(3);
    calloutLayer.style.visibility = S.call > 0.01 ? 'visible' : 'hidden';
    if (S.call <= 0.01) return;
    const W = window.innerWidth, H = window.innerHeight, mob = isMobile();
    const dx = mob ? Math.min(60, W * 0.1) : Math.min(210, W * 0.14);
    callouts.forEach((c, i) => {
        c.obj.getWorldPosition(_v).project(camera);
        const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
        const bw = c.box.offsetWidth, bh = c.box.offsetHeight;
        let lx = sx + c.side * dx, ly = sy + c.dy * (mob ? 0.6 : 1);
        if (c.side > 0) lx = Math.min(lx, W - bw - 14); else lx = Math.max(lx, bw + 14);
        ly = THREE.MathUtils.clamp(ly, bh / 2 + 84, H - bh / 2 - 20);
        const ex = sx + c.side * Math.min(36, Math.abs(lx - sx) * 0.4);
        c.line.setAttribute('points', `${sx},${sy} ${ex},${ly} ${lx},${ly}`);
        c.dot.setAttribute('cx', sx); c.dot.setAttribute('cy', sy);
        c.ring.setAttribute('cx', sx); c.ring.setAttribute('cy', sy);
        const reveal = THREE.MathUtils.clamp(S.call * 3 - i * 0.9, 0, 1);
        c.box.style.opacity = reveal;
        c.box.style.transform = `translate(${lx + (c.side < 0 ? -bw : 0)}px, ${ly - bh / 2 + (1 - reveal) * 14}px)`;
    });
}

/* =========================================================
   RENDER LOOP
   ========================================================= */
const clock = new THREE.Clock();
const _base = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
let elapsed = 0;
function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const t = elapsed;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    scrollGroup.position.set(S.x, S.y, 0);
    scrollGroup.rotation.set(S.rx, S.ry, S.rz);
    scrollGroup.scale.setScalar(S.s);

    const floatY = reduceMotion ? 0 : Math.sin(t * 0.9) * 0.05;
    floatGroup.position.y = floatY + intro.y;
    floatGroup.rotation.x = mouse.y * 0.12;
    floatGroup.rotation.y = mouse.x * 0.3 + (reduceMotion ? 0 : Math.sin(t * 0.3) * 0.12) + intro.r;
    floatGroup.rotation.z = (reduceMotion ? 0 : Math.sin(t * 0.6) * 0.012) - mouse.x * 0.03;
    floatGroup.scale.setScalar(respScale * intro.s);

    // cap: scroll-driven OR manual (spray button) — heavy magnetic lift with slight drift
    const capK = Math.max(S.cap, manual.cap);
    capGroup.position.y = capK * 1.22 + Math.sin(t * 1.3) * 0.025 * capK;
    capGroup.rotation.y = capK * 0.55;
    capGroup.rotation.z = capK * 0.06;
    collarGroup.position.y = S.collar * 0.22;
    actuatorPress.position.y = -manual.press * 0.04;

    // synchronized burst right as the cap clears the nozzle on scroll
    if (S.cap > 0.62 && !autoSprayed) { autoSprayed = true; if (!sprayBusy) pressAndSpray(); }
    if (S.cap < 0.2) autoSprayed = false;

    // liquid: meniscus shimmer + slosh from motion; dip tube tinted by the liquid
    updateMeniscus(t, -(floatGroup.rotation.z + scrollGroup.rotation.z) * 0.08);
    tubeMat.color.copy(liquidMat.color).multiplyScalar(1.22).lerp(WHITE, 0.06);

    glow.position.x = scrollGroup.position.x * 0.9;
    glow.position.y = scrollGroup.position.y - 0.1;
    glow.scale.setScalar(respScale * (1 + S.mist * 0.2));

    // contact shadow + warm light pool under the base
    anchorBase.getWorldPosition(_base);
    const ws = respScale * S.s * sizeGroup.scale.x * intro.s;
    const lift = floatY + intro.y;
    const tilt = Math.abs(scrollGroup.rotation.z) + Math.abs(scrollGroup.rotation.x);
    const floorY = scrollGroup.position.y + (assembly.position.y + GLASS_BOTTOM) * ws - 0.06 * ws;
    contactShadow.position.set(_base.x, floorY - Math.max(0, lift) * 0.4, _base.z);
    contactShadow.scale.set(2.1 * ws * (1 + Math.abs(lift) * 0.6 + tilt * 0.4), 1.25 * ws * (1 + Math.abs(lift) * 0.6), 1);
    shadowMat.opacity = THREE.MathUtils.clamp(0.85 - Math.abs(lift) * 2.5 - tilt * 0.6, 0.25, 0.9) * Math.min(1, intro.s * 1.4);
    lightPool.position.set(_base.x, contactShadow.position.y - 0.005, _base.z + 0.15);
    lightPool.scale.set(3.4 * ws, 2 * ws, 1);

    dust.position.copy(scrollGroup.position);
    const spread = 1 + S.mist * 0.9;
    for (let i = 0; i < P_COUNT; i++) {
        const k = i * 3, ph = pSeed[k], sp = pSeed[k + 1];
        pPos[k] = pBase[k] * spread * respScale + Math.sin(t * sp + ph) * 0.12;
        pPos[k + 1] = pBase[k + 1] * spread * respScale + Math.sin(t * sp * 0.8 + ph * 1.7) * 0.16;
        pPos[k + 2] = pBase[k + 2] * spread * respScale + Math.cos(t * sp * 0.9 + ph) * 0.1;
    }
    pGeo.attributes.position.needsUpdate = true;
    dust.rotation.y = t * 0.03;
    pMat.opacity = 0.5 + S.mist * 0.35;

    updateMist(dt, t);
    renderer.render(scene, camera);
    updateCallouts();
}

/* =========================================================
   SCROLL CHOREOGRAPHY — one master timeline measured in scroll pixels
   ========================================================= */
const K = {
    hero: () => ({ x: 0, y: 0, rx: 0, ry: 0, rz: 0, s: 1 }),
    notes: () => ({ x: isMobile() ? 0 : visibleSize().w * 0.23, y: isMobile() ? 1.15 : 0, rx: 0.08, ry: -0.62, rz: -0.12, s: isMobile() ? 0.68 : 0.95 }),
    atelier: () => ({ x: isMobile() ? 0 : visibleSize().w * 0.3, y: isMobile() ? 1.35 : 0.05, rx: -0.04, ry: -0.2, rz: 0.05, s: isMobile() ? 0.55 : 0.86 }),
    craft: () => ({ x: isMobile() ? 0 : visibleSize().w * 0.04, y: isMobile() ? -0.25 : -0.5, rx: -0.03, ry: 0.5, rz: 0, s: isMobile() ? 0.74 : 0.84 }),
    shop: () => ({ x: isMobile() ? 0 : -visibleSize().w * 0.21, y: isMobile() ? 1.15 : -0.05, rx: 0, ry: -0.3, rz: 0.035, s: isMobile() ? 0.64 : 1 })
};
let master = null;
function scrollAt(sel, edge, vpFrac) {
    const el = $(sel), r = el.getBoundingClientRect(), top = r.top + window.scrollY;
    return Math.max(0, (edge === 'top' ? top : top + r.height) - window.innerHeight * vpFrac);
}
function buildMaster() {
    if (master) { master.scrollTrigger && master.scrollTrigger.kill(); master.kill(); }
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const kH = K.hero(), kN = K.notes(), kA = K.atelier(), kC = K.craft(), kS = K.shop();
    master = gsap.timeline({
        defaults: { ease: 'none', immediateRender: false },
        scrollTrigger: { start: 0, end: () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight), scrub: 1.1 }
    });
    master.to({}, { duration: max }, 0);
    master.set(S, { ...kH, cap: 0, collar: 0, mist: 0, call: 0 }, 0);
    const seg = (a, b, from, to, ease = 'none') => { if (b > a) master.fromTo(S, from, { ...to, duration: b - a, ease }, a); };

    seg(scrollAt('#notes', 'top', 1), scrollAt('#notes', 'top', 0.15), kH, kN, 'power1.inOut');
    seg(scrollAt('#atelier', 'top', 1), scrollAt('#atelier', 'top', 0.2), kN, kA, 'power1.inOut');
    seg(scrollAt('#craftsmanship', 'top', 1), scrollAt('#craftsmanship', 'top', 0.15), kA, kC, 'power1.inOut');

    // exploded view: heavy cap lifts first, collar + mist follow
    const exA = scrollAt('#craftsmanship', 'top', 0.4), exB = scrollAt('#craftsmanship', 'bottom', 1);
    seg(exA, exA + (exB - exA) * 0.45, { cap: 0 }, { cap: 1 }, 'power3.inOut');
    seg(exA + (exB - exA) * 0.2, exB, { collar: 0, mist: 0 }, { collar: 1, mist: 1 }, 'power2.inOut');
    seg(scrollAt('#craftsmanship', 'top', 0.3), scrollAt('#craftsmanship', 'top', -0.05), { call: 0 }, { call: 1 });

    const shA = Math.max(exB, scrollAt('#edition', 'top', 1)), shB = scrollAt('#edition', 'top', 0.15);
    seg(shA, shB, { ...kC, cap: 1, collar: 1, mist: 1 }, { ...kS, cap: 0, collar: 0, mist: 0 }, 'power2.inOut');
    seg(scrollAt('#edition', 'top', 0.88), scrollAt('#edition', 'top', 0.6), { call: 1 }, { call: 0 });
}
let rebuildTimer;

function buildScroll() {
    buildMaster();
    gsap.to('.hero-inner', { yPercent: -12, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 25%', scrub: true } });
    gsap.to('#atmos', { yPercent: -6, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
    gsap.fromTo('#atelierImg', { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: '#atelier', start: 'top bottom', end: 'bottom top', scrub: true } });

    $$('.reveal').forEach(el => gsap.from(el, {
        y: 44, opacity: 0, duration: 1.5, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' }
    }));
    gsap.from('.note-card', {
        x: -80, opacity: 0, duration: 1.5, ease: 'expo.out', stagger: 0.16,
        scrollTrigger: { trigger: '.notes-cards', start: 'top 82%', toggleActions: 'play none none reverse' }
    });
    $$('main > section').forEach(sec => ScrollTrigger.create({
        trigger: sec, start: 'top 55%', end: 'bottom 55%',
        onToggle: self => { if (self.isActive) $('#railCount').textContent = sec.dataset.index; }
    }));
}

/* =========================================================
   NOTES hover → rim light colour
   ========================================================= */
function tweenColor(target, color, dur = 1.2) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    return gsap.to(target, { r: c.r, g: c.g, b: c.b, duration: dur, ease: 'power2.inOut', overwrite: 'auto' });
}
$$('.note-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        tweenColor(rimLight.color, card.dataset.rim, 0.8); tweenColor(rimPoint.color, card.dataset.rim, 0.8);
        gsap.to(rimLight, { intensity: 6.5, duration: 0.8 }); gsap.to(rimPoint, { intensity: 38, duration: 0.8 });
    });
    card.addEventListener('mouseleave', () => {
        tweenColor(rimLight.color, RIM_DEFAULT, 1.1); tweenColor(rimPoint.color, RIM_DEFAULT, 1.1);
        gsap.to(rimLight, { intensity: 3.6, duration: 1.1 }); gsap.to(rimPoint, { intensity: 22, duration: 1.1 });
    });
});

/* =========================================================
   CONFIGURATOR
   ========================================================= */
const EDITIONS = {
    amber: {
        name: 'Nocturne Amber', liquid: '#c58a22', emissive: '#8a5a06', glow: '#D4AF37', glowI: 0.4, mist: '#ffd98c', swatch: '#D4AF37',
        desc: 'The signature: liquid gold of amber resin, warm vanilla and a whisper of smoked iris.'
    },
    rose: {
        name: 'Velvet Rose', liquid: '#9a1d42', emissive: '#5c0a22', glow: '#c2456b', glowI: 0.42, mist: '#ffc0d0', swatch: '#c2456b',
        desc: 'Damask rose absolute, deepened with pink pepper and a velvet base of ambergris.'
    },
    oud: {
        name: 'Obsidian Oud', liquid: '#3d1e0f', emissive: '#1f0d04', glow: '#9a6430', glowI: 0.46, mist: '#e8c39a', swatch: '#8c5a2e',
        desc: 'Aged oud and black amber, smouldering like embers in an unlit room.'
    }
};
const PRICES = { 50: 210, 100: 320 };
const state = { edition: 'amber', size: 100 };
const priceEl = $('#price'), priceObj = { v: 320 };

function setEdition(key) {
    const e = EDITIONS[key]; if (!e) return;
    state.edition = key;
    tweenColor(liquidMat.color, e.liquid, 1.5);
    tweenColor(liquidMat.emissive, e.emissive, 1.5);
    tweenColor(glowMat.color, new THREE.Color(e.glow).multiplyScalar(e.glowI), 1.5);
    tweenColor(underGlow.color, e.glow, 1.5);
    tweenColor(poolMat.color, e.glow, 1.5);
    tweenColor(mistMat.uniforms.uWarm.value, e.mist, 1.5);
    tweenColor(pMat.color, key === 'rose' ? '#f0a0b4' : key === 'oud' ? '#c98d4a' : '#d4af37', 1.5);
    gsap.fromTo(liquidMat, { emissiveIntensity: 0.7 }, { emissiveIntensity: 0.16, duration: 1.8, ease: 'power2.out' });
    $$('.ed-opt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.edition === key)));
    const swap = [$('#edName'), $('#edDesc'), $('#edLabel')];
    gsap.to(swap, {
        opacity: 0, y: -6, duration: 0.25, ease: 'power2.in', onComplete() {
            $('#edName').textContent = e.name; $('#edLabel').textContent = e.name; $('#edDesc').textContent = e.desc;
            gsap.to(swap, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' });
        }
    });
}
function setSize(ml) {
    ml = Number(ml); state.size = ml;
    const s = ml === 50 ? 0.82 : 1;
    gsap.to(sizeGroup.scale, { x: s, y: s, z: s, duration: 1.4, ease: 'expo.inOut' });
    gsap.to(priceObj, { v: PRICES[ml], duration: 0.9, ease: 'power3.out', onUpdate() { priceEl.textContent = '$' + Math.round(priceObj.v); } });
    $('#sizeToggle').dataset.size = String(ml);
    $$('.size-opt').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === ml)));
    $('#sizeLabel').textContent = ml + ' ML';
    drawLabel(ml);
}
$$('.ed-opt').forEach(b => b.addEventListener('click', () => setEdition(b.dataset.edition)));
$$('.size-opt').forEach(b => b.addEventListener('click', () => setSize(b.dataset.size)));

/* =========================================================
   CART
   ========================================================= */
const cart = [];
const fmt = n => '$' + n.toLocaleString('en-US');
const drawer = $('#cart'), scrim = $('#scrim'), badge = $('#badge');
function addToBag() {
    const key = state.edition + '-' + state.size;
    const found = cart.find(i => i.key === key);
    if (found) found.qty++; else cart.push({ key, edition: state.edition, size: state.size, price: PRICES[state.size], qty: 1 });
    renderCart(true);
    const span = $('#addBtn span'); span.textContent = 'Added to Bag';
    setTimeout(() => { span.textContent = 'Add to Bag'; }, 1600);
    setTimeout(openCart, 380);
}
function renderCart(pop = false) {
    const count = cart.reduce((a, i) => a + i.qty, 0), subtotal = cart.reduce((a, i) => a + i.qty * i.price, 0);
    badge.textContent = count;
    $('#drawerCount').textContent = `${count} ITEM${count === 1 ? '' : 'S'}`;
    $('#subtotal').textContent = fmt(subtotal);
    $('#checkoutBtn').disabled = count === 0;
    if (pop) gsap.fromTo(badge, { scale: 1.6 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1,0.4)' });
    const list = $('#cartItems');
    if (!cart.length) { list.innerHTML = `<div class="empty"><span class="logo-mark"></span><h3>Your bag is empty</h3><p>Compose your edition of L'Élixir Nocturne to begin.</p></div>`; return; }
    list.innerHTML = cart.map(i => {
        const e = EDITIONS[i.edition];
        return `<div class="item" data-key="${i.key}">
      <div class="item-thumb"><i style="color:${e.swatch};background:${e.swatch}"></i></div>
      <div><h4>${e.name}</h4><div class="meta">Extrait de Parfum · ${i.size} ML</div>
        <div class="qty"><button data-act="dec" aria-label="Decrease quantity">&minus;</button><span>${i.qty}</span><button data-act="inc" aria-label="Increase quantity">+</button></div></div>
      <div class="item-right"><div class="item-price">${fmt(i.price * i.qty)}</div><button class="remove" data-act="rm">Remove</button></div>
    </div>`;
    }).join('');
}
$('#cartItems').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const key = btn.closest('.item').dataset.key, idx = cart.findIndex(i => i.key === key); if (idx < 0) return;
    const act = btn.dataset.act;
    if (act === 'inc') cart[idx].qty++;
    if (act === 'dec') cart[idx].qty--;
    if (act === 'rm' || cart[idx].qty <= 0) {
        gsap.to(btn.closest('.item'), { opacity: 0, x: 40, duration: 0.35, ease: 'power2.in', onComplete() { cart.splice(cart.findIndex(i => i.key === key), 1); renderCart(true); } });
        return;
    }
    renderCart(true);
});
let lastFocus = null;
function openCart() {
    lastFocus = document.activeElement;
    drawer.classList.add('open'); scrim.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
    lenis.stop();
    gsap.fromTo('#cartItems .item, #cartItems .empty', { opacity: 0, x: 30 }, { opacity: 1, x: 0, stagger: 0.07, duration: 0.8, delay: 0.25, ease: 'expo.out' });
    setTimeout(() => $('#closeCart').focus(), 300);
}
function closeCart() {
    drawer.classList.remove('open'); scrim.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
    lenis.start();
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
}
$('#cartBtn').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
scrim.addEventListener('click', closeCart);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeCart(); });
$('#addBtn').addEventListener('click', addToBag);
const toast = $('#toast');
function showToast(title, msg) {
    $('#toastTitle').textContent = title; $('#toastMsg').textContent = msg;
    gsap.killTweensOf(toast);
    gsap.timeline().fromTo(toast, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }).to(toast, { opacity: 0, y: 20, duration: 0.6, ease: 'power2.in' }, '+=3.8');
}
$('#checkoutBtn').addEventListener('click', () => {
    if (!cart.length) return;
    const btn = $('#checkoutBtn'), label = $('#checkoutBtn span');
    btn.disabled = true; label.textContent = 'Processing…';
    setTimeout(() => {
        const total = cart.reduce((a, i) => a + i.qty * i.price, 0), order = 'AUR-' + Math.floor(100000 + Math.random() * 900000);
        cart.length = 0; renderCart(); label.textContent = 'Proceed to Checkout'; closeCart();
        showToast('Merci. Order confirmed.', `${order} · ${fmt(total)} — a simulated checkout, nothing was charged.`);
    }, 1500);
});
renderCart();

/* =========================================================
   RESIZE
   ========================================================= */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    computeRespScale(); updateMistScale();
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { buildMaster(); ScrollTrigger.refresh(); }, 250);
});

/* =========================================================
   HERO ENTRANCE + BOOT
   ========================================================= */
function heroIntro() {
    return gsap.timeline({ defaults: { ease: 'expo.out' } })
        .to(intro, { s: 1, r: 0, y: 0, duration: 3 }, 0)
        .from('.nav > *', { y: -24, opacity: 0, duration: 1.3, stagger: 0.1 }, 0.35)
        .from('.rail', { opacity: 0, duration: 1.6 }, 0.6)
        .from('.hero .kicker', { y: 16, opacity: 0, duration: 1.3 }, 0.5)
        .from('.hl .word', { yPercent: 118, rotate: 3, duration: 1.7, stagger: 0.08 }, 0.55)
        .from('.hero-foot > *', { y: 26, opacity: 0, duration: 1.3, stagger: 0.12 }, 1.05)
        .add(() => { lenis.start(); ScrollTrigger.refresh(); }, 1.1);
}
async function boot() {
    try {
        const fonts = Promise.all([
            document.fonts.load('500 150px "Cormorant Garamond"'),
            document.fonts.load('italic 500 66px "Cormorant Garamond"'),
            document.fonts.load('500 25px "Plus Jakarta Sans"')
        ]);
        await Promise.race([fonts, new Promise(r => setTimeout(r, 3500))]);
        setProgress(40);
        drawLabel(100); drawPlaque();
        setProgress(62);
        await new Promise(r => requestAnimationFrame(r));
        renderer.compile(scene, camera);
        setProgress(84);
        tick();
        renderer.setAnimationLoop(tick);
        buildScroll();
    } catch (err) { console.error('AURELIA 3D init failed:', err); }
    await setProgress(100, 0.7);
    document.body.classList.remove('is-loading');
    gsap.timeline()
        .to('.pl-inner', { opacity: 0, y: -24, duration: 0.6, ease: 'power2.in' })
        .to('#preloader', { yPercent: -100, duration: 1.25, ease: 'expo.inOut' }, '-=0.1')
        .add(heroIntro(), '-=0.75')
        .set('#preloader', { display: 'none' });
}
boot();