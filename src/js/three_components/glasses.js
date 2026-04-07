
import * as THREE from 'three';
import { PUBLIC_PATH } from '../public_path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { scaleLandmark } from '../facemesh/landmarks_helpers';

function loadModel( file ) {
  return new Promise( ( res, rej ) => {
      const loader = new GLTFLoader();
      loader.load( file, function ( gltf ) {
        res( gltf.scene );
      }, undefined, function ( error ) {
          rej( error );
      } );
  });
}

export class Glasses {
  constructor(scene, width, height) {
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.needsUpdate = false;
    this.landmarks = null;
    this.isTracking = false; // 用于标记是否是第一帧识别
    this.loadGlasses();
  }

  async loadGlasses() {
    this.glasses = await loadModel( `${PUBLIC_PATH}/3d/black-glasses/scene.gltf` );

    // scale glasses
    const bbox = new THREE.Box3().setFromObject(this.glasses);
    const size = bbox.getSize(new THREE.Vector3());
    this.scaleFactor = size.x;

    this.glasses.name = 'glasses';
  }

  async changeModel(fileUrl) {
    if (this.glasses) {
      this.removeGlasses();
    }

    try {
      this.glasses = await loadModel(fileUrl);

      const bbox = new THREE.Box3().setFromObject(this.glasses);
      const size = bbox.getSize(new THREE.Vector3());
      this.scaleFactor = size.x;

      this.glasses.name = 'glasses';
      this.needsUpdate = true;

      if (this.previousUrl) {
        URL.revokeObjectURL(this.previousUrl);
      }
      this.previousUrl = fileUrl;
    } catch (e) {
      console.error("Failed to load new glasses model", e);
    }
  }

  updateDimensions(width, height) {
    this.width = width;
    this.height = height;
    this.needsUpdate = true;
  }

  updateLandmarks(landmarks) {
    this.landmarks = landmarks;
    this.needsUpdate = true;
  }

  updateGlasses() {
    // Points for reference
    // https://raw.githubusercontent.com/google/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png

    let midEyes = scaleLandmark(this.landmarks[168], this.width, this.height);
    let leftEyeInnerCorner = scaleLandmark(this.landmarks[463], this.width, this.height);
    let rightEyeInnerCorner = scaleLandmark(this.landmarks[243], this.width, this.height);
    let noseBottom = scaleLandmark(this.landmarks[2], this.width, this.height);
    
    // These points seem appropriate 446, 265, 372, 264
    let leftEyeUpper1 = scaleLandmark(this.landmarks[264], this.width, this.height);
    // These points seem appropriate 226, 35, 143, 34
    let rightEyeUpper1 = scaleLandmark(this.landmarks[34], this.width, this.height);

    if (this.glasses) {
  
      // position smoothing (Lerp)
      const targetPosition = new THREE.Vector3(midEyes.x, midEyes.y, midEyes.z);

      // scale to make glasses
      // as wide as distance between
      // left eye corner and right eye corner
      const eyeDist = Math.sqrt(
        ( leftEyeUpper1.x - rightEyeUpper1.x ) ** 2 +
        ( leftEyeUpper1.y - rightEyeUpper1.y ) ** 2 +
        ( leftEyeUpper1.z - rightEyeUpper1.z ) ** 2
      );
      
      // scale smoothing (Lerp)
      const targetScale = eyeDist / this.scaleFactor;
      const currentScale = this.glasses.scale.x;

      // use two vectors to rotate glasses
      // Vertical Vector from midEyes to noseBottom
      // is used for calculating rotation around x and z axis
      // Horizontal Vector from leftEyeCorner to rightEyeCorner
      // us use to calculate rotation around y axis
      let upVector = new THREE.Vector3(
        midEyes.x - noseBottom.x,
        midEyes.y - noseBottom.y,
        midEyes.z - noseBottom.z,
      ).normalize();

      let sideVector = new THREE.Vector3(
        leftEyeInnerCorner.x - rightEyeInnerCorner.x,
        leftEyeInnerCorner.y - rightEyeInnerCorner.y,
        leftEyeInnerCorner.z - rightEyeInnerCorner.z,
      ).normalize();

      let zRot = (new THREE.Vector3(1, 0, 0)).angleTo(
        upVector.clone().projectOnPlane(
          new THREE.Vector3(0, 0, 1)
        )
      ) - (Math.PI / 2)

      let xRot = (Math.PI / 2) - (new THREE.Vector3(0, 0, 1)).angleTo(
        upVector.clone().projectOnPlane(
          new THREE.Vector3(1, 0, 0)
        )
      );

      let yRot =  (
        new THREE.Vector3(sideVector.x, 0, sideVector.z)
      ).angleTo(new THREE.Vector3(0, 0, 1)) - (Math.PI / 2);
      
      // rotation smoothing (Slerp)
      const targetEuler = new THREE.Euler(xRot, yRot, zRot);
      const targetQuaternion = new THREE.Quaternion().setFromEuler(targetEuler);

      if (!this.isTracking) {
        // 第一帧：瞬间移动过去，不要有动画
        this.glasses.position.copy(targetPosition);
        this.glasses.scale.set(targetScale, targetScale, targetScale);
        this.glasses.quaternion.copy(targetQuaternion);
        this.isTracking = true;
      } else {
        // 后续帧：平滑过渡消除抖动
        this.glasses.position.lerp(targetPosition, 0.4);
        const smoothedScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.4);
        this.glasses.scale.set(smoothedScale, smoothedScale, smoothedScale);
        this.glasses.quaternion.slerp(targetQuaternion, 0.4);
      }

    }
  }

  addGlasses() {
    if (this.glasses) {
      this.scene.add(this.glasses);
    }
  }

  removeGlasses() {
    this.scene.remove(this.glasses);
    this.isTracking = false; // 离开画面后重置状态
  }

  update() {
    if (this.needsUpdate) {
      let inScene = !!this.scene.getObjectByName('glasses');
      let shouldShow = !!this.landmarks;
      if (inScene) {
        shouldShow ? this.updateGlasses() : this.removeGlasses();
      } else {
        if (shouldShow) {
          this.addGlasses();
        }
      }
    }
  }
}