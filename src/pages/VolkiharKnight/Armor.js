import './Armor.css';

import vknx from 'assets/volkihar-cube-nx.png';
import vkny from 'assets/volkihar-cube-ny.png';
import vknz from 'assets/volkihar-cube-nz.png';
import vkpx from 'assets/volkihar-cube-px.png';
import vkpy from 'assets/volkihar-cube-py.png';
import vkpz from 'assets/volkihar-cube-pz.png';
import armor from 'assets/volkihar-knight.glb';
import { useInViewport, usePrefersReducedMotion } from 'hooks';
import { spring, value } from 'popmotion';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CubeTextureLoader,
  DirectionalLight,
  Group,
  LinearFilter,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  TextureLoader,
  WebGLRenderer,
  sRGBEncoding,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { degToRad } from 'three/src/math/MathUtils';
import { classes, cssProps, numToMs } from 'utils/style';
import { cleanRenderer, cleanScene, removeLights } from 'utils/three';

export const Armor = ({
  models,
  show = true,
  showDelay = 0,
  cameraPosition = { x: 0, y: 0, z: 6 },
  enableControls,
  className,
  alt,
  ...rest
}) => {
  const [loaded, setLoaded] = useState(false);
  const loading = useRef(false);
  const container = useRef();
  const canvas = useRef();
  const camera = useRef();
  const textureLoader = useRef();
  const modelGroup = useRef();
  const scene = useRef();
  const renderer = useRef();
  const lights = useRef();
  const envMap = useRef();
  const renderTarget = useRef();
  const isInViewport = useInViewport(container, false, { threshold: 0.4 });
  const reduceMotion = usePrefersReducedMotion();
  const loadModel = useRef();

  useEffect(() => {
    const { clientWidth, clientHeight } = container.current;

    renderer.current = new WebGLRenderer({
      canvas: canvas.current,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });

    renderer.current.setPixelRatio(2);
    renderer.current.setSize(clientWidth, clientHeight);
    renderer.current.outputEncoding = sRGBEncoding;
    renderer.current.physicallyCorrectLights = true;
    renderer.current.toneMapping = ACESFilmicToneMapping;

    camera.current = new PerspectiveCamera(36, clientWidth / clientHeight, 0.1, 100);
    camera.current.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    scene.current = new Scene();

    const cubeTextureLoader = new CubeTextureLoader();
    textureLoader.current = new TextureLoader();
    modelGroup.current = new Group();

    const pmremGenerator = new PMREMGenerator(renderer.current);
    pmremGenerator.compileEquirectangularShader();

    // Lighting
    const ambientLight = new AmbientLight(0xffffff, 1.8);
    const keyLight = new DirectionalLight(0xffffff, 1.9);
    const fillLight = new DirectionalLight(0xffffff, 1.6);

    fillLight.position.set(-6, 2, 2);
    keyLight.position.set(0.5, 0, 0.866);
    lights.current = [ambientLight, keyLight, fillLight];
    lights.current.forEach(light => scene.current.add(light));

    const loadEnv = async () => {
      const hdrTexture = await cubeTextureLoader.loadAsync([
        vknx,
        vkny,
        vknz,
        vkpx,
        vkpy,
        vkpz,
      ]);

      renderTarget.current = pmremGenerator.fromCubemap(hdrTexture);
      envMap.current = hdrTexture;
      envMap.current.magFilter = LinearFilter;
      envMap.current.needsUpdate = true;
      pmremGenerator.dispose();

      scene.current.traverse(({ material }) => {
        if (material) {
          material.envMap = renderTarget.current.texture;
          material.needsUpdate = true;
        }
      });
    };

    const load = async () => {
      const dracoLoader = new DRACOLoader();
      const modelLoader = new GLTFLoader();
      dracoLoader.setDecoderPath('/draco/');
      modelLoader.setDRACOLoader(dracoLoader);

      const gltf = await modelLoader.loadAsync(armor);
      modelGroup.current.add(gltf.scene);
      gltf.scene.rotation.y = degToRad(180);
      gltf.scene.position.y = -1.6;
      scene.current.add(modelGroup.current);

      await loadEnv();
      setLoaded(true);
      renderFrame();
    };

    loadModel.current = load;

    return () => {
      removeLights(lights.current);
      cleanScene(scene.current);
      cleanRenderer(renderer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle render passes for a single frame
  const renderFrame = useCallback(() => {
    renderer.current.render(scene.current, camera.current);
  }, []);

  // Handle mouse move animation
  useEffect(() => {
    let rotationSpring;
    let rotationSpringValue;

    const onMouseMove = event => {
      const { rotation } = modelGroup.current;
      const { innerWidth, innerHeight } = window;

      const position = {
        x: (event.clientX - innerWidth / 2) / innerWidth,
        y: (event.clientY - innerHeight / 2) / innerHeight,
      };

      if (!rotationSpringValue) {
        rotationSpringValue = value({ x: rotation.x, y: rotation.y }, ({ x, y }) => {
          rotation.set(x, y, rotation.z);
          renderFrame();
        });
      }

      rotationSpring = spring({
        from: rotationSpringValue.get(),
        to: { x: position.y / 2, y: position.x / 2 },
        stiffness: 40,
        damping: 40,
        velocity: rotationSpringValue.getVelocity(),
        restSpeed: 0.00001,
        mass: 1.4,
      }).start(rotationSpringValue);
    };

    if (isInViewport && !reduceMotion) {
      window.addEventListener('mousemove', onMouseMove);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      rotationSpring?.stop();
    };
  }, [isInViewport, reduceMotion, renderFrame]);

  useEffect(() => {
    if (!loading.current && !loaded && isInViewport) {
      loading.current = true;
      loadModel.current();
    }
  }, [isInViewport, loaded]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!container.current) return;

      const { clientWidth, clientHeight } = container.current;

      renderer.current.setSize(clientWidth, clientHeight);
      camera.current.aspect = clientWidth / clientHeight;
      camera.current.updateProjectionMatrix();

      renderFrame();
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [renderFrame]);

  return (
    <div
      className={classes('armor', className)}
      data-loaded={loaded}
      style={cssProps({ delay: numToMs(showDelay) })}
      ref={container}
      role="img"
      aria-label={alt}
      {...rest}
    >
      <canvas className="armor__canvas" ref={canvas} />
    </div>
  );
};
