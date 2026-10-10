import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Three-second 3D welcome before the menu: a plate of dosa, idli, laddoos, a doughnut,
 * chutney and steaming coffee, with ingredients and gold sparkles orbiting around it.
 * Moving the pointer (or a finger) tilts the plate; pressing spins it faster.
 */
export default function FoodSplash({ hotelName, duration = 3000, onDone }: { hotelName: string; duration?: number; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = element.clientWidth || 600, height = element.clientHeight || 420;

    // Always finish on time, even if the tab is in the background (no animation frames) or 3D is unavailable.
    const fallback = window.setTimeout(() => done.current(), (reduced ? 600 : duration) + 400);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { window.clearTimeout(fallback); const skip = window.setTimeout(() => done.current(), 900); return () => window.clearTimeout(skip); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 4.2, 7.6);
    camera.lookAt(0, 0.4, 0);

    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1d2b4a, 1.1));
    const key = new THREE.DirectionalLight(0xffe2b0, 2.4); key.position.set(4, 7, 5); scene.add(key);
    const rim = new THREE.PointLight(0xd6ac68, 30, 20); rim.position.set(-4, 3, -3); scene.add(rim);

    const material = (color: number, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const dish = new THREE.Group();
    scene.add(dish);

    // Plate with a gold rim.
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.2, 0.18, 64), material(0xfbfaf6, 0.35)); dish.add(plate);
    const plateRim = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.06, 16, 96), material(0xd6ac68, 0.25, 0.9)); plateRim.rotation.x = Math.PI / 2; plateRim.position.y = 0.1; dish.add(plateRim);

    // Rolled dosa (a long golden cone lying on the plate).
    const dosa = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xd99a3a, roughness: 0.55, side: THREE.DoubleSide }));
    dosa.rotation.z = Math.PI / 2; dosa.rotation.y = 0.5; dosa.position.set(-0.2, 0.45, 0.6); dish.add(dosa);

    // Idlis: soft white domes.
    [[1.2, -0.9], [1.75, -0.35], [0.7, -1.4]].forEach(([x, z]) => {
      const idli = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), material(0xf6f1e6, 0.9));
      idli.scale.set(1, 0.42, 1); idli.position.set(x, 0.24, z); dish.add(idli);
    });
    // Laddoos.
    [[-1.5, -0.8], [-1.05, -1.25], [-1.75, -0.2]].forEach(([x, z]) => {
      const laddoo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), material(0xf2a03d, 0.75)); laddoo.position.set(x, 0.38, z); dish.add(laddoo);
    });
    // Chutney bowl.
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.32, 32), material(0xffffff, 0.3)); bowl.position.set(1.55, 0.26, 0.85); dish.add(bowl);
    const chutney = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 32), material(0x7fb24a, 0.8)); chutney.position.set(1.55, 0.41, 0.85); dish.add(chutney);

    // Coffee tumbler beside the plate, with rising steam.
    const coffee = new THREE.Group(); coffee.position.set(3.4, 0, -0.6); scene.add(coffee);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.95, 32), material(0xd8dde4, 0.25, 0.85)); cup.position.y = 0.48; coffee.add(cup);
    const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.03, 32), material(0x6b3f1d, 0.4)); brew.position.y = 0.93; coffee.add(brew);
    const steam = Array.from({ length: 10 }, (_, index) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 1 }));
      puff.userData.offset = index / 10; coffee.add(puff); return puff;
    });

    // Glazed doughnut floating on the other side.
    const donut = new THREE.Group(); donut.position.set(-3.5, 1.4, -0.4); scene.add(donut);
    donut.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.24, 24, 48), material(0xc98a4b, 0.7)));
    const glaze = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.25, 24, 48, Math.PI * 2), material(0xf07aa5, 0.4)); glaze.scale.set(1, 1, 0.6); glaze.position.z = 0.06; donut.add(glaze);

    // Ingredients orbiting the plate: tomatoes, peas, leaves.
    const orbiters: THREE.Mesh[] = [];
    const ingredient = (geometry: THREE.BufferGeometry, color: number) => { const mesh = new THREE.Mesh(geometry, material(color, 0.5)); scene.add(mesh); orbiters.push(mesh); return mesh; };
    for (let i = 0; i < 6; i += 1) ingredient(new THREE.SphereGeometry(0.16, 16, 16), 0xe5463b);
    for (let i = 0; i < 8; i += 1) ingredient(new THREE.SphereGeometry(0.09, 12, 12), 0x6fbf4a);
    for (let i = 0; i < 5; i += 1) { const leaf = ingredient(new THREE.CircleGeometry(0.22, 3), 0x3f9b4b); leaf.scale.set(0.7, 1.6, 1); }
    orbiters.forEach((mesh, index) => { mesh.userData = { angle: (index / orbiters.length) * Math.PI * 2, radius: 3.2 + (index % 3) * 0.5, height: 0.6 + (index % 4) * 0.45, speed: 0.4 + (index % 5) * 0.08 }; });

    // Gold sparkles.
    const sparkleCount = 160, positions = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i += 1) { positions[i * 3] = (Math.random() - 0.5) * 12; positions[i * 3 + 1] = Math.random() * 6 - 0.5; positions[i * 3 + 2] = (Math.random() - 0.5) * 8; }
    const sparkleGeometry = new THREE.BufferGeometry(); sparkleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const sparkles = new THREE.Points(sparkleGeometry, new THREE.PointsMaterial({ color: 0xf3cf86, size: 0.06, transparent: true, opacity: 0.9 }));
    scene.add(sparkles);

    // "3D touch": tilt toward the pointer, spin faster while pressed.
    const pointer = { x: 0, y: 0, pressed: false };
    const onMove = (event: PointerEvent) => { const box = element.getBoundingClientRect(); pointer.x = ((event.clientX - box.left) / box.width) * 2 - 1; pointer.y = ((event.clientY - box.top) / box.height) * 2 - 1; };
    const onDown = () => { pointer.pressed = true; }, onUp = () => { pointer.pressed = false; };
    element.addEventListener("pointermove", onMove); element.addEventListener("pointerdown", onDown); window.addEventListener("pointerup", onUp);
    const onResize = () => { const w = element.clientWidth, h = element.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);

    const start = performance.now();
    let spin = 0, frame = 0, finished = false;
    const tick = (now: number) => {
      const elapsed = now - start, t = elapsed / 1000;
      const intro = Math.min(1, elapsed / 900), ease = 1 - Math.pow(1 - intro, 3);
      spin += (pointer.pressed ? 0.06 : 0.012);
      dish.rotation.y = spin;
      dish.rotation.x = THREE.MathUtils.lerp(dish.rotation.x, pointer.y * 0.25, 0.08);
      dish.rotation.z = THREE.MathUtils.lerp(dish.rotation.z, -pointer.x * 0.2, 0.08);
      dish.scale.setScalar(0.4 + 0.6 * ease);
      dish.position.y = Math.sin(t * 2) * 0.06;
      donut.rotation.set(t * 0.9, t * 1.3, 0); donut.position.y = 1.4 + Math.sin(t * 1.6) * 0.18;
      coffee.position.y = Math.sin(t * 1.4 + 1) * 0.05;
      steam.forEach(puff => { const phase = (t * 0.5 + puff.userData.offset) % 1; puff.position.set(Math.sin(phase * 6 + puff.userData.offset * 9) * 0.15, 1 + phase * 1.4, 0); (puff.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - phase); puff.scale.setScalar(1 + phase * 1.5); });
      orbiters.forEach(mesh => { const data = mesh.userData; const angle = data.angle + t * data.speed * (pointer.pressed ? 2.5 : 1); mesh.position.set(Math.cos(angle) * data.radius * ease, data.height + Math.sin(t * 2 + data.angle) * 0.2, Math.sin(angle) * data.radius * 0.6 * ease); mesh.rotation.set(t + data.angle, t * 0.7, 0); });
      sparkles.rotation.y = t * 0.08; (sparkles.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(t * 3) * 0.3;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 1.2, 0.05);
      camera.lookAt(0, 0.4, 0);
      renderer.render(scene, camera);
      setProgress(Math.min(1, elapsed / duration));
      if (!finished && elapsed >= (reduced ? 600 : duration)) { finished = true; window.clearTimeout(fallback); done.current(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(fallback);
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", onMove); element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp); window.removeEventListener("resize", onResize);
      scene.traverse(object => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const mat = mesh.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(item => item.dispose()); });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [duration]);

  return <div className="fs-splash">
    <div ref={host} className="fs-canvas" aria-hidden="true"/>
    <div className="fs-copy">
      <p>WELCOME TO</p>
      <h2>{hotelName}</h2>
      <span>Something delicious is on its way…</span>
      <div className="fs-bar"><i style={{ width: `${Math.round(progress * 100)}%` }}/></div>
    </div>
    <button type="button" className="fs-skip" onClick={() => done.current()}>Skip</button>
  </div>;
}
