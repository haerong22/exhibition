import * as THREE from 'three';

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => disposeMaterial(m));
      } else {
        disposeMaterial(child.material);
      }
    }
    if (child instanceof THREE.Light) {
      if ((child as THREE.SpotLight).shadow?.map) {
        (child as THREE.SpotLight).shadow.map?.dispose();
      }
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  const mat = material as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.normalMap?.dispose();
  mat.roughnessMap?.dispose();
  mat.metalnessMap?.dispose();
  mat.emissiveMap?.dispose();
  material.dispose();
}
