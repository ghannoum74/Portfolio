import * as THREE from "three";

export type GrassMaskData = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

export async function loadGrassMask(
  url: string,
  loadingManager?: THREE.LoadingManager,
): Promise<GrassMaskData> {
  const imageLoader = new THREE.ImageLoader(loadingManager);

  const image = await imageLoader.loadAsync(url);

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas context for grass mask");
  }

  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return {
    pixels: imageData.data,
    width: image.width,
    height: image.height,
  };
}
