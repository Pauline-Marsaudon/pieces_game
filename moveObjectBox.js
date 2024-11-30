"use strict";

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

import {
  AmbientLight,
  Group,
  HemisphereLight,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  WebGLRenderer
} from 'three';

// XR Emulator
import { DevUI } from '@iwer/devui';
import { XRDevice, metaQuest3 } from 'iwer';

// XR
import { XRButton } from 'three/addons/webxr/XRButton.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/examples/jsm/Addons.js';

// Example of hard link to official repo for data, if needed
// const MODEL_PATH = 'https://raw.githubusercontent.com/mrdoob/js/r148/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';

function RandomValue(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let coins = [];
let draggableObject = null;
const touchPosition = new Vector2();


async function setupXR(xrMode) {

  if (xrMode !== 'immersive-vr') return;

  // iwer setup: emulate vr session
  let nativeWebXRSupport = false;
  if (navigator.xr) {
    nativeWebXRSupport = await navigator.xr.isSessionSupported(xrMode);
  }

  if (!nativeWebXRSupport) {
    const xrDevice = new XRDevice(metaQuest3);
    xrDevice.installRuntime();
    xrDevice.fovy = (75 / 180) * Math.PI;
    xrDevice.ipd = 0;
    window.xrdevice = xrDevice;
    xrDevice.controllers.right.position.set(0.15649, 1.43474, -0.38368);
    xrDevice.controllers.right.quaternion.set(
      0.14766305685043335,
      0.02471366710960865,
      -0.0037767395842820406,
      0.9887216687202454,
    );
    xrDevice.controllers.left.position.set(-0.15649, 1.43474, -0.38368);
    xrDevice.controllers.left.quaternion.set(
      0.14766305685043335,
      0.02471366710960865,
      -0.0037767395842820406,
      0.9887216687202454,
    );
    new DevUI(xrDevice);
  }
}

await setupXR('immersive-ar');

let camera, scene, renderer;
let controller, controller2, controllerGrip1, controllerGrip2, group, raycaster;
const intersected = [];

// Main loop
const animate = (timestamp, frame) => {

  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace('viewer').then(function (referenceSpace) {
        session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', function () {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;

    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

      } else {
        reticle.visible = false;
      }
    }
  }
  // can be used in shaders: uniforms.u_time.value = elapsed;
  renderer.render(scene, camera);
};


const init = () => {
  let isCerveauSpawn = false;
  scene = new Scene();

  const aspect = window.innerWidth / window.innerHeight;
  camera = new PerspectiveCamera(75, aspect, 0.1, 10); // meters
  camera.position.set(0, 1.6, 3);

  const light = new AmbientLight(0xffffff, 1.0); // soft white light
  scene.add(light);

  const hemiLight = new HemisphereLight(0xffffff, 0xbbbbff, 3);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate); // requestAnimationFrame() replacement, compatible with XR 
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  const xrButton = XRButton.createButton(renderer, {});
  xrButton.style.backgroundColor = 'blue';
  document.body.appendChild(xrButton);

  const controls = new OrbitControls(camera, renderer.domElement);
  //controls.listenToKeyEvents(window); // optional
  controls.target.set(0, 1.6, 0);
  controls.update();

  // Handle input: see THREE.js webxr_ar_cones

  let manager = new LoadingManager();

  manager.onProgress = function (url) {
    if (url == 'big_brain.glb') {
      console.log('Loading ' + url);
    }
  };

  let loader = new GLTFLoader(manager).setPath('assets/models/')

  const onSelect = (event) => {

    if (reticle.visible) {


      if (isCerveauSpawn == false) {
        loader.load('empty_box.glb', gltfReader);
        isCerveauSpawn = true;
        loader.load('coin.glb', gltfCoinReader);
        return;
      }


      const controller = event.target;

      raycaster.setFromXRController(controller);
      const intersections = raycaster.intersectObjects(coins);

      console.log(intersections);
      if (intersections.length > 0) {
        // si j'ai cliqué sur une liste d'objets, faire l'action que je veux

        const intersection = intersections[0];

        const object = intersection.object;
        // object.material.emissive.r = 1;
        // controller.attach(object);

        controller.userData.selected = object;
        console.log('J\'ai intercepté un object ' + object.name);
        draggableObject = object;
      }
      else {
        console.log('Aucun object intercepté');
        draggableObject = null;
      }
    }
    controller.userData.targetRayMode = event.data.targetRayMode;
  }

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  controller.addEventListener('selectstart', onTouchStart);
  controller.addEventListener('selectend', onTouchMove);
  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  scene.add(controller);
  group = new Group();
  scene.add(group);

  reticle = new Mesh(
    new RingGeometry(0.15, 0.2, 32).rotateX(- Math.PI / 2),
    new MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  raycaster = new Raycaster()

  window.addEventListener('resize', onWindowResize, false);

}

init();

function gltfReader(gltf) {
  let brain_obj = gltf.scene;

  if (brain_obj != null) {
    console.log("Model loaded:  " + brain_obj);
    brain_obj.scale.set(0.1, 0.1, 0.1);
    reticle.matrix.decompose(brain_obj.position, brain_obj.quaternion, brain_obj.scale)
    group.add(brain_obj);
  } else {
    console.log("Load FAILED.  ");
  }

}

function gltfCoinReader(gltf) {
  let testModel = null;

  testModel = gltf.scene;

  if (testModel != null) {
    console.log("Model loaded:  " + testModel);
    for (let i = 1; i <= 3; i++) {
      const clone = gltf.scene.clone();
      clone.position.set(RandomValue(-2, 2), 1, RandomValue(-2, 2));
      clone.name = "Coin_" + i;
      scene.add(clone); // Add the wrapper to the scene
      group.add(clone); // Add the wrapper to the scene
      coins.push(clone); // Store the wrapper instead of the clone
    }

  } else {
    console.log("Load FAILED.  ");
  }
}

function getIntersections(controller) {

  controller.updateMatrixWorld();

  raycaster.setFromXRController(controller);

  return raycaster.intersectObjects(group.children, false);

}

function onTouchStart(event) {
  console.log('Touch start');
  const c = event.target;
  const intersections = getIntersections(c);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    const object = intersection.object;
    c.attach(object);
    c.userData.selected = object;
  }
  c.userData.targetRayMode = event.data.targetRayMode;
}

function onTouchMove(event) {
  console.log('Touch end');
  const c = event.target;
  if (c.userData.selected !== undefined) {
    const object = c.userData.selected;
    group.attach(object);
    c.userData.selected = undefined;
  }
}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}
