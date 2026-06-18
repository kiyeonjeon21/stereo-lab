import { Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Station 09 — abstraction / framework (React Three Fiber).
// This rebuilds station 06's PBR helmet viewer, but DECLARATIVELY. R3F isn't a
// competitor to three.js — it's three.js expressed as a React component tree, and
// drei is a library of ready-made helpers (controls, loaders, environments).
// Graduation question: how does imperative three.js map onto a JSX tree? Compare
// this file to 06-pbr.ts line by line — same scene, a fraction of the wiring.

// drei has a one-liner <Environment preset="city" /> for this, but presets fetch
// an HDR from a CDN. To stay offline and mirror 06 exactly, we set the same
// RoomEnvironment by hand — note it's still just a declarative <RoomEnv /> node.
function RoomEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

// drei's useGLTF replaces GLTFLoader + onload + traverse from station 06.
function Helmet() {
  const { scene } = useGLTF('models/DamagedHelmet.glb');
  return <primitive object={scene} />;
}

function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 3.2], fov: 50 }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <color attach="background" args={['#0b0d10']} />
      <RoomEnv />
      <OrbitControls enableDamping />
      <Suspense fallback={null}>
        <Helmet />
      </Suspense>
    </Canvas>
  );
}

export function mount(container: HTMLElement) {
  // The router's mount→cleanup contract maps cleanly onto React: a root that we
  // render into, and unmount() to tear down. No special-casing needed.
  const root = createRoot(container);
  root.render(<Scene />);
  return () => root.unmount();
}
