"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import type { HeroPaperTuning } from "@/components/home/HeroPaperTuning";

const SHEET_WIDTH = 1.16;
const SHEET_HEIGHT = 1.36;
const CURL_LENGTH = 0.32;
const CURL_ANGLE = 2.15;
const CURL_RADIUS = CURL_LENGTH / CURL_ANGLE;
const FOLD_NORMAL_LENGTH = Math.hypot(1 / SHEET_WIDTH, 1 / SHEET_HEIGHT);
const FOLD_DIRECTION_X = 1 / SHEET_WIDTH / FOLD_NORMAL_LENGTH;
const FOLD_DIRECTION_Y = 1 / SHEET_HEIGHT / FOLD_NORMAL_LENGTH;

type HeroPaperSurfaceProps = {
  active: boolean;
  onUnavailable: () => void;
  tuning: HeroPaperTuning["paper"];
};

export function HeroPaperSurface({ active, onUnavailable, tuning }: HeroPaperSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const tuningRef = useRef(tuning);
  const startAnimationRef = useRef<() => void>(() => undefined);
  const applyTuningRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    activeRef.current = active;
    startAnimationRef.current();
  }, [active]);

  useEffect(() => {
    tuningRef.current = tuning;
    applyTuningRef.current();
  }, [tuning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(tuningRef.current.cameraFov, 1, 0.1, 10);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      onUnavailable();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const handleContextLoss = (event: Event) => {
      event.preventDefault();
      onUnavailable();
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLoss);

    const geometry = new THREE.PlaneGeometry(SHEET_WIDTH, SHEET_HEIGHT, 36, 48);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const flatPositions = new Float32Array(positions.array as Float32Array);

    const texture = new THREE.TextureLoader().load(
      "/images/hero-paper-texture.webp",
      () => {
        if (disposed) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        renderFrame();
      },
      undefined,
      () => {
        if (!disposed) onUnavailable();
      },
    );
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      color: 0xf0ecdf,
      map: texture,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(geometry, material);
    scene.add(sheet);

    scene.add(new THREE.HemisphereLight(0xfff9ec, 0x64736a, 2.2));
    const keyLight = new THREE.DirectionalLight(0xfff7e7, 3.1);
    keyLight.position.set(-2.5, 3.5, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xd9e9df, 0.65);
    fillLight.position.set(3, -1, 2);
    scene.add(fillLight);

    let progress = 0;
    let previousTime = performance.now();
    let animationFrame = 0;

    const deformSheet = (amount: number) => {
      for (let index = 0; index < positions.count; index += 1) {
        const offset = index * 3;
        const x = flatPositions[offset];
        const y = flatPositions[offset + 1];
        const normalizedX = (x + SHEET_WIDTH / 2) / SHEET_WIDTH;
        const normalizedY = (y + SHEET_HEIGHT / 2) / SHEET_HEIGHT;
        const diagonal = normalizedX + normalizedY - 1.5;
        const penetration = Math.max(0, diagonal / FOLD_NORMAL_LENGTH);
        const curlDistance = Math.min(penetration, CURL_LENGTH);
        const tailDistance = Math.max(0, penetration - CURL_LENGTH);
        const theta = curlDistance / CURL_RADIUS;
        const bentDistance =
          CURL_RADIUS * Math.sin(theta) + tailDistance * Math.cos(CURL_ANGLE);
        const inwardShift = (penetration - bentDistance) * amount;
        const elevation =
          (CURL_RADIUS * (1 - Math.cos(theta)) +
            tailDistance * Math.sin(CURL_ANGLE)) *
          amount;

        positions.setXYZ(
          index,
          x - inwardShift * FOLD_DIRECTION_X,
          y - inwardShift * FOLD_DIRECTION_Y,
          elevation,
        );
      }

      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    };

    function renderFrame() {
      renderer.render(scene, camera);
    }

    const animate = (now: number) => {
      const elapsed = Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      const target = activeRef.current ? 1 : 0;
      const easing = 1 - Math.exp(-elapsed * 13);
      progress += (target - progress) * easing;

      if (Math.abs(target - progress) < 0.001) progress = target;
      deformSheet(progress);
      renderFrame();

      if (progress !== target) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        animationFrame = 0;
      }
    };

    const startAnimation = () => {
      if (animationFrame) return;
      previousTime = performance.now();
      animationFrame = requestAnimationFrame(animate);
    };
    startAnimationRef.current = startAnimation;
    if (activeRef.current) startAnimation();

    const applyTuning = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;

      const current = tuningRef.current;
      const aspect = width / height;
      const margin = 1.08;
      const halfFov = THREE.MathUtils.degToRad(current.cameraFov / 2);
      const distance = Math.max(
        (SHEET_HEIGHT * margin) / 2 / Math.tan(halfFov),
        (SHEET_WIDTH * margin) / 2 / (Math.tan(halfFov) * aspect),
      );

      camera.aspect = aspect;
      camera.fov = current.cameraFov;
      camera.position.set(0, 0, distance);
      camera.updateProjectionMatrix();

      const viewHeight = 2 * Math.tan(halfFov) * distance;
      const viewWidth = viewHeight * aspect;
      sheet.position.set(
        (current.positionX / width) * viewWidth,
        (-current.positionY / height) * viewHeight,
        0,
      );
      sheet.scale.setScalar(current.scale);
      sheet.rotation.set(
        THREE.MathUtils.degToRad(current.rotationX),
        THREE.MathUtils.degToRad(current.rotationY),
        THREE.MathUtils.degToRad(current.rotationZ),
      );

      renderer.setSize(width, height, true);
      renderFrame();
    };
    applyTuningRef.current = applyTuning;

    const resizeObserver = new ResizeObserver(applyTuning);
    resizeObserver.observe(container);
    applyTuning();
    deformSheet(0);
    renderFrame();

    return () => {
      disposed = true;
      startAnimationRef.current = () => undefined;
      applyTuningRef.current = () => undefined;
      resizeObserver.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLoss);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [onUnavailable]);

  return <div ref={containerRef} className="hero-paper-motion" aria-hidden="true" />;
}
