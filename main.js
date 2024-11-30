"use strict";

import {
  AmbientLight,
  Audio,
  AudioLoader,
  AudioListener,
  Clock,
  Group,
  HemisphereLight,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  WebGLRenderer
} from 'three';

// XR Emulator
import { DevUI } from '@iwer/devui';
import { XRDevice, metaQuest3 } from 'iwer';

// XR
import { XRButton } from 'three/addons/webxr/XRButton.js';

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import {
  GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';


import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';

let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let objectScaled;
let info, infomesh;

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
let controller, group, raycaster;

const clock = new Clock();
let brain_rotate = true;

// Main loop
const animate = (timestamp, frame) => {

  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();
    let elapsed = clock.getElapsedTime();

    if (!brain_rotate)
      elapsed = clock.oldTime;
    if (brain_rotate && brain_obj) {
      brain_obj.rotation.y = elapsed / 2;
      elapsed = clock.getElapsedTime();
    }

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

  var audioLoader = new AudioLoader();
  var listener = new AudioListener();
  var backgroundAudio = new Audio(listener);
  audioLoader.load("assets/audios/background_sound.mp3", function (buffer) {
    backgroundAudio.setBuffer(buffer);
    backgroundAudio.setLoop(true);
    backgroundAudio.setVolume(1);
    backgroundAudio.play();
  });

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
        brain_obj = loader.load('big_brain.glb', gltfReader);
        isCerveauSpawn = true;
      }
      let targetObject = null;
      const controller = event.target;

      // fonction qui me récupère tous les objets sur lesquels j'ai cliqué
      const intersections = getIntersections(controller);

      console.log(intersections);
      if (intersections.length > 0) {
        // si j'ai cliqué sur une liste d'objets, faire l'action que je veux

        const intersection = intersections[0];

        const object = intersection.object;

        controller.userData.selected = object;
        targetObject = object.parent;
        console.log('J\'ai intercepté un object ' + targetObject.name);
      }
      if (targetObject) {
        if (objectScaled != null) {
          // To revert back scaled object
          objectScaled.scale.set(objectScaled.scale.x - 0.1, objectScaled.scale.y - 0.1, objectScaled.scale.z - 0.1);
          infomesh.visible = false;
          objectScaled = null;
        }
        info = document.getElementById(targetObject.name);
        infomesh = new HTMLMesh(info);
        infomesh.position.set(brain_obj.position.x + 1, brain_obj.position.y + 1, brain_obj.position.z + 1);
        scene.add(infomesh);

        brain_rotate = false;

        // Make object 10% bigger
        targetObject.scale.set(targetObject.scale.x + 0.1, targetObject.scale.y + 0.1, targetObject.scale.z + 0.1)
        objectScaled = targetObject;
      }
      else {
        if (objectScaled != null) {
          objectScaled.scale.set(objectScaled.scale.x - 0.1, objectScaled.scale.y - 0.1, objectScaled.scale.z - 0.1);
          objectScaled = null;
          infomesh.visible = false;
        }
        brain_rotate = true;
      }
      controller.userData.targetRayMode = event.data.targetRayMode;

    }
  }

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
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

init()

let brain_obj;
function gltfReader(gltf) {
  brain_obj = gltf.scene;

  if (brain_obj != null) {
    console.log("Model loaded:  " + brain_obj);
    brain_obj.scale.set(0.1, 0.1, 0.1);
    reticle.matrix.decompose(brain_obj.position, brain_obj.quaternion, brain_obj.scale)
    group.add(brain_obj);
    console.log(brain_obj);
    return brain_obj;
  } else {
    console.log("Load FAILED.  ");
  }

}

function getIntersections(controller) {

  controller.updateMatrixWorld();

  raycaster.setFromXRController(controller);

  return raycaster.intersectObjects(group.children, true);

}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}